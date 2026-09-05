/**
 * Borra las prácticas de un período académico y los documentos emitidos en él.
 *
 * ── Por qué no borra y ya ──
 *
 * Esto toca datos que nadie sembró con un script: son los que fuiste cargando
 * a mano y por Excel. Un borrado en el período equivocado no se deshace, así
 * que el comportamiento por defecto es ENSEÑAR lo que se iría y no tocar nada.
 * Para que borre de verdad hay que pedirlo con `--confirmar`.
 *
 * ── Qué borra exactamente ──
 *
 *   · Las prácticas cuyo `academicPeriod` sea el período indicado.
 *   · Los documentos cuyo CÓDIGO lleve ese período impreso.
 *   · Los renglones de lote de firma que apunten a esos documentos.
 *   · Los archivos de esos documentos en el almacén de objetos.
 *
 * El documento se acota por su código y no por su estudiante a propósito: un
 * estudiante puede arrastrar prácticas de varios semestres, y borrar «todos
 * sus documentos» se llevaría por delante los de un período que nadie pidió
 * tocar.
 *
 * ── Qué NO borra ──
 *
 * Los estudiantes. Uno puede tener práctica en varios períodos, y quitarlo
 * dejaría huérfanas las de los demás. Con `--incluir-estudiantes` se borran,
 * pero solo los que se queden sin ninguna práctica en ningún período.
 *
 * ── Uso ──
 *
 *   node demo/05-limpieza/limpiar-periodo.cjs                  ← simulacro de 2025-2
 *   node demo/05-limpieza/limpiar-periodo.cjs 2025-2 --confirmar
 *   node demo/05-limpieza/limpiar-periodo.cjs 2025-2 --confirmar --solo-demo
 *   node demo/05-limpieza/limpiar-periodo.cjs 2025-2 --confirmar --incluir-estudiantes
 *
 *   --solo-demo             se limita a las cédulas 13159000xx de la demostración
 *   --incluir-estudiantes   borra además los estudiantes que queden sin prácticas
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const ENV = path.join(RAIZ, 'apps', 'api', '.env');
if (fs.existsSync(ENV)) {
  for (const linea of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { PrismaClient } = require(path.join(RAIZ, 'node_modules', '@prisma/client'));

const args = process.argv.slice(2);
const PERIODO = args.find((a) => !a.startsWith('--')) || '2025-2';
const CONFIRMAR = args.includes('--confirmar');
const SOLO_DEMO = args.includes('--solo-demo');
const INCLUIR_ESTUDIANTES = args.includes('--incluir-estudiantes');
const PREFIJO_DEMO = '13159000';
const BUCKET = 'unibridge-documents';

const prisma = new PrismaClient();

function clienteMinio() {
  if (process.env.DISABLE_MINIO === 'true') return null;
  if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) return null;
  try {
    const { Client } = require(path.join(RAIZ, 'node_modules', 'minio'));
    return new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  } catch { return null; }
}

/**
 * Borra estudiantes que ya no tienen NINGUNA práctica, en ningún período.
 *
 * Existe porque el resto del script trabaja a partir de las prácticas: en
 * cuanto estas desaparecen, el estudiante queda fuera de su alcance y no hay
 * forma de llegar a él. Y sigue en la base, así que al reimportar el padrón el
 * sistema lo reconoce por la cédula y avisa de que «ya está registrado»,
 * cuando lo que se quería era partir de cero.
 */
async function limpiarHuerfanos() {
  const filtro = { practices: { none: {} } };
  if (SOLO_DEMO) filtro.dni = { startsWith: PREFIJO_DEMO };

  const huerfanos = await prisma.student.findMany({
    where: filtro,
    select: { id: true, dni: true, firstName: true, lastName: true },
  });

  console.log(`\n${'='.repeat(66)}`);
  console.log(`  ${CONFIRMAR ? 'BORRADO REAL' : 'SIMULACRO — no se va a tocar nada'}`);
  console.log(`  Estudiantes sin ninguna práctica${SOLO_DEMO ? ` (solo cédulas ${PREFIJO_DEMO}xx)` : ''}`);
  console.log(`${'='.repeat(66)}\n`);

  if (huerfanos.length === 0) {
    console.log('  No hay estudiantes huérfanos. Nada que hacer.\n');
    return;
  }

  console.log(`  Estudiantes a borrar: ${huerfanos.length}\n`);
  huerfanos.slice(0, 8).forEach((e) =>
    console.log(`    · ${e.dni}  ${e.lastName} ${e.firstName}`));
  if (huerfanos.length > 8) console.log(`    · … y ${huerfanos.length - 8} más`);

  if (!CONFIRMAR) {
    console.log('\n  ── Simulacro. No se ha modificado nada. ──');
    console.log(`\n     node demo/05-limpieza/limpiar-periodo.cjs --huerfanos --confirmar${SOLO_DEMO ? ' --solo-demo' : ''}\n`);
    return;
  }

  const ids = huerfanos.map((e) => e.id);
  // Un estudiante sin prácticas puede conservar documentos de un período
  // anterior; se van con él, porque nadie va a poder consultarlos después.
  const docs = await prisma.generatedDocument.findMany({
    where: { studentId: { in: ids } },
    select: { id: true, fileUrl: true, signedFileKey: true, signatureStatus: true },
  });
  if (docs.some((d) => d.signatureStatus === 'SIGNED')) {
    console.log('\n  DETENIDO: alguno conserva un certificado firmado. Anúlalo desde la aplicación.\n');
    process.exitCode = 1;
    return;
  }

  console.log('\n  Borrando...\n');
  if (docs.length) {
    await prisma.signatureBatchItem.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    const rd = await prisma.generatedDocument.deleteMany({ where: { studentId: { in: ids } } });
    console.log(`    documentos   : ${rd.count}`);
  }
  const re = await prisma.student.deleteMany({ where: { id: { in: ids } } });
  console.log(`    estudiantes  : ${re.count}`);

  const claves = docs.flatMap((d) => [d.fileUrl, d.signedFileKey]).filter(Boolean);
  const minio = clienteMinio();
  if (minio && claves.length) {
    try { await minio.removeObjects(BUCKET, claves); console.log(`    archivos     : ${claves.length}`); }
    catch (e) { console.log(`    aviso: MinIO no respondió (${e.message})`); }
  }
  console.log('\n  Listo.\n');
}

async function main() {
  if (args.includes('--huerfanos')) return limpiarHuerfanos();

  const periodo = await prisma.academicPeriod.findUnique({ where: { code: PERIODO } });
  if (!periodo) throw new Error(`El período "${PERIODO}" no existe.`);

  console.log(`\n${'='.repeat(66)}`);
  console.log(`  ${CONFIRMAR ? 'BORRADO REAL' : 'SIMULACRO — no se va a tocar nada'}`);
  console.log(`  Período ${PERIODO}${periodo.isActive ? '  (ES EL PERÍODO ACTIVO)' : ''}`);
  if (SOLO_DEMO) console.log(`  Limitado a las cédulas ${PREFIJO_DEMO}xx de la demostración`);
  console.log(`${'='.repeat(66)}\n`);

  // ── Qué prácticas entran ──
  const filtro = { academicPeriod: PERIODO };
  if (SOLO_DEMO) filtro.student = { dni: { startsWith: PREFIJO_DEMO } };

  const practicas = await prisma.practice.findMany({
    where: filtro,
    select: { id: true, studentId: true, status: true,
              student: { select: { dni: true, firstName: true, lastName: true } } },
  });

  if (practicas.length === 0) {
    console.log('  No hay prácticas que borrar. Nada que hacer.\n');
    return;
  }

  const idsEstudiantes = [...new Set(practicas.map((p) => p.studentId))];

  // ── Qué documentos entran ──
  //
  // Un documento no guarda a qué período pertenece. Se intentó deducirlo de su
  // código, y no sirve: los certificados sí lo llevan («00001-TI-CERT-2025-2»)
  // pero los oficios usan otro patrón («2026-TI-008») y se quedaban fuera,
  // huérfanos de una práctica ya borrada.
  //
  // La regla que sí se sostiene es por estudiante: si TODAS sus prácticas están
  // en este período, todos sus documentos son de este período y se van con él.
  // Si arrastra prácticas de otro semestre, no hay forma de saber a cuál
  // pertenece cada documento, así que no se toca ninguno y se avisa.
  const conOtrasPracticas = new Set();
  for (const id of idsEstudiantes) {
    const otras = await prisma.practice.count({
      where: { studentId: id, academicPeriod: { not: PERIODO } },
    });
    if (otras > 0) conOtrasPracticas.add(id);
  }
  const idsExclusivos = idsEstudiantes.filter((id) => !conOtrasPracticas.has(id));

  const documentos = await prisma.generatedDocument.findMany({
    where: { studentId: { in: idsExclusivos } },
    select: { id: true, documentType: true, status: true, signatureStatus: true,
              fileUrl: true, signedFileKey: true, documentCode: true },
  });

  const docsIntactos = conOtrasPracticas.size === 0 ? 0
    : await prisma.generatedDocument.count({ where: { studentId: { in: [...conOtrasPracticas] } } });

  // ── Freno de seguridad: un documento firmado no se borra por script ──
  const firmados = documentos.filter((d) => d.signatureStatus === 'SIGNED');
  if (firmados.length > 0) {
    console.log(`  DETENIDO. Hay ${firmados.length} documento(s) firmado(s) por las dos autoridades:\n`);
    firmados.slice(0, 10).forEach((d) => console.log(`    · ${d.documentCode} (${d.documentType})`));
    console.log('\n  Un certificado firmado acredita un hecho y puede haberse entregado ya.');
    console.log('  Si de verdad hay que retirarlo, anúlalo desde la aplicación, que deja');
    console.log('  registrado el motivo y quién lo hizo. Este script no lo va a borrar.\n');
    process.exitCode = 1;
    return;
  }

  // ── Resumen de lo que se iría ──
  const porEstado = {};
  practicas.forEach((p) => { porEstado[p.status] = (porEstado[p.status] || 0) + 1; });
  const porTipo = {};
  documentos.forEach((d) => {
    const k = `${d.documentType}/${d.status}`;
    porTipo[k] = (porTipo[k] || 0) + 1;
  });

  console.log(`  Prácticas          : ${practicas.length}`);
  console.log(`    por estado       : ${JSON.stringify(porEstado)}`);
  console.log(`  Estudiantes tocados: ${idsEstudiantes.length}`);
  console.log(`  Documentos         : ${documentos.length}`);
  if (documentos.length) console.log(`    detalle          : ${JSON.stringify(porTipo)}`);
  if (conOtrasPracticas.size > 0) {
    console.log(`    NO se tocan      : ${docsIntactos} documento(s) de ${conOtrasPracticas.size} estudiante(s)`);
    console.log(`                       con prácticas en otros períodos — no se puede saber`);
    console.log(`                       a qué semestre pertenece cada uno.`);
  }

  const claves = documentos
    .flatMap((d) => [d.fileUrl, d.signedFileKey])
    .filter((k) => typeof k === 'string' && k.length > 0);
  console.log(`  Archivos en MinIO  : ${claves.length}`);

  // ── Estudiantes que quedarían huérfanos ──
  let huerfanos = [];
  if (INCLUIR_ESTUDIANTES) {
    const idsPracticas = new Set(practicas.map((p) => p.id));
    for (const id of idsEstudiantes) {
      const otras = await prisma.practice.count({
        where: { studentId: id, id: { notIn: [...idsPracticas] } },
      });
      if (otras === 0) huerfanos.push(id);
    }
    console.log(`  Estudiantes a borrar: ${huerfanos.length} (sin prácticas en ningún otro período)`);
    const conservados = idsEstudiantes.length - huerfanos.length;
    if (conservados > 0) console.log(`    se conservan       : ${conservados}, tienen prácticas en otros períodos`);
  } else {
    console.log('  Estudiantes        : se conservan (usa --incluir-estudiantes para borrar los huérfanos)');
  }

  if (!CONFIRMAR) {
    console.log('\n  ── Esto ha sido un simulacro. No se ha modificado nada. ──');
    console.log(`  Para ejecutarlo de verdad:\n`);
    console.log(`     node demo/05-limpieza/limpiar-periodo.cjs ${PERIODO} --confirmar${SOLO_DEMO ? ' --solo-demo' : ''}${INCLUIR_ESTUDIANTES ? ' --incluir-estudiantes' : ''}\n`);
    return;
  }

  // ── Borrado, de la hoja a la raíz: las claves foráneas no están en cascada ──
  console.log('\n  Borrando...\n');

  const idsDocs = documentos.map((d) => d.id);
  if (idsDocs.length) {
    const { count } = await prisma.signatureBatchItem.deleteMany({ where: { documentId: { in: idsDocs } } });
    if (count) console.log(`    renglones de firma : ${count}`);
    const r = await prisma.generatedDocument.deleteMany({ where: { id: { in: idsDocs } } });
    console.log(`    documentos         : ${r.count}`);
  }

  // Una práctica puede apuntar a la anterior del mismo estudiante: se suelta el
  // encadenamiento antes, o el borrado en bloque rompe esa referencia a medias.
  const idsPr = practicas.map((p) => p.id);
  await prisma.practice.updateMany({
    where: { id: { in: idsPr }, previousPracticeId: { not: null } },
    data: { previousPracticeId: null },
  });
  const rp = await prisma.practice.deleteMany({ where: { id: { in: idsPr } } });
  console.log(`    prácticas          : ${rp.count}`);

  if (INCLUIR_ESTUDIANTES && huerfanos.length) {
    await prisma.generatedDocument.deleteMany({ where: { studentId: { in: huerfanos } } });
    const re = await prisma.student.deleteMany({ where: { id: { in: huerfanos } } });
    console.log(`    estudiantes        : ${re.count}`);
  }

  let archivos = 0;
  const minio = clienteMinio();
  if (minio && claves.length) {
    try { await minio.removeObjects(BUCKET, claves); archivos = claves.length; }
    catch (e) { console.log(`    aviso: MinIO no respondió (${e.message})`); }
  }
  console.log(`    archivos retirados : ${archivos}${minio ? '' : ' (almacén desactivado)'}`);

  console.log(`\n  Listo. El período ${PERIODO} quedó limpio.\n`);
}

main()
  .catch((e) => { console.error('\nERROR:', e.message, '\n'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
