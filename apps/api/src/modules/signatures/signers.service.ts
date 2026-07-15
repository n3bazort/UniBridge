import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SignerRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/**
 * Gestión de usuarios firmantes (autoridades). Dos vías:
 *  A) El ADMIN crea el usuario directamente (con contraseña temporal generada).
 *  B) El ADMIN genera un link de invitación con token de un solo uso y se lo
 *     envía a la autoridad, que se auto-registra y rellena sus datos.
 */
@Injectable()
export class SignersService {
  constructor(private prisma: PrismaService) {}

  // ───────────── Vía A: creación directa por el admin ─────────────

  async createSigner(dto: {
    email: string;
    password?: string;
    fullName: string;
    title?: string;
    signerRole: SignerRole;
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Ya existe un usuario con ese correo');

    // Contraseña temporal si el admin no define una
    const tempPassword = dto.password || crypto.randomBytes(6).toString('base64url');
    const hashed = await bcrypt.hash(tempPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        role: 'SIGNER',
        signerProfile: {
          create: {
            signerRole: dto.signerRole,
            fullName: dto.fullName,
            title: dto.title,
          },
        },
      },
      include: { signerProfile: true },
    });

    return {
      id: user.id,
      email: user.email,
      signerRole: user.signerProfile?.signerRole,
      fullName: user.signerProfile?.fullName,
      // Solo se devuelve si fue autogenerada, para que el admin la comunique
      temporaryPassword: dto.password ? undefined : tempPassword,
    };
  }

  async listSigners() {
    return this.prisma.signerProfile.findMany({
      include: { user: { select: { id: true, email: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ───────────── Vía B: invitación con token ─────────────

  async createInvitation(
    createdById: string,
    dto: { signerRole: SignerRole; email?: string; fullName?: string; expiresInDays?: number },
  ) {
    const token = crypto.randomBytes(32).toString('base64url');
    const days = Math.min(Math.max(dto.expiresInDays ?? 7, 1), 30);

    const invitation = await this.prisma.signerInvitation.create({
      data: {
        token,
        signerRole: dto.signerRole,
        email: dto.email,
        fullName: dto.fullName,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        createdById,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL
      || (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',')[0].trim() : 'http://localhost:3000');

    return {
      id: invitation.id,
      token,
      link: `${frontendUrl}/signer-register?token=${token}`,
      signerRole: invitation.signerRole,
      expiresAt: invitation.expiresAt,
    };
  }

  async listInvitations() {
    return this.prisma.signerInvitation.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Valida un token de invitación (para pre-llenar el formulario público). */
  async validateInvitation(token: string) {
    const invitation = await this.prisma.signerInvitation.findUnique({ where: { token } });
    if (!invitation) throw new NotFoundException('Invitación no válida');
    if (invitation.usedAt) throw new BadRequestException('Esta invitación ya fue utilizada');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Esta invitación ha expirado');
    return {
      signerRole: invitation.signerRole,
      email: invitation.email,
      fullName: invitation.fullName,
    };
  }

  /** Registro público del firmante usando el token de invitación. */
  async registerWithInvitation(dto: {
    token: string;
    email: string;
    password: string;
    fullName: string;
    title?: string;
  }) {
    const invitation = await this.prisma.signerInvitation.findUnique({ where: { token: dto.token } });
    if (!invitation) throw new NotFoundException('Invitación no válida');
    if (invitation.usedAt) throw new BadRequestException('Esta invitación ya fue utilizada');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Esta invitación ha expirado');

    // Si el admin fijó el correo en la invitación, debe coincidir
    if (invitation.email && invitation.email.toLowerCase() !== dto.email.toLowerCase()) {
      throw new BadRequestException('El correo no coincide con el de la invitación');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Ya existe un usuario con ese correo');

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const [user] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashed,
          role: 'SIGNER',
          signerProfile: {
            create: {
              signerRole: invitation.signerRole,
              fullName: dto.fullName,
              title: dto.title,
            },
          },
        },
      }),
      this.prisma.signerInvitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { id: user.id, email: user.email, message: 'Registro completado. Ya puedes iniciar sesión.' };
  }
}
