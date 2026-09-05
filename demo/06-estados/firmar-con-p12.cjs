/**
 * Pasa los certificados sembrados por el firmador REAL de la carpeta
 * `certificados-prueba/`, con sus certificados .p12 de ensayo.
 *
 * ── Por qué existe ──
 *
 * El sembrador marca certificados como firmados, pero el archivo que dejaba
 * era el PDF sin tocar: al abrirlo no había ni sello visible ni firma. Un
 * tribunal que abra ese documento ve un certificado cualquiera.
 *
 * Este script cierra ese hueco usando la herramienta que ya tenías: baja el
 * PDF del almacén, lo firma como Responsable, firma el resultado como Decano
 * —en ese orden, que es el que el sistema exige— y sube el archivo final.
 *
 * El resultado lleva el sello azul de FirmaEC con el nombre leído del propio
 * certificado, y una firma criptográfica de verdad. Lo único que no tiene es
 * una cadena de confianza reconocida: los .p12 son autofirmados, de prueba.
 *
 * Uso:  node demo/06-estados/firmar-con-p12.cjs             ← todos los firmados
 *       node demo/06-estados/firmar-con-p12.cjs 1315900018  ← solo esa cédula
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');
const ENV = path.join(RAIZ, 'apps', 'api', '.env');
if (fs.existsSync(ENV)) {
  for (const linea of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { PrismaClient } = require(path.join(RAIZ, 'node_modules', '@prisma/client'));
const { Client } = require(path.join(RAIZ, 'node_modules', 'minio'));

const prisma = new PrismaClient();
const BUCKET = 'unibridge-documents';
const FIRMADOR = path.join(RAIZ, 'certificados-prueba', 'firmar.js');
const CEDULA = process.argv.find((a) => /^\d{10}$/.test(a));

const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const bajar = async (clave) => {
  const trozos = [];
  const flujo = await minio.getObject(BUCKET, clave);
  for await (const t of flujo) trozos.push(t);
  return Buffer.concat(trozos);
};

/** Llama al firmador y devuelve la carpeta donde dejó el resultado. */
function firmar(carpeta, rol) {
  const r = spawnSync('node', [FIRMADOR, carpeta, '--como', rol], {
    cwd: RAIZ, encoding: 'utf8', shell: false,
  });
  if (r.status !== 0) {
    throw new Error(`el firmador falló como ${rol}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`);
  }
  const etiqueta = rol === 'responsable' ? 'Responsable' : 'Decano';
  return path.join(carpeta, `firmados (${etiqueta})`);
}

/** El único PDF que hay dentro de una carpeta. */
function unicoPdf(carpeta) {
  const f = fs.readdirSync(carpeta).filter((x) => x.toLowerCase().endsWith('.pdf'));
  if (f.length === 0) throw new Error(`el firmador no dejó ningún PDF en ${carpeta}`);
  return path.join(carpeta, f[0]);
}

async function main() {
  if (!fs.existsSync(FIRMADOR)) throw new Error('No encuentro certificados-prueba/firmar.js');

  const docs = await prisma.generatedDocument.findMany({
    where: {
      documentType: 'CERTIFICADO', signatureStatus: 'SIGNED', status: 'VALID',
      ...(CEDULA ? { student: { dni: CEDULA } } : { student: { dni: { startsWith: '13159000' } } }),
    },
    include: { student: { select: { dni: true, firstName: true, lastName: true } } },
    orderBy: { documentCode: 'asc' },
  });

  console.log(`\n  ${docs.length} certificado(s) por firmar${CEDULA ? ` · cédula ${CEDULA}` : ''}.\n`);
  if (docs.length === 0) { console.log('  Nada que hacer.\n'); return; }

  const trabajo = path.join(__dirname, '_firma');
  fs.rmSync(trabajo, { recursive: true, force: true });

  for (const d of docs) {
    const caja = path.join(trabajo, d.documentCode || d.id);
    fs.mkdirSync(caja, { recursive: true });

    const nombre = path.basename(d.fileUrl);
    fs.writeFileSync(path.join(caja, nombre), await bajar(d.fileUrl));

    console.log(`  ${d.student.dni}  ${d.student.lastName} ${d.student.firstName}`);
    console.log(`     ${d.documentCode}`);

    // El orden importa y es el que el sistema exige: responsable, luego decano.
    const tras1 = firmar(caja, 'responsable');
    console.log('     firmado por el Responsable');
    const tras2 = firmar(tras1, 'decano');
    console.log('     firmado por el Decano');

    const final = fs.readFileSync(unicoPdf(tras2));
    const clave = d.signedFileKey || d.fileUrl.replace('/CERTIFICADO/', '/FIRMADOS/');
    await minio.putObject(BUCKET, clave, final, final.length, { 'Content-Type': 'application/pdf' });
    if (!d.signedFileKey) {
      await prisma.generatedDocument.update({ where: { id: d.id }, data: { signedFileKey: clave } });
    }
    console.log(`     subido · ${(final.length / 1024).toFixed(0)} KB\n`);
  }

  fs.rmSync(trabajo, { recursive: true, force: true });
  console.log('  Listo. Los certificados llevan el sello visible de FirmaEC');
  console.log('  y la firma de las dos autoridades, con los .p12 de prueba.\n');
}

main()
  .catch((e) => { console.error('\nERROR:', e.message, '\n'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
