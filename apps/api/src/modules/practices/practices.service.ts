import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreatePracticeDto } from './dto/create-practice.dto';
import { UpdatePracticeDto } from './dto/update-practice.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PracticesService {
  constructor(private prisma: PrismaService) {}

  async create(createPracticeDto: CreatePracticeDto) {
    try {
      return await this.prisma.practice.create({
        data: createPracticeDto,
        include: {
          student: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } }
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('El estudiante ya tiene una práctica registrada en este periodo académico');
      }
      throw error;
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const page = Number(paginationDto.page) || 1;
    const limit = Number(paginationDto.limit) || 10;
    const { search, sortBy = 'createdAt', sortOrder = 'desc' } = paginationDto;
    const skip = (page - 1) * limit;

    const where: Prisma.PracticeWhereInput = {};
    if (search) {
      where.OR = [
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
        { student: { dni: { contains: search, mode: 'insensitive' } } },
        { company: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.practice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          student: { 
            include: {
              user: { select: { email: true } },
              program: { select: { name: true } }
            }
          },
          company: true
        }
      }),
      this.prisma.practice.count({ where }),
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
    return this.prisma.practice.findUnique({
      where: { id },
      include: {
        student: true,
        company: true
      }
    });
  }

  update(id: string, updatePracticeDto: UpdatePracticeDto) {
    return this.prisma.practice.update({
      where: { id },
      data: updatePracticeDto
    });
  }

  remove(id: string) {
    return this.prisma.practice.delete({ where: { id } });
  }

  async bulkImport(programName: string, students: any[], facultyId?: string) {
    if (!facultyId) {
      const defaultFaculty = await this.prisma.faculty.findFirst();
      if (!defaultFaculty) throw new ConflictException('No hay facultades registradas en el sistema');
      facultyId = defaultFaculty.id;
    }

    let program = await this.prisma.program.findFirst({ where: { name: programName, facultyId } });
    if (!program) {
      program = await this.prisma.program.create({
        data: { name: programName, facultyId }
      });
    }

    let importedCount = 0;

    for (const row of students) {
      if (!row.dni) continue;

      const companyName = row.companyName || 'Empresa No Especificada';
      let company = await this.prisma.company.upsert({
        where: { name: companyName },
        update: {
          contactName: row.companyTutor || undefined,
          email: row.companyEmail || undefined,
          phone: row.companyPhone || undefined,
          recipientName: row.destinatarioOficio || undefined
        },
        create: {
          name: companyName,
          contactName: row.companyTutor,
          email: row.companyEmail,
          phone: row.companyPhone,
          recipientName: row.destinatarioOficio
        }
      });

      let user = await this.prisma.user.findUnique({ where: { email: row.email } });
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: row.email,
            password: 'temporal123',
            role: 'STUDENT'
          }
        });
      }

      let student = await this.prisma.student.findUnique({ where: { dni: row.dni } });
      if (!student) {
        student = await this.prisma.student.create({
          data: {
            dni: row.dni,
            firstName: row.firstName,
            lastName: row.lastName,
            facultyId,
            programId: program.id,
            userId: user.id
          }
        });
      }

      await this.prisma.practice.upsert({
        where: {
          studentId_academicPeriod: {
            studentId: student.id,
            academicPeriod: row.academicPeriod || '2024-1'
          }
        },
        update: {
          companyId: company.id,
          tutorName: row.tutorName,
          practiceLevel: row.practiceLevel,
          academicLevel: row.academicLevel,
          totalHours: row.totalHours,
          status: 'COMPLETED'
        },
        create: {
          studentId: student.id,
          companyId: company.id,
          facultyId,
          academicPeriod: row.academicPeriod || '2024-1',
          tutorName: row.tutorName,
          practiceLevel: row.practiceLevel,
          academicLevel: row.academicLevel,
          totalHours: row.totalHours,
          status: 'COMPLETED'
        }
      });

      importedCount++;
    }

    return { count: importedCount };
  }

  async getDashboardStats(facultyId?: string) {
    const whereCondition = facultyId ? { facultyId } : {};

    // 1. KPIs
    const activePractices = await this.prisma.practice.count({
      where: { ...whereCondition, status: 'IN_PROGRESS' },
    });

    const activeStudentsResult = await this.prisma.practice.groupBy({
      by: ['studentId'],
      where: { ...whereCondition, status: 'IN_PROGRESS' },
    });
    const activeStudents = activeStudentsResult.length;

    const totalCompaniesResult = await this.prisma.practice.groupBy({
      by: ['companyId'],
      where: whereCondition,
    });
    const totalCompanies = totalCompaniesResult.length;

    const hoursResult = await this.prisma.practice.aggregate({
      _sum: { totalHours: true },
      where: whereCondition,
    });
    const totalHours = hoursResult._sum.totalHours || 0;

    const allPracticesCount = await this.prisma.practice.count({ where: whereCondition });
    const completedPracticesCount = await this.prisma.practice.count({
      where: { ...whereCondition, status: 'COMPLETED' },
    });
    const completionRate = allPracticesCount > 0 ? Math.round((completedPracticesCount / allPracticesCount) * 100) : 0;

    const activeAlerts = await this.prisma.practice.count({
      where: { ...whereCondition, status: { in: ['DELAYED', 'REJECTED'] } },
    });

    // 2. Status Distribution (Donut Chart)
    const statusDistributionResult = await this.prisma.practice.groupBy({
      by: ['status'],
      _count: { studentId: true },
      where: whereCondition,
    });
    const statusDistribution = statusDistributionResult.map(s => ({
      status: s.status,
      count: s._count.studentId,
    }));

    // 3. Period Distribution (Vertical Bar Chart)
    const periodDistributionResult = await this.prisma.practice.groupBy({
      by: ['academicPeriod'],
      _count: { studentId: true },
      where: whereCondition,
    });
    const periodDistribution = periodDistributionResult.map(p => ({
      period: p.academicPeriod || 'Sin definir',
      count: p._count.studentId,
    })).sort((a, b) => a.period.localeCompare(b.period));

    // 4. Career Distribution (Horizontal Bar Chart)
    const practicesWithProgram = await this.prisma.practice.findMany({
      where: whereCondition,
      select: { student: { select: { program: { select: { name: true } } } } },
    });
    
    const careerMap = new Map<string, number>();
    for (const p of practicesWithProgram) {
      const pName = p.student?.program?.name || 'Desconocida';
      careerMap.set(pName, (careerMap.get(pName) || 0) + 1);
    }
    const careerDistribution = Array.from(careerMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // top 5 carreras

    // 5. Load by Company
    const loadByCompanyResult = await this.prisma.practice.groupBy({
      by: ['companyId'],
      _count: { studentId: true },
      where: whereCondition,
      orderBy: { _count: { studentId: 'desc' } },
      take: 5,
    });

    const companies = await this.prisma.company.findMany({
      where: { id: { in: loadByCompanyResult.map(r => r.companyId) } },
      select: { id: true, name: true }
    });

    const topCompanies = loadByCompanyResult.map((r) => {
      const company = companies.find(c => c.id === r.companyId);
      return {
        name: company?.name || 'Empresa Desconocida',
        count: r._count.studentId,
      };
    });

    return {
      kpis: {
        activePractices,
        activeStudents,
        totalCompanies,
        totalHours,
        completionRate,
        activeAlerts,
      },
      charts: {
        statusDistribution,
        periodDistribution,
        careerDistribution,
      },
      operational: {
        topCompanies,
      }
    };
  }
}
