import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DocumentEngineService } from '../document-engine/document-engine.service';
import { MinioService } from '../minio/minio.service';
import { PracticesService } from '../practices/practices.service';
import { canIssueCertificate } from '../practices/practice-status.util';

export interface DocumentGenerationJob {
  batchId: string;
  templateId: string;
  studentId: string;
  generatedById?: string;
}

@Injectable()
export class GeneratedDocumentsService {
  constructor(
    private prisma: PrismaService,
    private documentEngine: DocumentEngineService,
    private minio: MinioService,
    private practices: PracticesService,
    @InjectQueue('document-generation') private documentQueue: Queue<DocumentGenerationJob>,
  ) {}

  async generateDocumentCode(
    type: string,
    periodCode: string,
    programAbbr: string,
    docTypeAbbr: string,
    suffix: string,
  ): Promise<string> {
    let period = await this.prisma.academicPeriod.findUnique({ where: { code: periodCode } });
    if (!period) {
      period = await this.prisma.academicPeriod.create({
        data: { code: periodCode, name: periodCode, startDate: new Date(), endDate: new Date() },
      });
    }

    const sequence = await this.prisma.documentSequence.upsert({
      where: {
        type_periodCode: { type, periodCode },
      },
      update: { lastNumber: { increment: 1 } },
      create: { type, periodCode, lastNumber: 1 },
    });

    const num = String(sequence.lastNumber).padStart(5, '0');
    const parts = [num, programAbbr, docTypeAbbr, periodCode];
    if (suffix) parts.push(suffix);
    return parts.filter(Boolean).join('-');
  }

  /**
   * Las autoridades se configuran por periodo académico en Configuración
   * (panel de admin). Sin esos nombres no se genera ningún documento oficial:
   * el certificado imprime ambas firmas y el oficio DOCX la del Responsable
   * de Prácticas, así que un nombre vacío produciría documentos inválidos.
   */
  private async getAuthoritiesOrFail(periodCode: string) {
    const period = await this.prisma.academicPeriod.findUnique({ where: { code: periodCode } });
    const missing: string[] = [];
    if (!period?.deanName?.trim()) missing.push('Decano(a) de la Facultad');
    if (!period?.directorName?.trim()) missing.push('Responsable de Prácticas');
    if (missing.length > 0) {
      throw new BadRequestException(
        `No se puede generar el documento. Falta configurar: ${missing.join(' y ')} para el periodo ${periodCode}. ` +
        'Establece los nombres de las autoridades en Configuración (panel de administración).',
      );
    }
    return {
      period,
      deanName: period!.deanName!.trim(),
      directorName: period!.directorName!.trim(),
    };
  }

  /** Key único en MinIO: periodo/tipo/codigo_Apellido.ext — imposible de colisionar */
  private buildObjectKey(periodCode: string, docType: string, documentCode: string, lastName: string, ext: string): string {
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, '');
    return `${safe(periodCode)}/${safe(docType)}/${documentCode}_${safe(lastName)}${ext}`;
  }

  async generate(templateId: string, studentId: string, generatedById?: string) {
    // 1. Obtener template
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('Template no encontrado');

    // 2. Obtener datos del estudiante y sus relaciones
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        program: true,
        faculty: true,
        practices: { include: { company: true } },
      },
    });
    if (!student) throw new NotFoundException('Estudiante no encontrado');

    // 3. Preparar diccionario de variables
    const currentPractice = student.practices[0];
    const academicPeriodCode = currentPractice?.academicPeriod || '2024-1';

    // Requisitos para emitir el certificado: solicitud vigente (el proceso
    // arrancó formalmente) y los datos que se imprimen. NO se exige estado
    // "Finalizado": ese estado es la consecuencia de que este certificado
    // quede firmado, así que exigirlo sería un ciclo imposible.
    if (template.type !== 'DOCX' && currentPractice) {
      const docs = await this.prisma.generatedDocument.findMany({
        where: { studentId },
        select: { documentType: true, status: true, signatureStatus: true },
      });
      const { ok, missing } = canIssueCertificate(currentPractice, docs);
      if (!ok) {
        throw new BadRequestException(
          `No se puede generar el certificado de ${student.firstName} ${student.lastName}. Falta: ${missing.join(', ')}.`,
        );
      }
    }

    // Validar autoridades ANTES de consumir un número de secuencia
    const { deanName, directorName } = await this.getAuthoritiesOrFail(academicPeriodCode);

    const programAbbr = student.program?.abbreviation || student.faculty?.abbreviation || 'SIN';
    const documentCode = await this.generateDocumentCode('CERTIFICADO', academicPeriodCode, programAbbr, 'CERT', '');

    const dataToInject = {
      documentCode,
      studentName: `${student.firstName} ${student.lastName}`,
      studentDni: student.dni,
      programName: student.program?.name || 'N/A',
      facultyName: student.faculty?.name || 'N/A',
      companyName: currentPractice?.company?.name || 'N/A',
      totalHours: currentPractice?.totalHours?.toString() || '0',
      tutorName: currentPractice?.tutorName || 'N/A',
      practiceLevel: currentPractice?.practiceLevel || 'N/A',
      academicLevel: currentPractice?.academicLevel || 'N/A',
      academicPeriod: academicPeriodCode,
      // Certificado: lleva las firmas de AMBAS autoridades configuradas
      deanName,
      directorName,
      currentDate: new Date().toLocaleDateString('es-ES'),
    };

    // 4. Delegar al Motor de Documentos con key único (sin colisiones)
    const ext = template.type === 'DOCX' ? '.docx' : '.pdf';
    const objectKey = this.buildObjectKey(academicPeriodCode, 'CERTIFICADO', documentCode, student.lastName, ext);

    const storedKey = await this.documentEngine.generateDocument(
      template.type as 'PDF' | 'DOCX',
      template.content,
      dataToInject,
      objectKey,
    );

    // 5. Guardar el registro final en BD (fileUrl = objectKey)
    return this.prisma.generatedDocument.create({
      data: {
        templateId,
        studentId,
        fileUrl: storedKey,
        documentCode,
        documentType: 'CERTIFICADO',
        status: 'VALID',
        generatedById,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // GENERACIÓN MASIVA REAL: cola BullMQ con workers concurrentes,
  // reintentos automáticos y progreso consultable.
  // ─────────────────────────────────────────────────────────────
  async generateBatch(templateId: string, studentIds: string[], generatedById?: string) {
    const template = await this.prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template no encontrado');

    // Falla rápido: valida autoridades de cada periodo involucrado ANTES de
    // encolar, en vez de dejar que cada job falle dentro de la cola.
    const studentsForPeriods = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { practices: { select: { academicPeriod: true } } },
    });
    const periodCodes = new Set<string>(
      studentsForPeriods.map((s) => s.practices[0]?.academicPeriod || '2024-1'),
    );
    for (const code of periodCodes) {
      await this.getAuthoritiesOrFail(code);
    }

    // Requisitos por estudiante, validados ANTES de encolar para fallar de
    // inmediato en vez de dejar que cada job muera dentro de la cola.
    const relevantDocs = await this.prisma.generatedDocument.findMany({
      where: { studentId: { in: studentIds }, status: 'VALID' },
      select: { studentId: true, documentType: true },
    });
    const withSolicitud = new Set(
      relevantDocs.filter((d) => d.documentType === 'SOLICITUD').map((d) => d.studentId),
    );
    const withCertificate = new Set(
      relevantDocs.filter((d) => d.documentType === 'CERTIFICADO').map((d) => d.studentId),
    );

    const describe = async (ids: string[]) => {
      const students = await this.prisma.student.findMany({
        where: { id: { in: ids } },
        select: { firstName: true, lastName: true },
      });
      return students.map((s) => `${s.firstName} ${s.lastName}`).join(', ');
    };

    // Ya tienen certificado vigente: no se emiten duplicados
    const duplicateIds = studentIds.filter((id) => withCertificate.has(id));
    if (duplicateIds.length > 0) {
      throw new BadRequestException(
        `${duplicateIds.length} estudiante(s) ya tienen un certificado vigente (${await describe(duplicateIds)}). Invalida el actual si necesitas reemplazarlo.`,
      );
    }

    const missingIds = studentIds.filter((id) => !withSolicitud.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `No se pueden generar los certificados: ${missingIds.length} estudiante(s) sin solicitud de prácticas vigente (${await describe(missingIds)}). Genera primero la solicitud grupal de su empresa.`,
      );
    }

    const batch = await this.prisma.generationBatch.create({
      data: {
        templateId,
        total: studentIds.length,
        createdById: generatedById,
      },
    });

    await this.documentQueue.addBulk(
      studentIds.map((studentId) => ({
        name: 'generate-document',
        data: { batchId: batch.id, templateId, studentId, generatedById },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      })),
    );

    return {
      batchId: batch.id,
      message: 'Generación en lote encolada',
      count: studentIds.length,
    };
  }

  /** Progreso de un lote de generación (para barra de progreso en UI). */
  async getBatchProgress(batchId: string) {
    const batch = await this.prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote de generación no encontrado');
    return {
      id: batch.id,
      total: batch.total,
      completed: batch.completed,
      failed: batch.failed,
      status: batch.status,
      progress: batch.total > 0 ? Math.round(((batch.completed + batch.failed) / batch.total) * 100) : 100,
    };
  }

  /** Llamado por el worker al terminar cada job. Actualiza contadores atómicamente. */
  async reportJobResult(batchId: string, success: boolean) {
    const batch = await this.prisma.generationBatch.update({
      where: { id: batchId },
      data: success ? { completed: { increment: 1 } } : { failed: { increment: 1 } },
    });
    if (batch.completed + batch.failed >= batch.total) {
      await this.prisma.generationBatch.update({
        where: { id: batchId },
        data: { status: batch.failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED' },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DESCARGAS SEGURAS: el bucket es privado; se entrega una URL
  // prefirmada de corta duración tras validar permisos.
  // ─────────────────────────────────────────────────────────────
  async getDownloadUrl(documentId: string, requester: { id: string; role: string }) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { id: documentId },
      include: { student: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    // Un estudiante solo puede descargar sus propios documentos
    if (requester.role === 'STUDENT') {
      const student = await this.prisma.student.findUnique({ where: { userId: requester.id } });
      if (!student || student.id !== doc.studentId) {
        throw new ForbiddenException('No tienes acceso a este documento');
      }
    }

    // Si ya existe versión firmada, se entrega esa (documento con valor legal)
    const objectKey = doc.signedFileKey || doc.fileUrl;
    const downloadName = objectKey.split('/').pop();
    const url = await this.minio.getPresignedUrl(objectKey, 900, downloadName);
    return { url, expiresInSeconds: 900, signed: !!doc.signedFileKey };
  }

  async getViewUrl(documentId: string, requester: { id: string; role: string }) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { id: documentId },
      include: { student: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    if (requester.role === 'STUDENT') {
      const student = await this.prisma.student.findUnique({ where: { userId: requester.id } });
      if (!student || student.id !== doc.studentId) {
        throw new ForbiddenException('No tienes acceso a este documento');
      }
    }

    const objectKey = doc.signedFileKey || doc.fileUrl;
    const downloadName = objectKey.split('/').pop();
    // Pasamos true como 4to argumento para forzar inline en vez de attachment
    const url = await this.minio.getPresignedUrl(objectKey, 900, downloadName, true);
    return { url, expiresInSeconds: 900, signed: !!doc.signedFileKey };
  }

  async findAll() {
    return this.prisma.generatedDocument.findMany({
      include: {
        student: {
          include: {
            practices: {
              include: {
                company: true,
              },
            },
          },
        },
        template: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMyDocuments(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });
    if (!student) throw new NotFoundException('Estudiante no encontrado');

    return this.prisma.generatedDocument.findMany({
      where: {
        studentId: student.id,
        status: 'VALID', // Solo mostrar los documentos vigentes al estudiante
      },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByStudent(studentId: string) {
    return this.prisma.generatedDocument.findMany({
      where: { studentId },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkExistingSolicitud(studentIds: string[]) {
    const existing = await this.prisma.generatedDocument.findFirst({
      where: {
        studentId: { in: studentIds },
        documentType: 'SOLICITUD',
        status: 'VALID'
      }
    });
    return { exists: !!existing };
  }

  async generateSolicitudGrouped(templateId: string, studentIds: string[], generatedById?: string, overwrite?: boolean) {
    // 1. Obtener template
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template || template.type !== 'DOCX') {
      throw new NotFoundException('Template DOCX no encontrado');
    }

    // Verificar si ya existen documentos válidos
    const existingDocs = await this.prisma.generatedDocument.findMany({
      where: {
        studentId: { in: studentIds },
        documentType: 'SOLICITUD',
        status: 'VALID'
      }
    });

    if (existingDocs.length > 0) {
      if (!overwrite) {
        throw new ConflictException('Ya existen solicitudes válidas para algunos estudiantes seleccionados');
      } else {
        // Invalidar todos los documentos que compartan el documentCode (toda la solicitud grupal anterior)
        const docCodesToInvalidate = [...new Set(existingDocs.map(d => d.documentCode).filter(Boolean) as string[])];
        
        if (docCodesToInvalidate.length > 0) {
          await this.prisma.generatedDocument.updateMany({
            where: { 
              documentCode: { in: docCodesToInvalidate },
              documentType: 'SOLICITUD',
              status: 'VALID'
            },
            data: { status: 'SUPERSEDED', invalidatedAt: new Date(), invalidReason: 'Regenerado mediante nueva solicitud grupal' }
          });
        } else {
          // Fallback por si el documentCode no existía
          await this.prisma.generatedDocument.updateMany({
            where: { id: { in: existingDocs.map(d => d.id) } },
            data: { status: 'SUPERSEDED', invalidatedAt: new Date(), invalidReason: 'Regenerado mediante nueva solicitud grupal' }
          });
        }
      }
    }

    // 2. Obtener estudiantes y sus prácticas
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        program: true,
        faculty: true,
        user: true,
        practices: { 
          where: { status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] } },
          include: { company: true } 
        },
      },
    });

    if (students.length === 0) throw new NotFoundException('No se encontraron estudiantes con prácticas activas');

    // Asumimos que todos van a la misma empresa porque se agruparon en el UI
    const firstStudent = students[0];
    const currentPractice = firstStudent.practices[0];
    const company = currentPractice?.company;
    const faculty = firstStudent.faculty;
    const program = firstStudent.program;

    if (!company) throw new NotFoundException('Los estudiantes seleccionados no tienen una empresa asignada');

    // 3. Preparar diccionario de variables reales
    const academicPeriodCode = currentPractice?.academicPeriod || '2024-1';

    // Validar autoridades ANTES de consumir un número de secuencia
    const { deanName, directorName } = await this.getAuthoritiesOrFail(academicPeriodCode);

    const docxCfg = typeof template.content === 'object' && template.content !== null
      ? (template.content as any)
      : {};

    const programAbbr = program?.abbreviation || faculty?.abbreviation || 'SIN';
    const docTypeAbbr = docxCfg.docTypeAbbr || 'SPP';
    const suffix = docxCfg.codeSuffix || '';

    const oficioId = await this.generateDocumentCode('SOLICITUD', academicPeriodCode, programAbbr, docTypeAbbr, suffix);

    const oficioCode = oficioId;

    const dataToInject = {
      oficioId: oficioId,
      oficioCode,
      documentCode: oficioCode,
      currentDate: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
      companyContactName: company.contactName || 'Responsable',
      companyRecipientName: company.recipientName || 'Director(a)',
      facultyName: faculty?.name || 'Facultad de Ciencias de la Vida y Tecnologías',
      academicPeriod: academicPeriodCode,
      // Oficio DOCX: la firma que se imprime es la del Responsable de
      // Prácticas (directorName); deanName queda disponible para plantillas
      // que lo referencien en el encabezado.
      deanName,
      directorName,
      responsableName: directorName,
      companyName: company.name,
      academicTutorName: currentPractice?.tutorName || 'Docente Tutor',
      programName: program?.name || 'Carrera',
      students: students.map((s) => {
        const p = s.practices[0];
        return {
          lastName: s.lastName,
          firstName: s.firstName,
          dni: s.dni,
          phone: (s as any).phone || 'N/A',
          email: s.user?.email || 'N/A',
          totalHours: p?.totalHours?.toString() || '0',
        };
      }),
    };

    // 4. Delegar al Motor de Documentos con key único
    const objectKey = this.buildObjectKey(academicPeriodCode, 'SOLICITUD', oficioId, company.name.substring(0, 12), '.docx');

    const storedKey = await this.documentEngine.generateDocument(
      'DOCX',
      template.content, // Path al DOCX original
      dataToInject,
      objectKey,
    );

    // 5. Guardar el registro en GeneratedDocument para TODOS los estudiantes involucrados.
    await this.prisma.generatedDocument.createMany({
      data: studentIds.map((studentId) => ({
        templateId,
        studentId,
        fileUrl: storedKey,
        documentCode: oficioCode,
        documentType: 'SOLICITUD',
        status: 'VALID' as const,
        generatedById,
      })),
    });

    // La solicitud vigente es lo que mueve la práctica de Pendiente a En curso
    await this.practices.recalculateForStudents(studentIds).catch((): void => undefined);

    // URL prefirmada para descarga inmediata desde la UI (el bucket es privado)
    const downloadUrl = await this.minio.getPresignedUrl(storedKey, 900, storedKey.split('/').pop());

    return { fileUrl: storedKey, downloadUrl, documentCode: oficioCode, message: 'Oficio generado correctamente' };
  }

  async invalidate(id: string, reason: string) {
    return this.prisma.generatedDocument.update({
      where: { id },
      data: {
        status: 'INVALIDATED',
        invalidatedAt: new Date(),
        invalidReason: reason,
      },
    });
  }

  async regenerate(id: string, generatedById?: string) {
    const oldDoc = await this.prisma.generatedDocument.findUnique({
      where: { id },
      include: { student: true },
    });

    if (!oldDoc) throw new NotFoundException('Documento no encontrado');

    // Invalidate old one first if not already
    await this.prisma.generatedDocument.update({
      where: { id },
      data: { status: 'SUPERSEDED' },
    });

    let latestDoc;
    if (oldDoc.documentType === 'SOLICITUD') {
      await this.generateSolicitudGrouped(oldDoc.templateId, [oldDoc.studentId], generatedById);
      // createMany no devuelve registros: buscamos el recién creado
      latestDoc = await this.prisma.generatedDocument.findFirst({
        where: { studentId: oldDoc.studentId, templateId: oldDoc.templateId, status: 'VALID' },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // generate() devuelve el registro creado directamente (sin carrera de datos)
      latestDoc = await this.generate(oldDoc.templateId, oldDoc.studentId, generatedById);
    }

    if (latestDoc) {
      latestDoc = await this.prisma.generatedDocument.update({
        where: { id: latestDoc.id },
        data: {
          version: oldDoc.version + 1,
          replacedById: oldDoc.id,
        },
      });
    }

    return latestDoc;
  }
}
