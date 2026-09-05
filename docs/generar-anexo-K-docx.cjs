/**
 * Genera el Anexo K en Word, listo para imprimir o pegar en la tesis.
 *
 * Arial 11 en todo el cuerpo, que es la regla fija del documento. Los títulos
 * usan los niveles de encabezado propios de Word para que la tabla de
 * contenidos los recoja sola, pero con Arial impuesto: los estilos de fábrica
 * traen Calibri y azul, y eso desentona con el resto de la tesis.
 *
 * Uso:  node docs/generar-anexo-K-docx.cjs
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
} = require(path.join(__dirname, '..', 'node_modules', 'docx'));

const FUENTE = 'Arial';
const TAM = 22;          // 11 pt (docx usa medios puntos)
const TAM_TABLA = 20;    // 10 pt dentro de las tablas
const INTERLINEADO = 360; // 1,5 líneas

/** Párrafo de cuerpo. `partes` admite tramos en negrita: ['texto', ['negrita', true]] */
function p(partes, opciones = {}) {
  const runs = (Array.isArray(partes) ? partes : [partes]).map((t) =>
    Array.isArray(t)
      ? new TextRun({ text: t[0], bold: !!t[1], font: FUENTE, size: opciones.size || TAM })
      : new TextRun({ text: t, font: FUENTE, size: opciones.size || TAM }));
  return new Paragraph({
    children: runs,
    alignment: opciones.alignment || AlignmentType.JUSTIFIED,
    spacing: { line: opciones.line || INTERLINEADO, after: opciones.after ?? 160 },
    indent: opciones.indent,
  });
}

/** Título con nivel de esquema, para que entre en la tabla de contenidos. */
function titulo(texto, nivel, tam) {
  return new Paragraph({
    heading: nivel,
    children: [new TextRun({ text: texto, bold: true, font: FUENTE, size: tam, color: '000000' })],
    spacing: { before: 280, after: 160, line: INTERLINEADO },
  });
}

/** Viñeta con su primera frase en negrita, como en el original. */
function vineta(destacado, resto) {
  return new Paragraph({
    children: [
      new TextRun({ text: destacado, bold: true, font: FUENTE, size: TAM }),
      new TextRun({ text: ' ' + resto, font: FUENTE, size: TAM }),
    ],
    bullet: { level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: INTERLINEADO, after: 120 },
  });
}

const BORDE = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };

function celda(texto, { negrita = false, cabecera = false, derecha = false, ancho } = {}) {
  return new TableCell({
    width: { size: ancho, type: WidthType.DXA },
    borders: BORDES,
    shading: cabecera ? { type: ShadingType.CLEAR, fill: 'EFEFEF' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: derecha ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { line: 240, after: 0 },
      children: [new TextRun({
        text: texto, bold: negrita || cabecera, font: FUENTE, size: TAM_TABLA,
      })],
    })],
  });
}

/** Tabla con anchos explícitos en DXA, en la tabla y en cada celda. */
function tabla(cabeceras, filas, anchos, alineacionDerecha = []) {
  const total = anchos.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    rows: [
      new TableRow({
        tableHeader: true,
        children: cabeceras.map((c, i) => celda(c, { cabecera: true, ancho: anchos[i] })),
      }),
      ...filas.map((fila) => new TableRow({
        children: fila.map((c, i) => celda(String(c), {
          ancho: anchos[i],
          derecha: alineacionDerecha.includes(i),
          negrita: String(c).startsWith('**'),
        })),
      })),
    ],
  });
}

const hijos = [];

// ── Título del anexo ──
hijos.push(titulo('Anexo K. Prueba de rendimiento de la emisión masiva de certificados',
  HeadingLevel.HEADING_1, 28));

hijos.push(p('Este anexo documenta una prueba complementaria a la validación funcional del Objetivo Específico 4. Su propósito no es verificar un requisito, sino dimensionar el desempeño real del sistema en el escenario operativo de mayor exigencia: la emisión de todos los certificados de un cierre de período.'));

// ── K.1 ──
hijos.push(titulo('K.1 Encaje con los objetivos y el planteamiento', HeadingLevel.HEADING_2, 24));
hijos.push(p('La investigación no formuló requisitos no funcionales cuantitativos, de modo que esta medición no se corresponde con un caso de prueba de la Tabla 15. Se la ejecutó porque el planteamiento del problema (apartado 1.4) atribuye al procedimiento manual una fricción operativa cuya magnitud solo puede apreciarse contrastando tiempos, y porque los impactos esperados (apartado 1.7) declaran expresamente la reducción de tareas repetitivas y la mejora del tiempo de respuesta como beneficios previstos. La medición operacionaliza esa previsión con una cifra observable, no la sustituye ni la extiende.'));

// ── K.2 ──
hijos.push(titulo('K.2 Diseño de la prueba', HeadingLevel.HEADING_2, 24));
hijos.push(p('Se simuló el cierre del período 2024-1 sembrando ciento veinticuatro estudiantes, cada uno con una práctica completa y con el acta de calificaciones aprobada por el docente, condiciones que exige el sistema para admitir la emisión del certificado. El número ciento veinticuatro no es arbitrario: es el volumen de certificados que la Comisión de Prácticas emitió realmente en el período 2025-1, según la carpeta compartida con los estudiantes que se describe en el apartado 3.9.1.'));
hijos.push(p('La medición se cronometra desde el momento en que el lote se encola hasta que el último certificado queda generado y almacenado en el servidor de objetos. El intervalo excluye el tiempo humano previo (selección de estudiantes y elección de la plantilla) y el posterior (revisión del resultado), de modo que la cifra que se reporta corresponde exclusivamente al trabajo del sistema. La corrida se ejecutó una sola vez, sin repeticiones descartadas.'));

// ── K.3 ──
hijos.push(titulo('K.3 Entorno de ejecución', HeadingLevel.HEADING_2, 24));
hijos.push(tabla(
  ['Componente', 'Configuración'],
  [
    ['Procesador', 'AMD Ryzen 3 3250U · 4 hilos'],
    ['Memoria', '14 GB'],
    ['Almacenamiento', 'HDD, con escritura virtualizada por Docker'],
    ['Sistema operativo', 'Windows 11 · Docker Desktop'],
    ['Node.js', 'v24.14.1'],
    ['Motor de generación', 'pdf-lib'],
    ['Cola de procesamiento', 'BullMQ sobre Redis, concurrencia 4'],
    ['Almacenamiento de objetos', 'MinIO (compatible S3)'],
    ['Fecha de la corrida', '24 de agosto de 2026'],
  ],
  [3000, 5400],
));
hijos.push(p('', { after: 160 }));
hijos.push(p('El equipo utilizado corresponde a una laptop de gama baja del año 2020, con disco mecánico y con la sobrecarga adicional de la capa de virtualización de Docker sobre Windows. Estas condiciones son deliberadamente conservadoras: la cifra que se reporta es un piso, no un techo (véase K.6).'));

// ── K.4 ──
hijos.push(titulo('K.4 Resultado', HeadingLevel.HEADING_2, 24));
hijos.push(p([
  'La cola procesó los ciento veinticuatro certificados en ',
  ['354,85 segundos (5 minutos 55 segundos), con cero fallos', true],
  '. El tiempo medio por certificado resultó de ',
  ['2,86 segundos', true],
  ' y el rendimiento sostenido, de 0,35 certificados por segundo.',
]));
hijos.push(p('La Tabla K.1 muestra seis hitos del avance real de la corrida, tomados de la serie temporal registrada por el medidor.'));
hijos.push(p([['Tabla K.1.', true], ' Hitos del avance real durante la corrida.'], { alignment: AlignmentType.LEFT, after: 100 }));
hijos.push(tabla(
  ['Tiempo transcurrido', 'Certificados generados', 'Progreso'],
  [
    ['0,01 s', '0', '0 %'],
    ['81,06 s', '29', '23 %'],
    ['146,92 s', '50', '40 %'],
    ['217,88 s', '75', '60 %'],
    ['296,01 s', '100', '81 %'],
    ['354,85 s', '124', '100 %'],
  ],
  [2800, 3200, 2400],
  [0, 1, 2],
));
hijos.push(p([['Nota.', true], ' Corrida única del 24-ago-2026 (fuente: benchmarks/evidencia/prueba-124-2026-08-24-0411-optimizado.json).'],
  { alignment: AlignmentType.LEFT, size: 20, line: 240 }));
hijos.push(p('El ritmo es uniforme de principio a fin: los primeros veintinueve certificados salen a 2,80 segundos cada uno y los noventa y cinco restantes, a 2,88. No hay arranque en frío apreciable, y eso no es casual: la imagen de fondo de la plantilla se trae del almacenamiento de objetos una sola vez y se reutiliza durante todo el lote, de modo que el primer certificado no paga un costo que los demás no paguen.'));

// ── K.5 ──
hijos.push(titulo('K.5 Contraste con el procedimiento manual', HeadingLevel.HEADING_2, 24));
hijos.push(p('La responsable declaró en la entrevista (Anexo A, pregunta 2) que la emisión de un certificado toma alrededor de seis minutos «cuando todo está en orden». Esa cifra es el mejor caso del procedimiento manual: excluye la corrección de datos incorrectos y excluye el error, descrito por la propia responsable, de que un certificado reutilizado como base conserve el nombre del estudiante anterior. El contraste, por lo tanto, es conservador para el manual.'));
hijos.push(tabla(
  ['Escenario', 'Tiempo para 124 certificados'],
  [
    ['Procedimiento manual (6 min × 124)', '12 h 24 min'],
    ['UniBridge (medido)', '5 min 55 s'],
    ['Factor de mejora', '× 126'],
  ],
  [5000, 3400],
  [1],
));
hijos.push(p('', { after: 160 }));
hijos.push(p('Doce horas y veinticuatro minutos equivalen a poco más de una jornada y media de trabajo de una sola persona; cinco minutos y cincuenta y cinco segundos, a lo que dura una llamada telefónica. Adicionalmente, ninguna de las emisiones que efectuó el sistema requirió transcripción manual de datos entre archivos, de modo que el error de reutilización descrito por la responsable no puede producirse por construcción.'));

// ── K.6 ──
hijos.push(titulo('K.6 Consideraciones sobre el hardware y proyección', HeadingLevel.HEADING_2, 24));
hijos.push(p('El equipo utilizado no es representativo de un despliegue institucional. Presenta tres cuellos de botella concretos:'));
hijos.push(vineta('Disco mecánico virtualizado.', 'La escritura de cada PDF al almacenamiento de objetos y el registro en la base atraviesan el disco duro por la capa de virtualización de Docker sobre Windows. En pruebas del motor aislado —pdf-lib en memoria, sin persistencia— el mismo equipo genera cada certificado en aproximadamente 7 milisegundos; el resto del tiempo lo consume la escritura.'));
hijos.push(vineta('Concurrencia conservadora, con el procesador ocioso.', 'El worker de la cola está fijado en cuatro trabajos simultáneos, valor definido en el código y no impuesto por el hardware. Conviene precisar que esos cuatro trabajos no ocupan cuatro núcleos: son cuatro operaciones asíncronas atendidas por un único proceso, que mientras una espera la confirmación del disco atiende a la siguiente. Dado que la generación del PDF consume unos 7 milisegundos de los 2 860 que toma cada certificado, el procesador permanece ocioso durante la mayor parte del lote. Elevar la concurrencia en un despliegue con almacenamiento de estado sólido permitiría solapar más esperas sin saturarlo.'));
hijos.push(vineta('Docker sobre Windows.', 'La traducción del sistema de archivos entre el contenedor Linux y el host Windows añade una sobrecarga por cada operación de disco. Un despliegue Linux nativo la elimina.'));
hijos.push(p([
  'En un servidor dedicado Linux con almacenamiento de estado sólido, los tres cuellos de botella se reducen simultáneamente. Como estimación conservadora de la mejora combinada, un factor de tres a cinco veces —basado en las diferencias típicas reportadas entre SSD y disco mecánico y entre Linux nativo y Docker sobre Windows en cargas de I/O intensivo— sitúa el tiempo esperado para los ciento veinticuatro certificados ',
  ['entre uno y dos minutos', true],
  '. Esta cifra es una proyección técnica, no una medición; se declara como tal y no reemplaza al dato del apartado K.4. Aun tomando el resultado medido, sin proyección, el factor de mejora frente al procedimiento manual supera las ciento veintiséis veces.',
]));

// ── K.7 ──
hijos.push(titulo('K.7 Reproducibilidad', HeadingLevel.HEADING_2, 24));
hijos.push(p('Los scripts y la evidencia se conservan en el repositorio (véase Anexo H), en el directorio benchmarks/. Para reproducir la prueba se levantan los contenedores de PostgreSQL, Redis y MinIO, se ejecuta el sembrado del período 2024-1 con «node benchmarks/sembrar-periodo-2024-1.cjs 124», se arranca la aplicación con «npm run start» desde apps/api, y se ejecuta «node benchmarks/prueba-rendimiento.cjs 124». El script produce dos archivos en benchmarks/evidencia/: la transcripción completa de la corrida en texto plano y los datos en formato JSON, incluyendo la serie temporal íntegra. El nombre de cada archivo lleva la fecha y la hora, de modo que dos corridas del mismo día no se sobrescriben. La transcripción de la corrida documentada en este anexo corresponde a «prueba-124-2026-08-24-0411-optimizado.txt».'));
hijos.push(p('[Insertar aquí las capturas de pantalla tomadas durante la corrida, como Figura K.1, K.2, K.3 y K.4 según corresponda.]',
  { alignment: AlignmentType.LEFT }));

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: FUENTE, size: TAM } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },        // Carta
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1701 }, // izq. 3 cm
      },
    },
    children: hijos,
  }],
});

const salida = path.join(__dirname, 'Anexo K - Prueba de rendimiento.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(salida, buf);
  console.log('generado:', path.basename(salida), '·', buf.length, 'bytes');
});
