import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import fontkit from '@pdf-lib/fontkit';

export interface KonvaTemplateJson {
  width: number;
  height: number;
  background?: string;
  elements: Array<{
    type: 'text' | 'image';
    content: string;
    x: number;
    y: number;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    fontWeight?: string | number;
    fontStyle?: string;
    textAlign?: string;
    width?: number;
    height?: number;
  }>;
}

@Injectable()
export class PdfDriver {
  private readonly logger = new Logger(PdfDriver.name);

  async generatePdf(template: KonvaTemplateJson, data: Record<string, any>, outputPath: string): Promise<string> {
    this.logger.log(`Generando PDF con pdf-lib para ${outputPath}...`);
    
    // Inyectar datos en la plantilla JSON
    let jsonString = JSON.stringify(template);
    for (const key of Object.keys(data)) {
      const val = data[key] !== undefined && data[key] !== null ? String(data[key]) : '';
      const regex = new RegExp(`{{${key}}}`, 'g');
      jsonString = jsonString.replace(regex, val);
    }
    // Reemplazar placeholders no definidos por vacío para evitar imprimir {{variable}}
    jsonString = jsonString.replace(/{{[a-zA-Z0-9_]+}}/g, '');
    const processedTemplate: KonvaTemplateJson = JSON.parse(jsonString);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    
    // Configurar fuentes estándar
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const helveticaBoldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
    
    const page = pdfDoc.addPage([processedTemplate.width, processedTemplate.height]);

    // 1. Dibujar imagen de fondo si existe
    if (processedTemplate.background) {
      await this.drawBackground(pdfDoc, page, processedTemplate.background, processedTemplate.width, processedTemplate.height);
    }

    // 2. Dibujar Elementos
    for (const el of processedTemplate.elements) {
      if (el.type === 'text') {
        let font = helveticaFont;
        const isBold = el.fontWeight === 'bold' || el.fontWeight === 700;
        const isItalic = el.fontStyle === 'italic';

        if (isBold && isItalic) font = helveticaBoldOblique;
        else if (isBold) font = helveticaBold;
        else if (isItalic) font = helveticaOblique;

        const size = el.fontSize || 16;
        
        let r = 0, g = 0, b = 0;
        if (el.color) {
          const hexColor = el.color.replace('#', '');
          r = parseInt(hexColor.substring(0, 2), 16) / 255;
          g = parseInt(hexColor.substring(2, 4), 16) / 255;
          b = parseInt(hexColor.substring(4, 6), 16) / 255;
        }

        // Invertir Y (Konva es top-left, pdf-lib es bottom-left)
        // Además, pdf-lib dibuja desde la línea base (baseline), así que ajustamos por el tamaño de la fuente.
        const pdfYOffset = processedTemplate.height - el.y - size + (size * 0.2); 
        const cleanContent = (el.content || '').toString().replace(/<[^>]*>/g, '');
        const lines = cleanContent.split('\n');
        const lineHeight = size * 1.2;
        
        lines.forEach((line, index) => {
           let pdfX = el.x;
           // Alineación simple
           if (el.textAlign === 'center' && el.width) {
              const textWidth = font.widthOfTextAtSize(line, size);
              pdfX = el.x + (el.width / 2) - (textWidth / 2);
           } else if (el.textAlign === 'right' && el.width) {
              const textWidth = font.widthOfTextAtSize(line, size);
              pdfX = el.x + el.width - textWidth;
           }
           
           page.drawText(line, {
              x: pdfX,
              y: pdfYOffset - (index * lineHeight),
              size: size,
              font: font,
              color: rgb(r, g, b),
           });
        });
      }
      // Nota: El editor Konva actualmente no añade imágenes flotantes,
      // pero se podría agregar la lógica aquí si en el futuro se requieren firmas o sellos.
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    this.logger.log(`PDF generado exitosamente en ${outputPath}`);
    
    return outputPath;
  }

  private async drawBackground(pdfDoc: PDFDocument, page: any, bg: string, width: number, height: number) {
    let imgBuffer: Buffer | null = null;
    let format = 'png';

    try {
      if (bg.startsWith('data:image')) {
        const matches = bg.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
           format = matches[1].toLowerCase();
           imgBuffer = Buffer.from(matches[2], 'base64');
        }
      } else if (bg.startsWith('http')) {
        const response = await fetch(bg);
        const arrayBuffer = await response.arrayBuffer();
        imgBuffer = Buffer.from(arrayBuffer);
        if (bg.toLowerCase().includes('.jpg') || bg.toLowerCase().includes('.jpeg')) format = 'jpeg';
        else format = 'png';
      } else if (bg.startsWith('/uploads/')) {
        const rootDir = path.resolve(process.cwd());
        const relativeAssetPath = bg.replace(/^\//, '');
        const pathsToTry = [
          path.join(rootDir, relativeAssetPath),
          path.join(rootDir, 'apps/api', relativeAssetPath),
          path.join(rootDir, '..', relativeAssetPath),
          path.resolve(relativeAssetPath),
        ];

        for (const absoluteAssetPath of pathsToTry) {
          if (fs.existsSync(absoluteAssetPath) && fs.lstatSync(absoluteAssetPath).isFile()) {
            imgBuffer = fs.readFileSync(absoluteAssetPath);
            if (absoluteAssetPath.toLowerCase().endsWith('.jpg') || absoluteAssetPath.toLowerCase().endsWith('.jpeg')) {
              format = 'jpeg';
            } else {
              format = 'png';
            }
            break;
          }
        }
      }

      if (imgBuffer) {
        let pdfImage;
        if (format === 'jpeg' || format === 'jpg') {
          pdfImage = await pdfDoc.embedJpg(imgBuffer);
        } else {
          pdfImage = await pdfDoc.embedPng(imgBuffer);
        }
        
        page.drawImage(pdfImage, {
          x: 0,
          y: 0,
          width: width,
          height: height,
        });
      } else {
        this.logger.warn(`No se pudo cargar la imagen de fondo: ${bg}`);
      }
    } catch (err: any) {
      this.logger.error(`Error al procesar la imagen de fondo: ${err.message}`);
    }
  }
}

