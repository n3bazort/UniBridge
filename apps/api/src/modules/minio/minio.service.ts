import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

/**
 * Almacenamiento de objetos (MinIO).
 *
 * Decisiones de seguridad:
 * - El bucket es PRIVADO: nunca se expone una URL pública permanente.
 * - Las descargas se hacen con URLs prefirmadas de corta duración (getPresignedUrl).
 * - Los métodos de subida devuelven el objectKey (no una URL absoluta),
 *   de modo que cambiar de host/endpoint no rompe los registros en BD.
 */
@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: Minio.Client;
  private readonly bucketName = 'unibridge-documents';
  private readonly isDisabled = process.env.DISABLE_MINIO === 'true';

  constructor() {
    if (this.isDisabled) {
      this.logger.warn('MinIO is disabled via DISABLE_MINIO env variable');
      return;
    }

    const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = parseInt(process.env.MINIO_PORT || '9000', 10);
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;

    if (!accessKey || !secretKey) {
      this.logger.error('MINIO_ACCESS_KEY y MINIO_SECRET_KEY son requeridas cuando DISABLE_MINIO no está activo.');
      throw new Error('MinIO credentials not configured. Set MINIO_ACCESS_KEY and MINIO_SECRET_KEY env vars.');
    }

    this.minioClient = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });
  }

  async onModuleInit() {
    if (this.isDisabled) return;
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`Bucket privado ${this.bucketName} creado.`);
      } else {
        // Migración de seguridad: si el bucket quedó con la antigua política
        // pública de lectura, la eliminamos (los documentos contienen datos personales).
        try {
          const policy = await this.minioClient.getBucketPolicy(this.bucketName);
          if (policy && policy.includes('"Principal":{"AWS":["*"]}')) {
            await this.minioClient.setBucketPolicy(this.bucketName, '');
            this.logger.warn(`Política pública eliminada del bucket ${this.bucketName}. Ahora es privado.`);
          }
        } catch {
          // sin política = privado, que es lo que queremos
        }
      }
    } catch (error) {
      this.logger.error('Error initializing MinIO:', error);
    }
  }

  /** Sube un archivo desde disco. Devuelve el objectKey. */
  async uploadFile(filePath: string, objectKey: string, mimetype: string): Promise<string> {
    if (this.isDisabled) {
      const targetPath = path.join(process.cwd(), 'uploads', objectKey);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(filePath, targetPath);
      return objectKey;
    }
    try {
      const fileStream = fs.createReadStream(filePath);
      const stat = fs.statSync(filePath);

      await this.minioClient.putObject(
        this.bucketName,
        objectKey,
        fileStream,
        stat.size,
        { 'Content-Type': mimetype }
      );
      return objectKey;
    } catch (error) {
      this.logger.error('Error uploading file to MinIO', error);
      throw error;
    }
  }

  /** Sube un buffer en memoria. Devuelve el objectKey. */
  async uploadBuffer(buffer: Buffer, objectKey: string, mimetype: string): Promise<string> {
    if (this.isDisabled) {
      const targetPath = path.join(process.cwd(), 'uploads', objectKey);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, buffer);
      return objectKey;
    }
    try {
      await this.minioClient.putObject(
        this.bucketName,
        objectKey,
        buffer,
        buffer.length,
        { 'Content-Type': mimetype }
      );
      return objectKey;
    } catch (error) {
      this.logger.error('Error uploading buffer to MinIO', error);
      throw error;
    }
  }

  /**
   * URL prefirmada de descarga con expiración corta (por defecto 15 min).
   * `downloadName` fuerza el nombre de archivo en el navegador.
   * `inline` fuerza a que el navegador intente visualizar el archivo en vez de descargarlo.
   */
  async getPresignedUrl(objectKey: string, expirySeconds = 900, downloadName?: string, inline = false): Promise<string> {
    if (this.isDisabled) {
      // Servido directamente como activo estático por NestJS (/uploads/...)
      const filename = path.basename(objectKey);
      return `/uploads/${objectKey}`;
    }

    let respHeaders: Record<string, string> | undefined = undefined;

    if (inline || downloadName) {
      const disposicion = inline ? 'inline' : 'attachment';
      respHeaders = {
        'response-content-disposition': this.contentDisposition(disposicion, downloadName || 'documento'),
      };
    }

    return this.minioClient.presignedGetObject(this.bucketName, objectKey, expirySeconds, respHeaders);
  }

  /** Content-Disposition con nombre de archivo legible. */
  private contentDisposition(disposicion: 'inline' | 'attachment', nombre: string): string {
    const ascii = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')     // quita los acentos, no la letra
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '');
    return `${disposicion}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
  }

  /** Stream de lectura de un objeto (para empaquetar ZIPs en el servidor). */
  async getObjectStream(objectKey: string): Promise<Readable> {
    if (this.isDisabled) {
      const lower = objectKey.toLowerCase();
      const isDesignation = lower.includes('designac');
      const hasSignature = lower.includes('firma') || lower.includes('sello');

      let fallbackDocx = 'Solicitud de Prácticas Oficial.docx';
      if (isDesignation && hasSignature) {
        fallbackDocx = 'Designación (con firma y sello) de Estudiantes Oficial.docx';
      } else if (isDesignation) {
        fallbackDocx = 'Designación de Estudiantes Oficial.docx';
      } else if (hasSignature) {
        fallbackDocx = 'Solicitud (con firma y sello) de Prácticas Oficial.docx';
      }

      const candidates = [
        path.join(process.cwd(), 'uploads', objectKey),
        path.join(process.cwd(), objectKey),
        path.join(process.cwd(), 'apps/web/public/templates', path.basename(objectKey)),
        path.join(process.cwd(), 'apps/web/public/templates', fallbackDocx),
        path.join(process.cwd(), 'apps/web/public/templates/Solicitud (con firma y sello) de Prácticas Oficial.docx'),
        path.join(process.cwd(), 'apps/web/public/templates/Designación (con firma y sello) de Estudiantes Oficial.docx'),
        path.join(process.cwd(), 'apps/web/public/templates/Solicitud de Prácticas Oficial.docx'),
        path.join(process.cwd(), 'apps/web/public/templates/Designación de Estudiantes Oficial.docx'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return fs.createReadStream(p);
      }
      throw new Error(`Archivo no encontrado localmente: ${objectKey}`);
    }
    return this.minioClient.getObject(this.bucketName, objectKey);
  }

  /** Descarga un objeto completo a un Buffer. */
  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    if (this.isDisabled) {
      const lower = objectKey.toLowerCase();
      const isDesignation = lower.includes('designac');
      const hasSignature = lower.includes('firma') || lower.includes('sello');

      let fallbackDocx = 'Solicitud de Prácticas Oficial.docx';
      if (isDesignation && hasSignature) {
        fallbackDocx = 'Designación (con firma y sello) de Estudiantes Oficial.docx';
      } else if (isDesignation) {
        fallbackDocx = 'Designación de Estudiantes Oficial.docx';
      } else if (hasSignature) {
        fallbackDocx = 'Solicitud (con firma y sello) de Prácticas Oficial.docx';
      }

      const candidates = [
        path.join(process.cwd(), 'uploads', objectKey),
        path.join(process.cwd(), objectKey),
        path.join(process.cwd(), 'apps/web/public/templates', path.basename(objectKey)),
        path.join(process.cwd(), 'apps/web/public/templates', fallbackDocx),
        path.join(process.cwd(), 'apps/web/public/templates/Solicitud (con firma y sello) de Prácticas Oficial.docx'),
        path.join(process.cwd(), 'apps/web/public/templates/Designación (con firma y sello) de Estudiantes Oficial.docx'),
        path.join(process.cwd(), 'apps/web/public/templates/Solicitud de Prácticas Oficial.docx'),
        path.join(process.cwd(), 'apps/web/public/templates/Designación de Estudiantes Oficial.docx'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return fs.readFileSync(p);
      }
      throw new Error(`Archivo no encontrado localmente: ${objectKey}`);
    }
    const stream = await this.getObjectStream(objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /** Elimina un objeto del bucket (ej. al borrar una plantilla). */
  async removeObject(objectKey: string): Promise<void> {
    if (this.isDisabled) {
      const p = path.join(process.cwd(), 'uploads', objectKey);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
      return;
    }
    try {
      await this.minioClient.removeObject(this.bucketName, objectKey);
    } catch (error) {
      this.logger.error(`Error eliminando objeto ${objectKey}`, error);
    }
  }

  async objectExists(objectKey: string): Promise<boolean> {
    if (this.isDisabled) {
      const p = path.join(process.cwd(), 'uploads', objectKey);
      return fs.existsSync(p);
    }
    try {
      await this.minioClient.statObject(this.bucketName, objectKey);
      return true;
    } catch {
      return false;
    }
  }
}
