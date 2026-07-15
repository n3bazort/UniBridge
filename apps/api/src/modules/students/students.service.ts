import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OpenSearchService } from '../opensearch/opensearch.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private openSearchService: OpenSearchService
  ) {}

  async create(createStudentDto: CreateStudentDto) {
    const existing = await this.prisma.student.findUnique({
      where: { dni: createStudentDto.dni }
    });

    if (existing) {
      throw new ConflictException('Ya existe un estudiante registrado con ese DNI');
    }

    return this.prisma.student.create({
      data: createStudentDto
    });
  }

  async findAll(paginationDto: PaginationDto) {
    const page = Number(paginationDto.page) || 1;
    const limit = Number(paginationDto.limit) || 10;
    const { search, sortBy = 'createdAt', sortOrder = 'desc' } = paginationDto;
    const skip = (page - 1) * limit;
    
    const where: Prisma.StudentWhereInput = {};
    
    // Si hay búsqueda, intentamos usar OpenSearch
    if (search) {
      const osResults = await this.openSearchService.searchStudents(search);
      
      if (osResults !== null) {
        // OpenSearch está habilitado y respondió
        const studentIds = osResults.map((hit: any) => hit.id);
        where.id = { in: studentIds.length > 0 ? studentIds : ['no-results'] };
      } else {
        // Fallback a Prisma (OpenSearch deshabilitado)
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { dni: { contains: search, mode: 'insensitive' } }
        ];
      }
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
