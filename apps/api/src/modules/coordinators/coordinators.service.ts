import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateCoordinatorDto } from './dto/create-coordinator.dto';
import { UpdateCoordinatorDto } from './dto/update-coordinator.dto';

@Injectable()
export class CoordinatorsService {
  constructor(private prisma: PrismaService) {}

  async create(createCoordinatorDto: CreateCoordinatorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: createCoordinatorDto.userId } });
    if (!user || user.role !== 'COORDINATOR') {
      throw new ConflictException('El usuario no existe o no tiene el rol COORDINATOR');
    }

    const existing = await this.prisma.coordinator.findUnique({
      where: { userId: createCoordinatorDto.userId }
    });

    if (existing) {
      throw new ConflictException('Este usuario ya está asignado a una facultad como coordinador');
    }

    return this.prisma.coordinator.create({
      data: createCoordinatorDto,
      include: { user: { select: { email: true } }, faculty: { select: { name: true } } }
    });
  }

  findAll() {
    return this.prisma.coordinator.findMany({
      include: { user: { select: { email: true } }, faculty: { select: { name: true } } }
    });
  }

  findOne(id: string) {
    return this.prisma.coordinator.findUnique({
      where: { id },
      include: { user: { select: { email: true } }, faculty: { select: { name: true } } }
    });
  }

  update(id: string, updateCoordinatorDto: UpdateCoordinatorDto) {
    return this.prisma.coordinator.update({
      where: { id },
      data: updateCoordinatorDto
    });
  }

  remove(id: string) {
    return this.prisma.coordinator.delete({ where: { id } });
  }
}
