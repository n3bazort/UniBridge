/**
 * Purga inmediata de documentos no vigentes.
 *
 * Aplica las mismas salvaguardas que `purgeTrash()` del servicio (no toca nada
 * que esté en un lote de firma, rompe las referencias de reemplazo y solo borra
 * de MinIO los objetos que ya no usa ninguna fila viva), pero sin esperar los
 * treinta días de la papelera. Pensado para limpiar residuos de pruebas.
 *
 * Uso:
 *   node scripts/purgar-invalidados.js            → muestra qué se borraría
 *   node scripts/purgar-invalidados.js --ejecutar → borra de verdad
 */
const { PrismaClient } = require('@prisma/client');
const { Client } = require('minio');

const EJECUTAR = process.argv.includes('--ejecutar');
const prisma = new PrismaClient();

const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});
const BUCKET = process.env.MINIO_BUCKET || 'unibridge-documents';

(async () => {
  const candidatos = await prisma.$queryRaw`
    SELECT d.id, d."documentCode", d."documentType", d.status, d."fileUrl", d."signedFileKey"
    FROM generated_documents d
    WHERE d.status <> 'VALID'
      AND NOT EXISTS (SELECT 1 FROM signature_batch_items i WHERE i."documentId" = d.id)
    ORDER BY d."documentType", d."documentCode"
  `;

  if (candidatos.length === 0) {
    console.log('No hay documentos no vigentes que purgar.');
    return;
  }

  const porTipo = candidatos.reduce((a, c) => {
    const k = `${c.documentType} · ${c.status}`;
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});
  console.log(`Documentos no vigentes y sin lote de firma: ${candidatos.length}`);
  Object.entries(porTipo).forEach(([k, n]) => console.log(`   ${n.toString().padStart(3)}  ${k}`));

  if (!EJECUTAR) {
    console.log('\nSimulación: no se borró nada.');
    console.log('Para borrar de verdad:  node scripts/purgar-invalidados.js --ejecutar');
    return;
  }

  const ids = candidatos.map((c) => c.id);
  const rotas = await prisma.$executeRaw`
    UPDATE generated_documents SET "replacedById" = NULL WHERE "replacedById" = ANY(${ids}::uuid[])
  `;
  const borrados = await prisma.$executeRaw`
    DELETE FROM generated_documents WHERE id = ANY(${ids}::uuid[])
  `;

  // Un oficio grupal comparte archivo entre varias filas: el objeto solo se
  // retira cuando ya ninguna fila viva lo referencia.
  const claves = new Set();
  candidatos.forEach((c) => { if (c.fileUrl) claves.add(c.fileUrl); if (c.signedFileKey) claves.add(c.signedFileKey); });
  let archivos = 0;
  for (const clave of claves) {
    const enUso = await prisma.generatedDocument.count({
      where: { OR: [{ fileUrl: clave }, { signedFileKey: clave }] },
    });
    if (enUso > 0) continue;
    try { await minio.removeObject(BUCKET, clave); archivos++; }
    catch (e) { console.log(`   (aviso) no se pudo borrar ${clave}: ${e.message}`); }
  }

  console.log(`\n✅ ${borrados} registros eliminados`);
  console.log(`   ${rotas} referencias de reemplazo liberadas`);
  console.log(`   ${archivos} archivos retirados del almacén`);
})()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
