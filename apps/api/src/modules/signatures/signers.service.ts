import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SignerRole, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class SignersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Correos con privilegio root (dueños del sistema). Definidos en
   * ROOT_ADMIN_EMAILS (separados por coma) en el entorno del servidor —
   * NUNCA en la base de datos, para que nadie los altere desde la app.
   * Solo un root puede crear o tocar otras cuentas ADMIN.
   */
  private rootEmails(): string[] {
    return (process.env.ROOT_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  private isRoot(email?: string | null): boolean {
    if (!email) return false;
    return this.rootEmails().includes(email.toLowerCase());
  }

  /**
   * Verifica que el actor pueda otorgar el rol solicitado.
   * Crear/gestionar un ADMIN es privilegio EXCLUSIVO de un root: así, aunque
   * una cuenta admin común sea comprometida, no puede fabricar más admins ni
   * escalar a tomar el control total.
   */
  private async assertCanGrantRole(actorId: string | undefined, targetRole: Role) {
    if (targetRole !== 'ADMIN') return; // coordinadores/firmantes: cualquier admin
    const actor = actorId
      ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { email: true } })
      : null;
    if (!this.isRoot(actor?.email)) {
      throw new ForbiddenException(
        'Solo el administrador raíz del sistema puede crear o gestionar cuentas de Administrador.',
      );
    }
  }

  async createSigner(dto: {
    email: string;
    password?: string;
    fullName?: string;
    title?: string;
    signerRole?: SignerRole;
    role: Role;
    facultyId?: string;
    programId?: string;
  }, actorId?: string) {
    await this.assertCanGrantRole(actorId, dto.role);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Ya existe un usuario con ese correo');

    const tempPassword = dto.password || crypto.randomBytes(6).toString('base64url');
    const hashed = await bcrypt.hash(tempPassword, 10);

    const userData: any = {
      email: dto.email,
      password: hashed,
      role: dto.role,
    };

    if (dto.role === 'SIGNER') {
      if (!dto.signerRole || !dto.fullName) throw new BadRequestException('Faltan datos para el firmante');
      userData.signerProfile = {
        create: {
          signerRole: dto.signerRole,
          fullName: dto.fullName,
          title: dto.title,
        },
      };
    } else if (dto.role === 'COORDINATOR') {
      // La carrera define la facultad; se acepta cualquiera de las dos como ancla
      const facultyId = dto.facultyId || (dto.programId
        ? (await this.prisma.program.findUnique({ where: { id: dto.programId }, select: { facultyId: true } }))?.facultyId
        : undefined);
      if (!facultyId) throw new BadRequestException('Falta la carrera (o facultad) para el coordinador');
      userData.coordinator = {
        create: {
          facultyId,
          programId: dto.programId || null,
        },
      };
    }

    const user = await this.prisma.user.create({
      data: userData,
      include: { signerProfile: true, coordinator: true },
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      signerRole: user.signerProfile?.signerRole,
      fullName: user.signerProfile?.fullName,
      temporaryPassword: dto.password ? undefined : tempPassword,
    };
  }

  async listSigners() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'COORDINATOR', 'SIGNER'] }, deletedAt: null },
      include: { signerProfile: true, coordinator: { include: { faculty: true, program: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      suspendedAt: user.suspendedAt,
      createdAt: user.createdAt,
      isRoot: this.isRoot(user.email),
      signerRole: user.signerProfile?.signerRole,
      fullName: user.signerProfile?.fullName || user.email.split('@')[0],
      title: user.signerProfile?.title,
      facultyName: user.coordinator?.faculty?.name,
      programName: user.coordinator?.program?.name,
    }));
  }

  async setSuspended(userId: string, suspended: boolean, actorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { signerProfile: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Una cuenta root es intocable desde la app; y tocar cualquier admin
    // (aunque no sea root) exige ser root.
    if (this.isRoot(user.email)) {
      throw new ForbiddenException('La cuenta raíz del sistema no puede inhabilitarse desde la aplicación.');
    }
    await this.assertCanGrantRole(actorId, user.role);

    if (suspended && user.role === 'SIGNER' && user.signerProfile) {
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
          `No se puede inhabilitar: es el único activo y hay ${pending} lote(s) esperando firma.`
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
        ? `La cuenta quedó inhabilitada: no podrá iniciar sesión.`
        : `La cuenta fue reactivada.`,
    };
  }

  /**
   * El administrador restablece la contraseña de un usuario: genera una clave
   * temporal aleatoria y la devuelve UNA vez para que el admin se la entregue.
   * Cierra las sesiones abiertas de ese usuario.
   *
   * Restablecer a un ADMIN exige ser root (mismo candado que crear admins).
   * La cuenta root solo se restablece con el script create-root.js.
   */
  async resetUserPassword(userId: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (this.isRoot(user.email)) {
      throw new ForbiddenException('La contraseña de la cuenta raíz solo se restablece con el script create-root.js.');
    }
    await this.assertCanGrantRole(actorId, user.role);

    // Clave temporal legible: 3 bloques (ej. "k7m-9qx-4pz")
    const tempPassword = Array.from({ length: 3 }, () => crypto.randomBytes(2).toString('hex')).join('-');
    const hashed = await bcrypt.hash(tempPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { password: hashed } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    return {
      id: userId,
      email: user.email,
      temporaryPassword: tempPassword,
      message: `Contraseña restablecida. Entrega esta clave temporal a ${user.email} y pídele que la cambie al ingresar.`,
    };
  }

  async deleteSigner(userId: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { signerProfile: true, coordinator: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (this.isRoot(user.email)) {
      throw new ForbiddenException('La cuenta raíz del sistema no puede eliminarse desde la aplicación.');
    }
    await this.assertCanGrantRole(actorId, user.role);

    if (user.role === 'SIGNER') {
      const [deanSigs, finalSigs, batches, generated, invalidated] = await Promise.all([
        this.prisma.signatureBatchItem.count({ where: { deanSignedById: userId } }),
        this.prisma.signatureBatchItem.count({ where: { finalSignedById: userId } }),
        this.prisma.signatureBatch.count({ where: { createdById: userId } }),
        this.prisma.generatedDocument.count({ where: { generatedById: userId } }),
        this.prisma.generatedDocument.count({ where: { invalidatedById: userId } }),
      ]);

      const traces = deanSigs + finalSigs + batches + generated + invalidated;
      if (traces > 0) {
        throw new ConflictException(
          `No se puede eliminar: tiene ${traces} registro(s) en el historial. Inhabilítalo en su lugar.`
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.$executeRaw`DELETE FROM refresh_tokens WHERE "userId" = ${userId}::uuid`,
      this.prisma.$executeRaw`DELETE FROM signer_profiles WHERE "userId" = ${userId}::uuid`,
      this.prisma.$executeRaw`DELETE FROM coordinators WHERE "userId" = ${userId}::uuid`,
      this.prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}::uuid`,
    ]);

    return { id: userId, message: `La cuenta fue eliminada definitivamente.` };
  }

  async createInvitation(
    createdById: string,
    dto: { role: Role; signerRole?: SignerRole; email?: string; fullName?: string; expiresInDays?: number; facultyId?: string; programId?: string },
  ) {
    // Una invitación de ADMIN es otra vía de escalar privilegios: mismo candado.
    await this.assertCanGrantRole(createdById, dto.role);

    const token = crypto.randomBytes(32).toString('base64url');
    const days = Math.min(Math.max(dto.expiresInDays ?? 7, 1), 30);

    let coordFaculty: string | null = null;
    if (dto.role === 'COORDINATOR') {
      coordFaculty = dto.facultyId || (dto.programId
        ? (await this.prisma.program.findUnique({ where: { id: dto.programId }, select: { facultyId: true } }))?.facultyId || null
        : null);
    }

    const invitation = await this.prisma.userInvitation.create({
      data: {
        token,
        role: dto.role,
        signerRole: dto.role === 'SIGNER' ? dto.signerRole : null,
        facultyId: coordFaculty,
        programId: dto.role === 'COORDINATOR' ? dto.programId : null,
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
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  async listInvitations() {
    const invitations = await this.prisma.userInvitation.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return invitations.map((inv) => {
      const isActive = !inv.usedAt && inv.expiresAt > now;
      return {
        ...inv,
        isActive,
        isExpired: !inv.usedAt && inv.expiresAt <= now,
        link: isActive ? `${this.frontendUrl()}/signer-register?token=${inv.token}` : null,
      };
    });
  }

  async deleteInvitation(id: string) {
    const invitation = await this.prisma.userInvitation.findUnique({ where: { id } });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');

    await this.prisma.userInvitation.delete({ where: { id } });
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

  async validateInvitation(token: string) {
    const invitation = await this.prisma.userInvitation.findUnique({ 
      where: { token },
      include: { createdBy: true }
    });
    if (!invitation) throw new NotFoundException('Invitación no válida');
    if (invitation.usedAt) throw new BadRequestException('Esta invitación ya fue utilizada');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Esta invitación ha expirado');
    return {
      role: invitation.role,
      signerRole: invitation.signerRole,
      facultyId: invitation.facultyId,
      email: invitation.email,
      fullName: invitation.fullName,
      inviterEmail: invitation.createdBy.email,
    };
  }

  async registerWithInvitation(dto: {
    token: string;
    email: string;
    password: string;
    fullName?: string;
    title?: string;
  }) {
    const invitation = await this.prisma.userInvitation.findUnique({ where: { token: dto.token } });
    if (!invitation) throw new NotFoundException('Invitación no válida');
    if (invitation.usedAt) throw new BadRequestException('Esta invitación ya fue utilizada');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Esta invitación ha expirado');

    if (invitation.email && invitation.email.toLowerCase() !== dto.email.toLowerCase()) {
      throw new BadRequestException('El correo no coincide con el de la invitación');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Ya existe un usuario con ese correo');

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const userData: any = {
      email: dto.email,
      password: hashed,
      role: invitation.role,
    };

    if (invitation.role === 'SIGNER') {
      userData.signerProfile = {
        create: {
          signerRole: invitation.signerRole,
          fullName: dto.fullName || 'Autoridad',
          title: dto.title,
        },
      };
    } else if (invitation.role === 'COORDINATOR') {
      userData.coordinator = {
        create: {
          facultyId: invitation.facultyId,
          programId: invitation.programId || null,
        },
      };
    }

    const [user] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: userData,
      }),
      this.prisma.userInvitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { id: user.id, email: user.email, message: 'Registro completado. Ya puedes iniciar sesión.' };
  }
}
