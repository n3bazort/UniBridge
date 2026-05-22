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

    // 1. Total students with practices
    const totalStudentsResult = await this.prisma.practice.groupBy({
      by: ['studentId'],
      where: whereCondition,
    });
    const totalStudents = totalStudentsResult.length;

    // 2. Average hours
    const avgHoursResult = await this.prisma.practice.aggregate({
      _avg: { totalHours: true },
      where: whereCondition,
    });
    const avgHours = Math.round(avgHoursResult._avg.totalHours || 0);

    // 3. Total Companies (with practices)
    const totalCompaniesResult = await this.prisma.practice.groupBy({
      by: ['companyId'],
      where: whereCondition,
    });
    const totalCompanies = totalCompaniesResult.length;

    // 4. Total Tutors
    const totalTutorsResult = await this.prisma.practice.groupBy({
      by: ['tutorName'],
      where: { ...whereCondition, tutorName: { not: null } },
    });
    const totalTutors = totalTutorsResult.length;

    // 5. Distribution by practice level
    const distributionResult = await this.prisma.practice.groupBy({
      by: ['practiceLevel'],
      _count: { studentId: true },
      _sum: { totalHours: true },
      where: { ...whereCondition, practiceLevel: { not: null } },
    });

    const distributionByLevel = distributionResult.map((item) => ({
      practiceLevel: item.practiceLevel,
      studentCount: item._count.studentId,
      totalHours: item._sum.totalHours || 0,
    })).sort((a, b) => b.studentCount - a.studentCount);

    // 6. Load by Company
    const loadByCompanyResult = await this.prisma.practice.groupBy({
      by: ['companyId'],
      _count: { studentId: true },
      where: whereCondition,
      orderBy: { _count: { studentId: 'desc' } },
      take: 10,
    });

    // Populate company names
    const companies = await this.prisma.company.findMany({
      where: { id: { in: loadByCompanyResult.map(r => r.companyId) } },
      select: { id: true, name: true }
    });

    const loadByCompany = loadByCompanyResult.map((r) => {
      const company = companies.find(c => c.id === r.companyId);
      return {
        companyName: company?.name || 'Empresa Desconocida',
        studentCount: r._count.studentId,
      };
    });

    // 7. Load by Tutor
    const loadByTutorResult = await this.prisma.practice.groupBy({
      by: ['tutorName'],
      _count: { studentId: true },
      where: { ...whereCondition, tutorName: { not: null } },
      orderBy: { _count: { studentId: 'desc' } },
      take: 10,
    });

    const loadByTutor = loadByTutorResult.map((r) => ({
      tutorName: r.tutorName,
      studentCount: r._count.studentId,
    }));

    return {
      totalStudents,
      avgHours,
      totalCompanies,
      totalTutors,
      distributionByLevel,
      loadByCompany,
      loadByTutor,
    };
  }
}
