/**
 * Los datos de la demostración, en un solo sitio.
 *
 * El Excel y las actas tienen que hablar de las MISMAS personas: si el acta
 * nombra a alguien que no se importó, no se le pone el punto verde y la
 * demostración se cae en el peor momento. Por eso ambos generadores leen de
 * aquí en vez de llevar cada uno su copia.
 *
 * Cédulas 1315900001–1315900020. El benchmark de los 124 usa el prefijo 9024 y
 * el período 2024-1, y su script de limpieza borra SOLO ese prefijo: los dos
 * juegos de datos no se tocan ni por accidente.
 */

const PERIODO = '2025-2';
const CARRERA = 'Tecnologías de la Información';

const EMPRESAS = [
  {
    nombre: 'ALTURA S.A.',
    contacto: 'Ing. Byron Macías Alcívar',
    cargo: 'Gerente General',
    email: 'gerencia@altura.com.ec',
    telefono: '0960048753',
  },
  {
    nombre: 'ATUKHOSTING',
    contacto: 'Ing. Karla Vélez Zambrano',
    cargo: 'Directora de Operaciones',
    email: 'operaciones@atukhosting.com',
    telefono: '0982114567',
  },
  {
    nombre: 'GAD MUNICIPAL DE JARAMIJÓ',
    contacto: 'Ab. Marcos Delgado Pincay',
    cargo: 'Alcalde',
    email: 'alcaldia@jaramijo.gob.ec',
    telefono: '0523851004',
  },
  {
    nombre: 'EPAM SERVICIOS',
    contacto: 'Ing. Dolores Intriago Cedeño',
    cargo: 'Jefa de Sistemas',
    email: 'sistemas@epam.com.ec',
    telefono: '0991234567',
  },
];

/**
 * Los cinco docentes. `actaProfesor` va en APELLIDOS NOMBRES porque así lo
 * imprime Secretaría General en la cabecera del acta.
 */
const TUTORES = [
  { nombre: 'Ing. Juan Carlos Sendón Varela, Mg.',      actaProfesor: 'SENDON VARELA JUAN CARLOS' },
  { nombre: 'Ing. Diana Carolina Loor Zambrano, Mg.',   actaProfesor: 'LOOR ZAMBRANO DIANA CAROLINA' },
  { nombre: 'Ing. Julio César Mendoza Bravo, Mg.',      actaProfesor: 'MENDOZA BRAVO JULIO CESAR' },
  { nombre: 'Ing. Patricia Elizabeth Vera Macías, Mg.', actaProfesor: 'VERA MACIAS PATRICIA ELIZABETH' },
  { nombre: 'Ing. Marcos Vinicio Cedeño Alcívar, Mg.',  actaProfesor: 'CEDEÑO ALCIVAR MARCOS VINICIO' },
];

/**
 * Veinte estudiantes repartidos como se reparten de verdad: la mayoría de las
 * empresas recibe un grupo de cuatro con un solo docente, y una recibe ocho
 * repartidos entre dos. Ese caso es el que obliga a que un mismo oficio de
 * empresa conviva con dos bloques de tutor distintos.
 */
const ESTUDIANTES = [
  // ── ALTURA S.A. · 4 estudiantes, un solo docente ──
  { dni: '1315900001', apellidos: 'Alcívar Bravo',      nombres: 'Josselyn Mariana',  empresa: 0, tutor: 0, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Soporte Técnico' },
  { dni: '1315900002', apellidos: 'Briones Cedeño',     nombres: 'Kevin Adrián',      empresa: 0, tutor: 0, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Soporte Técnico' },
  { dni: '1315900003', apellidos: 'Chávez Delgado',     nombres: 'Michelle Andrea',   empresa: 0, tutor: 0, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Redes' },
  { dni: '1315900004', apellidos: 'Dueñas Espinales',   nombres: 'Anthony Steven',    empresa: 0, tutor: 0, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Redes' },

  // ── ATUKHOSTING · 8 estudiantes, DOS docentes ──
  { dni: '1315900005', apellidos: 'Farías García',      nombres: 'Dayana Lisbeth',    empresa: 1, tutor: 1, nivel: 'Séptimo Nivel', tipo: 'Prácticas Laborales I',  horas: 192, area: 'Desarrollo Web' },
  { dni: '1315900006', apellidos: 'Holguín Intriago',   nombres: 'Bryan Alexander',   empresa: 1, tutor: 1, nivel: 'Séptimo Nivel', tipo: 'Prácticas Laborales I',  horas: 192, area: 'Desarrollo Web' },
  { dni: '1315900007', apellidos: 'Jaramillo Loor',     nombres: 'Sofía Valentina',   empresa: 1, tutor: 1, nivel: 'Séptimo Nivel', tipo: 'Prácticas Laborales I',  horas: 192, area: 'Base de Datos' },
  { dni: '1315900008', apellidos: 'Macías Mendoza',     nombres: 'Erick Sebastián',   empresa: 1, tutor: 1, nivel: 'Séptimo Nivel', tipo: 'Prácticas Laborales I',  horas: 192, area: 'Base de Datos' },
  { dni: '1315900009', apellidos: 'Navarrete Ostaiza',  nombres: 'Camila Nicole',     empresa: 1, tutor: 2, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Infraestructura' },
  { dni: '1315900010', apellidos: 'Pincay Quijije',     nombres: 'Luis Fernando',     empresa: 1, tutor: 2, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Infraestructura' },
  { dni: '1315900011', apellidos: 'Rodríguez Solórzano',nombres: 'Génesis Paola',     empresa: 1, tutor: 2, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Ciberseguridad' },
  { dni: '1315900012', apellidos: 'Toala Vera',         nombres: 'Christopher David', empresa: 1, tutor: 2, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Ciberseguridad' },

  // ── GAD MUNICIPAL DE JARAMIJÓ · 4 estudiantes ──
  { dni: '1315900013', apellidos: 'Zambrano Andrade',   nombres: 'Melany Dayanara',   empresa: 2, tutor: 3, nivel: 'Séptimo Nivel', tipo: 'Prácticas Laborales I',  horas: 192, area: 'Sistemas' },
  { dni: '1315900014', apellidos: 'Alava Briones',      nombres: 'Jordy Alexander',   empresa: 2, tutor: 3, nivel: 'Séptimo Nivel', tipo: 'Prácticas Laborales I',  horas: 192, area: 'Sistemas' },
  { dni: '1315900015', apellidos: 'Cevallos Chávez',    nombres: 'Doménica Belén',    empresa: 2, tutor: 3, nivel: 'Séptimo Nivel', tipo: 'Prácticas Laborales I',  horas: 192, area: 'Atención al Usuario' },
  { dni: '1315900016', apellidos: 'Delgado Farías',     nombres: 'Ricardo Emmanuel',  empresa: 2, tutor: 3, nivel: 'Séptimo Nivel', tipo: 'Prácticas Laborales I',  horas: 192, area: 'Atención al Usuario' },

  // ── EPAM SERVICIOS · 4 estudiantes ──
  { dni: '1315900017', apellidos: 'García Holguín',     nombres: 'Nayeli Estefanía',  empresa: 3, tutor: 4, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Desarrollo de Software' },
  { dni: '1315900018', apellidos: 'Intriago Jaramillo', nombres: 'Steeven Josué',     empresa: 3, tutor: 4, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Desarrollo de Software' },
  { dni: '1315900019', apellidos: 'Loor Macías',        nombres: 'Emily Antonella',   empresa: 3, tutor: 4, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Calidad de Software' },
  { dni: '1315900020', apellidos: 'Mendoza Navarrete',  nombres: 'Angelo Sebastián',  empresa: 3, tutor: 4, nivel: 'Octavo Nivel',  tipo: 'Prácticas Laborales II', horas: 240, area: 'Calidad de Software' },
];

/** «Apellidos Nombres», que es como lo escribe la Facultad en sus listados. */
const nombreCompleto = (e) => `${e.apellidos} ${e.nombres}`;
/** «APELLIDOS NOMBRES» sin tildes, que es como lo imprime el acta. */
const nombreActa = (e) =>
  `${e.apellidos} ${e.nombres}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const correo = (e) => `e${e.dni}@live.uleam.edu.ec`;

/**
 * Las dos actas que el coordinador va a subir.
 *
 * Cubren dos de los cinco docentes a propósito: así, al terminar, siete
 * estudiantes quedan con el punto verde y trece sin él, y se ve de un vistazo
 * que el certificado depende del acta y no del capricho de la pantalla.
 *
 * Cada acta lleva un REPRUEBA. Es lo que demuestra que el lector no da por
 * aprobado a todo el que aparece: lee la columna Condición.
 */
const ACTAS = [
  {
    archivo: 'Acta 1207141 - Practicas Laborales II - Sendon Varela.pdf',
    numero: '1207141',
    version: '1',
    asignatura: 'PRÁCTICAS LABORALES II',
    codigo: 'IS-806',
    nivel: '8',
    paralelo: 'A',
    tutor: 0,
    // Los cuatro de ALTURA. Uno reprueba.
    filas: [
      { dni: '1315900001', nota: '9.75', condicion: 'APRUEBA' },
      { dni: '1315900002', nota: '9.40', condicion: 'APRUEBA' },
      { dni: '1315900003', nota: '10.00', condicion: 'APRUEBA' },
      { dni: '1315900004', nota: '5.20', condicion: 'REPRUEBA' },
    ],
  },
  {
    archivo: 'Acta 1207142 - Practicas Laborales I - Loor Zambrano.pdf',
    numero: '1207142',
    version: '1',
    asignatura: 'PRÁCTICAS LABORALES I',
    codigo: 'IS-706',
    nivel: '7',
    paralelo: 'B',
    tutor: 1,
    // Los cuatro de ATUKHOSTING que lleva Loor Zambrano. Uno reprueba.
    filas: [
      { dni: '1315900005', nota: '9.10', condicion: 'APRUEBA' },
      { dni: '1315900006', nota: '9.85', condicion: 'APRUEBA' },
      { dni: '1315900007', nota: '9.55', condicion: 'APRUEBA' },
      { dni: '1315900008', nota: '6.00', condicion: 'REPRUEBA' },
    ],
  },
];

module.exports = {
  PERIODO, CARRERA, EMPRESAS, TUTORES, ESTUDIANTES, ACTAS,
  nombreCompleto, nombreActa, correo,
};
