import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

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

    const firstNameWords = dtoData.firstName.trim().split(/\s+/).filter(Boolean);
    if (firstNameWords.length < 2) {
      throw new BadRequestException('Debe ingresar 2 nombres para el estudiante (ej: Dilian Alexander)');
    }

    const lastNameWords = dtoData.lastName.trim().split(/\s+/).filter(Boolean);
    if (lastNameWords.length < 2) {
      throw new BadRequestException('Debe ingresar 2 apellidos para el estudiante (ej: García López)');
    }

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

    // El estudiante NO recibe cuenta de acceso. Antes se le creaba un `User`
    // con la cédula por contraseña, pero el estudiante nunca entra al sistema:
    // es el sujeto del trámite, no quien lo opera. Crear credenciales que nadie
    // usa solo añadía superficie de ataque y datos que custodiar.
    return this.prisma.student.create({
      data: {
        ...dtoData,
        facultyId,
      },
      include: {
        program: true,
        faculty: true,
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
          program: { select: { name: true } }
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

}
