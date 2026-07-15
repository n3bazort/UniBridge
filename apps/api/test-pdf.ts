import { PdfDriver } from './src/modules/document-engine/pdf.driver';
import * as path from 'path';

async function main() {
  const driver = new PdfDriver();
  
  const template = {
    width: 1123,
    height: 794,
    // Usamos un color de fondo básico y un borde simulado para la prueba, o una URL pública
    background: '#ffffff', 
    elements: [
      {
        type: 'text',
        content: 'CERTIFICADO',
        x: 750, y: 150, fontSize: 45, fontWeight: 'bold', fontFamily: 'Arial', color: '#333333'
      },
      {
        type: 'text',
        content: 'Otorgado a:',
        x: 0, y: 280, fontSize: 24, textAlign: 'center', width: 1123
      },
      {
        type: 'text',
        content: '{{studentName}}',
        x: 0, y: 330, fontSize: 42, fontWeight: 'bold', textAlign: 'center', width: 1123
      },
      {
        type: 'text',
        content: 'Por haber culminado satisfactoriamente las {{totalHours}} horas de Prácticas Preprofesionales correspondiente a "{{practiceLevel}}", realizadas en {{companyName}} y supervisadas por el {{tutorName}}, en el periodo {{academicPeriod}}.',
        x: 150, y: 430, fontSize: 22, textAlign: 'center', width: 823, fontWeight: 'normal', fontFamily: 'Arial'
      },
      {
        type: 'text',
        content: 'Manta, Agosto 2025.',
        x: 750, y: 550, fontSize: 18, textAlign: 'right', width: 200
      }
    ]
  };

  const data = {
    studentName: 'Bazurto García Dilian Josué',
    totalHours: '120',
    practiceLevel: 'PRÁCTICAS LABORALES II (OCTAVO NIVEL)',
    companyName: 'GAD JARAMIJO',
    tutorName: 'Ing. Sendón Varela Juan Carlos, Mg.',
    academicPeriod: '2025-2026 (1)'
  };

  const outputPath = path.join(process.cwd(), 'certificado-prueba-fuego.pdf');
  
  console.log('🔥 Iniciando prueba de fuego del Motor Documental...');
  await driver.generatePdf(template as any, data, outputPath);
  console.log(`✅ ¡Prueba exitosa! PDF generado y guardado en: ${outputPath}`);
}

main().catch(console.error);
