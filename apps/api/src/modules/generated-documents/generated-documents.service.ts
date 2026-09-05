import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DocumentEngineService } from '../document-engine/document-engine.service';
import { MinioService } from '../minio/minio.service';
import { PracticesService } from '../practices/practices.service';
import { canIssueCertificate } from '../practices/practice-status.util';
import { assertPeriodoAbierto, getPeriodoActivo, normalizePeriodCode } from '../academic-periods/period.util';
import {
  OficioKind, OficioScope, esOficioGrupal, nombreDelOficio, formatearCodigo, PATRON_POR_DEFECTO,
  NOMBRE_BASE_POR_DEFECTO, nombreDeArchivo, fechaDelOficio, cantidadEnLetras, unirDistintos,
  nivelAbreviado, requisitosDe, dependientesDe, nombreDelDocumento, nombreContable,
} from './oficio.util';
import { PDFDocument } from 'pdf-lib';
import * as archiver from 'archiver';
import type { Response } from 'express';
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
   * Barrido de archivos huérfanos: retira del almacén los ficheros de versiones
   * anuladas a las que se les escapó el borrado inmediato (un fallo de red al
   * anular, una fila anulada antes de que existiera esta regla).
   *
   * NO borra filas. Antes sí: a los treinta días eliminaba el registro entero,
   * con lo que se perdía el rastro de que el documento existió y por qué se
   * anuló — justo lo contrario de lo que un expediente necesita. Ahora el
   * historial es permanente y lo que desaparece es el archivo equivocado.
   *
   * Los documentos FIRMADOS conservan su archivo: la firma es un hecho
   * ocurrido y hay que poder demostrar qué se suscribió.
   */
  async purgeTrash(): Promise<{ purged: number; filesRemoved: number }> {
    const candidates = await this.prisma.generatedDocument.findMany({
      where: {
        status: { not: 'VALID' },
        fileRemovedAt: null,
        signedFileKey: null,
        signatureStatus: 'NONE',
      },
      select: { id: true, fileUrl: true },
    });

    if (candidates.length === 0) return { purged: 0, filesRemoved: 0 };

    // Un oficio grupal comparte archivo entre varias filas: el objeto solo se
    // retira cuando ya NINGUNA fila vigente lo referencia.
    let filesRemoved = 0;
    for (const key of new Set(candidates.map((c) => c.fileUrl).filter(Boolean))) {
      const stillUsed = await this.prisma.generatedDocument.count({
        where: { fileUrl: key, status: 'VALID' },
      });
      if (stillUsed > 0) continue;
      try {
        await this.minio.removeObject(key);
        filesRemoved++;
      } catch (e: any) {
        this.logger.warn(`No se pudo borrar de MinIO: ${key} (${e?.message})`);
      }
    }

    await this.prisma.generatedDocument.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { fileRemovedAt: new Date() },
    });

    this.logger.log(`Barrido: ${filesRemoved} archivo(s) retirados. Los ${candidates.length} registros se conservan como historial.`);
    return { purged: candidates.length, filesRemoved };
  }

  /**
   * Consume el siguiente número de la serie de este tipo dentro del periodo.
   * Cada tipo lleva su propia serie, así que la solicitud y la designación
   * numeran por separado, como hace la Facultad a mano.
   */
  private async nextSequence(type: string, periodCode: string): Promise<number> {
    // Antes, un periodo desconocido se creaba aqui al vuelo con la fecha del
    // servidor. Eso llenaba el selector del topbar de periodos que nadie creo
    // y sin autoridades configuradas. Ahora se detiene: quien llame ya debio
    // validar el periodo con `assertPeriodoAbierto`.
    const period = await this.prisma.academicPeriod.findUnique({ where: { code: periodCode } });
    if (!period) {
      throw new BadRequestException(
        `El periodo "${periodCode}" no existe en el sistema, asi que no se puede numerar el documento. ` +
        'Crealo en Configuracion (panel de administracion).',
      );
    }

    // Una sola sentencia, resuelta entera dentro de PostgreSQL.
    //
    // Esto es lo que impide que dos coordinadores que pulsan "Generar" en el
    // mismo instante se lleven el mismo número. El motor toma un bloqueo sobre
    // la fila (type, periodCode) mientras la incrementa, así que la segunda
    // transacción espera y lee el valor YA incrementado: nunca 17 y 17, sino
    // 17 y 18. Y si la fila todavía no existe, las dos intentan insertarla, el
    // índice único la deja pasar una sola vez y `ON CONFLICT DO UPDATE`
    // convierte a la perdedora en un incremento en lugar de un error.
    //
    // Hacerlo en dos pasos (leer el último y guardar el siguiente) sí tendría
    // carrera: las dos leerían 16 y las dos escribirían 17.
    const [fila] = await this.prisma.$queryRaw<{ lastNumber: number }[]>`
      INSERT INTO document_sequences (id, type, "periodCode", "lastNumber")
      VALUES (gen_random_uuid(), ${type}, ${periodCode}, 1)
      ON CONFLICT (type, "periodCode")
      DO UPDATE SET "lastNumber" = document_sequences."lastNumber" + 1
      RETURNING "lastNumber"
    `;

    return Number(fila.lastNumber);
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
    //
    // El certificado acredita la práctica del periodo que se está cursando, no
    // "la primera que devuelva la base": un estudiante que ya hizo prácticas
    // en semestres anteriores tiene varias filas, y sin ordenar por periodo el
    // certificado podía salir con la empresa, las horas y el tutor de otro año.
    const periodoActivo = await getPeriodoActivo(this.prisma);
    if (!periodoActivo) {
      throw new BadRequestException(
        'No hay ningún periodo académico activo, así que no se puede emitir ningún documento. ' +
        'Marca el periodo en curso como activo en Configuración (panel de administración).',
      );
    }
    const academicPeriodCode = periodoActivo.code;
    const currentPractice =
      student.practices.find((p) => normalizePeriodCode(p.academicPeriod) === academicPeriodCode);

    if (!currentPractice) {
      throw new BadRequestException(
        `${student.firstName} ${student.lastName} no tiene una práctica registrada en el periodo ${academicPeriodCode}, ` +
        'así que no se le puede emitir un documento de este periodo.',
      );
    }

    // Requisitos para emitir el certificado: solicitud vigente (el proceso
    // arrancó formalmente) y los datos que se imprimen. NO se exige estado
    // "Finalizado": ese estado es la consecuencia de que este certificado
    // quede firmado, así que exigirlo sería un ciclo imposible.
    if (template.type !== 'DOCX') {
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

    // Un periodo cerrado no admite documentos nuevos: se consulta, no se emite.
    await assertPeriodoAbierto(this.prisma, academicPeriodCode, 'emitir documentos');

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
      responsableName: directorName,
      responsablePracticasName: directorName,
      decanoName: deanName,
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
  /**
   * Qué estudiantes pueden certificarse y qué le falta a cada uno de los demás.
   *
   * Existe para que la pantalla deje de tener su propia copia de las reglas.
   * Antes el frontend decidía mirando si había «algún DOCX vigente», sin
   * distinguir la solicitud de la designación —las dos usan plantilla DOCX— y
   * sin comprobar horas, tutor ni niveles. Resultado: habilitaba el botón sobre
   * condiciones que el servidor iba a rechazar después, dentro de la cola.
   *
   * Ahora la regla vive en un solo sitio, `canIssueCertificate`, y la pantalla
   * pregunta antes de ofrecer el botón.
   */
  async checkCertificateEligibility(studentIds: string[]) {
    if (!studentIds?.length) return { elegibles: [], bloqueados: [] };

    const [estudiantes, practicas, docs] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, firstName: true, lastName: true, dni: true },
      }),
      this.prisma.practice.findMany({
        where: { studentId: { in: studentIds } },
        select: {
          studentId: true, totalHours: true, tutorName: true,
          practiceLevel: true, academicLevel: true, status: true, createdAt: true,
          // La aprobacion del tutor es la septima condicion (RF-18). Si no se
          // trajera, llegaria como `undefined` y bloquearia a todo el mundo.
          tutorApprovedAt: true, closedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.generatedDocument.findMany({
        where: { studentId: { in: studentIds } },
        select: { studentId: true, documentType: true, status: true, signatureStatus: true },
      }),
    ]);

    // La práctica más reciente de cada estudiante es la que se certifica
    const practicaDe = new Map<string, (typeof practicas)[number]>();
    for (const p of practicas) if (!practicaDe.has(p.studentId)) practicaDe.set(p.studentId, p);

    const docsDe = new Map<string, typeof docs>();
    for (const d of docs) {
      if (!docsDe.has(d.studentId)) docsDe.set(d.studentId, []);
      docsDe.get(d.studentId)!.push(d);
    }

    const elegibles: Array<{ studentId: string; nombre: string }> = [];
    const bloqueados: Array<{ studentId: string; nombre: string; falta: string[] }> = [];

    for (const e of estudiantes) {
      const nombre = `${e.firstName} ${e.lastName}`;
      const practica = practicaDe.get(e.id);
      if (!practica) {
        bloqueados.push({ studentId: e.id, nombre, falta: ['una práctica registrada'] });
        continue;
      }
      const { ok, missing } = canIssueCertificate(practica, docsDe.get(e.id) ?? []);
      if (ok) elegibles.push({ studentId: e.id, nombre });
      else bloqueados.push({ studentId: e.id, nombre, falta: missing });
    }

    return { elegibles, bloqueados };
  }

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
      await assertPeriodoAbierto(this.prisma, code, 'emitir documentos');
      await this.getAuthoritiesOrFail(code);
    }

    // Requisitos por estudiante, con la MISMA regla que aplica el worker.
    //
    // Antes esta comprobación previa solo miraba la solicitud y el duplicado,
    // mientras que dentro de la cola se exigían además designación, horas,
    // tutor y los dos niveles. Lo que no cubría aquí entraba a la cola y moría
    // allá, donde el motivo ya no alcanzaba al usuario. Ahora se rechaza antes
    // de encolar y con el detalle de qué le falta a cada quien.
    const { bloqueados } = await this.checkCertificateEligibility(studentIds);
    if (bloqueados.length > 0) {
      const detalle = bloqueados
        .map((b) => `${b.nombre} (falta ${b.falta.join(', ')})`)
        .join('; ');
      throw new BadRequestException(
        `No se pueden generar ${bloqueados.length} de ${studentIds.length} certificados. ${detalle}.`,
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

  /**
   * Progreso de un lote de generación, con el motivo de cada fallo.
   *
   * Los contadores por sí solos dejaban al usuario delante de un «3 con error»
   * sin poder saber cuáles ni por qué: el motivo quedaba en el log del servidor
   * y en el registro del job, pero nunca llegaba a la pantalla.
   *
   * Los motivos se leen de la propia cola, que ya conserva los trabajos
   * fallidos con su `failedReason`. Así no hace falta duplicar esa información
   * en la base ni arriesgar carreras entre los cuatro workers concurrentes
   * escribiendo sobre la misma fila.
   */
  async getBatchProgress(batchId: string) {
    const batch = await this.prisma.generationBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Lote de generación no encontrado');

    const errores = batch.failed > 0 ? await this.getBatchFailures(batchId) : [];

    return {
      id: batch.id,
      total: batch.total,
      completed: batch.completed,
      failed: batch.failed,
      status: batch.status,
      progress: batch.total > 0 ? Math.round(((batch.completed + batch.failed) / batch.total) * 100) : 100,
      errores,
    };
  }

  /** Qué estudiante falló y por qué, tomado de los trabajos fallidos de la cola. */
  private async getBatchFailures(batchId: string) {
    try {
      const fallidos = await this.documentQueue.getFailed(0, 500);
      const míos = fallidos.filter((j) => j.data?.batchId === batchId);
      if (míos.length === 0) return [];

      const ids = [...new Set(míos.map((j) => j.data.studentId).filter(Boolean))];
      const estudiantes = await this.prisma.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, dni: true },
      });
      const porId = new Map(estudiantes.map((e) => [e.id, e]));

      // Un job reintentado tres veces aparece una sola vez; se deduplica por
      // estudiante para no repetir el mismo motivo en la lista.
      const vistos = new Set<string>();
      const salida: Array<{ studentId: string; nombre: string; cedula: string | null; motivo: string }> = [];
      for (const job of míos) {
        const sid = job.data.studentId;
        if (!sid || vistos.has(sid)) continue;
        vistos.add(sid);
        const e = porId.get(sid);
        salida.push({
          studentId: sid,
          nombre: e ? `${e.firstName} ${e.lastName}` : 'Estudiante desconocido',
          cedula: e?.dni ?? null,
          motivo: this.limpiarMotivo(job.failedReason),
        });
      }
      return salida;
    } catch (e: any) {
      // Que la cola no responda no debe tumbar la consulta de progreso: se
      // devuelve el progreso sin detalle en vez de un error.
      this.logger.warn(`No se pudieron leer los fallos del lote ${batchId}: ${e.message}`);
      return [];
    }
  }

  /** El motivo tal como lo verá el usuario, sin el ruido del stack. */
  private limpiarMotivo(raw?: string | null): string {
    if (!raw) return 'Error no especificado.';
    const primeraLinea = raw.split('\n')[0].trim();
    return primeraLinea.replace(/^(Error|BadRequestException|ForbiddenException):\s*/i, '')
      || 'Error no especificado.';
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

    const objectKey = doc.signedFileKey || doc.fileUrl;
    const downloadName = objectKey.split('/').pop();
    // Pasamos true como 4to argumento para forzar inline en vez de attachment
    const url = await this.minio.getPresignedUrl(objectKey, 900, downloadName, true);
    return { url, expiresInSeconds: 900, signed: !!doc.signedFileKey };
  }

  /**
   * GeneratedDocument no guarda el periodo directamente (nace de una
   * Practice, no lo copia); se filtra por "el estudiante tiene una práctica
   * en ese periodo". Sin `academicPeriod` trae todo, igual que antes —
   * el selector del topbar es quien manda este parámetro en la práctica.
   */
  /**
   * ZIP con los certificados indicados, para entregarlos a los estudiantes.
   *
   * Es la salida final del circuito, no un paso intermedio: por eso los
   * archivos van con un nombre legible —«Cert 003 - Nombre Apellido.pdf»— y no
   * con el código institucional. El código sigue impreso dentro del documento y
   * en el registro; aquí manda que la persona que lo recibe sepa cuál es suyo
   * de un vistazo.
   *
   * Solo certificados. Los oficios pertenecen al trámite con la empresa y no se
   * entregan al estudiante, así que se descartan aunque vengan en la selección.
   */
  async streamCertificadosZip(res: Response, documentIds: string[], academicPeriod?: string) {
    if (!documentIds?.length) {
      throw new BadRequestException('No se indicó ningún certificado');
    }

    const docs = await this.prisma.generatedDocument.findMany({
      where: {
        id: { in: documentIds },
        documentType: 'CERTIFICADO',
        status: 'VALID',
        deletedAt: null,
      },
      select: {
        id: true, documentCode: true, fileUrl: true, signedFileKey: true,
        student: { select: { firstName: true, lastName: true } },
      },
    });

    // Alfabético por el nombre del estudiante, de la A a la Z. No se agrupa por
    // empresa ni por lote: el ZIP es una lista plana, que es como se reparte.
    // localeCompare con «es» ordena bien las tildes y la ñ, que un sort crudo
    // mandaría al final.
    docs.sort((a, b) => {
      const na = `${a.student?.firstName || ''} ${a.student?.lastName || ''}`.trim();
      const nb = `${b.student?.firstName || ''} ${b.student?.lastName || ''}`.trim();
      return na.localeCompare(nb, 'es', { sensitivity: 'base' });
    });

    if (docs.length === 0) {
      throw new NotFoundException(
        'Ninguno de los documentos seleccionados es un certificado vigente',
      );
    }

    /** Quita lo que no admite un nombre de archivo, conservando tildes y ñ. */
    const limpiar = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();

    const usados = new Set<string>();
    const entries: { key: string; name: string }[] = [];
    for (const doc of docs) {
      const key = doc.signedFileKey || doc.fileUrl;
      if (!key) continue;

      // Del código institucional se conserva solo el correlativo, que es lo que
      // distingue un certificado de otro dentro del período.
      const correlativo = (doc.documentCode || '').split('-')[0] || '000';
      const alumno = limpiar(
        `${doc.student?.firstName || ''} ${doc.student?.lastName || ''}`,
      ) || 'Sin nombre';

      let nombre = `Cert ${correlativo} - ${alumno}.pdf`;
      // Dos homónimos no pueden pisarse dentro del ZIP.
      let n = 2;
      while (usados.has(nombre.toLowerCase())) {
        nombre = `Cert ${correlativo} - ${alumno} (${n++}).pdf`;
      }
      usados.add(nombre.toLowerCase());
      entries.push({ key, name: nombre });
    }

    if (entries.length === 0) {
      throw new NotFoundException('Los certificados seleccionados no tienen archivo asociado');
    }

    const periodo = academicPeriod || (await getPeriodoActivo(this.prisma))?.code || '';
    const nombreZip = limpiar(`Certificados Practicas ${periodo}`.trim()) + '.zip';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreZip}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      this.logger.error('Error creando el ZIP de certificados', err);
      res.destroy(err);
    });
    archive.pipe(res);
    for (const entry of entries) {
      const stream = await this.minio.getObjectStream(entry.key);
      archive.append(stream, { name: entry.name });
    }
    await archive.finalize();
  }

  async findAll(academicPeriod?: string) {
    return this.prisma.generatedDocument.findMany({
      where: academicPeriod
        ? { student: { practices: { some: { academicPeriod } } } }
        : undefined,
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

  /**
   * Qué documentos vigentes de este tipo ya tienen los estudiantes elegidos.
   *
   * Antes devolvía solo un sí/no, y con eso la pantalla no podía distinguir
   * los dos casos que el RF-20 separa: regenerar un oficio que aún no ha
   * salido —que sí reemplaza al anterior— y emitir uno nuevo para un grupo
   * distinto de la misma empresa, que convive con los que ya existen.
   *
   * `firmados` es el dato que decide: un oficio que ya salió a firma está
   * entregado en papel, y ese papel no se anula desde aquí.
   */
  async checkExistingOficio(kind: OficioKind, studentIds: string[]) {
    const existing = await this.prisma.generatedDocument.findMany({
      where: { studentId: { in: studentIds }, documentType: kind, status: 'VALID' },
      select: {
        id: true, documentCode: true, signatureStatus: true,
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const firmados = existing.filter((d) => d.signatureStatus !== 'NONE');
    const porCodigo = new Map<string, { documentCode: string; estudiantes: string[]; firmado: boolean }>();
    for (const d of existing) {
      const codigo = d.documentCode ?? 's/n';
      if (!porCodigo.has(codigo)) {
        porCodigo.set(codigo, { documentCode: codigo, estudiantes: [], firmado: false });
      }
      const g = porCodigo.get(codigo)!;
      g.estudiantes.push(`${d.student.firstName} ${d.student.lastName}`);
      if (d.signatureStatus !== 'NONE') g.firmado = true;
    }

    return {
      exists: existing.length > 0,
      total: existing.length,
      // Cuántos de los seleccionados NO tienen todavía este documento: son los
      // que un oficio nuevo ampararía sin pisar nada.
      sinDocumento: studentIds.length - new Set(existing.map((d) => d.student.id)).size,
      firmados: firmados.length,
      oficios: [...porCodigo.values()],
    };
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
  /**
   * Comprueba que cada estudiante tenga vigentes los documentos que preceden a
   * `tipo` en el expediente. Nombra a quién le falta qué, porque un «no se
   * puede» sin sujeto obliga a revisar la lista entera a mano.
   */
  private async exigirRequisitosPrevios(tipo: string, studentIds: string[]) {
    const requisitos = requisitosDe(tipo);
    if (requisitos.length === 0) return;

    const vigentes = await this.prisma.generatedDocument.findMany({
      where: { studentId: { in: studentIds }, documentType: { in: requisitos }, status: 'VALID' },
      select: { studentId: true, documentType: true },
    });

    const tiene = new Set(vigentes.map((d) => `${d.studentId}|${d.documentType}`));
    const faltantes = studentIds.flatMap((id) =>
      requisitos.filter((r) => !tiene.has(`${id}|${r}`)).map((r) => ({ studentId: id, requisito: r })),
    );
    if (faltantes.length === 0) return;

    const estudiantes = await this.prisma.student.findMany({
      where: { id: { in: [...new Set(faltantes.map((f) => f.studentId))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nombreDe = new Map(estudiantes.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

    const primero = faltantes[0];
    const cuantos = new Set(faltantes.map((f) => f.studentId)).size;
    const detalle =
      cuantos === 1
        ? `A ${nombreDe.get(primero.studentId)} le falta ${nombreDelDocumento(primero.requisito)}.`
        : `A ${cuantos} de los estudiantes seleccionados les falta algún documento previo (por ejemplo, a ${nombreDe.get(primero.studentId)} le falta ${nombreDelDocumento(primero.requisito)}).`;

    throw new BadRequestException(
      `No se puede emitir ${nombreDelDocumento(tipo)} sin ${requisitos.map(nombreDelDocumento).join(' y ')} vigente. ${detalle}`,
    );
  }

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

    // El expediente tiene un orden y no se puede saltar: la designación
    // presupone una solicitud aceptada. Se comprueba aquí, no solo en la
    // pantalla, porque es lo único que impide llegar por otra vía.
    await this.exigirRequisitosPrevios(kind, studentIds);

    // ── ¿Choca con un oficio que ya existe? (RF-20) ──
    //
    // Una empresa puede recibir varias designaciones en el mismo período: si
    // acepta cuatro de seis se emite la corregida, y si más adelante pide tres
    // más se emite otra. Lo que NO puede haber son dos papeles vigentes que
    // nombren al mismo estudiante para lo mismo. Por eso el choque se mide por
    // estudiante y no por empresa: los que no tienen este documento no chocan
    // con nadie y su oficio convive con los que ya estaban.
    const existingDocs = await this.prisma.generatedDocument.findMany({
      where: { studentId: { in: studentIds }, documentType: kind, status: 'VALID' },
      select: { id: true, documentCode: true, signatureStatus: true, studentId: true },
    });

    // Un oficio que ya salió a firma está entregado: su validez es física y no
    // se anula desde aquí (RF-21). Regenerar reemplaza solo lo que no ha salido.
    const yaFirmados = existingDocs.filter((d) => d.signatureStatus !== 'NONE');
    const sinFirmar = existingDocs.filter((d) => d.signatureStatus === 'NONE');
    const conservados: string[] = [...new Set(yaFirmados.map((d) => d.documentCode).filter(Boolean) as string[])];
    let reemplazados: string[] = [];

    if (existingDocs.length > 0) {
      if (!overwrite) {
        const codigos = [...new Set(existingDocs.map((d) => d.documentCode).filter(Boolean))];
        const cuantos = new Set(existingDocs.map((d) => d.studentId)).size;
        throw new ConflictException(
          `${cuantos} de los estudiantes seleccionados ya está${cuantos === 1 ? '' : 'n'} en una ` +
          `${nombreDelOficio(kind)} vigente${codigos.length ? ` (${codigos.join(', ')})` : ''}. ` +
          (yaFirmados.length > 0
            ? 'Parte de esos documentos ya salieron a firma, así que no se reemplazan: quita a esos estudiantes de la selección.'
            : 'Marca «regenerar» para reemplazarla, o quítalos de la selección si solo quieres emitir el oficio de los demás.'),
        );
      }

      if (sinFirmar.length > 0) {
        const motivo = `Regenerado mediante nueva ${nombreDelOficio(kind)} grupal`;
        // El oficio es un papel único: se reemplaza entero, con todos los que
        // nombra. Dejar viva la mitad de un documento dejaría constando una
        // vacante para quien ya no va.
        const codigos = [...new Set(sinFirmar.map((d) => d.documentCode).filter(Boolean) as string[])];
        reemplazados = codigos;

        if (codigos.length > 0) {
          await this.prisma.generatedDocument.updateMany({
            where: { documentCode: { in: codigos }, documentType: kind, status: 'VALID', signatureStatus: 'NONE' },
            data: { status: 'SUPERSEDED', invalidatedAt: new Date(), invalidReason: motivo },
          });
        } else {
          // Respaldo por si algún documento antiguo se guardó sin documentCode
          await this.prisma.generatedDocument.updateMany({
            where: { id: { in: sinFirmar.map((d) => d.id) } },
            data: { status: 'SUPERSEDED', invalidatedAt: new Date(), invalidReason: motivo },
          });
        }
      }

      if (yaFirmados.length > 0) {
        this.logger.warn(
          `Regeneración de ${kind}: se conservan ${conservados.join(', ')} porque ya salieron a firma.`,
        );
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

    // 3. ¿En qué periodo se emite? En el activo, y solo en el activo.
    //
    // Antes el periodo se leía de la primera práctica del primer estudiante.
    // Eso hacía dos daños silenciosos: un estudiante que repite empresa en dos
    // semestres podía aportar la práctica del semestre viejo —y el oficio
    // salía con las horas, el nivel y el tutor de entonces—, y bastaba que el
    // primero de la lista arrastrara una práctica cerrada para bloquear la
    // emisión de todo un grupo que sí estaba al día. El periodo no es un dato
    // que se descubra: es el que la Facultad tiene abierto.
    const periodoActivo = await getPeriodoActivo(this.prisma);
    if (!periodoActivo) {
      throw new BadRequestException(
        'No hay ningún periodo académico activo, así que no se puede emitir ningún documento. ' +
        'Marca el periodo en curso como activo en Configuración (panel de administración).',
      );
    }
    const academicPeriodCode = periodoActivo.code;

    /** ¿Esta práctica pertenece al periodo en que se está emitiendo? */
    const esDelPeriodo = (p: { academicPeriod: string | null }) =>
      normalizePeriodCode(p.academicPeriod) === academicPeriodCode;

    // La empresa sale de una práctica del periodo activo, no de cualquiera:
    // agrupar por una empresa de un semestre anterior dirigiría el oficio al
    // destinatario equivocado.
    const company = students
      .flatMap((s) => s.practices)
      .find((p) => esDelPeriodo(p))?.company;

    if (!company) {
      throw new BadRequestException(
        `Ninguno de los estudiantes seleccionados tiene una práctica registrada en el periodo ${academicPeriodCode}. ` +
        'Solo se emiten documentos del periodo activo: revisa el selector de periodo o carga las prácticas de este semestre.',
      );
    }

    const faculty = students[0].faculty;
    const program = students[0].program;

    // La práctica que interesa es la de ESTA empresa y ESTE periodo: un
    // estudiante puede arrastrar prácticas de otra empresa o de otro semestre,
    // y tomar la primera imprimiría el tutor y las horas equivocados.
    const practiceOf = (s: typeof students[number]) =>
      s.practices.find((p) => p.companyId === company.id && esDelPeriodo(p));

    // Quien no tenga práctica en esta empresa y este periodo no puede ir en el
    // papel. Se dice quién y por qué, en vez de emitirlo sin él en silencio:
    // el coordinador lo seleccionó a propósito y tiene que enterarse.
    const fuera = students.filter((s) => !practiceOf(s));
    if (fuera.length > 0) {
      const nombres = fuera.map((s) => `${s.lastName} ${s.firstName}`).join(', ');
      throw new BadRequestException(
        `No se puede emitir la ${nombreDelOficio(kind)}: ${fuera.length === 1 ? 'el estudiante' : 'los estudiantes'} ` +
        `${nombres} no ${fuera.length === 1 ? 'tiene' : 'tienen'} una práctica en "${company.name}" durante el periodo ${academicPeriodCode}. ` +
        'Un oficio ampara a un solo grupo, de una sola empresa y de un solo periodo: quita a quien no corresponda o corrige su práctica.',
      );
    }

    // Un periodo cerrado no admite documentos nuevos: se consulta, no se emite.
    await assertPeriodoAbierto(this.prisma, academicPeriodCode, 'emitir documentos');

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

      const firstDoc = await this.prisma.generatedDocument.findFirst({
        where: { fileUrl: storedKey, status: 'VALID' },
        select: { id: true },
      });

      // URL prefirmada para descarga inmediata desde la UI (el bucket es privado)
      const downloadUrl = await this.minio.getPresignedUrl(storedKey, 900, nombreVisible);

      return { id: firstDoc?.id || '', fileUrl: storedKey, downloadUrl, documentCode: oficioCode, fileName: nombreVisible, students: lote.length };
    };

    // 4. ¿Un oficio para todo el grupo o uno por estudiante?
    // Lo decide la plantilla. Por defecto va agrupado, que es como la Facultad
    // emite hoy; con `scope: 'ESTUDIANTE'` sale un papel por cada uno, cada uno
    // con su propio número de secuencia.
    const scope: OficioScope = docxCfg.scope === 'ESTUDIANTE' ? 'ESTUDIANTE' : 'GRUPO';

    // La unidad real del oficio no es la empresa sino la empresa Y el tutor
    // (RF-20). Dos docentes pueden tener estudiantes a la vez en la misma
    // empresa, y un solo papel que los mezcle sale con «Tutor A / Tutor B» en
    // el sitio donde debe ir un nombre. Se parte el lote por tutor y se emite
    // uno por cada grupo de tutoría, cada uno con su propio número.
    const porTutor = new Map<string, typeof students>();
    for (const s of students) {
      const clave = practiceOf(s)?.tutorId ?? practiceOf(s)?.tutorName ?? 'sin-tutor';
      if (!porTutor.has(clave)) porTutor.set(clave, []);
      porTutor.get(clave)!.push(s);
    }

    const lotes = scope === 'ESTUDIANTE' ? students.map((s) => [s]) : [...porTutor.values()];

    const emitidos: Awaited<ReturnType<typeof emitirOficio>>[] = [];
    for (const lote of lotes) {
      emitidos.push(await emitirOficio(lote));
    }

    // La solicitud vigente es lo que mueve la práctica de Pendiente a En curso
    await this.practices.recalculateForStudents(studentIds).catch((): void => undefined);

    const nombre = kind === 'SOLICITUD' ? 'Solicitud' : 'Designación';
    const plural = kind === 'SOLICITUD' ? 'solicitudes' : 'designaciones';
    const mensaje = emitidos.length === 1
      ? `${nombre} generada correctamente`
      : scope === 'ESTUDIANTE'
        ? `${emitidos.length} ${plural} generadas, una por estudiante`
        : `${emitidos.length} ${plural} generadas, una por cada grupo de tutoría`;

    // Los campos del primero se repiten en la raíz por compatibilidad: quien
    // solo espera un documento sigue funcionando sin cambios.
    return {
      scope,
      documents: emitidos,
      // Qué se reemplazó y qué se respetó por estar ya firmado: sin decirlo, el
      // coordinador no sabe si el papel viejo sigue valiendo en la empresa.
      reemplazados,
      conservadosPorFirma: conservados,
      ...emitidos[0],
      message: mensaje +
        (conservados.length
          ? `. Se conservaron ${conservados.join(', ')} porque ya salieron a firma: esos papeles siguen valiendo en la empresa.`
          : ''),
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
  async invalidate(id: string, reason: string, invalidatedById?: string, reasonId?: string) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { id },
      select: { id: true, studentId: true, documentType: true, documentCode: true, status: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    // Anular dos veces no es idempotente: la segunda pasada pisaría el motivo,
    // la fecha y el nombre de quien anuló la primera. Eso borra justamente el
    // rastro que la anulación existe para dejar, así que se rechaza.
    if (doc.status !== 'VALID') {
      throw new BadRequestException(
        `Este documento ya no está vigente (${doc.status === 'INVALIDATED' ? 'fue anulado' : 'fue reemplazado por una versión posterior'}), ` +
        'así que no se puede anular de nuevo.',
      );
    }

    // El motivo tipificado (RF-24) es lo que agrupan los reportes; el texto
    // libre queda como la nota que lo matiza. Se comprueba que exista y que
    // sirva para invalidar documentos: un id cualquiera en la peticion no basta.
    let etiqueta: string | null = null;
    if (reasonId) {
      const motivo = await this.prisma.reasonCode.findUnique({ where: { id: reasonId } });
      if (!motivo) throw new BadRequestException('El motivo indicado no existe');
      if (!motivo.isActive) throw new BadRequestException(`El motivo «${motivo.label}» esta desactivado`);
      if (motivo.scope !== 'DOCUMENT' && motivo.scope !== 'BOTH') {
        throw new BadRequestException(`El motivo «${motivo.label}» no corresponde a la invalidacion de un documento`);
      }
      etiqueta = motivo.label;
    }

    const data = {
      status: 'INVALIDATED' as const,
      invalidatedAt: new Date(),
      // Se guarda el texto ya compuesto para que las pantallas y el historial
      // que solo leen `invalidReason` sigan mostrando algo completo.
      invalidReason: etiqueta ? (reason?.trim() ? `${etiqueta}: ${reason.trim()}` : etiqueta) : reason,
      invalidReasonId: reasonId ?? null,
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

    // Lo que queda sin objeto al anular este documento se anula con él.
    //
    // Hoy solo ocurre en un caso: anular la designación arrastra la solicitud
    // que la precedió, porque esa solicitud pidió el cupo para una designación
    // que ya no existe. El certificado NO se arrastra —si llegó a emitirse es
    // porque el acta acreditó la práctica cumplida—; anularlo es una decisión
    // aparte. La lista sale de `dependientesDe`, que es donde vive la regla.
    const arrastrados: Array<{ tipo: string; cuantos: number }> = [];
    for (const dependiente of dependientesDe(doc.documentType || '')) {
      const { count } = await this.prisma.generatedDocument.updateMany({
        where: { studentId: { in: affectedStudentIds }, documentType: dependiente, status: 'VALID' },
        data: {
          ...data,
          invalidReason: `Anulado en cascada al invalidarse ${nombreDelDocumento(doc.documentType || '')}`,
          // El arrastre hereda el motivo del documento raiz: es el mismo hecho.
          invalidReasonId: reasonId ?? null,
        },
      });
      if (count > 0) arrastrados.push({ tipo: dependiente, cuantos: count });
    }

    // El archivo equivocado se retira AHORA, no dentro de treinta días. Lo que
    // se conserva es el registro: código, tipo, estudiantes, motivo, quién y
    // cuándo. Guardar el PDF errado no aporta nada y sí permite que alguien lo
    // reenvíe por descuido creyendo que es el bueno.
    const archivosRetirados = await this.retirarArchivosAnulados(affectedStudentIds, doc.documentCode, doc.documentType);

    // Invalidar la solicitud puede devolver las prácticas a "Pendiente"
    await this.practices.recalculateForStudents(affectedStudentIds).catch((): void => undefined);
    return { id: doc.id, affected: affectedStudentIds.length, cascade: arrastrados, archivosRetirados };
  }

  /**
   * Borra del almacén los archivos de las versiones recién anuladas.
   *
   * Dos salvedades:
   *
   * - Un oficio grupal comparte un mismo archivo entre varias filas. Solo se
   *   borra cuando ninguna fila VIGENTE lo referencia ya.
   * - Los documentos FIRMADOS conservan su archivo. Una firma electrónica es un
   *   hecho ocurrido: el documento salió, lo suscribieron dos autoridades y
   *   probablemente ya está en manos de la empresa. Borrar nuestra copia no lo
   *   deshace, solo nos deja sin poder demostrar qué se firmó.
   */
  private async retirarArchivosAnulados(studentIds: string[], documentCode: string | null, documentType: string | null) {
    const anulados = await this.prisma.generatedDocument.findMany({
      where: {
        studentId: { in: studentIds },
        status: { not: 'VALID' },
        fileRemovedAt: null,
        signedFileKey: null,
        signatureStatus: { in: ['NONE'] },
        ...(documentCode ? { OR: [{ documentCode }, { documentType: { not: documentType } }] } : {}),
      },
      select: { id: true, fileUrl: true },
    });
    if (anulados.length === 0) return 0;

    let retirados = 0;
    for (const clave of new Set(anulados.map((a) => a.fileUrl).filter(Boolean))) {
      const sigueViva = await this.prisma.generatedDocument.count({
        where: { fileUrl: clave, status: 'VALID' },
      });
      if (sigueViva > 0) continue;
      try {
        await this.minio.removeObject(clave);
        retirados++;
      } catch (e: any) {
        this.logger.warn(`No se pudo retirar del almacén: ${clave} (${e?.message})`);
      }
    }

    await this.prisma.generatedDocument.updateMany({
      where: { id: { in: anulados.map((a) => a.id) } },
      data: { fileRemovedAt: new Date() },
    });
    return retirados;
  }

  /**
   * Qué se llevaría por delante anular este documento, sin llegar a anularlo.
   * La pantalla lo consulta para avisar antes de que la coordinación confirme.
   */
  async invalidationImpact(id: string) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { id },
      select: { id: true, studentId: true, documentType: true, documentCode: true, status: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    let studentIds = [doc.studentId];
    if (esOficioGrupal(doc.documentType) && doc.documentCode) {
      const grupo = await this.prisma.generatedDocument.findMany({
        where: { documentCode: doc.documentCode, documentType: doc.documentType, status: 'VALID' },
        select: { studentId: true },
      });
      studentIds = [...new Set(grupo.map((g) => g.studentId))];
    }

    const dependientes = dependientesDe(doc.documentType || '');
    const afectados = dependientes.length
      ? await this.prisma.generatedDocument.groupBy({
          by: ['documentType'],
          where: { studentId: { in: studentIds }, documentType: { in: dependientes }, status: 'VALID' },
          _count: { _all: true },
        })
      : [];

    return {
      documentType: doc.documentType,
      students: studentIds.length,
      // Ordenado como se anularán: del último documento hacia atrás
      cascade: dependientes
        .map((t) => {
          const count = afectados.find((a) => a.documentType === t)?._count._all ?? 0;
          return { documentType: t, nombre: nombreContable(t, count), count };
        })
        .filter((c) => c.count > 0),
    };
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
