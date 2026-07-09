import { Injectable, Logger } from '@nestjs/common';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import * as fs from 'fs';

@Injectable()
export class DocxDriver {
  private readonly logger = new Logger(DocxDriver.name);

  async generateDocx(templatePath: string, data: Record<string, any>, outputPath: string): Promise<string> {
    this.logger.log(`Iniciando generación de DOCX. Template: ${templatePath}`);
    
    // Resolve path: Multer saves relative to cwd (apps/api when running via turbo)
    const resolvedPath = require('path').resolve(templatePath);
    this.logger.log(`Ruta resuelta del template: ${resolvedPath}`);
    
    const content = fs.readFileSync(resolvedPath, 'binary');
    
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
        nullGetter(part) {
            return '';
        }
    });

    doc.render(data);

    const buf = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
    });

    fs.writeFileSync(outputPath, buf);
    this.logger.log(`DOCX generado exitosamente en ${outputPath}`);
    
    return outputPath;
  }
}
