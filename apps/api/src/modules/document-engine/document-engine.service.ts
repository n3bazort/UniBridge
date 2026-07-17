import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PdfDriver, KonvaTemplateJson } from './pdf.driver';
import { DocxDriver } from './docx.driver';
import { MinioService } from '../minio/minio.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Rutas donde suele vivir LibreOffice (usado para convertir DOCX → PDF). */
const SOFFICE_CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
].filter(Boolean) as string[];

@Injectable()
export class DocumentEngineService {
  private readonly logger = new Logger(DocumentEngineService.name);

  constructor(
    private readonly pdfDriver: PdfDriver,
    private readonly docxDriver: DocxDriver,
    private readonly minioService: MinioService
  ) {}

  /** Localiza el binario de LibreOffice; null si no está instalado. */
  private findSoffice(): string | null {
    for (const candidate of SOFFICE_CANDIDATES) {
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {}
    }
    return null;
  }

  /**
   * Convierte un DOCX a PDF con LibreOffice headless. Devuelve la ruta del
   * PDF generado. Lanza un error claro si LibreOffice no está disponible.
   */
  async convertDocxToPdf(docxPath: string): Promise<string> {
    const soffice = this.findSoffice();
    if (!soffice) {
      throw new BadRequestException(
        'No se puede generar la solicitud en PDF: el servidor no tiene LibreOffice instalado (necesario para la conversión). Genera el DOCX o instala LibreOffice.',
      );
    }

    const outDir = path.dirname(docxPath);
    // 120s de margen: el primer arranque de soffice es lento
    await execFileAsync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docxPath], {
      timeout: 120_000,
      windowsHide: true,
    });

    const pdfPath = docxPath.replace(/\.docx$/i, '.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new BadRequestException('La conversión a PDF no produjo el archivo esperado');
    }
    this.logger.log(`DOCX convertido a PDF: ${path.basename(pdfPath)}`);
    return pdfPath;
  }

  /**
   * Genera el documento y lo sube a MinIO.
   * @param objectKey key único destino en el bucket (ej. "2026-1/CERTIFICADO/CERT-2026-1-00042.pdf")
   * @param options.convertToPdf para DOCX: entrega un PDF (vía LibreOffice)
   * @returns objectKey almacenado
   */
  async generateDocument(
    type: 'PDF' | 'DOCX',
    templateContent: any,
    data: Record<string, any>,
    objectKey: string,
    options?: { convertToPdf?: boolean },
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

      // Opcional: entregar la solicitud como PDF (mismo contenido, otro formato)
      if (options?.convertToPdf) {
        const pdfPath = await this.convertDocxToPdf(outputPath);
        try { fs.unlinkSync(outputPath); } catch {}
        mimetype = 'application/pdf';
        const storedKeyPdf = await this.minioService.uploadFile(pdfPath, objectKey, mimetype);
        try { fs.unlinkSync(pdfPath); } catch {}
        return storedKeyPdf;
      }
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
