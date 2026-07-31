const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

function inspect(fileName) {
  const filePath = path.join(__dirname, '../apps/web/public/templates', fileName);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath);
  const zip = new PizZip(content);
  const xml = zip.file('word/document.xml').asText();
  console.log(`\n=== ${fileName} ===`);
  const tblGridMatches = xml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/g);
  console.log('TABLE GRIDS:', tblGridMatches);
}

inspect('Designación de Estudiantes Oficial.docx');
inspect('Solicitud de Prácticas Oficial.docx');
