/**
 * Reglas comunes a los dos oficios en Word que emite la Facultad:
 *
 *   SOLICITUD   (PAP-001)  pide vacantes a la empresa para un grupo de estudiantes.
 *   DESIGNACION            comunica qué estudiantes fueron designados y quién los tutela.
 *
 * Los dos son documentos por lote: un solo papel dirigido a una empresa que
 * ampara a varios estudiantes, con una fila por cada uno. De ahí que compartan
 * numeración, formato de fecha y nombre de archivo.
 */

export type OficioKind = 'SOLICITUD' | 'DESIGNACION';

export const OFICIO_KINDS: OficioKind[] = ['SOLICITUD', 'DESIGNACION'];

/**
 * A cuántos estudiantes ampara un mismo papel.
 *
 *   GRUPO       un oficio por empresa, con una fila por estudiante (como emite hoy)
 *   ESTUDIANTE  un oficio por cada estudiante, cada uno con su propio número
 *
 * Se configura por plantilla porque no es una decisión del código: hay
 * facultades y periodos en que la Facultad prefiere un papel por estudiante.
 */
export type OficioScope = 'GRUPO' | 'ESTUDIANTE';

export const OFICIO_SCOPES: OficioScope[] = ['GRUPO', 'ESTUDIANTE'];

/** Nombre legible del alcance, para la interfaz y los mensajes. */
export function nombreDelAlcance(scope: OficioScope): string {
  return scope === 'ESTUDIANTE' ? 'uno por estudiante' : 'uno por empresa';
}

/**
 * ¿Es un oficio por lote? Importa porque invalidar, versionar o regenerar uno
 * de estos alcanza a TODAS las filas que comparten su código: es el mismo papel
 * físico, y dejarlo válido para unos e inválido para otros sería un imposible.
 */
export function esOficioGrupal(documentType?: string | null): documentType is OficioKind {
  return !!documentType && (OFICIO_KINDS as string[]).includes(documentType);
}

/** Nombre legible del tipo, para mensajes de error dirigidos a la coordinación. */
export function nombreDelOficio(kind: OficioKind): string {
  return kind === 'SOLICITUD' ? 'solicitud de prácticas' : 'designación de estudiantes';
}

// ─────────────────────────── Numeración ───────────────────────────

/**
 * Cada formato conserva la numeración con la que la Facultad lo emite a mano,
 * porque el número impreso es el que la empresa cita al responder.
 *
 *   SOLICITUD    2026-TECN-017
 *   DESIGNACION  055-FCVT-2026-1-TI
 *
 * El patrón se guarda en la plantilla (`content.codePattern`), así que se puede
 * ajustar sin tocar el código. Todo lo que no vaya entre llaves es literal.
 */
export const PATRON_POR_DEFECTO: Record<OficioKind, string> = {
  SOLICITUD: '{YYYY}-{PROGRAM}-{SEQ:3}',
  DESIGNACION: '{SEQ:3}-{FACULTY}-{PERIOD}-{PROGRAM}',
};

export interface DatosDelCodigo {
  secuencia: number;
  periodCode: string;
  programAbbr: string;
  facultyAbbr: string;
  docTypeAbbr: string;
  fecha: Date;
}

/**
 * Resuelve un patrón de numeración. Tokens reconocidos:
 *   {SEQ} {SEQ:n}  secuencial del tipo dentro del periodo, opcionalmente con n dígitos
 *   {YYYY} {YY}    año de emisión
 *   {PERIOD}       código del periodo académico (2026-1)
 *   {PROGRAM}      abreviatura de la carrera
 *   {FACULTY}      abreviatura de la facultad
 *   {TYPE}         abreviatura del tipo de documento
 */
export function formatearCodigo(patron: string, datos: DatosDelCodigo): string {
  const anio = datos.fecha.getFullYear();
  return patron.replace(/\{(\w+)(?::(\d+))?\}/g, (literal, token: string, digitos?: string) => {
    switch (token.toUpperCase()) {
      case 'SEQ':
        return String(datos.secuencia).padStart(Number(digitos ?? 3), '0');
      case 'YYYY':
        return String(anio);
      case 'YY':
        return String(anio).slice(-2);
      case 'PERIOD':
        return datos.periodCode;
      case 'PROGRAM':
        return datos.programAbbr;
      case 'FACULTY':
        return datos.facultyAbbr;
      case 'TYPE':
        return datos.docTypeAbbr;
      default:
        // Un token desconocido se deja tal cual: es más fácil de detectar en el
        // documento que un hueco vacío.
        return literal;
    }
  });
}

// ───────────────────────── Nombre del archivo ─────────────────────────

/**
 * Los archivos que la Facultad guarda se llaman «formato + empresa + número».
 * Reproducirlo importa: es como los encuentra quien lleva el archivo físico.
 *
 *   PAP-01-F-006-Solicitud-de-practicas-preprofesionales Epespo 057.docx
 *   DESIGNACION DE ESTUDIANTES FishEcuador 055.docx
 */
export const NOMBRE_BASE_POR_DEFECTO: Record<OficioKind, string> = {
  SOLICITUD: 'PAP-01-F-006-Solicitud-de-practicas-preprofesionales',
  DESIGNACION: 'DESIGNACION DE ESTUDIANTES',
};

export function nombreDeArchivo(
  base: string,
  companyName: string,
  secuencia: number,
  ext: string,
): string {
  // Se conservan los acentos: el nombre lo lee una persona, no un sistema de
  // archivos antiguo. Solo se quitan los caracteres que Windows prohíbe.
  const empresa = companyName.replace(/[\\/:*?"<>|]/g, '').trim();
  return `${base} ${empresa} ${String(secuencia).padStart(3, '0')}${ext}`;
}

// ─────────────────────────── Fecha y cantidades ───────────────────────────

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Formato de fecha de los oficios de la Facultad: «julio 27 de 2026».
 * No es el orden habitual del español, pero es el que llevan los originales.
 */
export function fechaDelOficio(fecha: Date): string {
  return `${MESES[fecha.getMonth()]} ${fecha.getDate()} de ${fecha.getFullYear()}`;
}

const UNIDADES = [
  'cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte',
];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
// Los veintitantos se escriben en una sola palabra y tres llevan tilde
const VEINTES = [
  'veinte', 'veintiuna', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];

/**
 * Cantidad en letras para el cuerpo del oficio: «la apertura de tres vacantes».
 * Concuerda en femenino porque siempre acompaña a «vacantes».
 */
export function cantidadEnLetras(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n <= 20) return UNIDADES[n];
  if (n < 30) return VEINTES[n - 20];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return DECENAS[d];
    return `${DECENAS[d]} y ${UNIDADES[u]}`;
  }
  if (n === 100) return 'cien';
  return String(n);
}

/**
 * Los oficios nombran el nivel de la práctica con su numeral romano solo:
 * «realizar sus 120 horas de prácticas pre-profesionales II». En el sistema el
 * nivel se guarda completo («Prácticas Laborales II»), así que se extrae el
 * numeral final. Si el tipo no lleva numeral —el servicio comunitario, por
 * ejemplo— se devuelve el nombre entero, que es lo único sensato que cabe ahí.
 */
export function nivelAbreviado(practiceLevel?: string | null): string {
  const limpio = practiceLevel?.trim();
  if (!limpio) return '';
  const numeral = limpio.match(/\b([IVX]+)\s*$/);
  return numeral ? numeral[1] : limpio;
}

/**
 * Junta valores repetidos en una sola mención. Un oficio por lote puede reunir
 * estudiantes con distinto tutor o distinta área, y el cuerpo del documento
 * tiene que nombrarlos a todos sin repetir al que coincide.
 */
export function unirDistintos(valores: (string | null | undefined)[], separador = ', '): string {
  const limpios = valores.map((v) => v?.trim()).filter((v): v is string => !!v);
  return [...new Set(limpios)].join(separador);
}
