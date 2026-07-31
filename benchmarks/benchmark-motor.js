/**
 * Benchmark aislado del motor de renderizado de certificados (pdf-lib).
 *
 * A diferencia de benchmark-cola.js, no requiere la base de datos, la cola ni el
 * almacén de objetos: mide únicamente el tiempo que tarda el motor en producir
 * el PDF a partir de la plantilla, que es lo que cambió con la migración desde
 * Puppeteer. Sirve, por tanto, para comparar motores en igualdad de condiciones.
 *
 * Uso:  node benchmarks/benchmark-motor.js [N]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const N = parseInt(process.argv[2] || '50', 10);
const DIST = path.join(__dirname, '..', 'apps', 'api', 'dist', 'src', 'modules', 'document-engine', 'pdf.driver.js');

if (!fs.existsSync(DIST)) {
  console.error('Falta el motor compilado. Ejecuta antes:  npm run build -w @ppp/api');
  process.exit(1);
}
const { PdfDriver } = require(DIST);

// Misma plantilla que siembra seed.ts, sin la imagen de fondo (el disco no
// influye en la comparación de motores y evita depender de un archivo local).
const PLANTILLA = {
  width: 1123,
  height: 794,
  elements: [
    { type: 'text', content: 'LA FACULTAD DE CIENCIAS DE LA VIDA Y TECNOLOGÍAS', x: 0, y: 180, fontSize: 22, fontFamily: 'Arial', fontWeight: 'bold', textAlign: 'center', color: '#000000', width: 1123 },
    { type: 'text', content: 'CONFIERE EL PRESENTE CERTIFICADO A:', x: 0, y: 230, fontSize: 16, fontFamily: 'Arial', textAlign: 'center', color: '#444444', width: 1123 },
    { type: 'text', content: '{{studentName}}', x: 0, y: 280, fontSize: 32, fontFamily: 'Arial', fontWeight: 'bold', textAlign: 'center', color: '#000000', width: 1123 },
    { type: 'text', content: 'Por haber culminado satisfactoriamente las {{totalHours}} horas de Prácticas Preprofesionales correspondientes a "{{practiceLevel}} ({{academicLevel}})", realizadas en la empresa {{companyName}} y supervisadas por el tutor {{tutorName}}, en el periodo académico {{academicPeriod}}.', x: 120, y: 380, fontSize: 18, fontFamily: 'Arial', textAlign: 'justify', color: '#333333', width: 883 },
    { type: 'text', content: 'Manta, {{currentDate}}', x: 120, y: 520, fontSize: 16, fontFamily: 'Arial', textAlign: 'left', color: '#000000', width: 883 },
    { type: 'text', content: '___________________________\nIng. Jorge Luis Palma Macías, PhD\nDECANO DE LA FACULTAD', x: 200, y: 650, fontSize: 14, fontFamily: 'Arial', fontWeight: 'bold', textAlign: 'center', color: '#000000', width: 300 },
    { type: 'text', content: '___________________________\nIng. Gina Alexandra Zambrano Loor, Mg.\nRESPONSABLE DE PRÁCTICAS', x: 623, y: 650, fontSize: 14, fontFamily: 'Arial', fontWeight: 'bold', textAlign: 'center', color: '#000000', width: 300 },
  ],
};

const datos = (i) => ({
  studentName: `Estudiante de Prueba ${String(i).padStart(3, '0')}`,
  totalHours: '240',
  practiceLevel: 'PRÁCTICAS LABORALES II',
  academicLevel: 'OCTAVO NIVEL',
  companyName: 'Empresa Receptora S.A.',
  tutorName: 'Ing. Tutor Académico, Mg.',
  academicPeriod: '2026-1',
  currentDate: new Date().toLocaleDateString('es-EC'),
});

(async () => {
  const driver = new PdfDriver();
  const dir = path.join(os.tmpdir(), 'benchmark-motor');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  console.log(`Motor: pdf-lib   ·   documentos: ${N}`);

  // Primera ejecución aparte: refleja el costo de arranque en frío.
  const tFrio = process.hrtime.bigint();
  await driver.generatePdf(PLANTILLA, datos(0), path.join(dir, 'calentamiento.pdf'));
  const frioMs = Number(process.hrtime.bigint() - tFrio) / 1e6;

  const tiempos = [];
  const t0 = process.hrtime.bigint();
  for (let i = 1; i <= N; i++) {
    const ti = process.hrtime.bigint();
    await driver.generatePdf(PLANTILLA, datos(i), path.join(dir, `cert-${i}.pdf`));
    tiempos.push(Number(process.hrtime.bigint() - ti) / 1e6);
    if (i % 10 === 0) process.stdout.write(`\r  generados ${i}/${N}   `);
  }
  const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const orden = [...tiempos].sort((a, b) => a - b);
  const pct = (p) => orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
  const tamanos = fs.readdirSync(dir).map((f) => fs.statSync(path.join(dir, f)).size);
  const pesoMedio = tamanos.reduce((a, b) => a + b, 0) / tamanos.length;

  const res = {
    fecha: new Date().toISOString(),
    motor: 'pdf-lib',
    documentos: N,
    arranque_frio_ms: +frioMs.toFixed(2),
    total_s: +(totalMs / 1000).toFixed(3),
    ms_por_documento: +(totalMs / N).toFixed(2),
    docs_por_segundo: +(N / (totalMs / 1000)).toFixed(1),
    minimo_ms: +orden[0].toFixed(2),
    mediana_ms: +pct(50).toFixed(2),
    p95_ms: +pct(95).toFixed(2),
    maximo_ms: +orden[orden.length - 1].toFixed(2),
    peso_medio_kb: +(pesoMedio / 1024).toFixed(1),
    memoria_pico_mb: +(process.memoryUsage().heapUsed / 1048576).toFixed(1),
    entorno: {
      node: process.version,
      plataforma: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model?.trim(),
      nucleos: os.cpus().length,
      ram_gb: +(os.totalmem() / 1073741824).toFixed(1),
    },
  };

  const out = path.join(__dirname, `motor-pdflib-${N}.json`);
  fs.writeFileSync(out, JSON.stringify(res, null, 2));
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`\n\n═══ MOTOR pdf-lib · ${N} certificados ═══`);
  console.log(`  Arranque en frío : ${res.arranque_frio_ms} ms`);
  console.log(`  Tiempo total     : ${res.total_s} s`);
  console.log(`  Por documento    : ${res.ms_por_documento} ms   (mediana ${res.mediana_ms} ms, p95 ${res.p95_ms} ms)`);
  console.log(`  Rendimiento      : ${res.docs_por_segundo} documentos/s`);
  console.log(`  Peso medio       : ${res.peso_medio_kb} KB por certificado`);
  console.log(`  Memoria del heap : ${res.memoria_pico_mb} MB`);
  console.log(`  Guardado en      : ${path.basename(out)}`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
