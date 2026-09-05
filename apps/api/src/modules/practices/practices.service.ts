import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreatePracticeDto } from './dto/create-practice.dto';
import { UpdatePracticeDto } from './dto/update-practice.dto';
import { ClosePracticeDto, ReassignPracticeDto } from './dto/close-practice.dto';
import { TutorsService } from '../tutors/tutors.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Prisma, PracticeStatus } from '@prisma/client';
import { derivePracticeStatus } from './practice-status.util';
import { normalizePeriodCode, getPeriodoActivo, assertPeriodoAbierto } from '../academic-periods/period.util';

@Injectable()
export class PracticesService {
  private readonly logger = new Logger(PracticesService.name);
  constructor(
    private prisma: PrismaService,
    private tutors: TutorsService,
  ) {}

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

    const esBorrador = createPracticeDto.status === 'PENDING';

    // Estudiante y empresa son obligatorios incluso en un borrador: la práctica
    // es la relación entre los dos y el modelo de datos no admite ninguna de las
    // dos columnas vacía. Lo que el borrador sí permite dejar pendiente es el
    // resto —tutor, área, horas, niveles—, que es donde de verdad se atasca
    // quien está registrando. Se dice cuál falta, no «faltan datos».
    const faltan: string[] = [];
    if (!createPracticeDto.studentId) faltan.push('el estudiante');
    if (!createPracticeDto.companyId) faltan.push('la empresa receptora');
    if (faltan.length > 0) {
      throw new BadRequestException(
        `Falta ${faltan.join(' y ')}. Una práctica, aunque quede en borrador, necesita a quién ampara y en qué empresa.`,
      );
    }

    // Un estudiante no lleva dos borradores a la vez. Son el mismo trámite a
    // medio llenar: el segundo no añade información, solo duplica la fila y
    // obliga a decidir después cuál de las dos era la buena.
    if (esBorrador && createPracticeDto.studentId) {
      const yaTiene = await this.prisma.practice.findFirst({
        where: {
          studentId: createPracticeDto.studentId,
          academicPeriod: activePeriod.code,
          status: 'PENDING',
          deletedAt: null,
        },
        include: { student: { select: { firstName: true, lastName: true } } },
      });
      if (yaTiene) {
        const nombre = `${yaTiene.student?.firstName ?? ''} ${yaTiene.student?.lastName ?? ''}`.trim();
        throw new ConflictException(
          `${nombre || 'Este estudiante'} ya tiene un borrador en ${activePeriod.code}. ` +
          'Ábrelo y complétalo en vez de crear otro.',
        );
      }
    }

    // La facultad se deduce del estudiante cuando no viene: es un dato que el
    // sistema ya conoce y pedírselo al formulario solo abre la puerta a que
    // llegue vacío —o peor, a que no coincida con la del estudiante—.
    let facultyId = createPracticeDto.facultyId;
    if (!facultyId && createPracticeDto.studentId) {
      const estudiante = await this.prisma.student.findUnique({
        where: { id: createPracticeDto.studentId },
        select: { facultyId: true },
      });
      facultyId = estudiante?.facultyId;
    }
    if (!facultyId) {
      throw new BadRequestException(
        'No se pudo determinar la facultad de la práctica. Selecciona al estudiante para resolverla.',
      );
    }

    return this.prisma.practice.create({
      data: {
        ...createPracticeDto,
        studentId: createPracticeDto.studentId!,
        companyId: createPracticeDto.companyId!,
        facultyId,
        academicPeriod: activePeriod.code, // Always use the active period
      },
      include: {
        student: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } }
      }
    });
  }

  async findAll(paginationDto: PaginationDto) {
    const page = Number(paginationDto.page) || 1;
    const limit = Number(paginationDto.limit) || 10;
    const { search, sortBy = 'createdAt', sortOrder = 'desc', academicPeriod } = paginationDto;
    const skip = (page - 1) * limit;

    const where: Prisma.PracticeWhereInput = {};
    // El frontend trae siempre UN periodo seleccionado (como el selector de
    // workspace de ChatGPT): filtrar aquí, en el servidor, es lo que evita
    // traer las prácticas de todos los años cada vez que alguien abre la
    // lista. Sin este parámetro, se listan todos los periodos (compatibilidad
    // con quien todavía no manda el filtro).
    if (academicPeriod) {
      where.academicPeriod = academicPeriod;
    }
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
              program: { select: { name: true } },
              generatedDocs: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  status: true,
                  signatureStatus: true,
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
          company: true,
          // Etiqueta de seguimiento del coordinador: la fila la pinta en lugar
          // del estado derivado, así que tiene que venir con la lista.
          label: { select: { id: true, name: true, color: true, isSystem: true, requiresCompletion: true } }
        }
      }),
      this.prisma.practice.count({ where }),
    ]);

    const mappedData = data.map((item) => {
      const derived = derivePracticeStatus(item, item.student.generatedDocs);
      if (derived !== item.status) {
        this.prisma.practice.update({ where: { id: item.id }, data: { status: derived } }).catch((): null => null);
        return { ...item, status: derived };
      }
      return item;
    });

    return {
      data: mappedData,
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

    // `UpdatePracticeDto` hereda `academicPeriod` de `CreatePracticeDto`, así
    // que una edición podía mudar la práctica a un semestre ya cerrado y
    // saltarse por completo la regla de que solo se escribe en el periodo
    // abierto. Mover entre periodos sigue siendo posible, pero únicamente
    // hacia el que está abierto.
    const periodoDestino = normalizePeriodCode(updatePracticeDto.academicPeriod);
    if (periodoDestino && periodoDestino !== practice.academicPeriod) {
      await assertPeriodoAbierto(this.prisma, periodoDestino, 'mover una práctica');
    }

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
   * Invalida (SUPERSEDED) los oficios vigentes del estudiante Y los de todo su
   * grupo (mismo documentCode). Candados: certificado emitido o documento
   * dentro del circuito de firma bloquean la reasignación.
   *
   * Cubre SOLICITUD y DESIGNACION. Antes solo miraba la solicitud, así que al
   * mover a un estudiante de empresa la designación se quedaba vigente
   * nombrando a la empresa y al docente anteriores — un oficio en pie que ya
   * no decía la verdad. Los dos tipos se tratan igual porque los dos son
   * grupales: un solo documento nombra a todos los estudiantes de la empresa,
   * de modo que si uno se va, el oficio entero queda desactualizado.
   *
   * Se recorren por separado y no en una sola consulta porque cada tipo tiene
   * su propia serie de `documentCode`: mezclarlas arrastraría documentos que
   * no comparten grupo.
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

    // Oficios grupales vigentes del estudiante que se mueve, por tipo.
    const TIPOS = ['SOLICITUD', 'DESIGNACION'] as const;
    const nombreDelTipo: Record<(typeof TIPOS)[number], string> = {
      SOLICITUD: 'la solicitud',
      DESIGNACION: 'la designación',
    };

    const porTipo: { tipo: (typeof TIPOS)[number]; codes: string[] }[] = [];
    for (const tipo of TIPOS) {
      const propios = await this.prisma.generatedDocument.findMany({
        where: { studentId, documentType: tipo, status: 'VALID' },
      });
      const codes = [...new Set(propios.map((d) => d.documentCode).filter(Boolean))] as string[];
      if (codes.length) porTipo.push({ tipo, codes });
    }

    // Sin ningún oficio vigente no hay nada que arrastrar. Ojo: esto ya no
    // depende de que exista solicitud — una designación puede haberse emitido
    // por su cuenta, sin solicitud previa, y aun así debe invalidarse.
    if (porTipo.length === 0) {
      return { invalidatedDocumentIds: [], invalidatedCodes: [], affectedStudentIds: [] };
    }

    // Candado 2: alguno de los oficios está dentro del circuito de firma.
    // Se comprueban TODOS antes de tocar nada: invalidar la solicitud y
    // después toparse con la designación en firma dejaría el expediente a
    // medias, con un oficio anulado y otro en pie.
    for (const { tipo, codes } of porTipo) {
      const enFirma = await this.prisma.generatedDocument.findFirst({
        where: {
          documentCode: { in: codes },
          documentType: tipo,
          signatureStatus: { in: ['IN_SIGNING', 'PARTIALLY_SIGNED'] },
        },
      });
      if (enFirma) {
        throw new ConflictException(
          `No se puede reasignar la empresa: ${nombreDelTipo[tipo]} ${enFirma.documentCode} está en el circuito de firma. ` +
          'Espera a que el lote se complete o recházalo primero.',
        );
      }
    }

    const newCompany = await this.prisma.company.findUnique({ where: { id: newCompanyId } });
    if (!newCompany) throw new NotFoundException('La empresa destino no existe');

    // Cascada: TODAS las filas del grupo que comparten cada oficio.
    const groupDocs = await this.prisma.generatedDocument.findMany({
      where: {
        status: 'VALID',
        OR: porTipo.map(({ tipo, codes }) => ({ documentType: tipo, documentCode: { in: codes } })),
      },
    });
    const codes = porTipo.flatMap((t) => t.codes);

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


  /**
   * Comprueba que el motivo exista y sirva para cerrar una practica.
   *
   * Vive aqui y no en el servicio de motivos para no atar los dos modulos por
   * una sola llamada; la regla es la misma que aplica la invalidacion.
   */
  private async motivoDeCierre(reasonId: string) {
    const motivo = await this.prisma.reasonCode.findUnique({ where: { id: reasonId } });
    if (!motivo) throw new BadRequestException('El motivo indicado no existe');
    if (!motivo.isActive) throw new BadRequestException(`El motivo «${motivo.label}» está desactivado`);
    if (motivo.scope !== 'PRACTICE' && motivo.scope !== 'BOTH') {
      throw new BadRequestException(`El motivo «${motivo.label}» no corresponde a la baja de una práctica`);
    }
    return motivo;
  }

  /**
   * Da de baja a un estudiante de su práctica (RF-21).
   *
   * NO reemite ningún documento. Cuando el retiro llega semanas después, el
   * oficio ya está firmado y entregado en físico: la validez de esa firma es
   * física y un papel nuevo no cambiaría el que ya está en la empresa. Lo que
   * el sistema aporta es el registro de que ese estudiante ya no va, con su
   * motivo y su fecha.
   *
   * Sí avisa cuando el documento aún NO salió a firma, porque entonces
   * regenerarlo sigue siendo posible y probablemente sea lo que conviene.
   */
  async close(id: string, dto: ClosePracticeDto, actorId?: string) {
    const practica = await this.prisma.practice.findUnique({
      where: { id },
      include: { student: true, company: true },
    });
    if (!practica) throw new NotFoundException('La práctica no existe');
    if (practica.closedAt) {
      throw new BadRequestException(
        'Esta práctica ya estaba dada de baja. Volver a cerrarla pisaría el motivo y la fecha del primer cierre.',
      );
    }

    // Un período cerrado se consulta, no se modifica.
    await assertPeriodoAbierto(this.prisma, practica.academicPeriod, 'dar de baja a un estudiante');

    const motivo = await this.motivoDeCierre(dto.reasonId);

    // ¿Los documentos de esta práctica ya salieron a firma? De eso depende el
    // consejo que se le da al coordinador, no la baja en sí.
    const docs = await this.prisma.generatedDocument.findMany({
      where: { studentId: practica.studentId, status: 'VALID' },
      select: { id: true, documentType: true, documentCode: true, signatureStatus: true },
    });
    const entregados = docs.filter((d) => d.signatureStatus !== 'NONE');
    const sinFirmar = docs.filter((d) => d.signatureStatus === 'NONE');

    const cerrada = await this.prisma.practice.update({
      where: { id },
      data: {
        status: 'CANCELED',
        closedAt: new Date(),
        closureReasonId: motivo.id,
        closureNote: dto.note?.trim() || null,
      },
      include: { student: true, company: true },
    });

    const nombre = `${practica.student.firstName} ${practica.student.lastName}`;
    const consejo = entregados.length > 0
      ? `Los documentos de ${nombre} ya salieron a firma, así que NO se reemiten: la designación que está en ` +
        `${practica.company?.name ?? 'la empresa'} conserva su validez en papel. Queda el registro de la baja.`
      : sinFirmar.length > 0
        ? `Los documentos de ${nombre} todavía no salieron a firma, así que conviene regenerarlos sin él ` +
          `antes de enviarlos a ${practica.company?.name ?? 'la empresa'}.`
        : `${nombre} no tenía documentos emitidos, así que no hay nada que rehacer.`;

    return {
      practice: cerrada,
      motivo: motivo.label,
      documentosFirmados: entregados.length,
      documentosSinFirmar: sinFirmar.length,
      regenerarConviene: entregados.length === 0 && sinFirmar.length > 0,
      consejo,
    };
  }

  /**
   * Mueve a un estudiante a otra empresa o a otro docente (RF-19).
   *
   * No se edita la práctica en su sitio: se cierra la que había —con su
   * motivo— y nace otra que apunta a ella. Así el recorrido completo del
   * estudiante sigue siendo legible, que es lo que se pierde cuando un
   * registro se sobrescribe.
   */
  async reassign(id: string, dto: ReassignPracticeDto, actorId?: string) {
    const anterior = await this.prisma.practice.findUnique({
      where: { id },
      include: { student: true, company: true },
    });
    if (!anterior) throw new NotFoundException('La práctica no existe');
    if (anterior.closedAt) {
      throw new BadRequestException('Esta práctica ya está cerrada: reasigna la que esté abierta.');
    }
    if (!dto.companyId && !dto.tutorId) {
      throw new BadRequestException('Indica al menos la empresa o el docente de destino');
    }

    // La práctica nueva nace en el mismo período que la anterior, así que si
    // ese período está cerrado la reasignación entera queda fuera de lugar.
    await assertPeriodoAbierto(this.prisma, anterior.academicPeriod, 'reasignar a un estudiante');

    const motivo = await this.motivoDeCierre(dto.reasonId);

    const companyId = dto.companyId ?? anterior.companyId;
    if (dto.companyId) {
      const empresa = await this.prisma.company.findFirst({
        where: { id: dto.companyId, deletedAt: null },
      });
      if (!empresa) throw new NotFoundException('La empresa de destino no existe');
    }

    // El tope del docente destino se comprueba ANTES de tocar nada: rechazar a
    // mitad dejaría la práctica anterior cerrada y ninguna abierta en su lugar.
    let tutorId = dto.tutorId ?? anterior.tutorId;
    let tutorName = anterior.tutorName;
    if (dto.tutorId && dto.tutorId !== anterior.tutorId) {
      const cupo = await this.tutors.verificarCupo(dto.tutorId, anterior.academicPeriod, 1);
      if (!cupo.ok) {
        throw new BadRequestException(
          `«${cupo.tutorName}» ya lleva ${cupo.asignados} de ${cupo.max} estudiantes en el período ` +
          `${anterior.academicPeriod}, así que no se le puede reasignar a nadie más. Elige otro docente.`,
        );
      }
      const t = await this.prisma.tutor.findUnique({ where: { id: dto.tutorId }, select: { fullName: true } });
      tutorName = t?.fullName ?? null;
    }

    // Cerrar la vieja y abrir la nueva en una sola transacción: si algo falla
    // a mitad, el estudiante no puede quedarse sin ninguna práctica abierta.
    const nueva = await this.prisma.$transaction(async (tx) => {
      await tx.practice.update({
        where: { id },
        data: {
          status: 'CANCELED',
          closedAt: new Date(),
          closureReasonId: motivo.id,
          closureNote: dto.note?.trim() || null,
        },
      });

      return tx.practice.create({
        data: {
          studentId: anterior.studentId,
          companyId,
          facultyId: anterior.facultyId,
          academicPeriod: anterior.academicPeriod,
          tutorId,
          tutorName,
          practiceLevel: anterior.practiceLevel,
          academicLevel: anterior.academicLevel,
          workArea: dto.workArea?.trim() ?? anterior.workArea,
          totalHours: anterior.totalHours,
          startDate: anterior.startDate,
          endDate: anterior.endDate,
          // El hilo que hace legible el recorrido completo.
          previousPracticeId: anterior.id,
          // La aprobación del tutor NO se hereda: acredita una práctica que ya
          // no es esta. La nueva vuelve a necesitar su acta.
          status: 'PENDING',
        },
        include: { company: true, student: true, tutor: true },
      });
    });

    // Los documentos del grupo anterior dejan de reflejar la realidad: quien
    // se movió sigue nombrado en un oficio dirigido a otra empresa.
    // Se escribe la forma a mano: inferirla de `invalidateGroupSolicitudes`
    // desde dentro de la misma clase le pide a TypeScript un tipo que aun
    // esta calculando, y se rinde con un `any` implicito.
    let arrastre: {
      invalidatedDocumentIds: string[];
      invalidatedCodes: string[];
      affectedStudentIds: string[];
    } | null = null;
    if (dto.companyId && dto.companyId !== anterior.companyId) {
      arrastre = await this.invalidateGroupSolicitudes(
        anterior.studentId,
        `${anterior.student.firstName} ${anterior.student.lastName}`,
        anterior.company?.name || 'Sin empresa',
        dto.companyId,
        actorId,
      ).catch((e): null => {
        // Un candado del arrastre (certificado vigente, documento en firma) no
        // debe deshacer la reasignación ya hecha: se informa y se sigue.
        this.logger.warn(`Reasignación ${id}: no se pudo arrastrar el grupo anterior — ${e.message}`);
        return null;
      });
    }

    await this.recalculateStatus(nueva.id).catch((): null => null);
    if (arrastre) {
      await this.recalculateForStudents(arrastre.affectedStudentIds).catch((): void => undefined);
    }

    return {
      practice: nueva,
      previousPracticeId: anterior.id,
      motivo: motivo.label,
      documentosAnulados: arrastre?.invalidatedDocumentIds.length ?? 0,
      // Los ids, no solo cuántos: la lista los usa para animar el quiebre del
      // ícono de los documentos que acaban de dejar de valer.
      documentoIdsAnulados: arrastre?.invalidatedDocumentIds ?? [],
      aviso:
        'La nueva práctica arranca sin la aprobación del tutor: acredita una práctica distinta, ' +
        'así que necesita su propia acta de culminación antes de poder certificarse.',
    };
  }

  /** El recorrido completo de un estudiante: la cadena de prácticas encadenadas. */
  async history(studentId: string) {
    const practicas = await this.prisma.practice.findMany({
      where: { studentId, deletedAt: null },
      include: {
        company: { select: { name: true } },
        tutor: { select: { fullName: true } },
        closureReason: { select: { code: true, label: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return practicas.map((p) => ({
      id: p.id,
      academicPeriod: p.academicPeriod,
      empresa: p.company?.name ?? null,
      tutor: p.tutor?.fullName ?? p.tutorName,
      status: p.status,
      abierta: !p.closedAt,
      cerradaEl: p.closedAt,
      motivoCierre: p.closureReason ? p.closureReason.label : null,
      notaCierre: p.closureNote,
      vieneDe: p.previousPracticeId,
      aprobadaEl: p.tutorApprovedAt,
    }));
  }

  remove(id: string) {
    return this.prisma.practice.delete({ where: { id } });
  }

  async searchTutorNames(search: string): Promise<string[]> {
    const rows = await this.prisma.practice.findMany({
      where: {
        tutorName: { contains: search, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { tutorName: true },
      distinct: ['tutorName'],
      take: 3,
    });
    return rows.map(r => r.tutorName).filter(Boolean) as string[];
  }

  /**
   * Devuelve los valores más frecuentes de un campo de texto libre en prácticas.
   * Útil para mostrar sugerencias contextuales en el formulario.
   * Campos permitidos: workArea | academicPeriod | academicLevel | practiceLevel
   */
  async getTopFieldValues(field: 'workArea' | 'academicPeriod' | 'academicLevel' | 'practiceLevel', search?: string, limit = 5): Promise<string[]> {
    const allowedFields = ['workArea', 'academicPeriod', 'academicLevel', 'practiceLevel'];
    if (!allowedFields.includes(field)) return [];

    const where: any = { deletedAt: null };
    if (search && search.trim()) {
      where[field] = { contains: search.trim(), mode: 'insensitive' };
    } else {
      where[field] = { not: null };
    }

    // Fetch distinct values and return ordered by frequency
    const rows = await this.prisma.$queryRawUnsafe<{ value: string; count: bigint }[]>(
      `SELECT "${field}" AS value, COUNT(*) AS count
       FROM practices
       WHERE "${field}" IS NOT NULL AND deleted_at IS NULL
       ${search && search.trim() ? `AND LOWER("${field}") LIKE LOWER($1)` : ''}
       GROUP BY "${field}"
       ORDER BY count DESC
       LIMIT ${limit}`,
      ...(search && search.trim() ? [`%${search.trim()}%`] : [])
    );

    return rows.map(r => r.value).filter(Boolean);
  }

  /**
   * Carga masiva desde el Excel de la Facultad.
   *
   * Todo entra al periodo ACTIVO, sin excepción. La columna «Periodo» del
   * archivo no elige destino: solo sirve para detectar que la hoja pertenece
   * a otro semestre, y en ese caso la fila se descarta y se informa.
   *
   * Antes esta funcion tomaba `row.academicPeriod` tal cual y, si no habia
   * periodo activo, inventaba uno con la fecha del servidor. Las dos cosas
   * creaban periodos fantasma que despues aparecian en el selector del
   * topbar sin que nadie los hubiera creado.
   */

  /**
   * Resuelve los docentes que nombra el archivo y reparte sus cupos (RF-22).
   *
   * Se hace ENTERO antes del bucle de importación, y no dentro, por dos
   * razones que en paralelo darían problemas:
   *
   *   · Crear el docente dentro del bucle haría que dos filas del mismo
   *     profesor intentaran crearlo a la vez y una chocara con el índice único.
   *   · Contar su carga dentro del bucle leería siempre el mismo número de
   *     partida, porque las quince filas del lote van a la vez: veinticinco
   *     estudiantes del mismo docente entrarían todos creyéndose el primero.
   *
   * La carga de partida excluye a los estudiantes que vienen en el archivo, de
   * modo que reimportar la misma hoja no cuente a nadie dos veces.
   */
  private async repartirCupos(
    filas: Array<{ tutorName?: string | null }>,
    facultyId: string,
    academicPeriod: string,
    dnisDelArchivo: string[],
  ) {
    const clave = (n: string) =>
      n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

    const nombres = [...new Map(
      filas
        .map((f) => (f.tutorName ?? '').replace(/\s+/g, ' ').trim())
        .filter((n) => n.length > 2)
        .map((n) => [clave(n), n]),
    ).values()];

    const cupos = new Map<string, { id: string; fullName: string; max: number; usados: number; disponibles: number }>();
    if (nombres.length === 0) return cupos;

    const existentes = await this.prisma.tutor.findMany({
      where: { facultyId, deletedAt: null },
      select: { id: true, fullName: true, maxStudents: true },
    });
    const porClave = new Map(existentes.map((t) => [clave(t.fullName), t]));

    // Los estudiantes del archivo no cuentan en la carga de partida: sus
    // prácticas son justo las que se están cargando.
    const deLaHoja = await this.prisma.student.findMany({
      where: { dni: { in: dnisDelArchivo } },
      select: { id: true },
    });
    const idsDeLaHoja = deLaHoja.map((s) => s.id);

    for (const nombre of nombres) {
      let tutor = porClave.get(clave(nombre));
      if (!tutor) {
        // El archivo trae un docente que no estaba registrado. Se crea, porque
        // rechazar la hoja entera por eso obligaría a darlo de alta a mano
        // antes de cada importación.
        const creado = await this.prisma.tutor.create({
          data: { facultyId, fullName: nombre },
          select: { id: true, fullName: true, maxStudents: true },
        });
        this.logger.log(`Importación: se registró al docente «${nombre}».`);
        tutor = creado;
        porClave.set(clave(nombre), creado);
      }

      const usados = await this.prisma.practice.count({
        where: {
          tutorId: tutor.id,
          academicPeriod,
          deletedAt: null,
          closedAt: null,
          status: { notIn: ['CANCELED', 'REJECTED'] },
          ...(idsDeLaHoja.length ? { studentId: { notIn: idsDeLaHoja } } : {}),
        },
      });

      cupos.set(clave(nombre), {
        id: tutor.id,
        fullName: tutor.fullName,
        max: tutor.maxStudents,
        usados,
        disponibles: Math.max(0, tutor.maxStudents - usados),
      });
    }

    return cupos;
  }


  /**
   * Revisa el archivo SIN escribir nada (RF-26).
   *
   * Lo que la pantalla no puede saber sola es justo lo que más duele después:
   * si el estudiante ya está registrado, si ya tiene una práctica en el período
   * —y en qué empresa—, si el docente que le asignan todavía tiene cupo, y si
   * la empresa o la carrera van a crearse de cero. Todo eso vive en la base, y
   * enterarse al confirmar es enterarse tarde.
   *
   * Cada fila sale con su severidad: `error` no se puede cargar, `aviso` se
   * puede pero conviene mirarlo, `ok` entra limpia.
   */
  async previewBulkImport(students: any[], facultyId?: string) {
    const activePeriod = await getPeriodoActivo(this.prisma);
    if (!activePeriod) {
      throw new ConflictException(
        'No hay un periodo académico activo. Créalo o actívalo en Configuración antes de revisar el archivo.',
      );
    }
    if (!facultyId) {
      const porDefecto = await this.prisma.faculty.findFirst({ where: { deletedAt: null } });
      if (!porDefecto) throw new ConflictException('No hay facultades registradas en el sistema');
      facultyId = porDefecto.id;
    }

    const periodo = activePeriod.code;
    const clave = (n: string) =>
      n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

    const dnis = students.map((s) => String(s?.dni ?? '').trim()).filter(Boolean);

    // Todo lo que hace falta de la base, de una vez: preguntar fila por fila
    // serían cuatro consultas por estudiante y una hoja trae doscientos.
    const [registrados, empresas, carreras, tutores] = await Promise.all([
      this.prisma.student.findMany({
        where: { dni: { in: dnis }, deletedAt: null },
        select: {
          id: true, dni: true, firstName: true, lastName: true,
          practices: {
            where: { academicPeriod: periodo, deletedAt: null, closedAt: null },
            select: { id: true, status: true, company: { select: { name: true } } },
          },
        },
      }),
      this.prisma.company.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      this.prisma.program.findMany({ where: { facultyId, deletedAt: null }, select: { id: true, name: true, abbreviation: true } }),
      this.prisma.tutor.findMany({ where: { facultyId, deletedAt: null }, select: { id: true, fullName: true, maxStudents: true } }),
    ]);

    const porDni = new Map(registrados.map((e) => [e.dni, e]));
    const empresaPorNombre = new Map(empresas.map((c) => [clave(c.name), c]));
    const carreraPorNombre = new Map(carreras.map((p) => [clave(p.name), p]));
    const tutorPorNombre = new Map(tutores.map((t) => [clave(t.fullName), t]));

    // Cupo de partida de cada docente, sin contar a los del archivo.
    const idsDelArchivo = registrados.map((e) => e.id);
    const cupoDe = new Map<string, { fullName: string; max: number; disponibles: number }>();
    for (const t of tutores) {
      const usados = await this.prisma.practice.count({
        where: {
          tutorId: t.id, academicPeriod: periodo, deletedAt: null, closedAt: null,
          status: { notIn: ['CANCELED', 'REJECTED'] },
          ...(idsDelArchivo.length ? { studentId: { notIn: idsDelArchivo } } : {}),
        },
      });
      cupoDe.set(clave(t.fullName), {
        fullName: t.fullName, max: t.maxStudents, disponibles: Math.max(0, t.maxStudents - usados),
      });
    }

    const vistas = new Map<string, number>();
    const filas = students.map((row: any, indice: number) => {
      const dni = String(row?.dni ?? '').trim();
      const nombre = [row?.lastName, row?.firstName].filter(Boolean).join(' ').trim() || '(sin nombre)';
      const errores: string[] = [];
      const avisos: string[] = [];

      // ── Lo que impide cargar la fila ──
      if (!dni) {
        errores.push('Sin cédula: no hay forma de identificar al estudiante.');
      } else if (!/^\d{10}$/.test(dni)) {
        errores.push(`«${dni}» no es una cédula de diez dígitos.`);
      } else if (vistas.has(dni)) {
        errores.push(`Cédula repetida en el archivo (ya aparece en la fila ${(vistas.get(dni) as number) + 1}).`);
      }
      if (dni && !vistas.has(dni)) vistas.set(dni, indice);

      if (!row?.firstName?.trim() || !row?.lastName?.trim()) {
        errores.push('Faltan nombres o apellidos.');
      }
      if (!row?.companyName?.trim()) {
        errores.push('Sin empresa: la práctica no se puede registrar en el aire.');
      }

      const periodoFila = normalizePeriodCode(row?.academicPeriod ?? '');
      if (periodoFila && periodoFila !== periodo) {
        errores.push(`La fila es del período ${periodoFila} y el abierto es ${periodo}.`);
      }

      // ── Lo que conviene mirar antes de confirmar ──
      const existente = dni ? porDni.get(dni) : undefined;
      const practicaPrevia = existente?.practices?.[0];
      if (existente) {
        avisos.push(`Ya está registrado como ${existente.firstName} ${existente.lastName}; sus datos se actualizarán.`);
      }
      if (practicaPrevia) {
        avisos.push(
          `Ya tiene una práctica abierta en ${periodo}` +
          (practicaPrevia.company?.name ? ` con ${practicaPrevia.company.name}` : '') +
          ': se sobrescribirá con lo que traiga esta fila.',
        );
      }

      const nombreEmpresa = (row?.companyName ?? '').trim();
      const empresaConocida = nombreEmpresa ? empresaPorNombre.get(clave(nombreEmpresa)) : undefined;
      if (nombreEmpresa && !empresaConocida) {
        avisos.push(`«${nombreEmpresa}» no está registrada: se creará.`);
      }

      const nombreCarrera = (row?.programName ?? '').trim();
      const carreraConocida = nombreCarrera ? carreraPorNombre.get(clave(nombreCarrera)) : undefined;
      if (nombreCarrera && !carreraConocida) {
        avisos.push(`La carrera «${nombreCarrera}» se creará sin abreviatura: habrá que declararla para poder emitir documentos.`);
      } else if (carreraConocida && !carreraConocida.abbreviation) {
        avisos.push(`La carrera «${carreraConocida.name}» no tiene abreviatura: sin ella no se emiten documentos.`);
      }

      // ── Cupo del docente (RF-22), reservado en el mismo orden en que se cargará ──
      const nombreTutor = (row?.tutorName ?? '').replace(/\s+/g, ' ').trim();
      let tutor: { fullName: string; max: number; disponibles: number } | undefined;
      if (nombreTutor.length > 2) {
        tutor = cupoDe.get(clave(nombreTutor));
        if (!tutor) {
          const conocido = tutorPorNombre.get(clave(nombreTutor));
          if (!conocido) avisos.push(`El docente «${nombreTutor}» no está registrado: se creará.`);
        } else if (errores.length === 0) {
          // Solo reservan cupo las filas que de verdad entrarían: contar una
          // fila con error gastaría un sitio que nadie va a ocupar.
          if (tutor.disponibles <= 0) {
            errores.push(`«${tutor.fullName}» ya llega a su tope de ${tutor.max} estudiantes en ${periodo}.`);
          } else {
            tutor.disponibles--;
          }
        }
      } else {
        avisos.push('Sin docente tutor: hará falta asignarlo antes de poder certificar.');
      }

      return {
        indice,
        dni,
        nombre,
        empresa: nombreEmpresa || null,
        tutor: nombreTutor || null,
        severidad: errores.length ? ('error' as const) : avisos.length ? ('aviso' as const) : ('ok' as const),
        errores,
        avisos,
        yaRegistrado: !!existente,
        sobrescribePractica: !!practicaPrevia,
        empresaNueva: !!nombreEmpresa && !empresaConocida,
      };
    });

    return {
      academicPeriod: periodo,
      total: filas.length,
      resumen: {
        ok: filas.filter((f) => f.severidad === 'ok').length,
        aviso: filas.filter((f) => f.severidad === 'aviso').length,
        error: filas.filter((f) => f.severidad === 'error').length,
      },
      filas,
    };
  }

  async bulkImport(programName: string, students: any[], facultyId?: string) {
    const activePeriod = await getPeriodoActivo(this.prisma);
    if (!activePeriod) {
      throw new ConflictException(
        'No hay un periodo academico activo. Crealo o activalo en Configuracion ' +
        '(panel de administracion) antes de cargar el archivo.',
      );
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
    // Filas que no se cargan por una razon que el coordinador puede corregir.
    // Se devuelven una por una: «3 filas tuvieron errores» no le sirve a nadie.
    const descartadas: { dni: string; nombre: string; periodoArchivo: string; motivo: string }[] = [];

    // Docentes y cupos, resueltos de una vez antes de que las filas corran en
    // paralelo. `clave` se repite aquí porque la usan tanto el reparto como el
    // bucle, y viven en ámbitos distintos.
    const claveTutor = (n: string) =>
      n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const cupos = await this.repartirCupos(
      students,
      facultyId,
      activePeriod.code,
      students.map((s: any) => String(s.dni ?? '')).filter(Boolean),
    );

    const chunkSize = 15;
    const batches = [];
    for (let i = 0; i < students.length; i += chunkSize) {
      batches.push(students.slice(i, i + chunkSize));
    }

    for (const batch of batches) {
      await Promise.all(batch.map(async (row) => {
        const nombreFila = [row.lastName, row.firstName].filter(Boolean).join(' ').trim();

        if (!row.dni) {
          descartadas.push({
            dni: '',
            nombre: nombreFila || '(sin nombre)',
            periodoArchivo: '',
            motivo: 'La fila no trae cedula, y sin cedula no se puede identificar al estudiante.',
          });
          return;
        }

        // Unico filtro de periodo: si la hoja declara otro semestre, la fila
        // no entra. Se compara normalizado para que «2025-I» y «2025-1» no
        // cuenten como periodos distintos.
        const periodoArchivo = normalizePeriodCode(row.academicPeriod);
        if (periodoArchivo && periodoArchivo !== activePeriod.code) {
          descartadas.push({
            dni: row.dni,
            nombre: nombreFila || row.dni,
            periodoArchivo,
            motivo: `La fila pertenece al periodo ${periodoArchivo} y el periodo abierto es ${activePeriod.code}.`,
          });
          return;
        }

        try {
          const companyName = row.companyName || 'Empresa No Especificada';
          const contactName = row.companyContactName || row.companyTutor || undefined;
          const recipientName = row.companyPosition || row.destinatarioOficio || undefined;

          let company = await this.prisma.company.upsert({
            where: { name: companyName },
            update: {
              contactName,
              email: row.companyEmail || undefined,
              phone: row.companyPhone || undefined,
              recipientName,
            },
            create: {
              name: companyName,
              contactName: contactName || null,
              email: row.companyEmail || null,
              phone: row.companyPhone || null,
              recipientName: recipientName || null,
            }
          });

          // El estudiante se identifica por su cédula, no por un correo ni por
          // una cuenta: aquí ya no se crea ningún `User`. La cédula es el
          // identificador que la Facultad usa y el que los oficios imprimen.
          let student = await this.prisma.student.findUnique({ where: { dni: row.dni } });
          if (!student) {
            try {
              student = await this.prisma.student.create({
                data: {
                  dni: row.dni,
                  firstName: row.firstName,
                  lastName: row.lastName,
                  phone: row.phone || null,
                  facultyId,
                  programId: program.id,
                }
              });
            } catch(e) {
              student = await this.prisma.student.findUnique({ where: { dni: row.dni } });
              if (!student) throw e;
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

          const targetPeriod = activePeriod.code;

          // ── Cupo del docente (RF-22) ──
          //
          // La reserva se hace SIN esperar nada en medio: entre leer el
          // contador y bajarlo no puede colarse otra fila, porque no hay await
          // que ceda el turno. Con un await en medio, quince filas del mismo
          // docente leerían todas el mismo número.
          let tutorId: string | null = null;
          let tutorName: string | null = row.tutorName ?? null;
          const nombreTutor = (row.tutorName ?? '').replace(/\s+/g, ' ').trim();
          if (nombreTutor.length > 2) {
            const cupo = cupos.get(claveTutor(nombreTutor));
            if (cupo) {
              if (cupo.disponibles <= 0) {
                descartadas.push({
                  dni: row.dni,
                  nombre: nombreFila || row.dni,
                  periodoArchivo: targetPeriod,
                  motivo:
                    `«${cupo.fullName}» ya llega a su tope de ${cupo.max} estudiantes en ${targetPeriod}. ` +
                    'Reparte estas filas entre otros docentes y vuelve a cargarlas.',
                });
                return;
              }
              cupo.disponibles--;
              tutorId = cupo.id;
              // Se guarda la grafía registrada, no la del archivo: así el mismo
              // docente no vuelve a aparecer escrito de dos formas.
              tutorName = cupo.fullName;
            }
          }

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
                tutorId,
                tutorName,
                practiceLevel: row.practiceLevel,
                academicLevel: row.academicLevel,
                workArea: row.workArea,
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
                tutorId,
                tutorName,
                practiceLevel: row.practiceLevel,
                academicLevel: row.academicLevel,
                workArea: row.workArea,
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

    return {
      count: importedCount,
      periodo: activePeriod.code,
      descartadas,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async getDashboardStats(facultyId?: string, academicPeriod?: string) {
    // Acotado al periodo del selector global: sin esto, el dashboard
    // agregaba TODAS las prácticas desde que existe el sistema cada vez que
    // alguien abría el resumen ejecutivo.
    const whereCondition: Prisma.PracticeWhereInput = {
      ...(facultyId ? { facultyId } : {}),
      ...(academicPeriod ? { academicPeriod } : {}),
    };
    // "Prácticas por Periodo Académico" existe para comparar periodos entre
    // sí — si se acotara igual que el resto, la barra quedaría sola y el
    // gráfico perdería su propósito. Es la única consulta que se queda sin
    // el filtro de periodo, a propósito.
    const whereAllPeriods: Prisma.PracticeWhereInput = facultyId ? { facultyId } : {};

    // 1. KPIs
    // El caso de trabajo del periodo: todo lo que sigue vivo. La tarjeta se
    // llama «Prácticas Activas», y una práctica asignada, con empresa, tutor y
    // fechas está activa aunque todavía no tenga papeles. Antes esta cifra
    // contaba IN_PROGRESS, que en este sistema significa «ya tiene al menos un
    // documento emitido»: el rótulo prometía una cosa y mostraba otra, y un
    // periodo recién abierto se veía en cero como si no hubiera nadie.
    const periodPractices = await this.prisma.practice.count({
      where: { ...whereCondition, status: { notIn: ['REJECTED', 'CANCELED'] } },
    });

    // Cuántas de esas ya arrancaron el papeleo. Es la cifra que antes ocupaba
    // la tarjeta de arriba, ahora con el nombre de lo que de verdad mide.
    const startedProcedures = await this.prisma.practice.count({
      where: { ...whereCondition, status: 'IN_PROGRESS' },
    });

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

    // Alertas: solo lo que de verdad requiere intervención. «Atrasado» dejó de
    // derivarse porque dependía de una fecha de fin que el sistema no recoge.
    const activeAlerts = await this.prisma.practice.count({
      where: { ...whereCondition, status: { in: ['REJECTED', 'CANCELED'] } },
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

    // 3. Period Distribution (Vertical Bar Chart) — histórico, todos los periodos
    const periodDistributionResult = await this.prisma.practice.groupBy({
      by: ['academicPeriod'],
      _count: { studentId: true },
      where: whereAllPeriods,
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
        periodPractices,
        startedProcedures,
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
