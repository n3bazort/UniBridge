import { Injectable, Logger } from '@nestjs/common';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import * as fs from 'fs';

@Injectable()
export class DocxDriver {
  private readonly logger = new Logger(DocxDriver.name);

  /**
   * Genera un DOCX a partir de la plantilla.
   * @param templateSource Buffer con el contenido del template (recomendado, viene
   *                       de MinIO) o, por compatibilidad con plantillas antiguas,
   *                       una ruta del filesystem local.
   */
  async generateDocx(templateSource: Buffer | string, data: Record<string, any>, outputPath: string): Promise<string> {
    let content: Buffer | string;

    if (Buffer.isBuffer(templateSource)) {
      this.logger.log(`Iniciando generación de DOCX desde buffer (${templateSource.length} bytes)`);
      content = templateSource;
    } else {
      // Compatibilidad: plantillas antiguas guardadas como ruta local (Multer)
      const resolvedPath = require('path').resolve(templateSource);
      this.logger.log(`Iniciando generación de DOCX desde ruta legacy: ${resolvedPath}`);
      content = fs.readFileSync(resolvedPath, 'binary');
    }

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
