import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

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
export class PdfDriver implements OnModuleDestroy {
  private readonly logger = new Logger(PdfDriver.name);
  private browser: Browser | null = null;
  private isBrowserStarting = false;

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.isBrowserStarting) {
      // Wait for it to start if another request is already starting it
      while (this.isBrowserStarting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.browser!;
    }

    this.isBrowserStarting = true;
    this.logger.log('Lanzando instancia maestra de Puppeteer...');
    try {
      this.browser = await puppeteer.launch({
        headless: true, // Use new headless mode if supported
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      return this.browser;
    } finally {
      this.isBrowserStarting = false;
    }
  }

  async generatePdf(template: KonvaTemplateJson, data: Record<string, any>, outputPath: string): Promise<string> {
    this.logger.log(`Generando PDF para ${outputPath}...`);
    
    // Inyectar datos en la plantilla JSON
    let jsonString = JSON.stringify(template);
    for (const key of Object.keys(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      jsonString = jsonString.replace(regex, data[key]);
    }
    const processedTemplate: KonvaTemplateJson = JSON.parse(jsonString);

    const html = this.buildHtml(processedTemplate);

    const browser = await this.getBrowser();
    let page;

    try {
      page = await browser.newPage();
      await page.setViewport({ width: processedTemplate.width, height: processedTemplate.height });
      await page.setContent(html, { waitUntil: 'load' });

      await page.pdf({
        path: outputPath,
        width: `${processedTemplate.width}px`,
        height: `${processedTemplate.height}px`,
        printBackground: true,
        pageRanges: '1',
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });

      this.logger.log(`PDF generado exitosamente en ${outputPath}`);
      return outputPath;
    } finally {
      if (page) {
        await page.close(); // Clean up the page to free memory!
      }
    }
  }
  private buildHtml(template: KonvaTemplateJson): string {
    const fs = require('fs');
    const path = require('path');
    const rootDir = path.resolve(process.cwd());

    const toBase64DataUri = (urlPath: string): string => {
      try {
        if (urlPath.startsWith('/uploads/')) {
          const relativeAssetPath = urlPath.replace(/^\//, '');
          const pathsToTry = [
            path.join(rootDir, relativeAssetPath),
            path.join(rootDir, 'apps/api', relativeAssetPath),
            path.join(rootDir, '..', relativeAssetPath),
            path.resolve(relativeAssetPath),
          ];

          for (const absoluteAssetPath of pathsToTry) {
            if (fs.existsSync(absoluteAssetPath) && fs.lstatSync(absoluteAssetPath).isFile()) {
              const fileBuffer = fs.readFileSync(absoluteAssetPath);
              const extension = path.extname(absoluteAssetPath).toLowerCase().replace(/^\./, '');
              const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
              return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
            }
          }
          this.logger.warn(`No se encontró el archivo de carga para: ${urlPath} en las rutas intentadas`);
        }
      } catch (err) {
        this.logger.error(`Error al convertir ${urlPath} a base64: ${err.message}`);
      }
      return urlPath;
    };

    let elementsHtml = '';

    for (const el of template.elements) {
      if (el.type === 'text') {
        elementsHtml += `
          <div style="
            position: absolute;
            left: ${el.x}px;
            top: ${el.y}px;
            font-size: ${el.fontSize || 16}px;
            font-family: '${el.fontFamily || 'Arial'}';
            color: ${el.color || '#000'};
            font-weight: ${el.fontWeight || 'normal'};
            font-style: ${el.fontStyle || 'normal'};
            text-align: ${el.textAlign || 'left'};
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
            width: ${el.width ? el.width + 'px' : 'auto'};
          ">${el.content}</div>
        `;
      } else if (el.type === 'image') {
        let imgSrc = el.content;
        if (imgSrc.startsWith('/uploads/')) {
          imgSrc = toBase64DataUri(imgSrc);
        }
        elementsHtml += `
          <img src="${imgSrc}" style="
            position: absolute;
            left: ${el.x}px;
            top: ${el.y}px;
            width: ${el.width ? el.width + 'px' : 'auto'};
            height: ${el.height ? el.height + 'px' : 'auto'};
          " />
        `;
      }
    }

    let backgroundCss = '#ffffff';
    if (template.background) {
      if (template.background.startsWith('data:')) {
        // Imagen ya incrustada (viene de MinIO, resuelta en el motor)
        backgroundCss = `url('${template.background}')`;
      } else if (template.background.startsWith('http')) {
        backgroundCss = `url('${template.background}')`;
      } else if (template.background.startsWith('/uploads/')) {
        const base64Uri = toBase64DataUri(template.background);
        backgroundCss = `url('${base64Uri}')`;
      } else {
        backgroundCss = template.background;
      }
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            margin: 0;
            padding: 0;
            width: ${template.width}px;
            height: ${template.height}px;
            background: ${backgroundCss};
            background-size: cover;
            background-repeat: no-repeat;
            position: relative;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        ${elementsHtml}
      </body>
      </html>
    `;
  }
}
