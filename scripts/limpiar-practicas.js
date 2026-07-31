/**
 * Deja el sistema sin datos de prácticas, para volver a importarlos limpios.
 *
 * Borra en el orden que exigen las llaves foráneas y retira de MinIO los
 * archivos que queden sin dueño. NO toca la configuración institucional
 * —facultades, carreras, periodos y autoridades— ni las plantillas, ni las
 * cuentas de usuario: eso se configura una vez y volver a cargarlo sería
 * rehacer trabajo que no tiene nada que ver con los datos de prueba.
 *
 * Uso:
 *   node scripts/limpiar-practicas.js                    → muestra qué se borraría
 *   node scripts/limpiar-practicas.js --ejecutar         → borra prácticas y documentos
 *   node scripts/limpiar-practicas.js --ejecutar --todo  → borra además estudiantes y empresas
 */
const { PrismaClient } = require('@prisma/client');
const { Client } = require('minio');
const fs = require('fs');
const path = require('path');

// Las credenciales del almacén viven en el .env de la API. Sin leerlas, el
// borrado de la base funciona y el de los archivos falla en silencio, que es
// justo la mitad peor: quedan huérfanos ocupando espacio.
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

const EJECUTAR = process.argv.includes('--ejecutar');
const TODO = process.argv.includes('--todo');
const prisma = new PrismaClient();

const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});
const BUCKET = process.env.MINIO_BUCKET || 'unibridge-documents';

const num = (n) => String(n).padStart(6);

/**
 * Retira del almacén los documentos que ya no tiene ninguna fila de la base.
 *
 * Las plantillas viven en el mismo bucket bajo `templates/`, así que se dejan
 * fuera siempre: borrarlas obligaría a volver a subirlas a mano.
 */
async function limpiarHuerfanos(ejecutar) {
  const vivos = new Set();
  for (const d of await prisma.generatedDocument.findMany({ select: { fileUrl: true, signedFileKey: true } })) {
    if (d.fileUrl) vivos.add(d.fileUrl);
    if (d.signedFileKey) vivos.add(d.signedFileKey);
  }

  const objetos = await new Promise((resolve, reject) => {
    const lista = [];
    const flujo = minio.listObjectsV2(BUCKET, '', true);
    flujo.on('data', (o) => lista.push(o.name));
    flujo.on('end', () => resolve(lista));
    flujo.on('error', reject);
  });

  const plantillas = objetos.filter((k) => k.startsWith('templates/'));
  const huerfanos = objetos.filter((k) => !k.startsWith('templates/') && !vivos.has(k));

  console.log('\n═══ ALMACÉN ═══');
  console.log(num(objetos.length) + '  objetos en el bucket');
  console.log(num(plantillas.length) + '  plantillas (intocables)');
  console.log(num(objetos.length - plantillas.length - huerfanos.length) + '  documentos con dueño en la base');
  console.log(num(huerfanos.length) + '  huérfanos' + (ejecutar ? '' : '  ← se borrarían'));

  if (!ejecutar || huerfanos.length === 0) return;

  let borrados = 0;
  for (const clave of huerfanos) {
    try { await minio.removeObject(BUCKET, clave); borrados++; }
    catch (e) { console.log(`   (aviso) ${clave}: ${e.message}`); }
  }
  console.log(`   ${borrados} archivos retirados`);
}

(async () => {
  if (process.argv.includes('--huerfanos')) {
    await limpiarHuerfanos(EJECUTAR);
    return;
  }

  // ── Qué hay ahora ──
  const [
    practicas, documentos, lotes, items, importaciones, generaciones,
    estudiantes, empresas, usuariosEstudiante,
    facultades, carreras, periodos, plantillas, firmantes,
  ] = await Promise.all([
    prisma.practice.count(),
    prisma.generatedDocument.count(),
    prisma.signatureBatch.count(),
    prisma.signatureBatchItem.count(),
    prisma.excelImport.count().catch(() => 0),
    prisma.generationBatch.count().catch(() => 0),
    prisma.student.count(),
    prisma.company.count(),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.faculty.count(),
    prisma.program.count().catch(() => 0),
    prisma.academicPeriod.count(),
    prisma.documentTemplate.count(),
    prisma.signerProfile.count().catch(() => 0),
  ]);

  console.log('\n═══ SE BORRA ═══');
  console.log(num(practicas) + '  prácticas');
  console.log(num(documentos) + '  documentos generados (solicitudes, designaciones y certificados)');
  console.log(num(items) + '  ítems de lotes de firma');
  console.log(num(lotes) + '  lotes de firma');
  console.log(num(generaciones) + '  lotes de generación');
  console.log(num(importaciones) + '  trabajos de importación');
  if (TODO) {
    console.log(num(estudiantes) + '  estudiantes');
    console.log(num(usuariosEstudiante) + '  cuentas de estudiante');
    console.log(num(empresas) + '  empresas');
  }

  console.log('\n═══ NO SE TOCA ═══');
  if (!TODO) {
    console.log(num(estudiantes) + '  estudiantes   (usa --todo para borrarlos también)');
    console.log(num(empresas) + '  empresas      (usa --todo para borrarlas también)');
  }
  console.log(num(facultades) + '  facultades');
  console.log(num(carreras) + '  carreras');
  console.log(num(periodos) + '  periodos académicos, con sus autoridades');
  console.log(num(plantillas) + '  plantillas de documento');
  console.log(num(firmantes) + '  perfiles de firmante');
  console.log('        las cuentas de administrador y coordinador');

  if (!EJECUTAR) {
    console.log('\nSimulación: no se borró nada.');
    console.log('Para borrar de verdad:  node scripts/limpiar-practicas.js --ejecutar' + (TODO ? ' --todo' : ''));
    return;
  }

  // ── Archivos que habrá que retirar del almacén ──
  const claves = new Set();
  const docs = await prisma.generatedDocument.findMany({
    select: { fileUrl: true, signedFileKey: true },
  });
  docs.forEach((d) => { if (d.fileUrl) claves.add(d.fileUrl); if (d.signedFileKey) claves.add(d.signedFileKey); });

  // ── Borrado, en el orden que exigen las llaves foráneas ──
  await prisma.signatureBatchItem.deleteMany({});
  await prisma.signatureBatch.deleteMany({});

  // Un documento puede apuntar a otro como su reemplazo: se rompe el vínculo
  // antes de borrar, o la propia tabla se bloquea a sí misma.
  await prisma.$executeRaw`UPDATE generated_documents SET "replacedById" = NULL`;
  const borradosDocs = await prisma.generatedDocument.deleteMany({});

  const borradasPracticas = await prisma.practice.deleteMany({});
  await prisma.generationBatch.deleteMany({}).catch(() => undefined);
  await prisma.excelImport.deleteMany({}).catch(() => undefined);

  // Las secuencias de numeración vuelven a empezar: si no, el próximo oficio
  // saldría con un número que no corresponde a ningún documento existente.
  await prisma.documentSequence.deleteMany({});

  let borradosEstudiantes = 0;
  let borradasEmpresas = 0;
  let borradasCuentas = 0;
  if (TODO) {
    // Cada estudiante tiene cuenta: la relación con User es obligatoria
    const ids = (await prisma.student.findMany({ select: { userId: true } })).map((s) => s.userId);

    borradosEstudiantes = (await prisma.student.deleteMany({})).count;

    if (ids.length > 0) {
      // Ni las sesiones ni la bitácora se borran en cascada, así que hay que
      // soltarlas primero o el borrado de las cuentas falla a mitad.
      await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await prisma.auditLog.updateMany({ where: { userId: { in: ids } }, data: { userId: null } });
      borradasCuentas = (await prisma.user.deleteMany({ where: { id: { in: ids }, role: 'STUDENT' } })).count;
    }
    borradasEmpresas = (await prisma.company.deleteMany({})).count;
  }

  // ── Almacén ──
  let archivos = 0;
  for (const clave of claves) {
    try { await minio.removeObject(BUCKET, clave); archivos++; }
    catch (e) { console.log(`   (aviso) no se pudo borrar ${clave}: ${e.message}`); }
  }

  console.log('\n✅ Sistema limpio');
  console.log(`   ${borradasPracticas.count} prácticas`);
  console.log(`   ${borradosDocs.count} documentos generados`);
  console.log(`   ${archivos} archivos retirados del almacén`);
  if (TODO) {
    console.log(`   ${borradosEstudiantes} estudiantes y ${borradasCuentas} cuentas`);
    console.log(`   ${borradasEmpresas} empresas`);
  }
  console.log('   secuencias de numeración reiniciadas');
})()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
