/**
 * Genera las 3 diapositivas de resultados de rendimiento (1920×1080).
 *
 * Cada una lleva una "zona de animación": un recuadro 16:9 donde se incrusta el
 * fotograma inicial de la animación correspondiente, para que la diapositiva se
 * vea completa. En Canva, encima de esa zona se superpone el vídeo de la animación.
 *
 * Cifras reales de la prueba del 2026-08-24 (benchmarks/evidencia/prueba-124-2026-08-24.txt):
 *   124 certificados · 0 fallidos · 512,73 s (8 min 33 s) · 4,1 s/certificado.
 *
 * Uso (desde la raíz del repo, donde vive `sharp`):
 *   node docs/diapositivas-resultados/construir.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PNG = path.join(__dirname, '..', 'animaciones-svg', 'png');
const b64 = (archivo) =>
  'data:image/png;base64,' + fs.readFileSync(path.join(PNG, archivo)).toString('base64');

const C = {
  bg: '#FFFFFF', navy: '#0F172A', blue: '#2563EB', blueLight: '#DBEAFE',
  gray: '#CBD5E1', grayText: '#64748B', amber: '#B45309', amberBg: '#FEF3C7',
  greenBg: '#DCFCE7', green: '#15803D', zona: '#F1F5F9',
};
const FONT = 'Arial, Helvetica, sans-serif';

/** Cabecera común: filete azul, eyebrow y título. */
function cabecera(eyebrow, titulo, subtitulo) {
  return `
    <rect x="80" y="86" width="72" height="8" rx="4" fill="${C.blue}"/>
    <text x="168" y="100" font-family="${FONT}" font-size="26" font-weight="700"
          letter-spacing="6" fill="${C.blue}">${eyebrow}</text>
    <text x="80" y="176" font-family="${FONT}" font-size="72" font-weight="800"
          fill="${C.navy}">${titulo}</text>
    ${subtitulo ? `<text x="80" y="224" font-family="${FONT}" font-size="30"
          fill="${C.grayText}">${subtitulo}</text>` : ''}`;
}

/** Zona donde el usuario superpone el vídeo de la animación. */
function zonaAnimacion(x, y, w, h, img) {
  const alto = w * 9 / 16;
  const yImg = y + (h - alto) / 2;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${C.zona}"/>
    <image x="${x}" y="${yImg}" width="${w}" height="${alto}" href="${img}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${x + 24}" y="${y + h - 22}" font-family="${FONT}" font-size="20"
          letter-spacing="3" fill="${C.gray}">ANIMACIÓN</text>`;
}

// ── DIAPOSITIVA 1 · El impacto ────────────────────────────────────────────────
//
// La columna izquierda mantiene su animación (menor altura) y suma la mini-tabla
// de 6 hitos reales de la corrida del 24-ago-2026, para que no sea todo texto
// grande sin dato subyacente.
const hitos = [
  [ 0.04, 0,   0,   'Encolado del lote'],
  [ 151.21, 28, 23,  ''],
  [ 240.11, 50, 40,  ''],
  [ 345.43, 75, 60,  ''],
  [ 429.54, 100, 81, ''],
  [ 512.73, 124, 100, 'Último certificado'],
];
const anchoMini = 860;
const xMini = 80;
const yMini = 700;
const yEncab = yMini + 44;
const anchoCol = [150, 175, 170, 300];   // t / gen / % / nota
const col0 = xMini + 24;
const col1 = col0 + anchoCol[0];
const col2 = col1 + anchoCol[1];
const col3 = col2 + anchoCol[2];
const filasHitos = hitos.map((h, i) => {
  const y = yEncab + 42 + i * 34;
  return `
    <text x="${col0}" y="${y}" font-family="${FONT}" font-size="22" fill="${C.navy}">${h[0].toFixed(2)} s</text>
    <text x="${col1}" y="${y}" font-family="${FONT}" font-size="22" font-weight="700" fill="${C.navy}">${h[1]}</text>
    <text x="${col2}" y="${y}" font-family="${FONT}" font-size="22" fill="${C.blue}">${h[2]} %</text>
    <text x="${col3}" y="${y}" font-family="${FONT}" font-size="22" fill="${C.grayText}">${h[3]}</text>`;
}).join('');

const slide1 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <title>Resultados — el impacto en cifras</title>
  <rect width="1920" height="1080" fill="${C.bg}"/>
  ${cabecera('CAPÍTULO V · RESULTADOS', 'El impacto en cifras', 'Emisión de un cierre de período completo: 124 certificados')}

  ${zonaAnimacion(80, 300, 860, 380, b64('05-antes-despues-inicio.png'))}

  <!-- Mini-tabla de hitos reales de la corrida -->
  <rect x="${xMini}" y="${yMini}" width="${anchoMini}" height="290" rx="16" fill="${C.zona}"/>
  <text x="${col0}" y="${yMini + 34}" font-family="${FONT}" font-size="22" font-weight="700"
        letter-spacing="4" fill="${C.blue}">AVANCE REAL DE LA CORRIDA · 24-AGO-2026</text>
  <text x="${col0}" y="${yEncab + 12}" font-family="${FONT}" font-size="18" letter-spacing="2" fill="${C.grayText}">TIEMPO</text>
  <text x="${col1}" y="${yEncab + 12}" font-family="${FONT}" font-size="18" letter-spacing="2" fill="${C.grayText}">GENERADOS</text>
  <text x="${col2}" y="${yEncab + 12}" font-family="${FONT}" font-size="18" letter-spacing="2" fill="${C.grayText}">PROGRESO</text>
  <text x="${col3}" y="${yEncab + 12}" font-family="${FONT}" font-size="18" letter-spacing="2" fill="${C.grayText}">HITO</text>
  <line x1="${col0}" y1="${yEncab + 22}" x2="${xMini + anchoMini - 24}" y2="${yEncab + 22}" stroke="${C.gray}" stroke-width="1"/>
  ${filasHitos}

  <!-- Tarjeta ANTES -->
  <rect x="990" y="300" width="850" height="200" rx="20" fill="${C.amberBg}"/>
  <text x="1024" y="356" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="4" fill="${C.amber}">ANTES · PROCESO MANUAL</text>
  <text x="1024" y="440" font-family="${FONT}" font-size="76" font-weight="800" fill="${C.navy}">12 h 24 min</text>
  <text x="1520" y="440" font-family="${FONT}" font-size="30" fill="${C.grayText}">6 min × 124</text>
  <text x="1024" y="480" font-family="${FONT}" font-size="26" fill="${C.grayText}">≈ un día y medio de trabajo de una sola persona</text>

  <!-- Tarjeta AHORA -->
  <rect x="990" y="524" width="850" height="200" rx="20" fill="${C.greenBg}"/>
  <text x="1024" y="580" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="4" fill="${C.green}">AHORA · UNIBRIDGE</text>
  <text x="1024" y="664" font-family="${FONT}" font-size="76" font-weight="800" fill="${C.navy}">8 min 33 s</text>
  <text x="1520" y="664" font-family="${FONT}" font-size="30" fill="${C.grayText}">124 en lote</text>
  <text x="1024" y="704" font-family="${FONT}" font-size="26" fill="${C.grayText}">0 errores · un solo operador · trazabilidad completa</text>

  <!-- Banner del factor -->
  <rect x="990" y="748" width="850" height="172" rx="20" fill="${C.blue}"/>
  <text x="1415" y="838" font-family="${FONT}" font-size="96" font-weight="800" fill="#FFFFFF" text-anchor="middle">87× más rápido</text>
  <text x="1415" y="884" font-family="${FONT}" font-size="26" fill="${C.blueLight}" text-anchor="middle">mismo volumen, sin transcripción manual</text>

  <text x="80" y="1010" font-family="${FONT}" font-size="24" fill="${C.grayText}">Simulación de un cierre de período. 124 = volumen real del período 2025-1 (registros institucionales, apartado 3.9.1).</text>
</svg>`;

// ── DIAPOSITIVA 2 · Por qué minutos y no milisegundos ─────────────────────────
const pasos = [
  ['1', 'Consulta a PostgreSQL', 'Estudiante, empresa, tutor, autoridades, horas y acta de calificaciones'],
  ['2', 'Numeración correlativa', 'Reserva un código único por período con bloqueo transaccional'],
  ['3', 'Renderiza el PDF oficial', 'Dibuja el certificado con sus datos y firmas (motor pdf-lib)'],
  ['4', 'Almacena en MinIO', 'Sube el PDF compilado al servidor de objetos (almacenamiento S3)'],
  ['5', 'Registra la auditoría', 'Guarda el registro del documento con estado VALID en la base'],
  ['6', 'Cola BullMQ', 'Coordina la concurrencia: 4 certificados en paralelo sin saturar el equipo'],
];
const filasPasos = pasos.map((p, i) => {
  const y = 320 + i * 108;
  return `
    <circle cx="1024" cy="${y}" r="30" fill="${C.blue}"/>
    <text x="1024" y="${y + 11}" font-family="${FONT}" font-size="32" font-weight="800" fill="#FFFFFF" text-anchor="middle">${p[0]}</text>
    <text x="1080" y="${y - 4}" font-family="${FONT}" font-size="32" font-weight="700" fill="${C.navy}">${p[1]}</text>
    <text x="1080" y="${y + 32}" font-family="${FONT}" font-size="24" fill="${C.grayText}">${p[2]}</text>`;
}).join('');

const slide2 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <title>Resultados — no es un PDF, es un trámite oficial</title>
  <rect width="1920" height="1080" fill="${C.bg}"/>
  ${cabecera('CAPÍTULO V · RESULTADOS', 'No es un PDF: es un trámite oficial', 'Por qué cada certificado toma segundos y no milisegundos')}

  ${zonaAnimacion(80, 320, 840, 560, b64('08-arquitectura-capas-inicio.png'))}

  ${filasPasos}

  <rect x="80" y="924" width="1760" height="76" rx="16" fill="${C.blueLight}"/>
  <text x="112" y="971" font-family="${FONT}" font-size="26" fill="${C.navy}">Un generador web corriente hace solo el paso 3 (~10 ms). UniBridge ejecuta los seis, con trazabilidad y verificación.</text>
</svg>`;

// ── DIAPOSITIVA 3 · Proyección ────────────────────────────────────────────────
const slide3 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <title>Resultados — proyección en servidor dedicado</title>
  <rect width="1920" height="1080" fill="${C.bg}"/>
  ${cabecera('CAPÍTULO V · RESULTADOS', 'Y esto es en una laptop', 'El resultado medido es un piso, no un techo')}

  ${zonaAnimacion(80, 320, 840, 560, b64('07-anillo-progreso-inicio.png'))}

  <!-- Medido en -->
  <rect x="990" y="320" width="850" height="230" rx="20" fill="${C.zona}"/>
  <text x="1024" y="376" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="4" fill="${C.grayText}">MEDIDO EN</text>
  <text x="1024" y="432" font-family="${FONT}" font-size="34" font-weight="700" fill="${C.navy}">Laptop AMD Ryzen 3 3250U</text>
  <text x="1024" y="476" font-family="${FONT}" font-size="26" fill="${C.grayText}">4 hilos · 14 GB RAM · Docker sobre Windows</text>
  <text x="1024" y="514" font-family="${FONT}" font-size="26" fill="${C.grayText}">con escritura a disco virtualizado (sobrecarga extra)</text>

  <!-- Proyeccion -->
  <rect x="990" y="574" width="850" height="230" rx="20" fill="${C.blue}"/>
  <text x="1024" y="630" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="4" fill="${C.blueLight}">EN UN SERVIDOR DEDICADO (LINUX, SSD)</text>
  <text x="1024" y="712" font-family="${FONT}" font-size="72" font-weight="800" fill="#FFFFFF">≈ 2 minutos</text>
  <text x="1024" y="758" font-family="${FONT}" font-size="26" fill="${C.blueLight}">los 124 certificados · estimación conservadora de 3 a 5×</text>

  <rect x="990" y="828" width="850" height="92" rx="16" fill="${C.greenBg}"/>
  <text x="1024" y="884" font-family="${FONT}" font-size="27" font-weight="700" fill="${C.green}">Aun en el peor hardware, ya supera 87× al proceso manual.</text>

  <text x="80" y="1010" font-family="${FONT}" font-size="24" fill="${C.grayText}">La proyección es una estimación, no una medición: el cuello de botella actual es la escritura a disco virtualizado, que un servidor dedicado elimina.</text>
</svg>`;

// ── DIAPOSITIVA 0 · Contexto de la medición ───────────────────────────────────
//
// Va ANTES de las tres anteriores para dejar claro qué se midió y en qué
// condiciones antes de mostrar el resultado. La animación ocupa una columna
// estrecha (1/3) y el resto es tabla de ejecución + alcance.
const filasTabla = [
  ['Volumen del lote', '124 certificados', 'Igual al cierre real 2025-1 (registros institucionales)'],
  ['Período de la prueba', '2024-1', 'Período vacío del sistema, activado para la simulación'],
  ['Estudiantes sembrados', '124', 'Con práctica completa y acta del docente aprobada'],
  ['Motor de generación', 'pdf-lib', 'Renderiza el PDF; almacenamiento en MinIO (S3)'],
  ['Cola de procesamiento', 'BullMQ · Redis', '4 certificados en paralelo, con reintentos automáticos'],
  ['Equipo', 'Ryzen 3 3250U', '4 hilos · 14 GB RAM · Docker sobre Windows 11'],
  ['Fecha de la medición', '24 de agosto de 2026', 'Corrida única, sin repeticiones descartadas'],
];
const anchoTabla = 1160;   // ocupa 2/3 de la anchura util
const xTabla = 620;
const yTabla = 340;
const altoFila = 62;
const colEt = xTabla + 24;
const colVal = xTabla + 350;
const colDet = xTabla + 620;
const filasTablaSvg = filasTabla.map((f, i) => {
  const y = yTabla + 70 + i * altoFila;
  const fondo = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
  return `
    <rect x="${xTabla}" y="${y - 42}" width="${anchoTabla}" height="${altoFila}" fill="${fondo}"/>
    <text x="${colEt}" y="${y}" font-family="${FONT}" font-size="22" fill="${C.grayText}">${f[0]}</text>
    <text x="${colVal}" y="${y}" font-family="${FONT}" font-size="24" font-weight="700" fill="${C.navy}">${f[1]}</text>
    <text x="${colDet}" y="${y}" font-family="${FONT}" font-size="22" fill="${C.grayText}">${f[2]}</text>`;
}).join('');

const slide0 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <title>Resultados — contexto de la medición</title>
  <rect width="1920" height="1080" fill="${C.bg}"/>
  ${cabecera('CAPÍTULO V · RESULTADOS', 'Simulación de un cierre de período', 'Cómo se midió el tiempo real de emisión de 124 certificados')}

  ${zonaAnimacion(80, 320, 500, 500, b64('06-embudo-excel-inicio.png'))}

  <!-- Tabla de ejecucion (2/3 de la anchura) -->
  <text x="${xTabla}" y="${yTabla}" font-family="${FONT}" font-size="26" font-weight="700"
        letter-spacing="4" fill="${C.blue}">CONFIGURACIÓN DE LA CORRIDA</text>
  <rect x="${xTabla}" y="${yTabla + 20}" width="${anchoTabla}" height="${altoFila * filasTabla.length}"
        rx="16" fill="none" stroke="${C.gray}" stroke-width="2"/>
  ${filasTablaSvg}

  <!-- Alcance de la medicion, resumido -->
  <rect x="80" y="856" width="1760" height="120" rx="16" fill="${C.blueLight}"/>
  <text x="112" y="898" font-family="${FONT}" font-size="24" font-weight="700"
        letter-spacing="4" fill="${C.blue}">ALCANCE DE LA MEDICIÓN</text>
  <text x="112" y="936" font-family="${FONT}" font-size="24" fill="${C.navy}">
    Se cronometra desde que el lote se encola hasta que el último certificado queda generado y almacenado.
  </text>
  <text x="112" y="966" font-family="${FONT}" font-size="24" fill="${C.navy}">
    No incluye el tiempo humano de seleccionar los estudiantes ni de revisar el resultado.
  </text>

  <text x="80" y="1030" font-family="${FONT}" font-size="22" fill="${C.grayText}">
    Los 6 min del proceso manual son el dato declarado por la responsable en la entrevista (Anexo A · pregunta 2) para el mejor caso, «cuando todo está en orden».
  </text>
</svg>`;

const slides = [
  ['resultados-0-contexto', slide0],
  ['resultados-1-impacto', slide1],
  ['resultados-2-porque', slide2],
  ['resultados-3-proyeccion', slide3],
];

(async () => {
  for (const [nombre, svg] of slides) {
    fs.writeFileSync(path.join(__dirname, `${nombre}.svg`), svg);
    await sharp(Buffer.from(svg)).png().toFile(path.join(__dirname, `${nombre}.png`));
    console.log('->', nombre + '.png');
  }
})().catch((e) => { console.error(e); process.exit(1); });
