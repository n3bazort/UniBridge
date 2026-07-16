import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ProgramsService {
  constructor(private prisma: PrismaService, private cls: ClsService) {}

  create(createProgramDto: CreateProgramDto) {
    const facultyId = this.cls.get<string>('facultyId');
    return this.prisma.program.create({
      data: {
        ...createProgramDto,
        facultyId: facultyId, // Tenancy interceptor asegura que esto exista o sea Admin global
      },
    });
  }

  async findAll(paginationDto: PaginationDto) {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = paginationDto;
    const skip = (page - 1) * limit;

    const where: Prisma.ProgramWhereInput = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.program.count({ where }),
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

  async findOne(id: string) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }

  update(id: string, updateProgramDto: UpdateProgramDto) {
    return this.prisma.program.update({
      where: { id },
      data: updateProgramDto,
    });
  }

  async remove(id: string) {
    try {
      return await this.prisma.program.delete({ where: { id } });
    } catch (error: any) {
      if (error.code === 'P2003') {
        throw new ConflictException('No se puede eliminar la carrera porque tiene estudiantes u otros datos asociados.');
      }
      throw error;
    }
  }

  async updateAbbreviation(id: string, abbreviation: string) {
    return this.prisma.program.update({
      where: { id },
      data: { abbreviation: abbreviation.toUpperCase().trim() },
    });
  }

  async findMissingAbbreviations() {
    return this.prisma.program.findMany({
      where: { abbreviation: null, deletedAt: null },
      include: { faculty: { select: { name: true, abbreviation: true } } },
    });
  }
}
