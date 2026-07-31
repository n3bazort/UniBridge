const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { Client: MinioClient } = require('minio');
const PizZip = require('pizzip');

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
const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});
const bucketName = process.env.MINIO_BUCKET || 'unibridge-documents';

async function main() {
  const faculty = await prisma.faculty.findFirst();
  if (!faculty) throw new Error('No faculty found');

  // Check if Designación sin firma exists
  const existingDesignacionSinFirma = await prisma.documentTemplate.findFirst({
    where: {
      type: 'DOCX',
      deletedAt: null,
      name: { contains: 'Designación de Estudiantes Oficial' }
    }
  });

  const desPublicaPath = path.join(__dirname, '../apps/web/public/templates/Designación de Estudiantes Oficial.docx');
  if (fs.existsSync(desPublicaPath)) {
    // Strip drawing elements for blank signature variant
    const content = fs.readFileSync(desPublicaPath);
    const zip = new PizZip(content);
    let xml = zip.file('word/document.xml').asText();
    
    // Remove drawing/signature elements
    const xmlSinFirma = xml.replace(/<w:r><w:rPr><w:noProof\/><\/w:rPr><w:drawing>[\s\S]*?<\/w:drawing><\/w:r>/g, '');
    zip.file('word/document.xml', xmlSinFirma);
    const bufSinFirma = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    const objectKey = `templates/${Date.now()}-designacion-sin-firma.docx`;
    await minioClient.putObject(bucketName, objectKey, bufSinFirma, bufSinFirma.length, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    const blankDes = await prisma.documentTemplate.create({
      data: {
        name: 'Designación de Estudiantes Oficial (sin firma ni sello)',
        type: 'DOCX',
        content: {
          kind: 'DESIGNACION',
          path: objectKey,
          scope: 'GRUPO',
          isDefault: false
        },
        facultyId: faculty.id
      }
    });
    console.log('✅ Created blank Designación template:', blankDes.name, blankDes.id);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
