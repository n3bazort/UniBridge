import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DocumentEngineService } from '../document-engine/document-engine.service';
import { MinioService } from '../minio/minio.service';
import { PracticesService } from '../practices/practices.service';
import { canIssueCertificate } from '../practices/practice-status.util';
import {
  OficioKind, OficioScope, esOficioGrupal, nombreDelOficio, formatearCodigo, PATRON_POR_DEFECTO,
  NOMBRE_BASE_POR_DEFECTO, nombreDeArchivo, fechaDelOficio, cantidadEnLetras, unirDistintos,
  nivelAbreviado,
} from './oficio.util';
import { PDFDocument } from 'pdf-lib';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface DocumentGenerationJob {
  batchId: string;
  templateId: string;
  studentId: string;
  generatedById?: string;
}

@Injectable()
export class GeneratedDocumentsService implements OnModuleInit {
  private readonly logger = new Logger(GeneratedDocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private documentEngine: DocumentEngineService,
    private minio: MinioService,
    private practices: PracticesService,
    @InjectQueue('document-generation') private documentQueue: Queue<DocumentGenerationJob>,
  ) {}

  /** Papelera de versiones: purga diaria de documentos no vigentes con +30 días. */
  onModuleInit() {
    // Primer barrido al minuto de arrancar; luego cada 24 horas
    setTimeout(() => this.purgeTrash().catch((e) => this.logger.error('Purga inicial falló', e)), 60_000);
    setInterval(() => this.purgeTrash().catch((e) => this.logger.error('Purga diaria falló', e)), 24 * 60 * 60 * 1000);
  }

  /**
   * Elimina DEFINITIVAMENTE (BD + archivo en MinIO) las versiones anuladas
   * con más de 30 días. Funciona como papelera: durante ese mes el historial
   * las muestra con su motivo; después desaparecen.
   *
   * Se conservan siempre las que participaron en un circuito de firma:
   * borrar esas filas rompería la trazabilidad de las firmas.
   */
  async purgeTrash(): Promise<{ purged: number; filesRemoved: number }> {
    const candidates = await this.prisma.$queryRaw<
      { id: string; fileUrl: string; signedFileKey: string | null }[]
    >`
      SELECT d.id, d."fileUrl", d."signedFileKey"
      FROM generated_documents d
      WHERE d.status != 'VALID'
        AND COALESCE(d."invalidatedAt", d."createdAt") < now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM signature_batch_items i WHERE i."documentId" = d.id)
    `;

    if (candidates.length === 0) return { purged: 0, filesRemoved: 0 };

    const ids = candidates.map((c) => c.id);

    // Romper las referencias de reemplazo que apunten a filas por purgar
    await this.prisma.$executeRaw`
      UPDATE generated_documents SET "replacedById" = NULL
      WHERE "replacedById" = ANY(${ids}::uuid[])
    `;
    await this.prisma.$executeRaw`
      DELETE FROM generated_documents WHERE id = ANY(${ids}::uuid[])
    `;

    // Un oficio grupal comparte archivo entre varias filas: el objeto solo se
    // borra de MinIO cuando ya NINGUNA fila viva lo referencia.
    const keys = new Set<string>();
    for (const c of candidates) {
      if (c.fileUrl) keys.add(c.fileUrl);
      if (c.signedFileKey) keys.add(c.signedFileKey);
    }
    let filesRemoved = 0;
    for (const key of keys) {
      const stillUsed = await this.prisma.generatedDocument.count({
        where: { OR: [{ fileUrl: key }, { signedFileKey: key }] },
      });
      if (stillUsed === 0) {
        try {
          await this.minio.removeObject(key);
          filesRemoved++;
        } catch (e: any) {
          this.logger.warn(`No se pudo borrar de MinIO: ${key} (${e?.message})`);
        }
      }
    }

    this.logger.log(`Papelera: ${ids.length} versión(es) purgadas, ${filesRemoved} archivo(s) eliminados de MinIO`);
    return { purged: ids.length, filesRemoved };
  }

  /**
   * Consume el siguiente número de la serie de este tipo dentro del periodo.
   * Cada tipo lleva su propia serie, así que la solicitud y la designación
   * numeran por separado, como hace la Facultad a mano.
   */
  private async nextSequence(type: string, periodCode: string): Promise<number> {
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

    return sequence.lastNumber;
  }

  async generateDocumentCode(
    type: string,
    periodCode: string,
    programAbbr: string,
    docTypeAbbr: string,
    suffix: string,
  ): Promise<string> {
    const num = String(await this.nextSequence(type, periodCode)).padStart(5, '0');
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
      // Datos de contacto que los oficios imprimen bajo la firma. A diferencia
      // del nombre, su ausencia no invalida el documento: se deja el hueco.
      directorDni: period!.directorDni?.trim() || '',
      directorPhone: period!.directorPhone?.trim() || '',
      directorEmail: period!.directorEmail?.trim() || '',
    };
  }

  /** Key único en MinIO: periodo/tipo/codigo_Apellido.ext — imposible de colisionar */
  private buildObjectKey(periodCode: string, docType: string, documentCode: string, lastName: string, ext: string): string {
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, '');
    return `${safe(periodCode)}/${safe(docType)}/${documentCode}_${safe(lastName)}${ext}`;
  }

  /**
   * Key de un oficio: el nombre del archivo dentro del almacén es el mismo con
   * el que la Facultad lo archiva, así que la descarga sale bien nombrada sin
   * tener que reconstruir el nombre después.
   *
   * Se quitan los acentos porque el key viaja dentro de una URL firmada; el
   * nombre visible al descargar sí los conserva.
   */
  private buildOficioObjectKey(periodCode: string, kind: OficioKind, nombreVisible: string): string {
    const sinAcentos = nombreVisible.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const limpio = sinAcentos.replace(/[^a-zA-Z0-9 ._-]/g, '');
    return `${periodCode.replace(/[^a-zA-Z0-9-]/g, '')}/${kind}/${limpio}`;
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

    const programAbbr = student.program?.abbreviation || student.faculty?.abbreviation;
    if (!programAbbr) {
      throw new BadRequestException(`No se puede generar el documento. La carrera "${student.program?.name || 'Desconocida'}" no tiene configurada su abreviatura. Ve a Configuraciones para asignarla.`);
    }
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
      include: {
        template: true,
        // El historial debe explicar por qué y quién anuló cada versión
        invalidatedBy: { select: { email: true } },
        generatedBy: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkExistingOficio(kind: OficioKind, studentIds: string[]) {
    const existing = await this.prisma.generatedDocument.findFirst({
      where: {
        studentId: { in: studentIds },
        documentType: kind,
        status: 'VALID'
      }
    });
    return { exists: !!existing };
  }

  /** Compatibilidad: la interfaz antigua solo preguntaba por la solicitud. */
  async checkExistingSolicitud(studentIds: string[]) {
    return this.checkExistingOficio('SOLICITUD', studentIds);
  }

  /**
   * Emite uno de los dos oficios oficiales en Word, agrupado por empresa.
   *
   * Los dos comparten estructura —un solo papel dirigido a una empresa con una
   * fila por estudiante— y se diferencian en el cuerpo y en la numeración, que
   * cada formato conserva tal como la escribe la Facultad. Por eso son un solo
   * método: duplicarlo habría dejado dos copias que se desincronizan.
   */
  async generateOficioGrouped(
    kind: OficioKind,
    templateId: string,
    studentIds: string[],
    generatedById?: string,
    overwrite?: boolean,
    asPdf?: boolean,
  ) {
    // 1. Obtener template con fallback seguro por si templateId no viene o no es válido
    let template = null;
    if (templateId) {
      template = await this.prisma.documentTemplate.findUnique({
        where: { id: templateId },
      });
    }
    if (!template) {
      template = await this.prisma.documentTemplate.findFirst({
        where: { type: 'DOCX' },
      });
    }
    if (!template) {
      throw new NotFoundException('Template DOCX no encontrado en el sistema');
    }

    // Las plantillas subidas antes de que existieran los dos formatos guardan el
    // content como un simple string: eran de solicitud, que era el único oficio.
    const docxCfg: any = typeof template.content === 'object' && template.content !== null
      ? { ...(template.content as any) }
      : { path: template.content };
    docxCfg.kind = docxCfg.kind || 'SOLICITUD';

    // Emitir una designación con el cuerpo de la solicitud produciría un
    // documento falso, así que el tipo de la plantilla tiene que coincidir.
    if (docxCfg.kind !== kind) {
      throw new BadRequestException(
        `La plantilla "${template.name}" es de ${nombreDelOficio(docxCfg.kind)} y se pidió una ${nombreDelOficio(kind)}. ` +
        'Elige la plantilla correcta en Plantillas.',
      );
    }

    // Verificar si ya existen documentos válidos DE ESTE TIPO
    const existingDocs = await this.prisma.generatedDocument.findMany({
      where: {
        studentId: { in: studentIds },
        documentType: kind,
        status: 'VALID'
      }
    });

    if (existingDocs.length > 0) {
      if (!overwrite) {
        throw new ConflictException(
          `Ya existe una ${nombreDelOficio(kind)} vigente para algunos de los estudiantes seleccionados`,
        );
      } else {
        const motivo = `Regenerado mediante nueva ${nombreDelOficio(kind)} grupal`;
        // Invalidar todos los documentos que compartan el documentCode (todo el oficio grupal anterior)
        const docCodesToInvalidate = [...new Set(existingDocs.map(d => d.documentCode).filter(Boolean) as string[])];

        if (docCodesToInvalidate.length > 0) {
          await this.prisma.generatedDocument.updateMany({
            where: {
              documentCode: { in: docCodesToInvalidate },
              documentType: kind,
              status: 'VALID'
            },
            data: { status: 'SUPERSEDED', invalidatedAt: new Date(), invalidReason: motivo }
          });
        } else {
          // Fallback por si el documentCode no existía
          await this.prisma.generatedDocument.updateMany({
            where: { id: { in: existingDocs.map(d => d.id) } },
            data: { status: 'SUPERSEDED', invalidatedAt: new Date(), invalidReason: motivo }
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
        practices: {
          where: { status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] } },
          include: { company: true }
        },
      },
    });

    if (students.length === 0) throw new NotFoundException('No se encontraron estudiantes con prácticas activas');

    // Todos van a la misma empresa porque se agruparon por empresa en la vista
    const firstStudent = students[0];
    const company = firstStudent.practices[0]?.company;
    const faculty = firstStudent.faculty;
    const program = firstStudent.program;

    if (!company) throw new NotFoundException('Los estudiantes seleccionados no tienen una empresa asignada');

    // La práctica que interesa es la de ESTA empresa: un estudiante puede
    // arrastrar prácticas de otra, y tomar la primera imprimiría el tutor y las
    // horas equivocados.
    const practiceOf = (s: typeof students[number]) =>
      s.practices.find((p) => p.companyId === company.id) ?? s.practices[0];

    const currentPractice = practiceOf(firstStudent);

    // 3. Preparar diccionario de variables reales
    const academicPeriodCode = currentPractice?.academicPeriod || '2024-1';

    // Validar autoridades ANTES de consumir un número de secuencia
    const { deanName, directorName, directorDni, directorPhone, directorEmail } =
      await this.getAuthoritiesOrFail(academicPeriodCode);

    const programAbbr = program?.abbreviation || faculty?.abbreviation;
    if (!programAbbr) {
      throw new BadRequestException(`No se puede generar la ${nombreDelOficio(kind)}. La carrera "${program?.name || 'Desconocida'}" no tiene configurada su abreviatura. Ve a Configuraciones para asignarla.`);
    }
    const docTypeAbbr = docxCfg.docTypeAbbr || (kind === 'SOLICITUD' ? 'SPP' : 'DES');

    /**
     * Emite UN oficio para el lote que se le pase. Está aquí dentro, y no como
     * método aparte, para no tener que reenviarle a mano la docena de datos del
     * contexto que ya están resueltos.
     */
    const emitirOficio = async (lote: typeof students) => {
      const secuencia = await this.nextSequence(kind, academicPeriodCode);
      const ahora = new Date();
      const oficioCode = formatearCodigo(docxCfg.codePattern || PATRON_POR_DEFECTO[kind], {
        secuencia,
        periodCode: academicPeriodCode,
        programAbbr,
        facultyAbbr: faculty?.abbreviation || programAbbr,
        docTypeAbbr,
        fecha: ahora,
      });

      // Datos que el cuerpo del oficio menciona una sola vez para todo el lote
      const horasDelLote = unirDistintos(lote.map((s) => practiceOf(s)?.totalHours?.toString()), ' y ');
      const nivelDelLote = unirDistintos(lote.map((s) => practiceOf(s)?.practiceLevel), ' y ');
      // Si nadie registró el área, se usa la abreviatura de la carrera: es lo que
      // la Facultad escribe cuando la empresa no precisa un departamento («TI»).
      const areaDelLote = unirDistintos(lote.map((s) => practiceOf(s)?.workArea), ', ') || programAbbr;
      const tutoresDelLote = unirDistintos(lote.map((s) => practiceOf(s)?.tutorName), ' / ');

      const dataToInject = {
        oficioId: oficioCode,
        oficioCode,
        documentCode: oficioCode,
        currentDate: fechaDelOficio(ahora),
        // Destinatario: nombre, cargo y empresa, las tres líneas del formato oficial
        companyContactName: company.contactName || 'Responsable',
        companyPosition: company.recipientName || '',
        // Nombre antiguo de la misma variable: hay plantillas que ya lo usan
        companyRecipientName: company.recipientName || '',
        companyName: company.name,
        facultyName: faculty?.name || 'Facultad de Ciencias de la Vida y Tecnologías',
        programName: program?.name || 'Carrera',
        academicPeriod: academicPeriodCode,
        // Cuántas vacantes se piden, en número y en letras
        vacancyCount: lote.length.toString(),
        vacancyCountWords: cantidadEnLetras(lote.length),
        // Concordancia del cuerpo. La plantilla decide la redacción con
        // {{#varios}}…{{/varios}} y {{^varios}}…{{/varios}}: así el texto vive
        // donde debe, en el formato, y no clavado en el código. Depende de
        // cuántos ampara ESTE papel, no del alcance configurado, de modo que un
        // oficio grupal de un solo estudiante también sale en singular.
        varios: lote.length > 1,
        uno: lote.length === 1,
        // Condiciones de la práctica que el cuerpo enuncia para todo el lote
        totalHours: horasDelLote || '0',
        practiceLevel: nivelDelLote,
        // Los oficios citan solo el numeral: «prácticas pre-profesionales II»
        practiceLevelShort: unirDistintos(
          lote.map((s) => nivelAbreviado(practiceOf(s)?.practiceLevel)), ' y ',
        ),
        workArea: areaDelLote,
        academicTutorName: tutoresDelLote || 'Docente Tutor',
        // Quien firma el oficio es el Responsable de Prácticas; deanName queda
        // disponible para plantillas que lo citen en el encabezado.
        deanName,
        directorName,
        responsableName: directorName,
        responsableDni: directorDni,
        responsablePhone: directorPhone,
        responsableEmail: directorEmail,
        students: lote.map((s) => {
          const p = practiceOf(s);
          return {
            fullName: `${s.lastName} ${s.firstName}`,
            lastName: s.lastName + ' ',
            firstName: s.firstName,
            dni: s.dni,
            programName: s.program?.name || program?.name || '',
            totalHours: p?.totalHours?.toString() || '0',
            practiceLevel: p?.practiceLevel || '',
            practiceLevelShort: nivelAbreviado(p?.practiceLevel),
            workArea: p?.workArea || '',
            tutorName: p?.tutorName || '',
          };
        }),
      };

      // Delegar al Motor de Documentos con key único.
      // La casilla "en PDF" entrega el MISMO oficio convertido con LibreOffice:
      // un solo documento oficial, en el formato que se pidió.
      const ext = asPdf ? '.pdf' : '.docx';
      // El archivo se guarda y se descarga con el nombre que usa la Facultad.
      // Cuando el oficio ampara a uno solo, su apellido distingue el archivo.
      const sufijo = lote.length === 1 ? `${company.name} - ${lote[0].lastName}` : company.name;
      const nombreVisible = nombreDeArchivo(
        docxCfg.fileBaseName || NOMBRE_BASE_POR_DEFECTO[kind],
        sufijo,
        secuencia,
        ext,
      );
      const objectKey = this.buildOficioObjectKey(academicPeriodCode, kind, nombreVisible);

      const storedKey = await this.documentEngine.generateDocument(
        'DOCX',
        template.content, // Path al DOCX original
        dataToInject,
        objectKey,
        { convertToPdf: !!asPdf },
      );

      // Una fila por cada estudiante que el papel ampara. Se usan los del lote
      // y no los ids pedidos: si alguno no tenía práctica activa, tampoco está
      // en el documento, y darle una fila diría que lo tiene cuando no.
      await this.prisma.generatedDocument.createMany({
        data: lote.map((s) => ({
          templateId,
          studentId: s.id,
          fileUrl: storedKey,
          documentCode: oficioCode,
          documentType: kind,
          status: 'VALID' as const,
          generatedById,
        })),
      });

      // URL prefirmada para descarga inmediata desde la UI (el bucket es privado)
      const downloadUrl = await this.minio.getPresignedUrl(storedKey, 900, nombreVisible);

      return { fileUrl: storedKey, downloadUrl, documentCode: oficioCode, fileName: nombreVisible, students: lote.length };
    };

    // 4. ¿Un oficio para todo el grupo o uno por estudiante?
    // Lo decide la plantilla. Por defecto va agrupado, que es como la Facultad
    // emite hoy; con `scope: 'ESTUDIANTE'` sale un papel por cada uno, cada uno
    // con su propio número de secuencia.
    const scope: OficioScope = docxCfg.scope === 'ESTUDIANTE' ? 'ESTUDIANTE' : 'GRUPO';
    const lotes = scope === 'ESTUDIANTE' ? students.map((s) => [s]) : [students];

    const emitidos: Awaited<ReturnType<typeof emitirOficio>>[] = [];
    for (const lote of lotes) {
      emitidos.push(await emitirOficio(lote));
    }

    // La solicitud vigente es lo que mueve la práctica de Pendiente a En curso
    await this.practices.recalculateForStudents(studentIds).catch((): void => undefined);

    const nombre = kind === 'SOLICITUD' ? 'Solicitud' : 'Designación';
    const mensaje = emitidos.length === 1
      ? `${nombre} generada correctamente`
      : `${emitidos.length} ${nombre.toLowerCase()}es generadas, una por estudiante`;

    // Los campos del primero se repiten en la raíz por compatibilidad: quien
    // solo espera un documento sigue funcionando sin cambios.
    return {
      scope,
      documents: emitidos,
      ...emitidos[0],
      message: mensaje,
    };
  }

  /** Compatibilidad con la interfaz y el flujo antiguos. */
  async generateSolicitudGrouped(templateId: string, studentIds: string[], generatedById?: string, overwrite?: boolean, asPdf?: boolean) {
    return this.generateOficioGrouped('SOLICITUD', templateId, studentIds, generatedById, overwrite, asPdf);
  }

  /**
   * Invalida un documento dejando rastro de por qué y de quién lo hizo: sin
   * eso, un documento anulado no se puede defender ante una auditoría.
   *
   * Si es una SOLICITUD, la invalidación alcanza a TODO el grupo (todas las
   * filas que comparten el documentCode): el oficio es un solo documento
   * físico compartido — invalidarlo "para uno solo" dejaría un estado
   * imposible, con el mismo papel válido e inválido a la vez.
   */
  async invalidate(id: string, reason: string, invalidatedById?: string) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { id },
      select: { id: true, studentId: true, documentType: true, documentCode: true, status: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const data = {
      status: 'INVALIDATED' as const,
      invalidatedAt: new Date(),
      invalidReason: reason,
      invalidatedById,
    };

    let affectedStudentIds: string[] = [doc.studentId];

    if (esOficioGrupal(doc.documentType) && doc.documentCode) {
      const group = await this.prisma.generatedDocument.findMany({
        where: { documentCode: doc.documentCode, documentType: doc.documentType, status: 'VALID' },
        select: { id: true, studentId: true },
      });
      await this.prisma.generatedDocument.updateMany({
        where: { id: { in: group.map((g) => g.id) } },
        data,
      });
      affectedStudentIds = [...new Set(group.map((g) => g.studentId))];
    } else {
      await this.prisma.generatedDocument.update({ where: { id }, data });
    }

    // Invalidar la solicitud puede devolver las prácticas a "Pendiente"
    await this.practices.recalculateForStudents(affectedStudentIds).catch((): void => undefined);
    return { id: doc.id, affected: affectedStudentIds.length };
  }

  // ─────────── Edición manual del oficio por la coordinación ───────────

  /**
   * Documentos que comparten el mismo papel físico. Tanto la solicitud como la
   * designación son un único oficio con una fila por estudiante: cualquier
   * cambio debe alcanzarlos a todos, o quedarían versiones distintas del mismo
   * documento.
   */
  private async getSharedGroup(doc: { id: string; documentType: string | null; documentCode: string | null }) {
    if (esOficioGrupal(doc.documentType) && doc.documentCode) {
      return this.prisma.generatedDocument.findMany({
        where: { documentCode: doc.documentCode, documentType: doc.documentType, status: 'VALID' },
        select: { id: true, studentId: true, templateId: true, version: true },
      });
    }
    const single = await this.prisma.generatedDocument.findUnique({
      where: { id: doc.id },
      select: { id: true, studentId: true, templateId: true, version: true },
    });
    return single ? [single] : [];
  }

  /** Inserta el sufijo de versión antes de la extensión: `OFIC-001.docx` → `OFIC-001_v2.docx`. */
  private versionedKey(objectKey: string, version: number, ext: string): string {
    const sinExt = objectKey.replace(/\.(docx|pdf)$/i, '');
    return `${sinExt.replace(/_v\d+$/, '')}_v${version}${ext}`;
  }

  /** Valida que el documento admita edición y devuelve su estado actual. */
  private async loadEditable(id: string) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { id },
      select: {
        id: true, fileUrl: true, documentCode: true, documentType: true, status: true,
        version: true, templateId: true, studentId: true, signatureStatus: true,
      },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status !== 'VALID') {
      throw new BadRequestException('Solo se puede modificar un documento vigente. Este ya fue anulado o reemplazado.');
    }
    if (doc.signatureStatus && doc.signatureStatus !== 'NONE') {
      throw new BadRequestException(
        'El documento está dentro del circuito de firma y no admite cambios. Retíralo del lote antes de editarlo.',
      );
    }
    return doc;
  }

  /**
   * Publica una versión nueva del documento conservando su código: las filas
   * vigentes pasan a SUPERSEDED y se crean las nuevas apuntando a aquellas.
   * Así el número oficial no cambia y el historial queda completo.
   */
  private async publishNewVersion(
    doc: { id: string; documentCode: string | null; documentType: string | null; version: number },
    nuevoObjectKey: string,
    generatedById?: string,
    motivo = 'Reemplazado por una versión editada',
  ) {
    const grupo = await this.getSharedGroup(doc);
    const nuevaVersion = doc.version + 1;

    const creados = await this.prisma.$transaction(async (tx) => {
      const nuevos: { id: string; studentId: string }[] = [];
      for (const fila of grupo) {
        const creado = await tx.generatedDocument.create({
          data: {
            templateId: fila.templateId,
            studentId: fila.studentId,
            fileUrl: nuevoObjectKey,
            documentCode: doc.documentCode,
            documentType: doc.documentType,
            status: 'VALID',
            version: nuevaVersion,
            replacedById: fila.id,
            generatedById,
          },
          select: { id: true, studentId: true },
        });
        nuevos.push(creado);
      }
      await tx.generatedDocument.updateMany({
        where: { id: { in: grupo.map((g) => g.id) } },
        data: { status: 'SUPERSEDED', invalidatedAt: new Date(), invalidReason: motivo, invalidatedById: generatedById },
      });
      return nuevos;
    });

    await this.practices
      .recalculateForStudents([...new Set(creados.map((c) => c.studentId))])
      .catch((): void => undefined);

    return { nuevos: creados, version: nuevaVersion };
  }

  /**
   * La coordinación sube el oficio corregido en Word. El archivo reemplaza al
   * anterior sin alterar el código del documento: se registra como una versión
   * más, y la anterior queda en el historial.
   */
  async replaceFile(id: string, file: { originalname: string; buffer: Buffer }, generatedById?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('No se recibió ningún archivo');
    if (!/\.docx$/i.test(file.originalname)) {
      throw new BadRequestException('El archivo debe ser un documento de Word (.docx)');
    }
    // Un .docx es un ZIP: la firma "PK" descarta archivos renombrados
    if (file.buffer.subarray(0, 2).toString('latin1') !== 'PK') {
      throw new BadRequestException('El archivo no es un .docx válido');
    }

    const doc = await this.loadEditable(id);
    if (!/\.docx$/i.test(doc.fileUrl)) {
      throw new BadRequestException('Solo los documentos en Word admiten edición manual. Este ya está en PDF.');
    }

    const nuevoKey = this.versionedKey(doc.fileUrl, doc.version + 1, '.docx');
    await this.minio.uploadBuffer(
      file.buffer,
      nuevoKey,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    const { nuevos, version } = await this.publishNewVersion(doc, nuevoKey, generatedById);
    this.logger.log(`Documento ${doc.documentCode} actualizado a la versión ${version} por edición manual`);

    return {
      id: nuevos[0]?.id,
      documentCode: doc.documentCode,
      version,
      affected: nuevos.length,
      message: `Documento actualizado. Se conserva el código ${doc.documentCode} y queda registrado como versión ${version}.`,
    };
  }

  /**
   * Convierte a PDF el oficio en Word ya revisado. El PDF pasa a ser la versión
   * vigente; el Word permanece en el historial por si hay que retomarlo.
   */
  async convertToPdf(id: string, generatedById?: string) {
    const doc = await this.loadEditable(id);
    if (!/\.docx$/i.test(doc.fileUrl)) {
      throw new BadRequestException('Este documento ya está en PDF');
    }

    const buffer = await this.minio.getObjectBuffer(doc.fileUrl);
    const dir = path.join(os.tmpdir(), 'unibridge-docs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const docxPath = path.join(dir, `${crypto.randomUUID()}.docx`);
    fs.writeFileSync(docxPath, buffer);

    let pdfPath: string | null = null;
    try {
      pdfPath = await this.documentEngine.convertDocxToPdf(docxPath);
      const nuevoKey = this.versionedKey(doc.fileUrl, doc.version + 1, '.pdf');
      await this.minio.uploadFile(pdfPath, nuevoKey, 'application/pdf');

      const { nuevos, version } = await this.publishNewVersion(
        doc, nuevoKey, generatedById, 'Convertido a PDF tras la revisión',
      );
      return {
        id: nuevos[0]?.id,
        documentCode: doc.documentCode,
        version,
        message: `Documento convertido a PDF conservando el código ${doc.documentCode}.`,
      };
    } finally {
      try { fs.unlinkSync(docxPath); } catch {}
      if (pdfPath) { try { fs.unlinkSync(pdfPath); } catch {} }
    }
  }

  /**
   * Une en un solo PDF los documentos indicados, listo para enviar a imprimir.
   * Los oficios en Word se convierten al vuelo; los grupales se incluyen una
   * sola vez, porque son un mismo papel compartido.
   */
  async buildPrintablePdf(ids: string[]): Promise<{ buffer: Buffer; included: number; skipped: string[] }> {
    if (!ids?.length) throw new BadRequestException('No se indicaron documentos');

    const docs = await this.prisma.generatedDocument.findMany({
      where: { id: { in: ids }, status: 'VALID' },
      select: { id: true, fileUrl: true, documentCode: true, documentType: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!docs.length) throw new NotFoundException('No se encontraron documentos vigentes en la selección');

    const vistos = new Set<string>();
    const merged = await PDFDocument.create();
    const skipped: string[] = [];
    let included = 0;

    for (const doc of docs) {
      const clave = doc.documentCode || doc.id;
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      let tmpDocx: string | null = null;
      let tmpPdf: string | null = null;
      try {
        let pdfBuffer: Buffer;
        if (/\.pdf$/i.test(doc.fileUrl)) {
          pdfBuffer = await this.minio.getObjectBuffer(doc.fileUrl);
        } else {
          const dir = path.join(os.tmpdir(), 'unibridge-docs');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          tmpDocx = path.join(dir, `${crypto.randomUUID()}.docx`);
          fs.writeFileSync(tmpDocx, await this.minio.getObjectBuffer(doc.fileUrl));
          tmpPdf = await this.documentEngine.convertDocxToPdf(tmpDocx);
          pdfBuffer = fs.readFileSync(tmpPdf);
        }
        const origen = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
        const paginas = await merged.copyPages(origen, origen.getPageIndices());
        paginas.forEach((p) => merged.addPage(p));
        included++;
      } catch (e: any) {
        this.logger.warn(`No se pudo incluir ${clave} en la impresión: ${e?.message}`);
        skipped.push(clave);
      } finally {
        if (tmpDocx) { try { fs.unlinkSync(tmpDocx); } catch {} }
        if (tmpPdf) { try { fs.unlinkSync(tmpPdf); } catch {} }
      }
    }

    if (!included) throw new BadRequestException('Ningún documento de la selección pudo prepararse para impresión');
    return { buffer: Buffer.from(await merged.save()), included, skipped };
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
    if (esOficioGrupal(oldDoc.documentType)) {
      await this.generateOficioGrouped(oldDoc.documentType, oldDoc.templateId, [oldDoc.studentId], generatedById);
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
