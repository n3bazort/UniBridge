import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreatePracticeDto } from './dto/create-practice.dto';
import { UpdatePracticeDto } from './dto/update-practice.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Prisma, PracticeStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { derivePracticeStatus, canIssueCertificate } from './practice-status.util';

@Injectable()
export class PracticesService {
  private readonly logger = new Logger(PracticesService.name);
  constructor(private prisma: PrismaService) {}

  async create(createPracticeDto: CreatePracticeDto) {
    // Auto-assign the active academic period
    const activePeriod = await this.prisma.academicPeriod.findFirst({ where: { isActive: true } });
    if (!activePeriod) {
      throw new ConflictException('No hay un periodo académico activo configurado. Contacte al administrador para activar un periodo.');
    }

    // If a period was provided, validate it matches the active one
    if (createPracticeDto.academicPeriod && createPracticeDto.academicPeriod !== activePeriod.code) {
      throw new ConflictException(
        `El periodo "${createPracticeDto.academicPeriod}" no coincide con el periodo activo "${activePeriod.code}". Las prácticas solo se pueden registrar en el periodo activo.`
      );
    }

    try {
      return await this.prisma.practice.create({
        data: {
          ...createPracticeDto,
          academicPeriod: activePeriod.code, // Always use the active period
        },
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
              program: { select: { name: true } },
              generatedDocs: {
                select: {
                  id: true,
                  status: true,
                  documentCode: true,
                  documentType: true,
                  invalidReason: true,
                  createdAt: true,
                  template: { select: { type: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
              }
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

  // ─────────────────────────────────────────────────────────────
  // ESTADOS DERIVADOS: el estado no se escribe a mano, se calcula
  // de los documentos emitidos y sus firmas. Ver practice-status.util.ts
  // ─────────────────────────────────────────────────────────────

  /**
   * Recalcula el estado de una práctica a partir de sus documentos.
   * Se llama sola cuando cambia algo que puede afectarlo (solicitud
   * generada/invalidada, certificado firmado, reasignación de empresa).
   */
  async recalculateStatus(practiceId: string): Promise<PracticeStatus | null> {
    const practice = await this.prisma.practice.findUnique({
      where: { id: practiceId },
      include: {
        student: {
          include: {
            generatedDocs: { select: { documentType: true, status: true, signatureStatus: true } },
          },
        },
      },
    });
    if (!practice) return null;

    const next = derivePracticeStatus(practice, practice.student.generatedDocs);
    if (next !== practice.status) {
      await this.prisma.practice.update({ where: { id: practiceId }, data: { status: next } });
    }
    return next;
  }

  /** Recalcula el estado de todas las prácticas de estos estudiantes. */
  async recalculateForStudents(studentIds: string[]): Promise<void> {
    if (!studentIds?.length) return;
    const practices = await this.prisma.practice.findMany({
      where: { studentId: { in: studentIds } },
      select: { id: true },
    });
    for (const p of practices) {
      await this.recalculateStatus(p.id).catch((): null => null);
    }
  }

  /**
   * Recalcula TODAS las prácticas. Sirve para sincronizar datos importados
   * de Excel, cuyo estado venía escrito a mano y no refleja el proceso real.
   */
  async recalculateAllStatuses() {
    const practices = await this.prisma.practice.findMany({
      include: {
        student: {
          include: {
            generatedDocs: { select: { documentType: true, status: true, signatureStatus: true } },
          },
        },
      },
    });

    const changes: Record<string, number> = {};
    const updates: { id: string; status: PracticeStatus }[] = [];

    for (const p of practices) {
      const next = derivePracticeStatus(p, p.student.generatedDocs);
      if (next !== p.status) {
        updates.push({ id: p.id, status: next });
        const key = `${p.status} → ${next}`;
        changes[key] = (changes[key] || 0) + 1;
      }
    }

    // En lotes para no abrir una transacción gigante
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await this.prisma.$transaction(
        updates.slice(i, i + CHUNK).map((u) =>
          this.prisma.practice.update({ where: { id: u.id }, data: { status: u.status } }),
        ),
      );
    }

    return { total: practices.length, updated: updates.length, changes };
  }

  async update(id: string, updatePracticeDto: UpdatePracticeDto, actorId?: string) {
    const practice = await this.prisma.practice.findUnique({
      where: { id },
      include: { student: true, company: true },
    });
    if (!practice) throw new NotFoundException('Práctica no encontrada');

    // "Finalizado" ya no se marca a mano: es la consecuencia de tener el
    // certificado firmado por ambas autoridades. Se deriva automáticamente.
    if (updatePracticeDto.status === 'COMPLETED') {
      throw new ConflictException(
        'El estado "Finalizado" no se asigna manualmente: se alcanza cuando el certificado queda firmado por el Decano y el Responsable de Prácticas.',
      );
    }

    // ── Reasignación de empresa ──
    // Las solicitudes son documentos GRUPALES: un oficio lista a todos los
    // estudiantes de la empresa. Mover a un estudiante deja obsoleto el
    // oficio del grupo entero, así que se invalida en cascada.
    const isReassignment =
      updatePracticeDto.companyId && updatePracticeDto.companyId !== practice.companyId;

    let reassignment: {
      invalidatedDocumentIds: string[];
      invalidatedCodes: string[];
      affectedStudentIds: string[];
    } | null = null;

    if (isReassignment) {
      reassignment = await this.invalidateGroupSolicitudes(
        practice.studentId,
        `${practice.student.firstName} ${practice.student.lastName}`,
        practice.company?.name || 'Sin empresa',
        updatePracticeDto.companyId!,
        actorId,
      );
    }

    let dataToUpdate = { ...updatePracticeDto };

    if (isReassignment && !updatePracticeDto.tutorName) {
      // Buscar tutor de la nueva empresa
      const peerPractice = await this.prisma.practice.findFirst({
        where: { companyId: updatePracticeDto.companyId, tutorName: { not: null } },
        select: { tutorName: true }
      });
      if (peerPractice?.tutorName) {
        dataToUpdate.tutorName = peerPractice.tutorName;
      } else {
        const newCompanyInfo = await this.prisma.company.findUnique({ where: { id: updatePracticeDto.companyId! }});
        if (newCompanyInfo?.contactName) {
          dataToUpdate.tutorName = newCompanyInfo.contactName;
        }
      }
    }

    const updated = await this.prisma.practice.update({
      where: { id },
      data: dataToUpdate,
      include: { company: true, student: true },
    });

    // La reasignación invalida la solicitud del grupo: los estados de todos
    // los afectados dejan de reflejar la realidad hasta recalcularlos.
    if (reassignment) {
      await this.recalculateStatus(id).catch((): null => null);
      await this.recalculateForStudents(reassignment.affectedStudentIds).catch((): void => undefined);
    }

    return reassignment ? { ...updated, reassignment } : updated;
  }

  /**
   * Invalida (SUPERSEDED) las solicitudes vigentes del estudiante Y las de
   * todo su grupo (mismo documentCode). Candados: certificado emitido o
   * documento dentro del circuito de firma bloquean la reasignación.
   */
  private async invalidateGroupSolicitudes(
    studentId: string,
    studentName: string,
    oldCompanyName: string,
    newCompanyId: string,
    actorId?: string,
  ) {
    // Candado 1: certificado de culminación vigente — moverlo lo volvería falso
    const validCert = await this.prisma.generatedDocument.findFirst({
      where: { studentId, documentType: 'CERTIFICADO', status: 'VALID' },
    });
    if (validCert) {
      throw new ConflictException(
        `No se puede reasignar la empresa: el estudiante tiene un certificado de culminación vigente (${validCert.documentCode}) emitido para ${oldCompanyName}. Invalida primero el certificado.`,
      );
    }

    // Solicitudes vigentes del estudiante que se mueve
    const ownDocs = await this.prisma.generatedDocument.findMany({
      where: { studentId, documentType: 'SOLICITUD', status: 'VALID' },
    });
    const codes = [...new Set(ownDocs.map((d) => d.documentCode).filter(Boolean))] as string[];
    if (codes.length === 0) {
      return { invalidatedDocumentIds: [], invalidatedCodes: [], affectedStudentIds: [] };
    }

    // Candado 2: el oficio está dentro del circuito de firma
    const inSigning = await this.prisma.generatedDocument.findFirst({
      where: {
        documentCode: { in: codes },
        signatureStatus: { in: ['IN_SIGNING', 'PARTIALLY_SIGNED'] },
      },
    });
    if (inSigning) {
      throw new ConflictException(
        `No se puede reasignar la empresa: la solicitud ${inSigning.documentCode} está en el circuito de firma. Espera a que el lote se complete o rechácelo primero.`,
      );
    }

    const newCompany = await this.prisma.company.findUnique({ where: { id: newCompanyId } });
    if (!newCompany) throw new NotFoundException('La empresa destino no existe');

    // Cascada: TODAS las filas del grupo que comparten el oficio
    const groupDocs = await this.prisma.generatedDocument.findMany({
      where: { documentCode: { in: codes }, documentType: 'SOLICITUD', status: 'VALID' },
    });

    await this.prisma.generatedDocument.updateMany({
      where: { id: { in: groupDocs.map((d) => d.id) } },
      data: {
        status: 'SUPERSEDED',
        invalidatedAt: new Date(),
        invalidatedById: actorId,
        invalidReason: `Reasignación de empresa: ${studentName} pasó de ${oldCompanyName} a ${newCompany.name}. El oficio grupal quedó desactualizado.`,
      },
    });

    return {
      invalidatedDocumentIds: groupDocs.map((d) => d.id),
      invalidatedCodes: codes,
      affectedStudentIds: [...new Set(groupDocs.map((d) => d.studentId))].filter((s) => s !== studentId),
    };
  }

  /**
   * Deshacer una reasignación: restaura a VALID las solicitudes que fueron
   * marcadas SUPERSEDED por el cambio de empresa (ventana de "Deshacer").
   */
  async restoreDocuments(documentIds: string[]) {
    const result = await this.prisma.generatedDocument.updateMany({
      where: { id: { in: documentIds }, status: 'SUPERSEDED' },
      data: { status: 'VALID', invalidatedAt: null, invalidReason: null, invalidatedById: null },
    });
    return { restored: result.count };
  }

  remove(id: string) {
    return this.prisma.practice.delete({ where: { id } });
  }

  async bulkImport(programName: string, students: any[], facultyId?: string) {
    // Validate or auto-create active period
    let activePeriod = await this.prisma.academicPeriod.findFirst({ where: { isActive: true } });
    if (!activePeriod) {
      // Auto-create a default active period based on current date
      const now = new Date();
      const year = now.getFullYear();
      const semester = now.getMonth() < 6 ? 1 : 2;
      const code = `${year}-${semester}`;
      activePeriod = await this.prisma.academicPeriod.create({
        data: {
          code,
          name: `Periodo ${code}`,
          startDate: new Date(year, semester === 1 ? 0 : 6, 1),
          endDate: new Date(year, semester === 1 ? 5 : 11, 30),
          isActive: true,
        }
      });
    }

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
      this.logger.warn(`Programa "${programName}" creado automáticamente sin abreviatura. Se requiere configuración.`);
    }

    let importedCount = 0;
    const errors: string[] = [];

    // Helper para dividir en lotes de 10 y acelerar la importación
    const chunkSize = 15;
    const batches = [];
    for (let i = 0; i < students.length; i += chunkSize) {
      batches.push(students.slice(i, i + chunkSize));
    }

    for (const batch of batches) {
      await Promise.all(batch.map(async (row) => {
        if (!row.dni) return;

        try {
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
            const hashedPassword = await bcrypt.hash(`temporal-${row.dni}`, 10);
            try {
              user = await this.prisma.user.create({
                data: {
                  email: row.email,
                  password: hashedPassword,
                  role: 'STUDENT'
                }
              });
            } catch(e) {
              // Si falla por concurrencia, intentar buscar de nuevo
              user = await this.prisma.user.findUnique({ where: { email: row.email } });
              if (!user) throw e;
            }
          }

          let student = await this.prisma.student.findUnique({ where: { dni: row.dni } });
          if (!student) {
            const existingStudentForUser = await this.prisma.student.findUnique({ where: { userId: user.id } });
            if (existingStudentForUser) {
              student = existingStudentForUser;
            } else {
              try {
                student = await this.prisma.student.create({
                  data: {
                    dni: row.dni,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    phone: row.phone || null,
                    facultyId,
                    programId: program.id,
                    userId: user.id
                  }
                });
              } catch(e) {
                student = await this.prisma.student.findUnique({ where: { dni: row.dni } });
                if (!student) throw e;
              }
            }
          }

          if (row.phone && !student.phone) {
            await this.prisma.student.update({
              where: { id: student.id },
              data: { phone: row.phone }
            });
            student = { ...student, phone: row.phone };
          }

          const rowProgramName = row.programName || programName;
          if (rowProgramName !== programName) {
            let rowProgram = await this.prisma.program.findFirst({ where: { name: rowProgramName, facultyId } });
            if (!rowProgram) {
              try {
                rowProgram = await this.prisma.program.create({
                  data: { name: rowProgramName, facultyId }
                });
                this.logger.warn(`Programa "${rowProgramName}" creado automáticamente sin abreviatura. Se requiere configuración.`);
              } catch(e) {
                rowProgram = await this.prisma.program.findFirst({ where: { name: rowProgramName, facultyId } });
              }
            }
            if (rowProgram && student.programId !== rowProgram.id) {
              await this.prisma.student.update({
                where: { id: student.id },
                data: { programId: rowProgram.id }
              });
            }
          }

          const targetPeriod = row.academicPeriod || activePeriod.code;
          const existingPractice = await this.prisma.practice.findFirst({
            where: {
              studentId: student.id,
              academicPeriod: targetPeriod,
              status: { not: 'CANCELED' }
            }
          });

          if (existingPractice) {
            await this.prisma.practice.update({
              where: { id: existingPractice.id },
              data: {
                companyId: company.id,
                tutorName: row.tutorName,
                practiceLevel: row.practiceLevel,
                academicLevel: row.academicLevel,
                totalHours: row.totalHours,
                status: 'COMPLETED'
              }
            });
          } else {
            await this.prisma.practice.create({
              data: {
                studentId: student.id,
                companyId: company.id,
                facultyId,
                academicPeriod: targetPeriod,
                tutorName: row.tutorName,
                practiceLevel: row.practiceLevel,
                academicLevel: row.academicLevel,
                totalHours: row.totalHours,
                status: 'COMPLETED'
              }
            });
          }

          importedCount++;
        } catch (error: any) {
          errors.push(`Fila DNI ${row.dni}: ${error.message || 'Error desconocido'}`);
        }
      }));
    }

    return { count: importedCount, errors: errors.length > 0 ? errors : undefined };
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

    const companyIds = loadByCompanyResult.map(r => r.companyId).filter(Boolean) as string[];
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
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
