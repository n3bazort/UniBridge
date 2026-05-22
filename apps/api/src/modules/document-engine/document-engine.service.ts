import { Injectable, BadRequestException } from '@nestjs/common';
import { PdfDriver, KonvaTemplateJson } from './pdf.driver';
import { DocxDriver } from './docx.driver';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DocumentEngineService {
  constructor(
    private readonly pdfDriver: PdfDriver,
    private readonly docxDriver: DocxDriver
  ) {}

  async generateDocument(
    type: 'PDF' | 'DOCX', 
    templateContent: any, 
    data: Record<string, any>, 
    outputFilename: string
  ): Promise<string> {
    
    const outputDir = path.join(process.cwd(), 'uploads', 'generated');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, outputFilename);

    if (type === 'PDF') {
      await this.pdfDriver.generatePdf(templateContent as KonvaTemplateJson, data, outputPath);
    } else if (type === 'DOCX') {
      await this.docxDriver.generateDocx(templateContent as string, data, outputPath);
    } else {
      throw new BadRequestException('Tipo de documento no soportado');
    }

    return `/uploads/generated/${outputFilename}`;
  }
}
