import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../minio/minio.service';
import { SignerRole, SignatureBatchStatus, SignatureItemStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as archiver from 'archiver';
import type { Response } from 'express';
import { extractDocumentCode, assertPdfHasDigitalSignature } from './signature-verification.util';
import { PracticesService } from '../practices/practices.service';

/**
 * Flujo de firma digital con FirmaEC (firma externa):
 *
 *  1. ADMIN/COORDINATOR crea un Lote de Firma con N documentos generados.
 *  2. El DECANO (rol SIGNER, SignerProfile.DEAN) descarga el ZIP del lote,
 *     firma los PDFs localmente con FirmaEC y los re-sube.
 *  3. El sistema verifica que cada PDF contenga firma digital, calcula el
 *     SHA-256, y cuando todos los ítems están firmados avanza el lote.
 *  4. El DIRECTOR repite el proceso sobre los PDFs ya firmados por el decano.
 *  5. Al completarse, cada documento queda SIGNED y visible para su estudiante.
 *
 * El emparejamiento archivo→documento se hace por el documentCode presente
 * en el nombre del archivo (FirmaEC conserva el nombre y añade sufijos).
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
        createdBy: { select: { email: true } },
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

  async findBatch(id: string) {
    const batch = await this.prisma.signatureBatch.findUnique({
      where: { id },
      include: {
        createdBy: { select: { email: true } },
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

    for (const file of files) {
      try {
        const documentCode = extractDocumentCode(file.originalname);
        if (!documentCode) {
          throw new Error('No se pudo identificar el código de documento en el nombre del archivo');
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
