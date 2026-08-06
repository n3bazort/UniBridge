import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService
  ) {}

  async create(createStudentDto: CreateStudentDto) {
    const existing = await this.prisma.student.findUnique({
      where: { dni: createStudentDto.dni }
    });

    if (existing) {
      throw new ConflictException('Ya existe un estudiante registrado con ese DNI');
    }

    const { email, ...dtoData } = createStudentDto;

    // 1. Resolver facultyId desde la carrera (Program) si no viene especificado
    let facultyId = dtoData.facultyId;
    if (!facultyId) {
      const prog = await this.prisma.program.findUnique({
        where: { id: dtoData.programId }
      });
      if (!prog) {
        throw new NotFoundException('La carrera seleccionada no existe');
      }
      facultyId = prog.facultyId;
    }

    // 2. Resolver o crear el registro de usuario (User) para el estudiante
    let userId = dtoData.userId;
    if (!userId) {
      const studentEmail = email || `${dtoData.dni}@estudiantes.unibridge.edu.ec`;
      const existingUser = await this.prisma.user.findUnique({
        where: { email: studentEmail }
      });

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const hashedPassword = await bcrypt.hash(dtoData.dni, 10);
        const newUser = await this.prisma.user.create({
          data: {
            email: studentEmail,
            password: hashedPassword,
            role: 'STUDENT',
          }
        });
        userId = newUser.id;
      }
    }

    return this.prisma.student.create({
      data: {
        ...dtoData,
        facultyId,
        userId,
      },
      include: {
        program: true,
        faculty: true,
        user: true,
      }
    });
  }

  async findAll(paginationDto: PaginationDto) {
    const page = Number(paginationDto.page) || 1;
    const limit = Number(paginationDto.limit) || 10;
    const { search, sortBy = 'createdAt', sortOrder = 'desc' } = paginationDto;
    const skip = (page - 1) * limit;
    
    const where: Prisma.StudentWhereInput = {};
    
    // Búsqueda por nombre, apellido o DNI directamente en la base de datos
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { dni: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (paginationDto.unassignedOnly === 'true' || paginationDto.unassignedOnly === true) {
      where.practices = {
        none: {
          status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] }
        }
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          program: { select: { name: true } },
          user: { select: { email: true } }
        }
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findOne(id: string) {
    return this.prisma.student.findUnique({
      where: { id },
      include: {
        program: { select: { name: true } },
        practices: true
      }
    });
  }

  update(id: string, updateStudentDto: UpdateStudentDto) {
    return this.prisma.student.update({
      where: { id },
      data: updateStudentDto
    });
  }

  remove(id: string) {
    return this.prisma.student.delete({ where: { id } });
  }

  async getProfileByUserId(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      include: {
        program: true,
        faculty: true,
        practices: {
          include: {
            company: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        generatedDocs: {
          include: {
            template: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!student) {
      throw new Error('Estudiante no encontrado');
    }

    return student;
  }
}
