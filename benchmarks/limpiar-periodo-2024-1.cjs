/**
 * Borra por completo los datos sembrados para la prueba de rendimiento.
 *
 * Por qué existe: el sembrado reutilizaba los estudiantes de la corrida
 * anterior y se limitaba a invalidar sus certificados. Bastaba con que una
 * corrida se interrumpiera a medias para que unos pocos estudiantes llegaran
 * a la siguiente con un certificado vigente, y la emisión masiva se negaba en
 * bloque: «No se pueden generar 2 de 124 certificados». Una medición debe
 * partir siempre del mismo estado, así que aquí no se invalida nada: se borra.
 *
 * Alcance: SOLO los registros sintéticos, reconocibles por el prefijo de
 * cédula 9024. Los estudiantes reales de la Facultad no se tocan.
 *
 * También retira del almacén los PDF que produjeron las corridas anteriores.
 * Borrar la fila y dejar el archivo llenaría el disco de certificados que ya
 * no le pertenecen a nadie, y el disco es justamente lo que se está midiendo.
 *
 * Uso:  node benchmarks/limpiar-periodo-2024-1.cjs
 *       (o automáticamente, al principio de `sembrar-periodo-2024-1.cjs`)
 */
const fs = require('fs');
const path = require('path');

// La conexión vive en apps/api/.env, no en el entorno del shell. Se lee a mano
// para no arrastrar dotenv solo por esto.
const ENV = path.join(__dirname, '..', 'apps', 'api', '.env');
if (fs.existsSync(ENV)) {
  for (const linea of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');

const PREFIJO_DNI = '9024';
const BUCKET = 'unibridge-documents';

/** Cliente de MinIO, o null si el almacén está desactivado o mal configurado. */
function clienteMinio() {
  if (process.env.DISABLE_MINIO === 'true') return null;
  if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) return null;
  try {
    const { Client } = require('minio');
    return new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  } catch {
    return null;
  }
}

/**
 * Borra los datos sintéticos y devuelve el recuento de lo eliminado.
 *
 * El orden importa: las claves foráneas no están declaradas en cascada, así
 * que hay que ir de la hoja a la raíz. Un `deleteMany` sobre estudiantes sin
 * haber retirado antes sus documentos y prácticas falla.
 */
async function limpiar(prisma, { silencioso = false } = {}) {
  const log = (msg) => { if (!silencioso) console.log(msg); };

  const estudiantes = await prisma.student.findMany({
    where: { dni: { startsWith: PREFIJO_DNI } },
    select: { id: true },
  });
  const ids = estudiantes.map((e) => e.id);

  if (ids.length === 0) {
    log('  no hay datos sembrados que borrar\n');
    return { estudiantes: 0, practicas: 0, documentos: 0, archivos: 0 };
  }

  // Los archivos se anotan ANTES de borrar las filas: `fileUrl` es la única
  // pista de qué objeto le corresponde a cada documento.
  const documentos = await prisma.generatedDocument.findMany({
    where: { studentId: { in: ids } },
    select: { fileUrl: true, signedFileKey: true },
  });
  const claves = documentos
    .flatMap((d) => [d.fileUrl, d.signedFileKey])
    .filter((k) => typeof k === 'string' && k.length > 0);

  // 1. Renglones de lotes de firma que apuntan a esos documentos.
  const { count: itemsFirma } = await prisma.signatureBatchItem.deleteMany({
    where: { document: { studentId: { in: ids } } },
  });

  // 2. Los documentos generados.
  const { count: docsBorrados } = await prisma.generatedDocument.deleteMany({
    where: { studentId: { in: ids } },
  });

  // 3. Las prácticas. Antes se suelta el encadenamiento entre ellas: una
  //    práctica puede apuntar a la anterior del mismo estudiante, y borrarlas
  //    todas de un golpe rompería esa referencia a mitad de camino.
  await prisma.practice.updateMany({
    where: { studentId: { in: ids }, previousPracticeId: { not: null } },
    data: { previousPracticeId: null },
  });
  const { count: practicasBorradas } = await prisma.practice.deleteMany({
    where: { studentId: { in: ids } },
  });

  // 4. Los estudiantes.
  const { count: estudiantesBorrados } = await prisma.student.deleteMany({
    where: { dni: { startsWith: PREFIJO_DNI } },
  });

  // 5. Los archivos del almacén de objetos.
  let archivosBorrados = 0;
  const minio = clienteMinio();
  if (minio && claves.length > 0) {
    try {
      await minio.removeObjects(BUCKET, claves);
      archivosBorrados = claves.length;
    } catch (e) {
      // Que el almacén no responda no invalida la limpieza de la base: lo que
      // impide medir son las filas, no los archivos huérfanos.
      log(`  aviso: no se pudieron retirar los archivos de MinIO (${e.message})`);
    }
  }

  log(`  documentos borrados : ${docsBorrados}${itemsFirma ? ` (y ${itemsFirma} renglones de firma)` : ''}`);
  log(`  prácticas borradas  : ${practicasBorradas}`);
  log(`  estudiantes borrados: ${estudiantesBorrados}`);
  log(`  archivos retirados  : ${archivosBorrados}${minio ? '' : ' (almacén desactivado)'}\n`);

  return {
    estudiantes: estudiantesBorrados,
    practicas: practicasBorradas,
    documentos: docsBorrados,
    archivos: archivosBorrados,
  };
}

module.exports = { limpiar, PREFIJO_DNI };

// Ejecución directa desde la línea de comandos.
if (require.main === module) {
  const prisma = new PrismaClient();
  console.log(`\nBorrando los datos sembrados (cédulas ${PREFIJO_DNI}xxxxxx).\n`);
  limpiar(prisma)
    .catch((e) => {
      console.error('\nERROR:', e.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
