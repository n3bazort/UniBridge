/**
 * Siembra el período 2024-1 con un cierre de semestre realista para poder medir
 * el rendimiento de la emisión masiva de certificados.
 *
 * Por qué 124: es el número de certificados que la Comisión de Prácticas emitió
 * realmente en el período 2025-1, según la carpeta compartida con los estudiantes
 * (apartado 3.9.1 de la tesis). No es una cifra inventada para la prueba: es el
 * volumen de un cierre real.
 *
 * Cada estudiante queda con una práctica que cumple las SIETE condiciones que el
 * sistema exige para certificar (`canIssueCertificate`): horas > 0, tutor asignado,
 * nivel de práctica, nivel académico, estado no rechazado ni cancelado, acta de
 * calificaciones aprobada por el tutor y ningún certificado vigente previo.
 *
 * Cada ejecución parte de cero: lo primero que hace es BORRAR lo sembrado
 * anteriormente —estudiantes, prácticas, documentos y los PDF del almacén—,
 * reconocible por el prefijo de cédula 9024xxxxxx. Antes se reutilizaban los
 * estudiantes y solo se invalidaban sus certificados, y bastaba con que una
 * corrida se interrumpiera a medias para que la siguiente encontrara dos o
 * tres certificados vigentes y se negara a emitir el lote entero. Una
 * medición tiene que arrancar siempre del mismo estado.
 *
 * Uso:  node benchmarks/sembrar-periodo-2024-1.cjs [N]
 */
const fs = require('fs');
const path = require('path');

// La conexión vive en apps/api/.env, no en el entorno del shell. Se lee a mano
// para no arrastrar dotenv solo por esto.
const ENV = path.join(__dirname, '..', 'apps', 'api', '.env');
if (fs.existsSync(ENV)) {
  for (const linea of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');
const { limpiar } = require('./limpiar-periodo-2024-1.cjs');

const prisma = new PrismaClient();
const PERIODO = '2024-1';
const N = parseInt(process.argv[2] || '124', 10);
const PREFIJO_DNI = '9024';

const NOMBRES = [
  'Ariana', 'Bryan', 'Camila', 'Dennis', 'Elena', 'Fabián', 'Gabriela', 'Héctor',
  'Isabel', 'Joel', 'Karla', 'Luis', 'Mariana', 'Néstor', 'Olivia', 'Paúl',
  'Quimberly', 'Ricardo', 'Sofía', 'Tomás', 'Úrsula', 'Víctor', 'Wendy', 'Ximena',
  'Yandri', 'Zoila', 'Andrés', 'Belén', 'Cristhian', 'Daniela',
];
const APELLIDOS = [
  'Alcívar', 'Bravo', 'Cedeño', 'Delgado', 'Espinales', 'Farías', 'García',
  'Holguín', 'Intriago', 'Jaramillo', 'Loor', 'Macías', 'Mendoza', 'Navarrete',
  'Ostaiza', 'Pincay', 'Quijije', 'Rodríguez', 'Solórzano', 'Toala', 'Vera',
  'Zambrano', 'Andrade', 'Briones', 'Chávez', 'Dueñas',
];

const NIVELES_PRACTICA = ['Práctica Preprofesional I', 'Práctica Preprofesional II'];
const NIVELES_ACADEMICOS = ['Quinto', 'Sexto', 'Séptimo', 'Octavo'];
const TUTORES = [
  'Ing. Marcos Vinicio Cedeño Alcívar, Mg.',
  'Ing. Diana Carolina Loor Zambrano, Mg.',
  'Ing. Julio César Mendoza Bravo, Mg.',
  'Ing. Patricia Elizabeth Vera Macías, Mg.',
];

/** Cédula sintética de 10 dígitos con prefijo reconocible, para poder limpiarla luego. */
const cedula = (i) => PREFIJO_DNI + String(i).padStart(6, '0');

async function main() {
  console.log(`\nSembrando el período ${PERIODO} con ${N} estudiantes y sus prácticas.\n`);

  const periodo = await prisma.academicPeriod.findUnique({ where: { code: PERIODO } });
  if (!periodo) throw new Error(`El período ${PERIODO} no existe.`);
  if (!periodo.deanName?.trim() || !periodo.directorName?.trim()) {
    throw new Error(`El período ${PERIODO} no tiene decano ni responsable configurados.`);
  }
  if (!periodo.isActive) throw new Error(`El período ${PERIODO} está cerrado; ábrelo antes de sembrar.`);
  console.log(`  período   : ${periodo.code} (activo)`);
  console.log(`  decano    : ${periodo.deanName}`);
  console.log(`  responsable: ${periodo.directorName}`);

  const faculty = await prisma.faculty.findFirst();
  const program =
    (await prisma.program.findFirst({ where: { abbreviation: 'TI', facultyId: faculty.id } })) ||
    (await prisma.program.findFirst({ where: { abbreviation: 'TI' } }));
  const empresas = await prisma.company.findMany({ take: 50 });
  if (!empresas.length) throw new Error('No hay empresas registradas.');
  console.log(`  facultad  : ${faculty.name}`);
  console.log(`  programa  : ${program.name} (${program.abbreviation})`);
  console.log(`  empresas  : ${empresas.length} disponibles\n`);

  console.log('Borrando lo sembrado en corridas anteriores:\n');
  await limpiar(prisma);

  console.log('Sembrando:\n');
  for (let i = 1; i <= N; i++) {
    const dni = cedula(i);
    const firstName = `${NOMBRES[i % NOMBRES.length]} ${NOMBRES[(i * 7) % NOMBRES.length]}`;
    const lastName = `${APELLIDOS[i % APELLIDOS.length]} ${APELLIDOS[(i * 5) % APELLIDOS.length]}`;

    // La limpieza previa garantiza que ninguna de estas cédulas existe todavía.
    const student = await prisma.student.create({
      data: { dni, firstName, lastName, facultyId: faculty.id, programId: program.id },
    });

    const datos = {
      companyId: empresas[i % empresas.length].id,
      facultyId: faculty.id,
      academicPeriod: PERIODO,
      tutorName: TUTORES[i % TUTORES.length],
      practiceLevel: NIVELES_PRACTICA[i % NIVELES_PRACTICA.length],
      academicLevel: NIVELES_ACADEMICOS[i % NIVELES_ACADEMICOS.length],
      totalHours: 240,
      status: 'IN_PROGRESS',
      // El acta de calificaciones del docente: sin ella el sistema se niega a certificar.
      tutorApprovedAt: new Date('2024-07-15T12:00:00Z'),
      startDate: new Date('2024-04-01T12:00:00Z'),
      endDate: new Date('2024-07-05T12:00:00Z'),
    };

    await prisma.practice.create({ data: { studentId: student.id, ...datos } });

    if (i % 25 === 0) process.stdout.write(`  sembrados ${i}/${N}\r`);
  }

  console.log(`  sembrados ${N}/${N}      \n`);
  console.log(`  estudiantes creados : ${N}`);
  console.log(`  prácticas en ${PERIODO}: ${N}, todas aptas para certificar`);
  console.log(`  certificados vigentes: 0 — el lote parte de cero\n`);
}

main()
  .catch((e) => {
    console.error('\nERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
