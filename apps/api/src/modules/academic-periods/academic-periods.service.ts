import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class AcademicPeriodsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.academicPeriod.findMany({
      include: {
        deanUser: { select: { id: true, email: true, signerProfile: true } },
        directorUser: { select: { id: true, email: true, signerProfile: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async findActive() {
    return this.prisma.academicPeriod.findFirst({
      where: { isActive: true },
      include: {
        deanUser: { select: { id: true, email: true, signerProfile: true } },
        directorUser: { select: { id: true, email: true, signerProfile: true } },
      },
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

    const payload = { ...data };

    if (data.deanUserId !== undefined) {
      if (data.deanUserId) {
        const user = await this.prisma.user.findUnique({
          where: { id: data.deanUserId },
          include: { signerProfile: true },
        });
        if (user) {
          const profile = user.signerProfile;
          const name = profile?.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
          payload.deanName = profile?.title ? `${profile.title} ${name}` : name;
        }
      } else {
        payload.deanUserId = null;
        payload.deanName = null;
      }
    }

    if (data.directorUserId !== undefined) {
      if (data.directorUserId) {
        const user = await this.prisma.user.findUnique({
          where: { id: data.directorUserId },
          include: { signerProfile: true },
        });
        if (user) {
          const profile = user.signerProfile;
          const name = profile?.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
          payload.directorName = profile?.title ? `${profile.title} ${name}` : name;
          payload.directorDni = profile?.dni || null;
          payload.directorPhone = profile?.phone || null;
          payload.directorEmail = user.email || null;
        }
      } else {
        payload.directorUserId = null;
        payload.directorName = null;
        payload.directorDni = null;
        payload.directorPhone = null;
        payload.directorEmail = null;
      }
    }

    return this.prisma.academicPeriod.update({
      where: { id },
      data: payload,
      include: {
        deanUser: { select: { id: true, email: true, signerProfile: true } },
        directorUser: { select: { id: true, email: true, signerProfile: true } },
      },
    });
  }
}
