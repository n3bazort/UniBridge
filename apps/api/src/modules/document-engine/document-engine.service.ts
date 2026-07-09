import { Injectable, BadRequestException } from '@nestjs/common';
import { PdfDriver, KonvaTemplateJson } from './pdf.driver';
import { DocxDriver } from './docx.driver';
import { MinioService } from '../minio/minio.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

@Injectable()
export class DocumentEngineService {
  constructor(
    private readonly pdfDriver: PdfDriver,
    private readonly docxDriver: DocxDriver,
    private readonly minioService: MinioService
  ) {}

  async generateDocument(
    type: 'PDF' | 'DOCX', 
    templateContent: any, 
    data: Record<string, any>, 
    outputFilename: string
  ): Promise<string> {
    
    const outputDir = path.join(os.tmpdir(), 'unibridge-docs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, outputFilename);

    let mimetype = 'application/pdf';
    if (type === 'PDF') {
      await this.pdfDriver.generatePdf(templateContent as KonvaTemplateJson, data, outputPath);
    } else if (type === 'DOCX') {
      mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      await this.docxDriver.generateDocx(templateContent as string, data, outputPath);
    } else {
      throw new BadRequestException('Tipo de documento no soportado');
    }

    // Subir a MinIO
    const fileUrl = await this.minioService.uploadFile(outputPath, outputFilename, mimetype);

    // Limpiar archivo temporal
    try {
      fs.unlinkSync(outputPath);
    } catch (e) {
      console.error('Error cleaning up temp file', e);
    }

    return fileUrl;
  }
}
