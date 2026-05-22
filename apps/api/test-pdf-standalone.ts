import puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

interface TemplateElement {
  type: 'text' | 'image';
  content: string;
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  color?: string;
  width?: number;
  height?: number;
}

interface TemplateJson {
  width: number;
  height: number;
  background?: string;
  elements: TemplateElement[];
}

function buildHtml(template: TemplateJson): string {
  let elementsHtml = '';

  for (const el of template.elements) {
    if (el.type === 'text') {
      elementsHtml += `
        <div style="
          position: absolute;
          left: ${el.x}px;
          top: ${el.y}px;
          font-size: ${el.fontSize || 16}px;
          font-family: '${el.fontFamily || 'Arial'}', sans-serif;
          color: ${el.color || '#000'};
          font-weight: ${el.fontWeight || 'normal'};
          font-style: ${el.fontStyle || 'normal'};
          text-align: ${el.textAlign || 'left'};
          white-space: pre-wrap;
          width: ${el.width ? el.width + 'px' : 'auto'};
          line-height: 1.4;
        ">
          ${el.content}
        </div>
      `;
    } else if (el.type === 'image') {
      elementsHtml += `
        <img src="${el.content}" style="
          position: absolute;
          left: ${el.x}px;
          top: ${el.y}px;
          width: ${el.width ? el.width + 'px' : 'auto'};
          height: ${el.height ? el.height + 'px' : 'auto'};
        " />
      `;
    }
  }

  const bgStyle = template.background && template.background.startsWith('http')
    ? `url('${template.background}')`
    : template.background && template.background.startsWith('file')
      ? `url('${template.background}')`
      : template.background || '#ffffff';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: ${template.width}px;
          height: ${template.height}px;
          background: ${bgStyle};
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

async function main() {
  console.log('🔥 PRUEBA DE FUEGO - Motor Documental PDF');
  console.log('==========================================');

  // Datos del certificado - basados en la imagen que nos proporcionó el usuario
  const template: TemplateJson = {
    width: 1123,
    height: 794,
    background: '#ffffff',
    elements: [
      // Título CERTIFICADO
      {
        type: 'text',
        content: 'CERTIFICADO',
        x: 0, y: 120, fontSize: 40, fontWeight: 'bold',
        fontFamily: 'Arial', color: '#1a1a1a',
        textAlign: 'center', width: 1123
      },
      // Otorgado a:
      {
        type: 'text',
        content: 'Otorgado a:',
        x: 0, y: 220, fontSize: 20, fontWeight: 'normal',
        fontFamily: 'Arial', color: '#333333',
        textAlign: 'center', width: 1123
      },
      // Nombre del estudiante (variable reemplazada)
      {
        type: 'text',
        content: '{{studentName}}',
        x: 0, y: 270, fontSize: 36, fontWeight: 'bold',
        fontFamily: 'Arial', color: '#000000',
        textAlign: 'center', width: 1123
      },
      // Cuerpo del certificado
      {
        type: 'text',
        content: 'Por haber culminado satisfactoriamente las {{totalHours}} horas de Prácticas Preprofesionales, correspondiente a "{{practiceLevel}}", realizadas en {{companyName}} y supervisadas por el {{tutorName}}, en el periodo {{academicPeriod}}.',
        x: 150, y: 370, fontSize: 18, fontWeight: 'normal',
        fontFamily: 'Arial', color: '#333333',
        textAlign: 'center', width: 823
      },
      // Fecha
      {
        type: 'text',
        content: 'Manta, Agosto 2025.',
        x: 0, y: 520, fontSize: 16, fontWeight: 'normal',
        fontFamily: 'Arial', color: '#333333',
        textAlign: 'center', width: 1123
      },
      // Firma izquierda
      {
        type: 'text',
        content: '________________________\nLic. Dolores Muñoz Verduga, PhD.\nDecana Facultad de Ciencias de la Vida\ny Tecnologías',
        x: 100, y: 600, fontSize: 12, fontWeight: 'normal',
        fontFamily: 'Arial', color: '#333333',
        textAlign: 'center', width: 350
      },
      // Firma derecha
      {
        type: 'text',
        content: '________________________\nIng. Héndol Santana Cedeño, Mg.\nResponsable de la Comisión de Prácticas\nPreprofesionales',
        x: 650, y: 600, fontSize: 12, fontWeight: 'normal',
        fontFamily: 'Arial', color: '#333333',
        textAlign: 'center', width: 350
      }
    ]
  };

  // Variables que inyectará el backend (datos del estudiante)
  const data: Record<string, string> = {
    studentName: 'Bazurto García Dilian Josué',
    totalHours: '120',
    practiceLevel: 'PRÁCTICAS LABORALES II (OCTAVO NIVEL)',
    companyName: 'GAD JARAMIJO',
    tutorName: 'Ing. Sendón Varela Juan Carlos, Mg.',
    academicPeriod: '2025-2026 (1)'
  };

  // 1. Inyectar variables
  console.log('\n📝 Paso 1: Inyectando variables del estudiante...');
  let jsonString = JSON.stringify(template);
  for (const key of Object.keys(data)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    jsonString = jsonString.replace(regex, data[key]);
  }
  const processedTemplate: TemplateJson = JSON.parse(jsonString);
  console.log('   ✅ Variables inyectadas correctamente');

  // 2. Generar HTML
  console.log('📄 Paso 2: Generando HTML del certificado...');
  const html = buildHtml(processedTemplate);
  
  // Guardar HTML para inspección
  const htmlPath = path.join(process.cwd(), 'certificado-preview.html');
  fs.writeFileSync(htmlPath, html);
  console.log(`   ✅ HTML guardado en: ${htmlPath}`);

  // 3. Lanzar Puppeteer y generar PDF
  console.log('🚀 Paso 3: Lanzando Puppeteer (Chrome Headless)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: processedTemplate.width, height: processedTemplate.height });
    
    console.log('   ⏳ Cargando contenido HTML en el navegador...');
    await page.setContent(html, { waitUntil: 'load' });

    const outputPath = path.join(process.cwd(), 'certificado-prueba-fuego.pdf');
    
    console.log('   ⏳ Renderizando PDF...');
    await page.pdf({
      path: outputPath,
      width: `${processedTemplate.width}px`,
      height: `${processedTemplate.height}px`,
      printBackground: true,
      pageRanges: '1',
    });

    // Verificar que el archivo existe y tiene tamaño
    const stats = fs.statSync(outputPath);
    console.log(`\n🎉 ¡¡¡PRUEBA DE FUEGO EXITOSA!!!`);
    console.log(`   📁 Archivo: ${outputPath}`);
    console.log(`   📏 Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   📐 Dimensiones: ${processedTemplate.width}x${processedTemplate.height}px (A4 Horizontal)`);
    
  } finally {
    await browser.close();
    console.log('   🔒 Navegador cerrado correctamente');
  }
}

main().catch((err) => {
  console.error('❌ ERROR:', err.message);
  process.exit(1);
});
