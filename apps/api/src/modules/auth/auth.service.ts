import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  // ─────────── Recuperación de contraseña (estudiantes y demás) ───────────

  /**
   * Genera un token de recuperación de un solo uso (1 hora de vigencia).
   * Con SMTP configurado el link viaja por correo; sin SMTP (entorno local)
   * el link se registra en el log del servidor y, fuera de producción,
   * también se devuelve para poder probar el flujo completo.
   *
   * La respuesta es idéntica exista o no el correo: no se revela cuáles
   * cuentas están registradas.
   */
  async forgotPassword(email: string) {
    const generic = { message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.suspendedAt) return generic;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const frontendUrl = process.env.FRONTEND_URL
      || (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',')[0].trim() : 'http://localhost:3000');
    const link = `${frontendUrl}/reset-password?token=${token}`;

    const sent = await this.trySendResetEmail(email, link);
    if (!sent) {
      this.logger.warn(`SMTP no configurado. Link de recuperación para ${email}: ${link}`);
      if (process.env.NODE_ENV !== 'production') {
        // Solo en desarrollo: permite probar el flujo sin servidor de correo
        return { ...generic, devLink: link };
      }
    }
    return generic;
  }

  async resetPassword(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException('El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, resetToken: null, resetTokenExpiresAt: null },
      }),
      // Cerrar todas las sesiones abiertas: la clave vieja pudo estar comprometida
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);

    return { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }

  /** Envía el correo si hay SMTP + nodemailer disponibles; false si no. */
  private async trySendResetEmail(to: string, link: string): Promise<boolean> {
    if (!process.env.SMTP_HOST) return false;
    try {
      // Carga perezosa: nodemailer es opcional en este proyecto
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'UniBridge <no-reply@uleam.edu.ec>',
        to,
        subject: 'Restablecer tu contraseña — UniBridge',
        html: `<p>Recibimos una solicitud para restablecer tu contraseña.</p>
               <p><a href="${link}">Haz click aquí para crear una nueva contraseña</a> (válido por 1 hora).</p>
               <p>Si no fuiste tú, ignora este correo.</p>`,
      });
      return true;
    } catch (e: any) {
      this.logger.error(`No se pudo enviar el correo de recuperación: ${e?.message}`);
      return false;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    
    // Si no existe el usuario, lanzamos Unauthorized
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Validar contraseña con bcrypt
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Cuenta inhabilitada por el administrador: la contraseña es correcta,
    // pero el acceso está suspendido (se puede reactivar).
    if ((user as any).suspendedAt) {
      throw new UnauthorizedException(
        'Tu cuenta está inhabilitada. Contacta al administrador del sistema.',
      );
    }

    // Identificar facultad si es coordinador
    let facultyId = null;
    if (user.role === 'COORDINATOR') {
        const coordinator = await this.usersService.findCoordinatorByUserId(user.id);
        if (coordinator) facultyId = coordinator.facultyId;
    }

    const payload = { sub: user.id, email: user.email, role: user.role, facultyId };
    
    // Generar Access Token y Refresh Token
    const access_token = this.jwtService.sign(payload);
    const refresh_token = await this.generateRefreshToken(user.id);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        facultyId
      }
    };
  }

  // Crea y persiste un Refresh Token en Base de Datos
  private async generateRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expira en 7 días por defecto

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      }
    });

    return token;
  }

  // Lógica de Refresh Session + Rotación de Tokens
  async refreshTokens(token: string) {
    // 1. Buscar token que no esté revocado y siga vigente
    const refreshTokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token }
    });

    if (!refreshTokenRecord) {
      throw new UnauthorizedException('Refresh token no encontrado');
    }

    if (refreshTokenRecord.revokedAt || refreshTokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado. Por favor, inicia sesión de nuevo.');
    }

    // 2. Extraer usuario (falla si el usuario fue soft-deleted)
    const user = await this.usersService.findOne(refreshTokenRecord.userId);
    if (!user) {
      throw new UnauthorizedException('El usuario ya no existe o fue inhabilitado');
    }

    // 3. Re-calcular payload
    let facultyId = null;
    if (user.role === 'COORDINATOR') {
        const coordinator = await this.usersService.findCoordinatorByUserId(user.id);
        if (coordinator) facultyId = coordinator.facultyId;
    }

    const payload = { sub: user.id, email: user.email, role: user.role, facultyId };

    // 4. Generar nuevos tokens
    const access_token = this.jwtService.sign(payload);
    const new_refresh_token = await this.generateRefreshToken(user.id);

    // 5. Revocar el token anterior (Protección contra robo - Rotación)
    await this.prisma.refreshToken.update({
      where: { id: refreshTokenRecord.id },
      data: { revokedAt: new Date() }
    });

    return {
      access_token,
      refresh_token: new_refresh_token
    };
  }

  // Revocar la sesión activa (Logout)
  async logout(token: string) {
    const refreshTokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token }
    });

    if (refreshTokenRecord && !refreshTokenRecord.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: refreshTokenRecord.id },
        data: { revokedAt: new Date() }
      });
    }

    return { message: 'Cierre de sesión exitoso' };
  }
}
