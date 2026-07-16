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
      include: { user: { select: { id: true, email: true, createdAt: true, suspendedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ───────────── Gestión de cuentas de firmantes ─────────────

  /**
   * Inhabilita (o reactiva) la cuenta de un firmante. Es reversible: la
   * cuenta y su historial de firmas se conservan, solo se bloquea el acceso.
   */
  async setSuspended(userId: string, suspended: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { signerProfile: true },
    });
    if (!user || !user.signerProfile) throw new NotFoundException('Firmante no encontrado');

    // Inhabilitar al ÚLTIMO firmante activo de un rol dejaría los lotes de esa
    // etapa sin nadie que los firme. Si hay otro colega activo, no hay problema.
    if (suspended) {
      const role = user.signerProfile.signerRole;
      const stage = role === 'DEAN' ? 'PENDING_DEAN' : 'PENDING_DIRECTOR';
      const [pending, otherActive] = await Promise.all([
        this.prisma.signatureBatch.count({ where: { status: stage } }),
        this.prisma.signerProfile.count({
          where: {
            signerRole: role,
            userId: { not: userId },
            user: { suspendedAt: null, deletedAt: null },
          },
        }),
      ]);
      if (pending > 0 && otherActive === 0) {
        throw new ConflictException(
          `No se puede inhabilitar: es el único ${role === 'DEAN' ? 'Decano' : 'Responsable de Prácticas'} activo y hay ${pending} lote(s) esperando esa firma. Registra un reemplazo o completa esos lotes primero.`,
        );
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { suspendedAt: suspended ? new Date() : null },
    });

    return {
      id: userId,
      suspended,
      message: suspended
        ? `La cuenta de ${user.email} quedó inhabilitada: no podrá iniciar sesión.`
        : `La cuenta de ${user.email} fue reactivada.`,
    };
  }

  /**
   * Elimina definitivamente la cuenta de un firmante. Solo se permite si no
   * dejó rastro en el circuito de firma: borrar a quien ya firmó documentos
   * rompería la trazabilidad de esos documentos.
   */
  async deleteSigner(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { signerProfile: true },
    });
    if (!user || !user.signerProfile) throw new NotFoundException('Firmante no encontrado');

    // Lo que de verdad ata a un firmante al historial son SUS FIRMAS: si se
    // borra su cuenta, los documentos que respaldó quedan sin autor conocido.
    const [deanSigs, finalSigs, batches, generated, invalidated] = await Promise.all([
      this.prisma.signatureBatchItem.count({ where: { deanSignedById: userId } }),
      this.prisma.signatureBatchItem.count({ where: { finalSignedById: userId } }),
      this.prisma.signatureBatch.count({ where: { createdById: userId } }),
      this.prisma.generatedDocument.count({ where: { generatedById: userId } }),
      this.prisma.generatedDocument.count({ where: { invalidatedById: userId } }),
    ]);

    const signatures = deanSigs + finalSigs;
    const traces = signatures + batches + generated + invalidated;
    if (traces > 0) {
      const detail = signatures > 0
        ? `firmó ${signatures} documento(s)`
        : `tiene ${traces} registro(s) en el historial de documentos`;
      throw new ConflictException(
        `No se puede eliminar a ${user.email}: ${detail}. Inhabilita la cuenta en su lugar para conservar la trazabilidad de esos documentos.`,
      );
    }

    // Ojo: el middleware global convierte User.delete en soft-delete (marca
    // deletedAt). Aquí queremos un borrado real —si no, el correo quedaría
    // ocupado para siempre y no se podría volver a registrar— así que se
    // ejecuta en SQL directo, que el middleware no intercepta.
    await this.prisma.$transaction([
      this.prisma.$executeRaw`DELETE FROM refresh_tokens WHERE "userId" = ${userId}::uuid`,
      this.prisma.$executeRaw`DELETE FROM signer_profiles WHERE "userId" = ${userId}::uuid`,
      this.prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}::uuid`,
    ]);

    return { id: userId, message: `La cuenta de ${user.email} fue eliminada definitivamente.` };
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

    return {
      id: invitation.id,
      token,
      link: `${this.frontendUrl()}/signer-register?token=${token}`,
      signerRole: invitation.signerRole,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Lista las invitaciones incluyendo el link completo: mientras siga activa,
   * el admin necesita poder volver a copiarlo (p. ej. si se perdió el correo).
   */
  async listInvitations() {
    const invitations = await this.prisma.signerInvitation.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return invitations.map((inv) => {
      const isActive = !inv.usedAt && inv.expiresAt > now;
      return {
        ...inv,
        isActive,
        isExpired: !inv.usedAt && inv.expiresAt <= now,
        // El link solo tiene sentido mientras la invitación pueda usarse
        link: isActive ? `${this.frontendUrl()}/signer-register?token=${inv.token}` : null,
      };
    });
  }

  /** Elimina una invitación: el link deja de funcionar de inmediato. */
  async deleteInvitation(id: string) {
    const invitation = await this.prisma.signerInvitation.findUnique({ where: { id } });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');

    await this.prisma.signerInvitation.delete({ where: { id } });
    return {
      id,
      message: invitation.usedAt
        ? 'Invitación eliminada del historial.'
        : 'Invitación eliminada: el link dejó de ser válido.',
    };
  }

  private frontendUrl(): string {
    return (
      process.env.FRONTEND_URL ||
      (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',')[0].trim() : 'http://localhost:3000')
    );
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
