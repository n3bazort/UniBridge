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

  // ─────────── Recuperación de contraseña ───────────
  // Decisión de diseño: en este sistema institucional la recuperación de
  // contraseñas la gestiona el ADMINISTRADOR (no hay auto-servicio por correo).
  // El usuario que olvida su clave contacta a coordinación, que la restablece
  // al instante desde Gestión de Usuarios. Ver SignersService.resetUserPassword.

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    // findOne() no devuelve el hash; se lee directo para poder comparar
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashed },
      }),
      // Cerrar todas las sesiones abiertas (excepto la actual, pero por seguridad se pueden cerrar todas, o no.
      // Si cerramos todas el usuario tendra que volver a logearse, lo cual es buena practica de seguridad).
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);

    return { message: 'Contraseña actualizada correctamente. Por favor inicie sesión nuevamente.' };
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
