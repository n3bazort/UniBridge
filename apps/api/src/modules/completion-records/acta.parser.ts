/**
 * Lector del acta de calificaciones (RF-18).
 *
 * ── Por qué se reconstruyen las filas por coordenadas ──
 *
 * El acta que emite Secretaría General se dibuja COLUMNA A COLUMNA: primero
 * los ocho números de orden, después las ocho cédulas, después los ocho
 * nombres… Leer el flujo de texto en el orden en que viene entrega los datos
 * agrupados por columna, no por estudiante, y cualquier extractor que se fíe
 * de ese orden empareja mal. Se comprobó con el acta real: `pdftotext` en modo
 * `-layout` desplaza la columna de nombres dos filas respecto a la de cédulas.
 *
 * Lo que sí es fiable es la posición. Cada fragmento de texto trae su altura
 * en la página, y todos los de un mismo estudiante comparten esa altura. Se
 * agrupan por `y` con una tolerancia pequeña y se ordenan por `x`: eso
 * reconstruye la tabla tal como se ve, sin depender de cómo se generó.
 *
 * ── Por qué no basta con buscar cédulas ──
 *
 * El acta trae una columna «Condición» con APRUEBA o REPRUEBA. Rastrear los
 * números de diez dígitos y dar por aprobado a todo el que aparezca marcaría
 * también a quien reprobó. Y hay una trampa: el pie del documento dice
 * «Generado por p1309857827», que son diez dígitos y no es de ningún
 * estudiante. Por eso se exige la forma completa de la fila —cédula y
 * condición en la misma altura— antes de aceptar a nadie.
 */

/** Una fila de la tabla, ya reconstruida. */
export interface FilaActa {
  numero: number | null;
  dni: string;
  nombre: string;
  nota: string | null;
  condicion: string;
  aprueba: boolean;
}

/** Lo que el acta declara de sí misma en su encabezado. */
export interface CabeceraActa {
  actaNumber: string | null;
  actaVersion: string | null;
  academicPeriod: string | null;
  faculty: string | null;
  program: string | null;
  subject: string | null;
  courseCode: string | null;
  level: string | null;
  parallel: string | null;
  professorRaw: string | null;
}

export interface ActaLeida {
  cabecera: CabeceraActa;
  filas: FilaActa[];
  /** Filas con forma de dato que no se pudieron interpretar del todo. */
  descartadas: string[];
}

/** Condiciones que cuentan como aprobación. */
const APRUEBA = /^(APRUEBA|APROBADO|APROBADA)$/i;
/** Condiciones reconocidas, aprueben o no: delimitan una fila de estudiante. */
const CONDICION = /^(APRUEBA|APROBADO|APROBADA|REPRUEBA|REPROBADO|REPROBADA|NO\s+APRUEBA|RETIRADO|ANULADA?|DESERT[OÓ])$/i;

interface Celda { x: number; txt: string }
interface Fila { y: number; celdas: Celda[] }

/**
 * Carga pdfjs. Es un paquete solo-ESM y la API compila a CommonJS, así que un
 * `import()` normal lo convertiría `require()` y fallaría. El indirecto por
 * `Function` conserva el import dinámico de verdad.
 */
const importarEsm: (m: string) => Promise<any> = new Function('m', 'return import(m)') as any;

/** Extrae las filas visuales de todas las páginas del PDF. */
async function filasDelPdf(buffer: Buffer): Promise<Fila[]> {
  const pdfjs = await importarEsm('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    // El acta no lleva formularios ni scripts; apagarlos evita trabajo inútil
    // y quita el aviso de fuentes estándar que pdfjs escupe en servidor.
    isEvalSupported: false,
  }).promise;

  const todas: Fila[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();

      const filas: Fila[] = [];
      for (const it of items as any[]) {
        const txt = (it.str || '').trim();
        if (!txt) continue;
        const x = it.transform[4];
        const y = it.transform[5];
        // Tolerancia de 3 puntos: los fragmentos de una misma fila no caen en
        // la misma altura exacta, varían décimas según el tipo de letra.
        let fila = filas.find((f) => Math.abs(f.y - y) < 3);
        if (!fila) {
          fila = { y, celdas: [] };
          filas.push(fila);
        }
        fila.celdas.push({ x, txt });
      }

      // De arriba abajo, y dentro de cada fila de izquierda a derecha.
      filas.sort((a, b) => b.y - a.y);
      for (const f of filas) f.celdas.sort((a, b) => a.x - b.x);
      todas.push(...filas);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return todas;
}

/** Texto de una fila, con las celdas separadas por espacio. */
const textoDe = (f: Fila) => f.celdas.map((c) => c.txt).join(' ');

/**
 * Valor que sigue a una etiqueta del encabezado.
 *
 * El encabezado viene como «Etiqueta: valor» en la misma altura, a veces con
 * dos pares en la misma fila («Asignatura: X   Nivel: 8   Código: IS-806»),
 * así que se busca por celdas y se recorta al llegar a la etiqueta siguiente.
 */
function campo(filas: Fila[], etiqueta: RegExp, siguientes: RegExp[] = []): string | null {
  for (const f of filas) {
    const i = f.celdas.findIndex((c) => etiqueta.test(c.txt));
    if (i === -1) continue;

    const partes: string[] = [];
    for (const celda of f.celdas.slice(i + 1)) {
      if (siguientes.some((s) => s.test(celda.txt))) break;
      partes.push(celda.txt);
    }
    const valor = partes.join(' ').replace(/\s+/g, ' ').trim();
    if (valor) return valor;
  }
  return null;
}

const ETIQUETAS = [
  /^No\.?\s*Acta:?$/i, /^Facultad:?$/i, /^Carrera:?$/i, /^Asignatura:?$/i,
  /^Profesor(a)?:?$/i, /^Nivel:?$/i, /^C[óo]digo:?$/i, /^Paralelo:?$/i,
];

function leerCabecera(filas: Fila[]): CabeceraActa {
  const acta = campo(filas, /^No\.?\s*Acta:?$/i, ETIQUETAS);
  // «1207140 - Versión 1»
  const mActa = acta?.match(/^(\S+)(?:\s*-\s*Versi[óo]n\s*(\S+))?/i);

  // «PERIODO: 2026-1 PRÁCTICAS PREPROFESIONALES»
  let periodo: string | null = null;
  for (const f of filas) {
    const m = textoDe(f).match(/PER[ÍI]ODO:?\s*(\d{4}-\d)/i);
    if (m) { periodo = m[1]; break; }
  }

  return {
    actaNumber: mActa?.[1] ?? null,
    actaVersion: mActa?.[2] ?? null,
    academicPeriod: periodo,
    faculty: campo(filas, /^Facultad:?$/i, ETIQUETAS),
    program: campo(filas, /^Carrera:?$/i, ETIQUETAS),
    subject: campo(filas, /^Asignatura:?$/i, ETIQUETAS),
    courseCode: campo(filas, /^C[óo]digo:?$/i, ETIQUETAS),
    level: campo(filas, /^Nivel:?$/i, ETIQUETAS),
    parallel: campo(filas, /^Paralelo:?$/i, ETIQUETAS),
    professorRaw: campo(filas, /^Profesor(a)?:?$/i, ETIQUETAS),
  };
}

/**
 * Interpreta una fila como un estudiante, o devuelve null si no lo es.
 *
 * Se exigen las dos cosas juntas: una cédula de diez dígitos y una condición
 * reconocida. Así el pie «Generado por p1309857827» —diez dígitos sin
 * condición— no pasa, y tampoco pasa el encabezado de la tabla.
 */
function leerFila(f: Fila): FilaActa | null {
  const celdas = f.celdas.map((c) => c.txt);

  const iDni = celdas.findIndex((c) => /^\d{10}$/.test(c));
  if (iDni === -1) return null;

  const iCond = celdas.findIndex((c) => CONDICION.test(c.trim()));
  if (iCond === -1 || iCond < iDni) return null;

  // Entre la cédula y la condición van el nombre y las notas.
  const enMedio = celdas.slice(iDni + 1, iCond);
  const notas = enMedio.filter((c) => /^\d+([.,]\d+)?$/.test(c));
  const nombre = enMedio
    .filter((c) => !/^\d+([.,]\d+)?$/.test(c))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const numero = iDni > 0 && /^\d{1,3}$/.test(celdas[iDni - 1]) ? Number(celdas[iDni - 1]) : null;
  const condicion = celdas[iCond].trim().toUpperCase();

  return {
    numero,
    dni: celdas[iDni],
    nombre,
    nota: notas.length ? notas[notas.length - 1] : null,
    condicion,
    aprueba: APRUEBA.test(condicion),
  };
}

/** Lee un acta en PDF y devuelve su encabezado y sus filas. */
export async function leerActaPdf(buffer: Buffer): Promise<ActaLeida> {
  const filas = await filasDelPdf(buffer);

  const leidas: FilaActa[] = [];
  const descartadas: string[] = [];

  for (const f of filas) {
    const fila = leerFila(f);
    if (fila) {
      leidas.push(fila);
      continue;
    }
    // Se anota la fila que traía una cédula pero no una condición: es la que
    // conviene enseñar cuando el acta no se entiende, porque delata el cambio
    // de formato mejor que un «no se encontró nada».
    const texto = textoDe(f);
    if (/\b\d{10}\b/.test(texto) && !/Generado por/i.test(texto)) descartadas.push(texto);
  }

  // Una cédula repetida en la misma acta (dos actas pegadas, una fila doble)
  // se queda con la primera aparición: aprobar dos veces al mismo no aporta.
  const vistas = new Set<string>();
  const unicas = leidas.filter((f) => (vistas.has(f.dni) ? false : (vistas.add(f.dni), true)));

  return { cabecera: leerCabecera(filas), filas: unicas, descartadas };
}
