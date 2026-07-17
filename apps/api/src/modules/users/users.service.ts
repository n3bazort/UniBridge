import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /** Correos root (dueños del sistema), definidos solo en el entorno. */
  private isRoot(email?: string | null): boolean {
    if (!email) return false;
    const roots = (process.env.ROOT_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    return roots.includes(email.toLowerCase());
  }

  async create(createUserDto: CreateUserDto, actorId?: string) {
    const { facultyId: rawFacultyId, programId, ...userData } = createUserDto;
    // La carrera define la facultad; se acepta cualquiera de las dos como ancla
    const facultyId = rawFacultyId || (programId
      ? (await this.prisma.program.findUnique({ where: { id: programId }, select: { facultyId: true } }))?.facultyId
      : undefined);

    // Crear un ADMIN es privilegio exclusivo del root: cierra la vía de
    // escalada de privilegios por este endpoint genérico.
    if (userData.role === 'ADMIN') {
      const actor = actorId
        ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { email: true } })
        : null;
      if (!this.isRoot(actor?.email)) {
        throw new ForbiddenException('Solo el administrador raíz puede crear cuentas de Administrador.');
      }
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: userData.email },
    });
    if (existingUser) throw new ConflictException('El email ya está registrado');

    // Un coordinador sin facultad no puede operar: el multi-tenancy filtra
    // todos sus datos por facultyId. Se exige al crear, no después.
    if (userData.role === 'COORDINATOR' && !facultyId) {
      throw new ConflictException('Un coordinador necesita una carrera (o facultad) asignada');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { ...userData, password: hashedPassword },
        select: { id: true, email: true, role: true, createdAt: true },
      });
      if (userData.role === 'COORDINATOR' && facultyId) {
        await tx.coordinator.create({ data: { userId: user.id, facultyId, programId: programId || null } });
      }
      return user;
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        suspendedAt: true,
        coordinator: { select: { faculty: { select: { name: true } } } },
      },
    });
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const data: any = { ...updateUserDto };
    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, role: true, updatedAt: true },
    });
  }

  remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }

  // --- Helpers for Auth ---
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findCoordinatorByUserId(userId: string) {
    return this.prisma.coordinator.findUnique({ where: { userId } });
  }
}
