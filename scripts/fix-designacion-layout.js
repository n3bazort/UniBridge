const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { PrismaClient } = require('@prisma/client');
const { Client: MinioClient } = require('minio');

// Read env variables
for (const rel of ['apps/api/.env', '.env']) {
  const ruta = path.join(process.cwd(), rel);
  if (!fs.existsSync(ruta)) continue;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const prisma = new PrismaClient();

function adjustXml(xml) {
  // Replace table grid
  const oldGrid = '<w:tblGrid><w:gridCol w:w="2498"/><w:gridCol w:w="1321"/><w:gridCol w:w="2179"/><w:gridCol w:w="830"/><w:gridCol w:w="2523"/></w:tblGrid>';
  const newGrid = '<w:tblGrid><w:gridCol w:w="3400"/><w:gridCol w:w="1450"/><w:gridCol w:w="1750"/><w:gridCol w:w="550"/><w:gridCol w:w="2201"/></w:tblGrid>';
  
  let newXml = xml.replace(oldGrid, newGrid);

  // Replace cell widths in table rows
  newXml = newXml.replace(/<w:tcW w:w="2498" w:type="dxa"\/>/g, '<w:tcW w:w="3400" w:type="dxa"/>');
  newXml = newXml.replace(/<w:tcW w:w="1321" w:type="dxa"\/>/g, '<w:tcW w:w="1450" w:type="dxa"/>');
  newXml = newXml.replace(/<w:tcW w:w="2179" w:type="dxa"\/>/g, '<w:tcW w:w="1750" w:type="dxa"/>');
  newXml = newXml.replace(/<w:tcW w:w="830" w:type="dxa"\/>/g, '<w:tcW w:w="550" w:type="dxa"/>');
  newXml = newXml.replace(/<w:tcW w:w="2523" w:type="dxa"\/>/g, '<w:tcW w:w="2201" w:type="dxa"/>');

  return newXml;
}

function processBuffer(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  let xml = zip.file('word/document.xml').asText();
  xml = adjustXml(xml);
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function main() {
  // 1. Process public template file
  const publicPath = path.join(__dirname, '../apps/web/public/templates/Designación de Estudiantes Oficial.docx');
  if (fs.existsSync(publicPath)) {
    const buf = fs.readFileSync(publicPath);
    const updatedBuf = processBuffer(buf);
    fs.writeFileSync(publicPath, updatedBuf);
    console.log('✅ Updated public template:', publicPath);
  }

  // 2. Process active DB templates and MinIO
  const minioClient = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  });

  const bucketName = process.env.MINIO_BUCKET || 'unibridge-documents';

  const templates = await prisma.documentTemplate.findMany({
    where: { deletedAt: null, type: 'DOCX' }
  });

  for (const t of templates) {
    const content = typeof t.content === 'object' && t.content !== null ? t.content : {};
    if (content.kind === 'DESIGNACION' && content.path) {
      console.log('Processing DB template:', t.name, content.path);
      try {
        const stream = await minioClient.getObject(bucketName, content.path);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const origBuf = Buffer.concat(chunks);
        const newBuf = processBuffer(origBuf);
        await minioClient.putObject(bucketName, content.path, newBuf, newBuf.length, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        console.log('✅ Updated MinIO template:', content.path);
      } catch (err) {
        console.error('Error updating MinIO template:', content.path, err.message);
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
