/**
 * Deja a los estudiantes de la demostración repartidos por TODOS los estados
 * del recorrido documental, de golpe.
 *
 * ── Para qué ──
 *
 * La demostración completa —importar, emitir oficios, subir actas, certificar,
 * firmar dos veces— lleva demasiado tiempo para hacerla entera delante del
 * tribunal. Con esto la pantalla ya enseña un cierre de período en marcha, y
 * se elige en vivo qué paso ejecutar de verdad.
 *
 * ── Los tres lotes de firma ──
 *
 * No basta con un lote: cada autoridad ve solo lo que le toca. Se siembran
 * tres para que las dos tengan trabajo pendiente al abrir sesión:
 *
 *   PENDING_DIRECTOR → lo ve el Responsable, es su turno
 *   PENDING_DEAN     → lo ve el Decano, el Responsable ya firmó
 *   COMPLETED        → historial, firmado por ambos
 *
 * ── Por qué todos llevan solicitud y designación ──
 *
 * El certificado exige una designación vigente. Sin ella, pulsar «emitir» ante
 * el tribunal devolvería un rechazo y la demostración se cortaría justo en el
 * momento que hay que lucir. Se siembran los dos oficios a todos.
 *
 * ── Qué NO hace ──
 *
 * No firma de verdad: los documentos marcados como firmados no llevan firma
 * criptográfica. Son un decorado. Para enseñar una firma real, usa uno de los
 * que quedan sin enviar y hazla con FirmaEC.
 *
 * Uso:  node demo/06-estados/sembrar-estados.cjs          ← simulacro
 *       node demo/06-estados/sembrar-estados.cjs --confirmar
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
const prisma = new PrismaClient();

const CONFIRMAR = process.argv.includes('--confirmar');
const PREFIJO = '13159000';

/**
 * El reparto, por posición en la lista ordenada por cédula: el resultado es
 * siempre el mismo y se puede ensayar.
 */
const REPARTO = [
  { hasta: 4,  estado: 'SIN_ACTA',         rotulo: 'Solo les falta el acta · punto gris' },
  { hasta: 8,  estado: 'LISTO',            rotulo: 'Acta y designación · SE PUEDE CERTIFICAR EN VIVO' },
  { hasta: 11, estado: 'CERTIFICADO',      rotulo: 'Certificado emitido, sin enviar a firma' },
  { hasta: 14, estado: 'PARA_RESPONSABLE', rotulo: 'Esperando al RESPONSABLE · es su turno' },
  { hasta: 17, estado: 'PARA_DECANO',      rotulo: 'Esperando al DECANO · el Responsable ya firmó' },
  { hasta: 20, estado: 'FIRMADO',          rotulo: 'Firmado por ambos · FINALIZADA' },
];

const ahora = new Date();
const hace = (dias) => new Date(ahora.getTime() - dias * 86400000);
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

async function main() {
  const periodo = await prisma.academicPeriod.findFirst({ where: { isActive: true } });
  if (!periodo) throw new Error('No hay período activo.');

  const practicas = await prisma.practice.findMany({
    where: { academicPeriod: periodo.code, student: { dni: { startsWith: PREFIJO } } },
    include: { student: { select: { id: true, dni: true, firstName: true, lastName: true } } },
    orderBy: { student: { dni: 'asc' } },
  });

  console.log(`\n${'='.repeat(66)}`);
  console.log(`  ${CONFIRMAR ? 'SEMBRANDO' : 'SIMULACRO — no se toca nada'}`);
  console.log(`  Período ${periodo.code} · ${practicas.length} estudiantes de la demostración`);
  console.log(`${'='.repeat(66)}\n`);

  if (practicas.length === 0) {
    console.log('  No hay estudiantes de la demostración. Importa primero el Excel.\n');
    return;
  }

  const plan = practicas.map((p, i) => ({
    practica: p,
    estado: (REPARTO.find((r) => i < r.hasta) || REPARTO[REPARTO.length - 1]).estado,
  }));

  for (const r of REPARTO) {
    const n = plan.filter((x) => x.estado === r.estado).length;
    if (n) console.log(`  ${String(n).padStart(2)} · ${r.rotulo}`);
  }

  if (!CONFIRMAR) {
    console.log('\n  ── Simulacro. Para sembrarlo de verdad: ──');
    console.log('\n     node demo/06-estados/sembrar-estados.cjs --confirmar\n');
    return;
  }

  const pdfTpl = await prisma.documentTemplate.findFirst({ where: { type: 'PDF', deletedAt: null } });
  if (!pdfTpl) throw new Error('No hay plantilla PDF de certificado. Súbela primero.');
  const docxTpl = await prisma.documentTemplate.findFirst({ where: { type: 'DOCX', deletedAt: null } });
  if (!docxTpl) throw new Error('No hay plantilla DOCX de oficios. Súbela primero.');

  const emisor = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'COORDINATOR'] } } });
  if (!emisor) throw new Error('No hay ningún usuario ADMIN o COORDINATOR.');

  console.log('\n  Sembrando...\n');

  // ── Se parte de cero ──
  const ids = practicas.map((p) => p.studentId);
  await prisma.signatureBatchItem.deleteMany({ where: { document: { studentId: { in: ids } } } });
  await prisma.generatedDocument.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.signatureBatch.deleteMany({ where: { code: { startsWith: `LOTE-${periodo.code}-DEMO` } } });

  // ── El acta: todos menos el primer grupo ──
  const conActa = plan.filter((x) => x.estado !== 'SIN_ACTA').map((x) => x.practica.id);
  const sinActa = plan.filter((x) => x.estado === 'SIN_ACTA').map((x) => x.practica.id);
  await prisma.practice.updateMany({ where: { id: { in: conActa } }, data: { tutorApprovedAt: hace(6) } });
  await prisma.practice.updateMany({ where: { id: { in: sinActa } }, data: { tutorApprovedAt: null } });
  console.log(`    acta del docente   : ${conActa.length} con acta · ${sinActa.length} sin ella`);

  // ── Solicitud y designación para TODOS ──
  //
  // El certificado exige designación vigente. Sin ella, «emitir» devolvería un
  // rechazo delante del tribunal, que es el peor sitio para descubrirlo.
  let nOficio = 0;
  for (const { practica } of plan) {
    const ape = sinTildes(practica.student.lastName.split(' ')[0]);
    for (const tipo of ['SOLICITUD', 'DESIGNACION']) {
      nOficio += 1;
      const abbr = tipo === 'SOLICITUD' ? 'SPP' : 'DES';
      await prisma.generatedDocument.create({
        data: {
          templateId: docxTpl.id,
          studentId: practica.studentId,
          generatedById: emisor.id,
          documentCode: `${String(nOficio).padStart(3, '0')}-TI-${abbr}-${periodo.code}`,
          documentType: tipo,
          fileUrl: `${periodo.code}/${tipo}/${abbr}-${ape}.docx`,
          status: 'VALID',
          signatureStatus: 'NONE',
          createdAt: hace(10),
        },
      });
    }
  }
  console.log(`    oficios            : ${nOficio} (solicitud y designación para los ${plan.length})`);

  // ── Un lote por cada punto del circuito ──
  const crearLote = async (sufijo, nombre, estado, extra) => prisma.signatureBatch.create({
    data: {
      code: `LOTE-${periodo.code}-DEMO-${sufijo}`,
      name: nombre,
      status: estado,
      createdById: emisor.id,
      createdAt: hace(4),
      ...extra,
    },
  });

  const lotes = {
    PARA_RESPONSABLE: await crearLote('A', 'Pendiente del Responsable', 'PENDING_DIRECTOR', {}),
    PARA_DECANO: await crearLote('B', 'Pendiente del Decano', 'PENDING_DEAN', { directorSignedAt: hace(2) }),
    FIRMADO: await crearLote('C', 'Completado', 'COMPLETED', { directorSignedAt: hace(2), deanSignedAt: hace(1) }),
  };
  console.log('    lotes de firma     : A pendiente del Responsable · B del Decano · C completado');

  // ── Los certificados ──
  const FIRMA = {
    CERTIFICADO: 'NONE',
    PARA_RESPONSABLE: 'IN_SIGNING',
    PARA_DECANO: 'PARTIALLY_SIGNED',
    FIRMADO: 'SIGNED',
  };
  const ITEM = {
    PARA_RESPONSABLE: 'PENDING',
    PARA_DECANO: 'SIGNED_BY_DIRECTOR',
    FIRMADO: 'SIGNED',
  };

  let n = 0;
  for (const { practica, estado } of plan) {
    if (!FIRMA[estado]) continue;   // sin acta, o listo para certificar en vivo
    n += 1;
    const codigo = `${String(n).padStart(5, '0')}-TI-CERT-${periodo.code}`;
    const ape = sinTildes(practica.student.lastName.split(' ')[0]);
    const firmado = estado === 'FIRMADO';

    const doc = await prisma.generatedDocument.create({
      data: {
        templateId: pdfTpl.id,
        studentId: practica.studentId,
        generatedById: emisor.id,
        fileUrl: `${periodo.code}/CERTIFICADO/${codigo}-${ape}.pdf`,
        documentCode: codigo,
        documentType: 'CERTIFICADO',
        status: 'VALID',
        signatureStatus: FIRMA[estado],
        signedAt: firmado ? hace(1) : null,
        signedFileKey: firmado ? `${periodo.code}/FIRMADOS/${codigo}-${ape}.pdf` : null,
        createdAt: hace(4),
      },
    });

    const lote = lotes[estado];
    if (lote && ITEM[estado]) {
      await prisma.signatureBatchItem.create({
        data: {
          batchId: lote.id,
          documentId: doc.id,
          status: ITEM[estado],
          directorSignedById: estado === 'PARA_RESPONSABLE' ? null : emisor.id,
          deanSignedById: firmado ? emisor.id : null,
          finalSignedById: firmado ? emisor.id : null,
        },
      });
    }
  }
  console.log(`    certificados       : ${n}`);

  console.log('\n  Listo. Recarga las pantallas.\n');
  for (const r of REPARTO) {
    const c = plan.filter((x) => x.estado === r.estado).length;
    if (c) console.log(`      ${String(c).padStart(2)} · ${r.rotulo}`);
  }
  console.log('\n  Las firmas son decorado, no son criptográficas. Para enseñar una');
  console.log('  firma real usa uno de los que quedan sin enviar, con FirmaEC.\n');
}

main()
  .catch((e) => { console.error('\nERROR:', e.message, '\n'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
