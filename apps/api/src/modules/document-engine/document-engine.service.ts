import { Injectable, BadRequestException } from '@nestjs/common';
import { PdfDriver, KonvaTemplateJson } from './pdf.driver';
import { DocxDriver } from './docx.driver';
import { MinioService } from '../minio/minio.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

@Injectable()
export class DocumentEngineService {
  constructor(
    private readonly pdfDriver: PdfDriver,
    private readonly docxDriver: DocxDriver,
    private readonly minioService: MinioService
  ) {}

  /**
   * Genera el documento y lo sube a MinIO.
   * @param objectKey key único destino en el bucket (ej. "2026-1/CERTIFICADO/CERT-2026-1-00042.pdf")
   * @returns objectKey almacenado
   */
  async generateDocument(
    type: 'PDF' | 'DOCX',
    templateContent: any,
    data: Record<string, any>,
    objectKey: string
  ): Promise<string> {

    const outputDir = path.join(os.tmpdir(), 'unibridge-docs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Nombre temporal aleatorio para evitar colisiones entre jobs concurrentes
    const tmpName = `${crypto.randomUUID()}${type === 'PDF' ? '.pdf' : '.docx'}`;
    const outputPath = path.join(outputDir, tmpName);

    let mimetype = 'application/pdf';
    if (type === 'PDF') {
      // Si el fondo del template vive en MinIO (key "templates/backgrounds/..."),
      // lo descargamos y lo incrustamos como data URI antes de renderizar,
      // así Puppeteer no depende de red ni de credenciales al generar el PDF.
      let tpl = templateContent as KonvaTemplateJson;
      const bg = (tpl as any)?.background;
      if (typeof bg === 'string' && bg.startsWith('templates/backgrounds/')) {
        try {
          const buf = await this.minioService.getObjectBuffer(bg);
          const ext = (bg.split('.').pop() || 'png').toLowerCase();
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
          tpl = { ...tpl, background: `data:${mime};base64,${buf.toString('base64')}` };
        } catch (e) {
          console.error('No se pudo cargar el fondo desde MinIO:', e);
        }
      }
      await this.pdfDriver.generatePdf(tpl, data, outputPath);
    } else if (type === 'DOCX') {
      mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      // Las plantillas DOCX viven en MinIO (key "templates/..."); las antiguas
      // pueden seguir siendo rutas del filesystem local (compatibilidad).
      // El content puede ser un string (key/ruta) o un objeto { path, ... }
      // con la configuración de numeración.
      const docxPath: string = typeof templateContent === 'string'
        ? templateContent
        : templateContent?.path || '';
      const source = docxPath.startsWith('templates/')
        ? await this.minioService.getObjectBuffer(docxPath)
        : docxPath;
      await this.docxDriver.generateDocx(source, data, outputPath);
    } else {
      throw new BadRequestException('Tipo de documento no soportado');
    }

    const storedKey = await this.minioService.uploadFile(outputPath, objectKey, mimetype);

    try {
      fs.unlinkSync(outputPath);
    } catch (e) {
      console.error('Error cleaning up temp file', e);
    }

    return storedKey;
  }
}
