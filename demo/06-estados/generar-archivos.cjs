/**
 * Produce los ARCHIVOS de los documentos que `sembrar-estados.cjs` registró.
 *
 * ── Por qué hace falta ──
 *
 * El sembrador escribe las filas en la base, que es lo que pinta la pantalla:
 * los estados, los puntos verdes, los lotes de firma. Pero un documento son
 * dos cosas —la fila y el archivo—, y sin el archivo el visor falla con un
 * «No se pudo descargar el documento» que delata el montaje.
 *
 * ── Cómo los genera ──
 *
 * Con el MISMO motor que usa la aplicación: `pdf.driver` y `docx.driver`
 * compilados en `apps/api/dist`. No se reimplementa nada ni se fabrican PDF
 * de mentira. Un certificado sembrado se abre y se ve igual que uno emitido
 * de verdad, porque lo produce el mismo código y la misma plantilla.
 *
 * Si `dist/` no existe o está viejo:  cd apps/api && npx nest build
 *
 * Uso:  node demo/06-estados/generar-archivos.cjs
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
const { Client } = require(path.join(RAIZ, 'node_modules', 'minio'));

const DIST = path.join(RAIZ, 'apps', 'api', 'dist', 'src', 'modules', 'document-engine');
if (!fs.existsSync(path.join(DIST, 'pdf.driver.js'))) {
  console.error('\n  Falta el motor compilado. Ejecuta antes:\n');
  console.error('     cd apps/api && npx nest build\n');
  process.exit(1);
}
const { PdfDriver } = require(path.join(DIST, 'pdf.driver.js'));
const { DocxDriver } = require(path.join(DIST, 'docx.driver.js'));

const prisma = new PrismaClient();
const BUCKET = 'unibridge-documents';
const PREFIJO = '13159000';

const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const pdfDriver = new PdfDriver();
const docxDriver = new DocxDriver();

/** El fondo del certificado vive aparte; pdf-lib lo necesita incrustado. */
async function conFondo(tpl) {
  const bg = tpl?.background;
  if (typeof bg !== 'string' || !bg || bg.startsWith('data:image')) return tpl;
  const m = bg.match(/(templates\/backgrounds\/[^\?#]+)/);
  const key = m ? m[1] : (bg.startsWith('templates/') ? bg : null);
  if (!key) return tpl;
  try {
    const trozos = [];
    const flujo = await minio.getObject(BUCKET, key);
    for await (const t of flujo) trozos.push(t);
    const buf = Buffer.concat(trozos);
    const ext = (key.match(/\.(jpg|jpeg|png|webp|gif)$/i) || [, 'png'])[1].toLowerCase();
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
    return { ...tpl, background: `data:${mime};base64,${buf.toString('base64')}` };
  } catch {
    return tpl;   // sin membrete antes que sin documento
  }
}

async function main() {
  const periodo = await prisma.academicPeriod.findFirst({ where: { isActive: true } });
  if (!periodo) throw new Error('No hay período activo.');

  const docs = await prisma.generatedDocument.findMany({
    where: { student: { dni: { startsWith: PREFIJO } }, status: 'VALID' },
    include: {
      template: true,
      student: { include: { program: true, faculty: true, practices: { include: { company: true } } } },
    },
    orderBy: { documentCode: 'asc' },
  });

  console.log(`\n  ${docs.length} documentos de la demostración por generar.\n`);
  if (docs.length === 0) return;

  const tmp = path.join(RAIZ, 'demo', '06-estados', '_tmp');
  fs.mkdirSync(tmp, { recursive: true });

  let hechos = 0, fallos = 0;
  for (const d of docs) {
    const est = d.student;
    const practica = est.practices.find((p) => p.academicPeriod === periodo.code) || est.practices[0];

    // Las mismas variables que inyecta el servicio al emitir de verdad.
    const datos = {
      documentCode: d.documentCode || '',
      studentName: `${est.firstName} ${est.lastName}`,
      studentDni: est.dni,
      programName: est.program?.name || 'N/A',
      facultyName: est.faculty?.name || 'N/A',
      companyName: practica?.company?.name || 'N/A',
      totalHours: String(practica?.totalHours ?? 0),
      tutorName: practica?.tutorName || 'N/A',
      practiceLevel: practica?.practiceLevel || 'N/A',
      academicLevel: practica?.academicLevel || 'N/A',
      academicPeriod: periodo.code,
      deanName: periodo.deanName || '',
      directorName: periodo.directorName || '',
      responsableName: periodo.directorName || '',
      responsablePracticasName: periodo.directorName || '',
      decanoName: periodo.deanName || '',
      currentDate: new Date().toLocaleDateString('es-ES'),
    };

    try {
      let buffer;
      if (d.template.type === 'PDF') {
        const tpl = await conFondo(d.template.content);
        buffer = Buffer.from(await pdfDriver.generatePdf(tpl, datos));
      } else {
        const cfg = d.template.content;
        const ruta = typeof cfg === 'string' ? cfg : (cfg?.path || '');
        let fuente = ruta;
        if (ruta.startsWith('templates/')) {
          const trozos = [];
          const flujo = await minio.getObject(BUCKET, ruta);
          for await (const t of flujo) trozos.push(t);
          fuente = Buffer.concat(trozos);
        }
        const salida = path.join(tmp, `${d.id}.docx`);
        await docxDriver.generateDocx(fuente, datos, salida);
        buffer = fs.readFileSync(salida);
        fs.unlinkSync(salida);
      }

      const tipo = d.template.type === 'PDF'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      await minio.putObject(BUCKET, d.fileUrl, buffer, buffer.length, { 'Content-Type': tipo });
      // Un certificado «firmado» apunta a otra clave: se sube el mismo archivo,
      // porque la firma sembrada es decorado y no cambia el contenido.
      if (d.signedFileKey) {
        await minio.putObject(BUCKET, d.signedFileKey, buffer, buffer.length, { 'Content-Type': tipo });
      }

      hechos += 1;
      process.stdout.write(`\r  generados ${hechos}/${docs.length}   `);
    } catch (e) {
      fallos += 1;
      console.log(`\n  FALLO en ${d.documentCode}: ${e.message}`);
    }
  }

  try { fs.rmdirSync(tmp); } catch {}
  console.log(`\n\n  Listo: ${hechos} archivos en el almacén${fallos ? `, ${fallos} fallaron` : ''}.\n`);
}

main()
  .catch((e) => { console.error('\nERROR:', e.message, '\n'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
