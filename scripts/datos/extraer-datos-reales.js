/**
 * Extrae el padrón real de prácticas y lo deja listo para el generador del
 * Excel de pruebas.
 *
 * El archivo de origen trae los datos de campo, pero no encaja con el formato
 * vigente: le faltan el área de desempeño y la ficha de 35 de las empresas que
 * sus propias prácticas citan. Aquí se completa lo que falta —sin inventar
 * estudiantes ni prácticas, que son los datos que importan— y se vuelca a un
 * JSON que consume `generar-excel-prueba.js`.
 *
 * Uso:  node scripts/datos/extraer-datos-reales.js [ruta del .xlsx de origen]
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const ORIGEN = process.argv[2] ||
  'C:/Users/micro/OneDrive/Desktop/New Tesis/apps/web/public/templates/Plantilla Importacion de datos.xlsx';
const DESTINO = path.join(__dirname, 'padron-practicas.json');

const wb = XLSX.readFile(ORIGEN);
const hoja = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false })
  .slice(2)
  .filter((f) => f && String(f[1] || f[2] || '').trim() !== '');

const est = hoja('👥 Estudiantes');
const emp = hoja('🏢 Empresas');
const tut = hoja('👨‍🏫 Tutores Académicos');
const pra = hoja('📋 Prácticas');

const limpio = (v) => String(v ?? '').trim();
const clave = (s) => limpio(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase();

// ───────────────────────── Cédulas ─────────────────────────

/**
 * Dígito verificador de una cédula ecuatoriana (módulo 10 sobre los nueve
 * primeros dígitos). Las del origen venían con nueve, que no es una cédula
 * válida; se les calcula el décimo para que lo sean.
 */
function digitoVerificador(nueve) {
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(nueve[i]) * coef[i];
    if (p >= 10) p -= 9;
    suma += p;
  }
  const resto = suma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

function cedulaValida(bruta) {
  const soloDigitos = limpio(bruta).replace(/\D/g, '');
  if (soloDigitos.length >= 10) return soloDigitos.slice(0, 10);
  const nueve = soloDigitos.padStart(9, '0');
  return nueve + digitoVerificador(nueve);
}

// ───────────────────── Fichas de empresa que faltan ─────────────────────

const NOMBRES_CONTACTO = [
  ['Ing.', 'Patricia Solórzano Cedeño'], ['Ing.', 'Ricardo Andrade Moreira'],
  ['Lcda.', 'Mariana Vélez Cedeño'], ['Ing.', 'Fabián Zambrano Loor'],
  ['Ing.', 'Gabriela Mendoza Pico'], ['Lcdo.', 'Jorge Intriago Bravo'],
  ['Ing.', 'Andrea Cañarte Delgado'], ['Ing.', 'Marcelo Chávez Pinargote'],
  ['Lcda.', 'Verónica Loor Anchundia'], ['Ing.', 'Byron Macías Alcívar'],
  ['Ing.', 'Karina Briones Mera'], ['Abg.', 'Daniel Cevallos Vera'],
  ['Ing.', 'Silvia Ponce Rodríguez'], ['Ing.', 'Hugo Palacios Zambrano'],
  ['Lcda.', 'Elena Bailón Santana'], ['Ing.', 'Óscar Quiroz Delgado'],
  ['Ing.', 'Tatiana Farías Moreira'], ['Dr.', 'Julio Mero Villavicencio'],
  ['Ing.', 'Nathaly Pico Cedeño'], ['Ing.', 'Rubén Giler Menéndez'],
];

/**
 * Perfil de la organización a partir de su nombre. Sirve para que el cargo, el
 * correo y el teléfono que se generan sean creíbles: un ministerio no tiene
 * «Gerente General» ni un dominio .com.
 */
function perfil(nombre) {
  const n = clave(nombre);
  const es = (...claves) => claves.some((c) => n.includes(c));

  if (es('ULEAM', 'FCVT', 'SUBDECANATO', 'EPULEAM', 'SEGUIMIENTO A GRADUADOS', 'PROYECTO', 'AYUDANTIA'))
    return { cargo: 'Responsable de la Unidad', dominio: 'uleam.edu.ec', buzon: 'coordinacion', fijo: true };
  if (es('MINISTERIO'))
    return { cargo: 'Director Distrital de Tecnologías', dominio: 'gob.ec', buzon: 'tics', fijo: true };
  if (es('GAD', 'MOVILIDAD', 'AUTORIDAD PORTUARIA', 'TERMINAL PORTUARIA', 'BOMBEROS'))
    return { cargo: 'Jefe de Sistemas', dominio: 'gob.ec', buzon: 'sistemas', fijo: true };
  if (es('HOSPITAL', 'DISTRITO DE SALUD', 'INSTITUTO DE NEUROCIENCIAS', 'IESS'))
    return { cargo: 'Coordinador de Informática', dominio: 'gob.ec', buzon: 'informatica', fijo: true };
  if (es('UNIDAD EDUCATIVA', 'COLEGIO', 'ESCUELA'))
    return { cargo: 'Rector', dominio: 'edu.ec', buzon: 'rectorado', fijo: true };
  if (es('COOPERATIVA'))
    return { cargo: 'Jefe de Tecnología', dominio: 'fin.ec', buzon: 'tecnologia', fijo: true };
  if (es('EP', 'CNEL', 'EPAM', 'EPESPO'))
    return { cargo: 'Analista de Sistemas', dominio: 'gob.ec', buzon: 'sistemas', fijo: true };
  if (es('HOSTING', 'CLOUD', 'PC', 'IOT', 'TECNOLOG', 'SOFTWARE'))
    return { cargo: 'Jefe de Tecnologías de la Información', dominio: 'com', buzon: 'soporte', fijo: false };
  if (es('HOTEL', 'EXPEDITIONS', 'TURISMO'))
    return { cargo: 'Administrador', dominio: 'com', buzon: 'administracion', fijo: false };
  if (es('CONSERVAS', 'FISH', 'PESCA', 'MARZAM', 'PRODUCE'))
    return { cargo: 'Jefe de Recursos Humanos', dominio: 'com.ec', buzon: 'talentohumano', fijo: false };
  return { cargo: 'Gerente General', dominio: 'com.ec', buzon: 'gerencia', fijo: false };
}

/** Dominio corto y legible a partir del nombre de la organización. */
function dominioDe(nombre, sufijo) {
  const base = clave(nombre)
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .filter((p) => p.length > 2 && !['DEL', 'LOS', 'LAS', 'DE', 'LA', 'EL', 'SA', 'LTDA', 'CIA'].includes(p))
    .slice(0, 2)
    .join('')
    .toLowerCase();
  return `${base || 'empresa'}.${sufijo}`;
}

function fichaGenerada(nombre, i) {
  const p = perfil(nombre);
  const [titulo, persona] = NOMBRES_CONTACTO[i % NOMBRES_CONTACTO.length];
  const dominio = dominioDe(nombre, p.dominio);
  const telefono = p.fijo
    ? `05${String(2600000 + ((i * 7919) % 99999)).padStart(7, '0')}`
    : `09${String(60000000 + ((i * 5417) % 39999999)).padStart(8, '0')}`;
  return {
    nombre,
    contacto: `${titulo} ${persona}`,
    cargo: p.cargo,
    email: `${p.buzon}@${dominio}`,
    telefono,
    generada: true,
  };
}

// ───────────────────── Área de desempeño ─────────────────────

const AREAS_POR_PERFIL = {
  'uleam.edu.ec': ['Soporte Técnico', 'Desarrollo de Software', 'Gestión Académica'],
  'gob.ec': ['TI', 'Sistemas', 'Redes y Comunicaciones', 'Soporte Técnico'],
  'edu.ec': ['Soporte Técnico', 'Laboratorio de Cómputo'],
  'fin.ec': ['Desarrollo de Software', 'Seguridad Informática'],
  'com': ['Desarrollo de Software', 'Infraestructura y Servidores', 'Soporte Técnico'],
  'com.ec': ['TI', 'Soporte Técnico', 'Redes y Comunicaciones'],
};

function areaDe(nombreEmpresa, i) {
  const p = perfil(nombreEmpresa);
  const lista = AREAS_POR_PERFIL[p.dominio] || ['TI'];
  return lista[i % lista.length];
}

// ───────────────────────── Fusión ─────────────────────────

// Directorio de empresas: las reales, más las que sus prácticas citan sin ficha
const directorio = new Map();
emp.forEach((f) => {
  directorio.set(clave(f[1]), {
    nombre: limpio(f[1]),
    contacto: limpio(f[2]),
    cargo: limpio(f[3]),
    email: limpio(f[4]),
    telefono: limpio(f[5]),
    generada: false,
  });
});

const citadas = [...new Set(pra.map((f) => limpio(f[5])).filter(Boolean))];
let generadas = 0;
citadas.forEach((nombre) => {
  if (directorio.has(clave(nombre))) return;
  directorio.set(clave(nombre), fichaGenerada(nombre, generadas++));
});

// Prácticas indexadas por estudiante, que es de donde salen tipo, nivel y horas
const practicaDe = new Map();
pra.forEach((f) => practicaDe.set(clave(f[2]), {
  empresa: limpio(f[5]),
  tutor: limpio(f[10]),
  tipo: limpio(f[11]),
  nivel: limpio(f[12]),
  horas: Number(limpio(f[13])) || 0,
  periodo: limpio(f[14]),
}));

const estudiantes = est.map((f, i) => {
  const nombre = limpio(f[2]);
  const cedula = cedulaValida(f[1]);
  const p = practicaDe.get(clave(nombre));
  if (!p) throw new Error('sin práctica: ' + nombre);
  return {
    cedula,
    nombre,
    // El correo institucional lleva la cédula dentro, así que se rehace para
    // que siga cuadrando con ella
    correo: `e${cedula}@live.uleam.edu.ec`,
    carrera: limpio(f[5]) || 'Tecnologías de la Información',
    celular: limpio(f[4]),
    tipo: p.tipo,
    nivel: p.nivel,
    horas: p.horas,
    periodo: p.periodo,
  };
});

const practicas = est.map((f, i) => {
  const nombre = limpio(f[2]);
  const p = practicaDe.get(clave(nombre));
  return { estudiante: nombre, empresa: p.empresa, tutor: p.tutor, area: areaDe(p.empresa, i) };
});

const salida = {
  origen: path.basename(ORIGEN),
  extraido: new Date().toISOString().slice(0, 10),
  estudiantes,
  empresas: [...directorio.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  tutores: tut.map((f) => limpio(f[1])).filter(Boolean),
  practicas,
};

fs.writeFileSync(DESTINO, JSON.stringify(salida, null, 2), 'utf8');

console.log('  estudiantes : ' + salida.estudiantes.length);
console.log('  prácticas   : ' + salida.practicas.length);
console.log('  tutores     : ' + salida.tutores.length);
console.log('  empresas    : ' + salida.empresas.length +
  '  (' + salida.empresas.filter((e) => !e.generada).length + ' del padrón, ' +
  salida.empresas.filter((e) => e.generada).length + ' con ficha generada)');
console.log('\nescrito: ' + DESTINO);
