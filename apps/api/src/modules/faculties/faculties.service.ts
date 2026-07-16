import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';

@Injectable()
export class FacultiesService {
  constructor(private prisma: PrismaService) {}

  async create(createFacultyDto: CreateFacultyDto) {
    const existing = await this.prisma.faculty.findUnique({
      where: { name: createFacultyDto.name }
    });

    if (existing) throw new ConflictException('La facultad ya existe');

    return this.prisma.faculty.create({
      data: createFacultyDto
    });
  }

  findAll() {
    return this.prisma.faculty.findMany();
  }

  findOne(id: string) {
    return this.prisma.faculty.findUnique({ where: { id } });
  }

  update(id: string, updateFacultyDto: UpdateFacultyDto) {
    return this.prisma.faculty.update({
      where: { id },
      data: updateFacultyDto
    });
  }

  remove(id: string) {
    return this.prisma.faculty.delete({ where: { id } });
  }

  async updateAbbreviation(id: string, abbreviation: string) {
    return this.prisma.faculty.update({
      where: { id },
      data: { abbreviation: abbreviation.toUpperCase().trim() },
    });
  }
}
