/**
 * Fase 2 · Trasvase de datos tras el cambio de esquema.
 *
 * Hace dos cosas, ambas idempotentes (se puede volver a correr sin daño):
 *
 *   1. TUTORES (RF-23). El nombre del docente vivía como texto libre en cada
 *      práctica. Aquí se agrupa por una clave insensible a tildes, mayúsculas y
 *      espacios de más —«Ing. Pérez» e «ING. PEREZ  » son el mismo docente— se
 *      crea una fila por docente y se enlaza cada práctica con `tutorId`.
 *      `tutorName` se conserva y se reescribe con la grafía elegida, de modo
 *      que las plantillas de documento sigan imprimiendo un texto y no queden
 *      dos versiones distintas del mismo nombre.
 *
 *   2. MOTIVOS (RF-24). Siembra el catálogo base de motivos de invalidación y
 *      de baja, con códigos estables porque son los que agrupan los reportes.
 *
 * Uso:
 *   node scripts/fase2-tutores-y-motivos.js              → informa, no escribe
 *   node scripts/fase2-tutores-y-motivos.js --ejecutar   → aplica los cambios
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Las credenciales viven en el .env de la API, igual que en el resto de scripts.
const envApi = path.join(__dirname, '..', 'apps', 'api', '.env');
if (fs.existsSync(envApi)) {
  for (const linea of fs.readFileSync(envApi, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const prisma = new PrismaClient();
const EJECUTAR = process.argv.includes('--ejecutar');

/** Clave de identidad de un docente: sin tildes, sin mayúsculas, sin espacios de más. */
function claveDe(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * De todas las grafías del mismo docente, la que se queda.
 *
 * Gana la más frecuente; a igualdad, la más larga, porque suele ser la que
 * conserva el título («Ing. Juan Pérez, Mg.» frente a «Juan Pérez»).
 */
function mejorGrafia(variantes) {
  const cuenta = new Map();
  for (const v of variantes) cuenta.set(v, (cuenta.get(v) || 0) + 1);
  return [...cuenta.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length,
  )[0][0];
}

const MOTIVOS = [
  // scope PRACTICE: cerrar o dar de baja una práctica
  { code: 'EMPRESA_RECHAZA',   label: 'La empresa rechazó al estudiante',        scope: 'PRACTICE', sortOrder: 10 },
  { code: 'ESTUDIANTE_RETIRA', label: 'El estudiante se retiró',                 scope: 'PRACTICE', sortOrder: 20 },
  { code: 'CAMBIO_EMPRESA',    label: 'Cambio de empresa',                       scope: 'PRACTICE', sortOrder: 30 },
  { code: 'CAMBIO_TUTOR',      label: 'Cambio de tutor',                         scope: 'PRACTICE', sortOrder: 40 },
  { code: 'CUPO_AGOTADO',      label: 'La empresa no tenía cupo disponible',     scope: 'PRACTICE', sortOrder: 50 },
  // scope DOCUMENT: invalidar un documento ya emitido
  { code: 'DOC_DATOS_ERRONEOS', label: 'Error en los datos del documento',       scope: 'DOCUMENT', sortOrder: 60 },
  { code: 'DOC_PERIODO_ERRADO', label: 'Período académico equivocado',           scope: 'DOCUMENT', sortOrder: 70 },
  { code: 'DOC_REEMPLAZADO',    label: 'Reemplazado por una versión corregida',  scope: 'DOCUMENT', sortOrder: 80 },
  // sirven en los dos diálogos
  { code: 'OTRO',              label: 'Otro motivo (se detalla en la nota)',     scope: 'BOTH',     sortOrder: 99 },
];

async function tutores() {
  console.log('\n=== 1. Tutores (RF-23) ===');

  const practicas = await prisma.practice.findMany({
    where: { tutorName: { not: null }, deletedAt: null },
    select: { id: true, facultyId: true, tutorName: true, tutorId: true, student: { select: { programId: true } } },
  });

  const conNombre = practicas.filter((p) => p.tutorName && p.tutorName.trim());
  if (conNombre.length === 0) {
    console.log('  No hay prácticas con tutor escrito. Nada que trasvasar.');
    return;
  }

  // Agrupar por facultad + clave del nombre: el mismo apellido en dos
  // facultades son dos docentes distintos, y así lo exige el índice único.
  const grupos = new Map();
  for (const p of conNombre) {
    const clave = `${p.facultyId}|${claveDe(p.tutorName)}`;
    if (!grupos.has(clave)) grupos.set(clave, { facultyId: p.facultyId, variantes: [], practicas: [], programas: [] });
    const g = grupos.get(clave);
    g.variantes.push(p.tutorName.replace(/\s+/g, ' ').trim());
    g.practicas.push(p.id);
    if (p.student && p.student.programId) g.programas.push(p.student.programId);
  }

  console.log(`  ${conNombre.length} prácticas con tutor → ${grupos.size} docentes distintos.`);
  const fusionados = [...grupos.values()].filter((g) => new Set(g.variantes).size > 1);
  for (const g of fusionados) {
    console.log(`  · se unifican ${new Set(g.variantes).size} grafías: ${[...new Set(g.variantes)].join(' | ')}`);
  }

  if (!EJECUTAR) {
    console.log('  (simulación: no se escribió nada)');
    return;
  }

  let creados = 0, reutilizados = 0, enlazadas = 0;
  for (const g of grupos.values()) {
    const fullName = mejorGrafia(g.variantes);

    // La carrera solo se fija cuando todos sus estudiantes son de la misma:
    // adivinarla con una mayoría dejaría un dato falso donde nadie lo revisa.
    const carreras = [...new Set(g.programas)];
    const programId = carreras.length === 1 ? carreras[0] : null;

    const existente = await prisma.tutor.findUnique({
      where: { facultyId_fullName: { facultyId: g.facultyId, fullName } },
    });
    const tutor = existente
      ? (reutilizados++, existente)
      : (creados++, await prisma.tutor.create({ data: { facultyId: g.facultyId, fullName, programId } }));

    const r = await prisma.practice.updateMany({
      where: { id: { in: g.practicas } },
      // Se reescribe también el nombre para dejar una sola grafía en circulación.
      data: { tutorId: tutor.id, tutorName: fullName },
    });
    enlazadas += r.count;
  }

  console.log(`  ✓ ${creados} docentes creados, ${reutilizados} ya existían, ${enlazadas} prácticas enlazadas.`);

  // Aviso temprano del RF-22: quién ya pasa del tope antes de que nadie asigne.
  const excedidos = await prisma.practice.groupBy({
    by: ['tutorId', 'academicPeriod'],
    where: { tutorId: { not: null }, deletedAt: null, closedAt: null },
    _count: { _all: true },
    having: { tutorId: { _count: { gt: 20 } } },
  });
  if (excedidos.length > 0) {
    console.log(`  ⚠ ${excedidos.length} docente(s) ya superan los 20 estudiantes en un período:`);
    for (const e of excedidos) {
      const t = await prisma.tutor.findUnique({ where: { id: e.tutorId }, select: { fullName: true } });
      console.log(`     ${t && t.fullName} · ${e.academicPeriod} · ${e._count._all} estudiantes`);
    }
    console.log('     El tope no se aplica hacia atrás: solo bloquea asignaciones nuevas.');
  }
}

async function motivos() {
  console.log('\n=== 2. Motivos tipificados (RF-24) ===');
  if (!EJECUTAR) {
    console.log(`  Se sembrarían ${MOTIVOS.length} motivos base.`);
    return;
  }
  for (const m of MOTIVOS) {
    await prisma.reasonCode.upsert({
      where: { code: m.code },
      // Al volver a correr solo se refresca la etiqueta y el orden: si alguien
      // desactivó un motivo desde la administración, se respeta.
      update: { label: m.label, scope: m.scope, sortOrder: m.sortOrder },
      create: { ...m, isSystem: true },
    });
  }
  console.log(`  ✓ ${MOTIVOS.length} motivos base sembrados.`);
}

(async () => {
  console.log(EJECUTAR ? 'Aplicando cambios…' : 'Simulación. Añade --ejecutar para aplicar.');
  try {
    await tutores();
    await motivos();
    console.log('\nListo.');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('\nFalló:', e.message);
  process.exit(1);
});
