/**
 * Datos de prueba para dos periodos académicos: 2025-1 (cerrado) y 2025-2 (abierto).
 *
 * Para qué sirve
 * --------------
 * El selector de periodo del topbar solo se puede demostrar si hay más de un
 * periodo con datos propios. Con un único semestre cargado, cambiar de periodo
 * no cambia nada en pantalla y la función parece rota.
 *
 * Qué NO hace y por qué
 * ---------------------
 * No fabrica documentos generados. El estado de una práctica se deriva de sus
 * documentos (ver practice-status.util.ts): una práctica marcada «Finalizado»
 * sin certificado firmado es una contradicción que el propio sistema corrige
 * en cuanto alguien recalcula estados. Aquí se siembran prácticas en estados
 * que la derivación respalda, y la variedad visual se consigue con etiquetas
 * de seguimiento, que sí son anotaciones humanas libres.
 *
 * Idempotente: se puede correr varias veces sin duplicar nada.
 *
 *   node packages/db/seed-demo.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// La cadena de conexión vive en apps/api/.env, no aquí. Se lee de ahí para que
// el script funcione desde cualquier carpeta sin exportar variables a mano.
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '../../apps/api/.env');
  if (!fs.existsSync(envPath)) {
    console.error('No se encontró ' + envPath + ' y DATABASE_URL no está definida.');
    process.exit(1);
  }
  for (const linea of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const par = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!par) continue;
    const valor = par[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[par[1]]) process.env[par[1]] = valor;
  }
}

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Cédulas ecuatorianas válidas
// ---------------------------------------------------------------------------
// Las cédulas ya cargadas tienen dígito verificador correcto. Si las de prueba
// no lo tuvieran, cualquier validación futura las delataría como inventadas, y
// lo que se pidió es justamente que no se distingan de las reales.
function digitoVerificador(nueveDigitos) {
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let producto = Number(nueveDigitos[i]) * coeficientes[i];
    if (producto > 9) producto -= 9;
    suma += producto;
  }
  return (10 - (suma % 10)) % 10;
}

function cedulaValida(secuencia) {
  // 13 = Manabí. El tercer dígito por debajo de 6 identifica a persona natural.
  const nueve = '13' + String(secuencia).padStart(7, '0');
  return nueve + digitoVerificador(nueve);
}

// ---------------------------------------------------------------------------
// Catálogo de nombres. Los tres arreglos tienen longitudes distintas a
// propósito: así las combinaciones no se repiten al dar la segunda vuelta.
// ---------------------------------------------------------------------------
const NOMBRES = [
  'María Fernanda', 'José Luis', 'Ana Belén', 'Carlos Andrés', 'Doménica Alexandra',
  'Luis Miguel', 'Karla Vanessa', 'Jorge Enrique', 'Gabriela Monserrate', 'Ángel David',
  'Nayeli Estefanía', 'Bryan Alexander', 'Dayana Michelle', 'Kevin Josué', 'Melany Nicole',
  'Christian Fabricio', 'Génesis Aracely', 'Anthony Steven', 'Emily Dayanara', 'Randy Patricio',
  'Scarlet Anahí', 'Erick Sebastián', 'Joselyn Mariuxi', 'Marlon Andrés', 'Cinthya Lisbeth',
];
const APELLIDOS_1 = [
  'Zambrano', 'Mendoza', 'Cedeño', 'Vera', 'Loor', 'Bravo', 'Intriago', 'Delgado',
  'Macías', 'Álava', 'Chávez', 'Pico', 'Moreira', 'Anchundia', 'Ponce', 'Solórzano',
  'Cevallos', 'Villavicencio', 'Farías', 'Andrade', 'Alcívar', 'Barcia', 'Giler', 'Santana',
];
const APELLIDOS_2 = [
  'Vélez', 'Rodríguez', 'Pinargote', 'Quijije', 'Muñoz', 'Sabando', 'Ruperti', 'Menéndez',
  'Toala', 'Palacios', 'Briones', 'García', 'Ortega', 'Baque', 'Mero', 'Parrales',
  'Tuárez', 'Zamora', 'Arteaga', 'Molina', 'Cañarte', 'Lucas', 'Chica',
];

const TUTORES = [
  'Ing. Jorge Aníbal Párraga Cedeño, Mg.',
  'Ing. Silvia Katherine Mendoza Vera, Mg.',
  'Ing. Fabricio Antonio Zambrano Loor, Mg.',
  'Ing. Verónica Elizabeth Cedeño Bravo, Mg.',
  'Ing. Danilo Xavier Moreira Intriago, Mg.',
];

const AREAS = [
  'Desarrollo de Software', 'Soporte Técnico', 'Redes y Comunicaciones',
  'Tecnologías de la Información', 'Sistemas', 'Infraestructura Tecnológica',
];

// Progresión académica: cada nivel lleva su tipo de práctica y su carga horaria.
const NIVELES = [
  { academicLevel: 'Quinto Nivel', practiceLevel: 'Prácticas Preprofesionales I', totalHours: 240 },
  { academicLevel: 'Sexto Nivel', practiceLevel: 'Prácticas Preprofesionales II', totalHours: 240 },
  { academicLevel: 'Séptimo Nivel', practiceLevel: 'Prácticas Laborales I', totalHours: 240 },
  { academicLevel: 'Octavo Nivel', practiceLevel: 'Prácticas Laborales II', totalHours: 240 },
  { academicLevel: 'Noveno Nivel', practiceLevel: 'Prácticas Laborales II', totalHours: 480 },
];

const EMPRESAS_NUEVAS = [
  {
    name: 'TECNOMEGA C.A.',
    address: 'Av. 4 de Noviembre, Manta',
    contactName: 'Ing. Guido Fabián Cevallos Mera',
    recipientName: 'Gerente de Sucursal',
    email: 'talentohumano@tecnomega.com.ec',
    phone: '052385140',
  },
  {
    name: 'GAD MUNICIPAL DE MONTECRISTI',
    address: 'Calle 9 de Julio y Sucre, Montecristi',
    contactName: 'Ab. Lorena Isabel Pincay Cedeño',
    recipientName: 'Directora de Talento Humano',
    email: 'talentohumano@montecristi.gob.ec',
    phone: '052310131',
  },
  {
    name: 'HOSPITAL RODRÍGUEZ ZAMBRANO',
    address: 'Av. Jaime Chávez Gutiérrez, Manta',
    contactName: 'Lcdo. Marcos Iván Delgado Suárez',
    recipientName: 'Jefe de Tecnologías de la Información',
    email: 'sistemas@hrz.gob.ec',
    phone: '052622525',
  },
  {
    name: 'COOPERATIVA DE AHORRO Y CRÉDITO CHONE LTDA.',
    address: 'Calle Bolívar y Colón, Chone',
    contactName: 'Ing. Andrea Paola Vélez Loor',
    recipientName: 'Jefa de Sistemas',
    email: 'sistemas@coopchone.fin.ec',
    phone: '052695410',
  },
  {
    name: 'SOLUCIONES INFORMÁTICAS DELTA S.A.',
    address: 'Av. Malecón y calle 15, Manta',
    contactName: 'Ing. Pedro Antonio Mendoza Zambrano',
    recipientName: 'Gerente General',
    email: 'contacto@deltasoluciones.ec',
    phone: '0993471280',
  },
  {
    name: 'GAD MUNICIPAL DE JARAMIJÓ',
    address: 'Av. Principal, Jaramijó',
    contactName: 'Ing. Silvana Katiuska Bailón Mero',
    recipientName: 'Directora Administrativa',
    email: 'sistemas@jaramijo.gob.ec',
    phone: '052471020',
  },
];

// ---------------------------------------------------------------------------

async function main() {
  console.log('== Datos de prueba: 2025-1 y 2025-2 ==\n');

  // 1. Facultad y carreras ---------------------------------------------------
  const faculty = await prisma.faculty.findFirst({ where: { deletedAt: null } });
  if (!faculty) throw new Error('No hay ninguna facultad registrada. Crea una antes de sembrar.');

  const programas = await prisma.program.findMany({
    where: { facultyId: faculty.id, deletedAt: null },
    orderBy: { name: 'asc' },
  });
  if (programas.length === 0) throw new Error('No hay carreras registradas en la facultad.');
  console.log('Facultad: ' + faculty.name);
  console.log('Carreras: ' + programas.map((p) => p.abbreviation || p.name).join(', ') + '\n');

  // 2. Periodos --------------------------------------------------------------
  // Las autoridades de 2025-2 se copian de 2024-1: son las que están en
  // funciones y es el periodo donde de verdad se van a emitir documentos.
  // 2025-1 lleva un decanato encargado distinto, que es justamente lo que
  // demuestra la función: cada periodo conserva las autoridades de su época.
  const periodoBase = await prisma.academicPeriod.findUnique({ where: { code: '2024-1' } });

  await prisma.academicPeriod.upsert({
    where: { code: '2025-1' },
    update: {},
    create: {
      code: '2025-1',
      name: 'Período Académico 2025 (1)',
      startDate: new Date('2025-05-01'),
      endDate: new Date('2025-09-30'),
      isActive: false,
      deanName: 'Ing. Mariuxi Gabriela Cedeño Vélez, Mg.',
      directorName: 'Ing. Wilfrido Javier Mendoza Bravo, Mg.',
      directorDni: '1312874509',
      directorPhone: '0993217845',
      directorEmail: 'wilfrido.mendoza@uleam.edu.ec',
    },
  });

  await prisma.academicPeriod.upsert({
    where: { code: '2025-2' },
    update: {},
    create: {
      code: '2025-2',
      name: 'Período Académico 2025 (2)',
      startDate: new Date('2025-11-01'),
      endDate: new Date('2026-03-31'),
      isActive: false, // se activa al final, cuando ya no queda nada por escribir
      deanName: periodoBase ? periodoBase.deanName : null,
      directorName: periodoBase ? periodoBase.directorName : null,
      directorDni: periodoBase ? periodoBase.directorDni : null,
      directorPhone: periodoBase ? periodoBase.directorPhone : null,
      directorEmail: periodoBase ? periodoBase.directorEmail : null,
    },
  });
  console.log('Periodos 2025-1 y 2025-2 listos.');

  // 3. Empresas --------------------------------------------------------------
  for (const empresa of EMPRESAS_NUEVAS) {
    await prisma.company.upsert({
      where: { name: empresa.name },
      update: {},
      create: empresa,
    });
  }
  const empresas = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });
  console.log('Empresas disponibles: ' + empresas.length);

  // 4. Etiquetas de seguimiento ---------------------------------------------
  // Se excluye la que exige expediente completo: asignarla sin certificado
  // firmado sería inconsistente con la regla que el servidor hace cumplir.
  const etiquetas = await prisma.practiceLabel.findMany({
    where: { facultyId: faculty.id, requiresCompletion: false },
  });

  // 5. Estudiantes -----------------------------------------------------------
  const passwordHash = await bcrypt.hash('Uleam2025*', 10);

  // La cédula se deriva del índice del estudiante, no de un contador que
  // avanza: así la segunda corrida genera exactamente las mismas cédulas, el
  // upsert las reconoce y no se crean personas nuevas. Con un contador móvil
  // cada ejecución sembraba una cohorte entera duplicada.
  //
  // 2100000 arranca por encima del bloque que ya estaba cargado (13159…), así
  // que los datos sembrados nunca chocan con los reales.
  const BASE_CEDULA = 2100000;

  const nombresVistos = new Set();
  async function crearEstudiante(i) {
    const nombre = NOMBRES[(i * 5 + 1) % NOMBRES.length];
    const ap1 = APELLIDOS_1[(i * 7 + 2) % APELLIDOS_1.length];
    const ap2 = APELLIDOS_2[(i * 11 + 5) % APELLIDOS_2.length];
    const lastName = ap1 + ' ' + ap2;
    const completo = lastName + ' ' + nombre;
    if (nombresVistos.has(completo)) throw new Error('Nombre repetido en el catálogo: ' + completo);
    nombresVistos.add(completo);

    const dni = cedulaValida(BASE_CEDULA + i);
    const email = 'e' + dni + '@live.uleam.edu.ec';
    const programa = programas[i % programas.length];

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, password: passwordHash, role: 'STUDENT', firstName: nombre, lastName },
    });

    return prisma.student.upsert({
      where: { dni },
      update: {},
      create: {
        userId: user.id,
        facultyId: faculty.id,
        programId: programa.id,
        dni,
        firstName: nombre,
        lastName,
        phone: '09' + String(90000000 + ((i * 137311) % 9999999)).slice(0, 8),
      },
    });
  }

  // 6. Prácticas -------------------------------------------------------------
  // Sin documentos generados, la derivación de estado da PENDING. Se respeta.
  // REJECTED y CANCELED sí se siembran porque son decisiones humanas y la
  // derivación las deja intactas: aportan variedad sin fabricar documentos.
  async function crearPractica(student, periodo, nivelIdx, i, opciones) {
    const opts = opciones || {};
    const yaExiste = await prisma.practice.findFirst({
      where: { studentId: student.id, academicPeriod: periodo },
    });
    if (yaExiste) return yaExiste;

    const nivel = NIVELES[Math.min(nivelIdx, NIVELES.length - 1)];
    const empresa = empresas[(i * 3 + nivelIdx) % empresas.length];
    const etiqueta = etiquetas.length > 0 && i % 4 === 0
      ? etiquetas[Math.floor(i / 4) % etiquetas.length]
      : null;

    return prisma.practice.create({
      data: {
        studentId: student.id,
        companyId: empresa.id,
        facultyId: faculty.id,
        academicPeriod: periodo,
        tutorName: TUTORES[i % TUTORES.length],
        practiceLevel: nivel.practiceLevel,
        academicLevel: nivel.academicLevel,
        workArea: AREAS[i % AREAS.length],
        totalHours: nivel.totalHours,
        status: opts.status || 'PENDING',
        labelId: etiqueta ? etiqueta.id : null,
        startDate: opts.startDate || null,
        endDate: opts.endDate || null,
      },
    });
  }

  // --- 2025-1: la cohorte que ya pasó ---
  const COHORTE_1 = 26;
  const inicio1 = new Date('2025-05-12');
  const fin1 = new Date('2025-09-19');
  const cohorte2025_1 = [];
  for (let i = 0; i < COHORTE_1; i++) {
    const student = await crearEstudiante(i);
    cohorte2025_1.push(student);
    // Dos casos que no prosperaron: la empresa desistió y el estudiante retiró.
    const status = i === 7 ? 'REJECTED' : i === 18 ? 'CANCELED' : 'PENDING';
    await crearPractica(student, '2025-1', i % 3, i, { status, startDate: inicio1, endDate: fin1 });
  }
  console.log('2025-1: ' + COHORTE_1 + ' estudiantes con práctica.');

  // --- 2025-2: los que siguen + los que vuelven + los nuevos ---
  const inicio2 = new Date('2025-11-10');
  const REPITEN = 10;
  for (let i = 0; i < REPITEN; i++) {
    // Sube un nivel: el mismo estudiante, otra práctica. Su ficha no se duplica.
    await crearPractica(cohorte2025_1[i], '2025-2', (i % 3) + 1, i, { startDate: inicio2 });
  }

  // Estudiantes de 2024-1 que reaparecen un año después, un nivel más arriba.
  // El nivel se calcula desde el que traían, no desde el índice del bucle: un
  // estudiante que estaba en Séptimo no puede aparecer en Noveno de un salto.
  const veteranos = await prisma.student.findMany({
    where: { deletedAt: null, practices: { some: { academicPeriod: '2024-1' } } },
    take: 8,
    orderBy: { lastName: 'asc' },
    include: {
      practices: { where: { academicPeriod: '2024-1' }, select: { academicLevel: true }, take: 1 },
    },
  });
  for (let i = 0; i < veteranos.length; i++) {
    const nivelPrevio = veteranos[i].practices[0] ? veteranos[i].practices[0].academicLevel : null;
    const idxPrevio = NIVELES.findIndex((n) => n.academicLevel === nivelPrevio);
    const idxSiguiente = idxPrevio === -1 ? 3 : Math.min(idxPrevio + 1, NIVELES.length - 1);
    await crearPractica(veteranos[i], '2025-2', idxSiguiente, COHORTE_1 + i, { startDate: inicio2 });
  }

  const NUEVOS_2 = 22;
  for (let i = 0; i < NUEVOS_2; i++) {
    const student = await crearEstudiante(COHORTE_1 + i);
    await crearPractica(student, '2025-2', i % 4, COHORTE_1 + veteranos.length + i, { startDate: inicio2 });
  }
  console.log('2025-2: ' + REPITEN + ' que continúan + ' + veteranos.length + ' de 2024-1 + ' + NUEVOS_2 + ' nuevos.');

  // 7. Un solo periodo abierto ----------------------------------------------
  await prisma.academicPeriod.updateMany({ data: { isActive: false } });
  await prisma.academicPeriod.update({ where: { code: '2025-2' }, data: { isActive: true } });
  console.log('\nPeriodo abierto: 2025-2. Cerrados: 2024-1, 2025-1.');

  // 8. Resumen ---------------------------------------------------------------
  const resumen = await prisma.practice.groupBy({
    by: ['academicPeriod', 'academicLevel'],
    _count: true,
    orderBy: [{ academicPeriod: 'asc' }, { academicLevel: 'asc' }],
  });
  console.log('\nPrácticas por periodo y nivel:');
  for (const fila of resumen) {
    const nivel = (fila.academicLevel || 'sin nivel').padEnd(16);
    console.log('  ' + fila.academicPeriod + '  ' + nivel + ' ' + fila._count);
  }
}

main()
  .catch((e) => {
    console.error('\nFalló el sembrado: ' + e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
