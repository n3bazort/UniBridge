import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class AcademicPeriodsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.academicPeriod.findMany({
      orderBy: { startDate: 'desc' },
    });
  }

  async findActive() {
    return this.prisma.academicPeriod.findFirst({
      where: { isActive: true },
    });
  }

  async create(data: { code: string; name: string; startDate: Date; endDate: Date; isActive?: boolean; deanName?: string; directorName?: string }) {
    if (data.isActive) {
      await this.prisma.academicPeriod.updateMany({ data: { isActive: false } });
    }
    return this.prisma.academicPeriod.create({ data });
  }

  async update(id: string, data: any) {
    if (data.isActive) {
      await this.prisma.academicPeriod.updateMany({ data: { isActive: false } });
    }
    return this.prisma.academicPeriod.update({
      where: { id },
      data,
    });
  }
}
