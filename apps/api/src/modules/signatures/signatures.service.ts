import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../minio/minio.service';
import { SignerRole, SignatureBatchStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as archiver from 'archiver';
import type { Response } from 'express';
import { matchDocumentCode, assertPdfHasDigitalSignature } from './signature-verification.util';
import { PracticesService } from '../practices/practices.service';

/**
 * Flujo de firma digital con FirmaEC (firma externa):
 *
 *  1. ADMIN/COORDINATOR crea un Lote de Firma con N documentos generados.
 *     El lote nace en PENDING_DIRECTOR.
 *  2. El RESPONSABLE DE PRÁCTICAS (rol SIGNER, SignerProfile.DIRECTOR) descarga
 *     el ZIP del lote, firma los PDFs localmente con FirmaEC y los re-sube.
 *  3. El sistema verifica que cada PDF contenga firma digital, calcula el
 *     SHA-256, y cuando todos los ítems están firmados pasa a PENDING_DEAN.
 *  4. El DECANO repite el proceso sobre los PDFs ya firmados por el responsable.
 *  5. Al completarse, cada documento queda SIGNED y visible para su estudiante.
 *
 * El emparejamiento archivo→documento se hace comparando el nombre del archivo
 * subido con los códigos que ese lote contiene: FirmaEC conserva el nombre que
 * traía el ZIP y solo le añade sufijos. Se compara contra los códigos reales y
 * no contra un patrón fijo porque la numeración se configura por plantilla.
 */
@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
    private practices: PracticesService,
  ) {}

  // ───────────────────────── Lotes ─────────────────────────

  async createBatch(documentIds: string[], createdById: string, name?: string) {
    if (!documentIds?.length) throw new BadRequestException('Debes seleccionar al menos un documento');

    const docs = await this.prisma.generatedDocument.findMany({
      where: { id: { in: documentIds }, status: 'VALID' },
    });
    if (docs.length === 0) throw new NotFoundException('No se encontraron documentos válidos');

    // Solo los CERTIFICADOS pasan por el circuito de firma. La solicitud es un
    // oficio que la Comisión envía a la empresa: no lleva firma digital de las
    // autoridades ni entra a este flujo.
    const notCertificates = docs.filter((d) => d.documentType !== 'CERTIFICADO');
    if (notCertificates.length > 0) {
      throw new BadRequestException(
        `Solo los certificados se envían a firma. ${notCertificates.length} documento(s) seleccionado(s) son solicitudes y no requieren firma digital.`,
      );
    }

    const alreadyInSigning = docs.filter((d) => d.signatureStatus === 'IN_SIGNING' || d.signatureStatus === 'PARTIALLY_SIGNED');
    if (alreadyInSigning.length > 0) {
      throw new BadRequestException(
        `${alreadyInSigning.length} documento(s) ya están en un proceso de firma activo`,
      );
    }

    const count = await this.prisma.signatureBatch.count();
    const code = `LOTE-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const batch = await this.prisma.signatureBatch.create({
      data: {
        code,
        name: name || `Lote de firma ${code}`,
        createdById,
        items: {
          create: docs.map((d) => ({ documentId: d.id })),
        },
      },
      include: { items: true },
    });

    await this.prisma.generatedDocument.updateMany({
      where: { id: { in: docs.map((d) => d.id) } },
      data: { signatureStatus: 'IN_SIGNING' },
    });

    return batch;
  }

  async cancelBatch(id: string) {
    const batch = await this.prisma.signatureBatch.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
      throw new BadRequestException('No se puede anular un lote que ya está completado o cancelado');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.signatureBatch.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      await tx.generatedDocument.updateMany({
        where: { id: { in: batch.items.map(i => i.documentId) } },
        data: { signatureStatus: 'NONE' }
      });
    });

    return { success: true, message: 'Lote anulado correctamente' };
  }

  async findBatches() {
    return this.prisma.signatureBatch.findMany({
      include: {
        // El nombre de quien envió el lote: el correo solo no le dice nada
        // al firmante que abre la lista y quiere saber a quién preguntarle.
        createdBy: { select: { email: true, firstName: true, lastName: true } },
        items: {
          include: {
            document: {
              select: { id: true, documentCode: true, documentType: true, student: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Lotes pendientes de la firma del usuario logueado (según su SignerProfile). */
  async findPendingForSigner(userId: string) {
    const profile = await this.getSignerProfile(userId);
    const stage: SignatureBatchStatus = profile.signerRole === 'DIRECTOR' ? 'PENDING_DIRECTOR' : 'PENDING_DEAN';
    return this.prisma.signatureBatch.findMany({
      where: { status: stage },
      include: {
        items: {
          include: {
            document: {
              select: { id: true, documentCode: true, documentType: true, student: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Historial de lo que este firmante ya suscribió, agrupado por lote.
   *
   * Sirve por igual al Responsable y al Decano: cada ítem guarda qué usuario
   * firmó en cada etapa, así que basta preguntar por las tres y quedarse con
   * las que llevan su nombre. Un mismo lote puede aparecer con documentos
   * firmados en etapas distintas si la persona intervino dos veces.
   */
  async findSignedByMe(userId: string) {
    const items = await this.prisma.signatureBatchItem.findMany({
      where: {
        OR: [
          { directorSignedById: userId },
          { deanSignedById: userId },
          { finalSignedById: userId },
        ],
      },
      include: {
        batch: { select: { id: true, code: true, name: true, status: true, createdAt: true } },
        document: {
          select: {
            id: true, documentCode: true, documentType: true,
            student: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const porLote = new Map<string, any>();
    for (const item of items) {
      // La etapa en que intervino esta persona; si firmó en varias, se informa
      // la más avanzada, que es la que refleja el estado real del documento.
      const etapa =
        item.finalSignedById === userId ? 'FINAL'
        : item.deanSignedById === userId ? 'DEAN'
        : 'DIRECTOR';

      if (!porLote.has(item.batchId)) {
        porLote.set(item.batchId, {
          batchId: item.batchId,
          code: item.batch.code,
          name: item.batch.name,
          status: item.batch.status,
          createdAt: item.batch.createdAt,
          firmadoEl: item.updatedAt,
          documentos: [],
        });
      }
      const lote = porLote.get(item.batchId);
      if (item.updatedAt > lote.firmadoEl) lote.firmadoEl = item.updatedAt;
      lote.documentos.push({
        itemId: item.id,
        documentId: item.documentId,
        documentCode: item.document.documentCode,
        documentType: item.document.documentType,
        student: item.document.student,
        estadoItem: item.status,
        etapa,
        firmadoEl: item.updatedAt,
      });
    }

    return [...porLote.values()].sort(
      (a, b) => new Date(b.firmadoEl).getTime() - new Date(a.firmadoEl).getTime(),
    );
  }

  async findBatch(id: string) {
    const batch = await this.prisma.signatureBatch.findUnique({
      where: { id },
      include: {
        // El nombre de quien envió el lote: el correo solo no le dice nada
        // al firmante que abre la lista y quiere saber a quién preguntarle.
        createdBy: { select: { email: true, firstName: true, lastName: true } },
        items: {
          include: {
            document: {
              select: { id: true, documentCode: true, documentType: true, fileUrl: true, student: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    return batch;
  }

  // ───────────────────── Descarga (ZIP) ─────────────────────

  /**
   * Empaqueta en un ZIP los archivos que corresponden a la etapa actual:
   * originales si espera al responsable de prácticas, firmados-por-responsable si espera al decano.
   * Los nombres de entrada son `<documentCode>.pdf` para el re-emparejamiento.
   */
  /**
   * Un único ZIP con todos los lotes que este firmante tiene pendientes, o solo
   * los indicados en `batchIds`.
   *
   * Quien firma suele tener varios lotes esperando a la vez y bajarlos de uno
   * en uno es puro trámite.
   *
   * El ZIP va plano, sin una carpeta por lote: así se apunta la herramienta de
   * firma a un único directorio y se firma todo de una pasada, y al devolverlos
   * se suben igual de juntos. No hay riesgo de que dos archivos choquen porque
   * el código del documento es único en todo el sistema, y es también ese
   * código —nunca la carpeta— el que decide a qué lote regresa cada archivo.
   */
  async streamPendingZip(userId: string, res: Response, batchIds?: string[]) {
    const profile = await this.getSignerProfile(userId);
    const stage: SignatureBatchStatus =
      profile.signerRole === 'DIRECTOR' ? 'PENDING_DIRECTOR' : 'PENDING_DEAN';

    const batches = await this.prisma.signatureBatch.findMany({
      where: { status: stage, ...(batchIds?.length ? { id: { in: batchIds } } : {}) },
      include: { items: { include: { document: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (batches.length === 0) {
      throw new NotFoundException('No tienes lotes pendientes de firma');
    }

    // Se resuelven todas las entradas antes de abrir el ZIP: así, si algo falta,
    // el error sale como respuesta HTTP y no a mitad de una descarga ya iniciada.
    const entries: { key: string; name: string }[] = [];
    for (const batch of batches) {
      const vistos = new Set<string>();
      for (const item of batch.items) {
        if (item.status === 'REJECTED') continue;
        const code = item.document.documentCode || item.document.id;
        if (vistos.has(code)) continue; // un oficio grupal comparte archivo
        vistos.add(code);
        const key =
          batch.status === 'PENDING_DEAN'
            ? (item.directorFileKey || item.deanFileKey)
            : item.document.fileUrl;
        if (!key) continue;
        const ext = key.endsWith('.docx') ? '.docx' : '.pdf';
        entries.push({ key, name: `${code}${ext}` });
      }
    }

    if (entries.length === 0) {
      throw new NotFoundException('Los lotes seleccionados no tienen archivos descargables');
    }

    const nombreZip =
      batches.length === 1 ? `${batches[0].code}.zip` : `lotes-pendientes-${batches.length}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreZip}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      this.logger.error('Error creando el ZIP de lotes pendientes', err);
      res.destroy(err);
    });
    archive.pipe(res);

    for (const entry of entries) {
      const stream = await this.minio.getObjectStream(entry.key);
      archive.append(stream, { name: entry.name });
    }
    await archive.finalize();
  }

  async streamBatchZip(batchId: string, userId: string, role: string, res: Response) {
    const batch = await this.findBatch(batchId);

    if (role === 'SIGNER') {
      const profile = await this.getSignerProfile(userId);
      const expected: SignatureBatchStatus = profile.signerRole === 'DIRECTOR' ? 'PENDING_DIRECTOR' : 'PENDING_DEAN';
      if (batch.status !== expected) {
        throw new ForbiddenException('Este lote no está pendiente de tu firma');
      }
    }

    // Un mismo archivo puede estar compartido por varios ítems (ej. SOLICITUD grupal):
    // deduplicamos por documentCode.
    const seen = new Set<string>();
    const entries: { key: string; name: string }[] = [];
    for (const item of batch.items) {
      if (item.status === 'REJECTED') continue;
      const code = item.document.documentCode || item.document.id;
      if (seen.has(code)) continue;
      seen.add(code);
      const key = batch.status === 'PENDING_DEAN' ? (item.directorFileKey || item.deanFileKey) : item.document.fileUrl;
      if (!key) continue;
      const ext = key.endsWith('.docx') ? '.docx' : '.pdf';
      entries.push({ key, name: `${code}${ext}` });
    }

    if (entries.length === 0) throw new NotFoundException('El lote no tiene archivos descargables');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${batch.code}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      this.logger.error(`Error creando ZIP del lote ${batch.code}`, err);
      res.destroy(err);
    });
    archive.pipe(res);

    for (const entry of entries) {
      const stream = await this.minio.getObjectStream(entry.key);
      archive.append(stream, { name: entry.name });
    }
    await archive.finalize();
  }

  /**
   * ZIP con los PDFs FINALES (ambas firmas) de lotes completados.
   * Sin ids: todos los lotes COMPLETED. Con ids: solo los seleccionados.
   */
  async streamSignedZip(res: Response, batchIds?: string[]) {
    const batches = await this.prisma.signatureBatch.findMany({
      where: {
        status: 'COMPLETED',
        ...(batchIds?.length ? { id: { in: batchIds } } : {}),
      },
      include: {
        items: {
          where: { status: 'SIGNED', finalFileKey: { not: null } },
          include: {
            document: {
              select: {
                documentCode: true,
                documentType: true,
                student: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    /** Quita lo que no admite un nombre de archivo, conservando tildes y ñ. */
    const limpiar = (s: string) =>
      s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();

    // Deduplicar por archivo (una SOLICITUD grupal comparte finalFileKey)
    const seen = new Set<string>();
    const certificados: { key: string; name: string; orden: string }[] = [];
    const solicitudes: { key: string; name: string; orden: string }[] = [];
    for (const batch of batches) {
      for (const item of batch.items) {
        if (!item.finalFileKey || seen.has(item.finalFileKey)) continue;
        seen.add(item.finalFileKey);
        const doc = item.document;
        const code = doc.documentCode || item.id;
        const alumno = doc.student
          ? limpiar(`${doc.student.lastName} ${doc.student.firstName}`)
          : '';
        if (doc.documentType === 'CERTIFICADO' && alumno) {
          // Un solo directorio, el nombre del estudiante por delante para que
          // el explorador de archivos los muestre ya ordenados.
          certificados.push({
            key: item.finalFileKey,
            name: `Certificados firmados/${alumno} - ${code}.pdf`,
            orden: alumno.toLocaleLowerCase('es'),
          });
        } else {
          solicitudes.push({
            key: item.finalFileKey,
            name: `Solicitudes firmadas/${batch.code} - ${code}.pdf`,
            orden: `${batch.code} ${code}`,
          });
        }
      }
    }
    const cmp = (a: { orden: string }, b: { orden: string }) => a.orden.localeCompare(b.orden, 'es');
    const entries = [...certificados.sort(cmp), ...solicitudes.sort(cmp)];

    if (entries.length === 0) {
      throw new NotFoundException('No hay documentos firmados que descargar en la selección');
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Certificados_Firmados_${stamp}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      this.logger.error('Error creando ZIP de firmados', err);
      res.destroy(err);
    });
    archive.pipe(res);
    for (const entry of entries) {
      const stream = await this.minio.getObjectStream(entry.key);
      archive.append(stream, { name: entry.name });
    }
    await archive.finalize();
  }

  // ─────────────────── Subida de firmados ───────────────────

  /**
   * Recibe los PDFs firmados (subida múltiple), los verifica y avanza el flujo.
   */
  async uploadSignedFiles(
    batchId: string,
    userId: string,
    files: Array<{ originalname: string; buffer: Buffer; mimetype: string }>,
  ) {
    if (!files?.length) throw new BadRequestException('No se recibieron archivos');

    const profile = await this.getSignerProfile(userId);
    const batch = await this.findBatch(batchId);

    const expected: SignatureBatchStatus = profile.signerRole === 'DIRECTOR' ? 'PENDING_DIRECTOR' : 'PENDING_DEAN';
    if (batch.status !== expected) {
      throw new ForbiddenException('Este lote no está pendiente de tu firma');
    }

    const activePeriod = await this.prisma.academicPeriod.findFirst({ where: { isActive: true } });
    const periodo = activePeriod?.code || new Date().getFullYear().toString();

    const results: Array<{ file: string; ok: boolean; documentCode?: string; error?: string }> = [];

    // Los códigos que este lote espera. El archivo subido se compara contra
    // ellos en vez de intentar deducir su código a ciegas.
    const codigosDelLote = [
      ...new Set(
        batch.items
          .filter((i) => i.status !== 'REJECTED')
          .map((i) => i.document.documentCode)
          .filter((c): c is string => !!c),
      ),
    ];

    for (const file of files) {
      try {
        const documentCode = matchDocumentCode(file.originalname, codigosDelLote);
        if (!documentCode) {
          throw new Error(
            `El archivo no corresponde a ningún documento de este lote. ` +
            `Súbelo con el nombre que traía el ZIP (${codigosDelLote.slice(0, 3).join(', ')}${codigosDelLote.length > 3 ? '…' : ''}).`,
          );
        }

        const items = batch.items.filter((i) => i.document.documentCode === documentCode && i.status !== 'REJECTED');
        if (items.length === 0) {
          throw new Error(`Ningún documento del lote coincide con el código ${documentCode}`);
        }

        // Verificación: el PDF debe contener al menos una firma digital
        assertPdfHasDigitalSignature(file.buffer, file.originalname);

        await this.persistSignedItem(documentCode, file.buffer, items, profile, userId, periodo, batch.code);

        results.push({ file: file.originalname, ok: true, documentCode });
      } catch (err: any) {
        results.push({ file: file.originalname, ok: false, error: err.message });
      }
    }

    // ¿Se completó la etapa? Avanza el lote y recalcula prácticas si procede.
    const batchStatus = await this.finalizeBatchStage(batchId, profile);

    return {
      results,
      uploaded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      batchStatus,
    };
  }

  /**
   * Sube los PDF firmados sin decir a qué lote pertenece cada uno: el sistema
   * lo deduce del código que lleva el nombre del archivo y lo encamina solo.
   *
   * Es la contraparte de `streamPendingZip`. Quien firma descarga varios lotes
   * de una vez, los firma todos y los devuelve juntos; obligarle a separarlos
   * por lote antes de subirlos sería pedirle que rehaga a mano una
   * clasificación que el código del documento ya resuelve. Un archivo que no
   * corresponda a ningún lote pendiente se reporta como error y no detiene a
   * los demás.
   */
  async uploadSignedFilesMulti(
    userId: string,
    files: Array<{ originalname: string; buffer: Buffer; mimetype: string }>,
  ) {
    if (!files?.length) throw new BadRequestException('No se recibieron archivos');

    const profile = await this.getSignerProfile(userId);
    const stage: SignatureBatchStatus =
      profile.signerRole === 'DIRECTOR' ? 'PENDING_DIRECTOR' : 'PENDING_DEAN';

    const batches = await this.prisma.signatureBatch.findMany({
      where: { status: stage },
      include: { items: { include: { document: true } } },
    });
    if (batches.length === 0) {
      throw new ForbiddenException('No tienes lotes pendientes de firma');
    }

    // Índice código -> lote, con los códigos de todos los lotes pendientes.
    // Los códigos son únicos en el sistema, así que no hay ambigüedad posible.
    const loteDeCodigo = new Map<string, (typeof batches)[number]>();
    for (const batch of batches) {
      for (const item of batch.items) {
        if (item.status === 'REJECTED') continue;
        if (item.document.documentCode) loteDeCodigo.set(item.document.documentCode, batch);
      }
    }
    const todosLosCodigos = [...loteDeCodigo.keys()];

    const activePeriod = await this.prisma.academicPeriod.findFirst({ where: { isActive: true } });
    const periodo = activePeriod?.code || new Date().getFullYear().toString();

    const results: Array<{
      file: string; ok: boolean; documentCode?: string; batchCode?: string; error?: string;
    }> = [];
    const lotesTocados = new Set<string>();

    for (const file of files) {
      try {
        const documentCode = matchDocumentCode(file.originalname, todosLosCodigos);
        const batch = documentCode ? loteDeCodigo.get(documentCode) : undefined;
        if (!documentCode || !batch) {
          throw new Error(
            'El archivo no corresponde a ningún documento de tus lotes pendientes. ' +
            'Súbelo con el nombre que traía el ZIP.',
          );
        }

        const items = batch.items.filter(
          (i) => i.document.documentCode === documentCode && i.status !== 'REJECTED',
        );
        if (items.length === 0) {
          throw new Error(`Ningún documento pendiente coincide con el código ${documentCode}`);
        }

        assertPdfHasDigitalSignature(file.buffer, file.originalname);
        await this.persistSignedItem(
          documentCode, file.buffer, items, profile, userId, periodo, batch.code,
        );

        lotesTocados.add(batch.id);
        results.push({ file: file.originalname, ok: true, documentCode, batchCode: batch.code });
      } catch (err: any) {
        results.push({ file: file.originalname, ok: false, error: err.message });
      }
    }

    // Cada lote alcanzado se cierra por separado: unos pueden quedar completos
    // y avanzar de etapa mientras a otros todavía les falten documentos.
    const batchStatuses: Array<{ batchId: string; batchCode: string; status: SignatureBatchStatus }> = [];
    for (const batchId of lotesTocados) {
      const status = await this.finalizeBatchStage(batchId, profile);
      const batch = batches.find((b) => b.id === batchId);
      batchStatuses.push({ batchId, batchCode: batch?.code || '', status });
    }

    return {
      results,
      uploaded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      batches: batchStatuses,
    };
  }

  /** Un firmante puede rechazar un ítem (documento con error) con motivo. */
  async rejectItem(batchId: string, itemId: string, userId: string, reason: string) {
    await this.getSignerProfile(userId); // valida que sea firmante
    const item = await this.prisma.signatureBatchItem.findFirst({
      where: { id: itemId, batchId },
      include: { document: true },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado en el lote');

    await this.prisma.signatureBatchItem.update({
      where: { id: item.id },
      data: { status: 'REJECTED', rejectReason: reason || 'Rechazado por el firmante' },
    });
    await this.prisma.generatedDocument.update({
      where: { id: item.documentId },
      data: { signatureStatus: 'REJECTED' },
    });
    return { message: 'Documento rechazado', itemId };
  }

  /** URL prefirmada del archivo de un ítem para la etapa actual (vista previa del firmante). */
  async getItemDownloadUrl(batchId: string, itemId: string) {
    const item = await this.prisma.signatureBatchItem.findFirst({
      where: { id: itemId, batchId },
      include: { document: true, batch: true },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado');
    const key = item.finalFileKey || item.directorFileKey || item.deanFileKey || item.document.fileUrl;
    const url = await this.minio.getPresignedUrl(key, 900, key.split('/').pop());
    return { url, expiresInSeconds: 900 };
  }

  // ───────────────────── Helpers ─────────────────────

  /** Sube el PDF firmado y actualiza ítems/documentos según la etapa (responsable/decano). */
  private async persistSignedItem(
    documentCode: string,
    buffer: Buffer,
    items: Array<{ id: string; directorFileKey?: string | null; deanFileKey?: string | null; document: { id: string } }>,
    profile: { signerRole: SignerRole },
    userId: string,
    periodo: string,
    batchCode: string,
  ) {
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const stage = profile.signerRole === 'DIRECTOR' ? 'director' : 'final';
    const objectKey = `signed/${periodo}/${batchCode}/${stage}/${documentCode}.pdf`;
    await this.minio.uploadBuffer(buffer, objectKey, 'application/pdf');

    const itemIds = items.map((i) => i.id);
    if (profile.signerRole === 'DIRECTOR') {
      await this.prisma.signatureBatchItem.updateMany({
        where: { id: { in: itemIds } },
        data: { status: 'SIGNED_BY_DIRECTOR', directorFileKey: objectKey, directorChecksum: checksum, directorSignedById: userId },
      });
      await this.prisma.generatedDocument.updateMany({
        where: { id: { in: items.map((i) => i.document.id) } },
        data: { signatureStatus: 'PARTIALLY_SIGNED' },
      });
    } else {
      await this.prisma.signatureBatchItem.updateMany({
        where: { id: { in: itemIds } },
        data: { status: 'SIGNED', finalFileKey: objectKey, finalChecksum: checksum, finalSignedById: userId },
      });
      await this.prisma.generatedDocument.updateMany({
        where: { id: { in: items.map((i) => i.document.id) } },
        data: {
          signatureStatus: 'SIGNED',
          signedFileKey: objectKey,
          signedChecksum: checksum,
          signedAt: new Date(),
        },
      });

      // El firmado final (ambas firmas) REEMPLAZA a las versiones anteriores: se
      // elimina la intermedia del responsable. El original sin firmar se conserva.
      const staleKeys = [...new Set(items.map((i) => i.directorFileKey || i.deanFileKey).filter(Boolean))] as string[];
      for (const staleKey of staleKeys) {
        if (staleKey === objectKey) continue;
        try {
          await this.minio.removeObject(staleKey);
          this.logger.log(`Versión intermedia eliminada: ${staleKey}`);
        } catch (e: any) {
          this.logger.warn(`No se pudo eliminar la versión intermedia ${staleKey}: ${e?.message}`);
        }
      }
    }
  }

  /** Avanza el lote si la etapa está completa y recalcula prácticas tras el decano (firma final). */
  private async finalizeBatchStage(
    batchId: string,
    profile: { signerRole: SignerRole },
  ): Promise<SignatureBatchStatus> {
    const fresh = await this.findBatch(batchId);
    const active = fresh.items.filter((i) => i.status !== 'REJECTED');
    let newStatus: SignatureBatchStatus | null = null;

    if (profile.signerRole === 'DIRECTOR' && active.every((i) => i.status === 'SIGNED_BY_DIRECTOR' || i.status === 'SIGNED_BY_DEAN' || i.status === 'SIGNED')) {
      newStatus = 'PENDING_DEAN';
      await this.prisma.signatureBatch.update({
        where: { id: batchId },
        data: { status: newStatus, directorSignedAt: new Date() },
      });
    } else if (profile.signerRole === 'DEAN' && active.every((i) => i.status === 'SIGNED')) {
      newStatus = 'COMPLETED';
      await this.prisma.signatureBatch.update({
        where: { id: batchId },
        data: { status: newStatus, deanSignedAt: new Date() },
      });
    }

    // Certificado firmado por ambas autoridades = práctica Finalizada (estado derivado).
    if (profile.signerRole === 'DEAN') {
      const signedDocs = await this.prisma.generatedDocument.findMany({
        where: { id: { in: fresh.items.map((i) => i.document.id) } },
        select: { studentId: true },
      });
      await this.practices
        .recalculateForStudents([...new Set(signedDocs.map((d) => d.studentId))])
        .catch((): void => undefined);
    }

    return newStatus ?? fresh.status;
  }

  private async getSignerProfile(userId: string) {
    const profile = await this.prisma.signerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Tu usuario no tiene perfil de firmante configurado');
    return profile;
  }

}
