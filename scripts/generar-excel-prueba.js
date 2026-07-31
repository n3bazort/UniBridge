/**
 * Genera los dos archivos de importación con una única estructura:
 *   · «Plantilla Practicas - En Blanco.xlsx»  → la maestra que se descarga
 *   · «Datos de Prueba - N Estudiantes.xlsx»  → la misma, ya rellenada con el padrón
 *
 * La idea es que toda la información viva en los tres directorios (estudiantes,
 * empresas y tutores) y que armar una práctica se reduzca a elegir tres cosas:
 * el estudiante por su nombre, la empresa y el tutor académico. Las demás
 * columnas se resuelven con fórmulas INDEX/MATCH contra esos directorios.
 *
 * Uso:  node scripts/generar-excel-prueba.js
 */
const ExcelJS = require('exceljs');
const path = require('path');

const DESTINO = path.join(__dirname, '..', 'apps', 'web', 'public', 'templates');
const HOJA_EST = '👥 Estudiantes';
const HOJA_EMP = '🏢 Empresas';
const HOJA_TUT = '👨‍🏫 Tutores Académicos';
const HOJA_PRA = '📋 Prácticas';

const FILAS = 200; // hasta dónde llegan fórmulas y listas desplegables

/* ─────────────── datos de prueba ─────────────── */
const NOMBRES = [
  'Alcívar Mendoza Camila Nicole', 'Andrade Zambrano Kevin Steven', 'Arteaga Bravo Doménica Belén',
  'Bailón Cedeño Anthony Josué', 'Barcia Loor Melany Dayana', 'Briones Delgado Erick Sebastián',
  'Cañarte Vera Allison Micaela', 'Cedeño Palma Jandry Alexander', 'Chávez Moreira Kerly Anahí',
  'Delgado Intriago Bryan Adrián', 'Farías Mera Nayeli Estefanía', 'García Solórzano Luis Andrés',
  'Giler Vélez Karla Michelle', 'Hidalgo Zamora Christopher Joel', 'Intriago Macías Génesis Paola',
  'Loor Pincay Jean Carlos', 'Macías Alcívar Danna Valentina', 'Mendoza Rivas Jordy Fabián',
  'Moreira Chica Aitana Sofía', 'Muñoz Bazurto Ariel Ricardo', 'Ortega Lucas Emily Johanna',
  'Palma Cevallos Mateo Nicolás', 'Pico Santana Doménica Rafaela', 'Quiroz Andrade Steven Alexis',
  'Rivera Chávez Antonella Lucía', 'Sánchez Zambrano Diego Armando', 'Santos Vinces Ashley Nicole',
  'Vera Mendoza Josué Emilio', 'Villamar Cedeño Milena Isabel', 'Zambrano Ponce Randy Josué',
];
const EMPRESAS = [
  ['GAD MUNICIPAL DEL CANTON MANTA', 'Ing. Patricia Solórzano Cedeño', 'Directora de Tecnologías de la Información', 'sistemas@manta.gob.ec', '052620500'],
  ['AUTORIDAD PORTUARIA DE MANTA', 'Ing. Ricardo Andrade Moreira', 'Jefe de Sistemas', 'ti@puertodemanta.gob.ec', '052621010'],
  ['HOSPITAL RODRIGUEZ ZAMBRANO', 'Lcda. Mariana Vélez Cedeño', 'Coordinadora de Informática', 'informatica@hrz.gob.ec', '052622020'],
  ['COOPERATIVA DE AHORRO CHONE LTDA', 'Ing. Fabián Zambrano Loor', 'Jefe de Desarrollo', 'desarrollo@coopchone.fin.ec', '052696030'],
  ['EMPRESA PUBLICA DE AGUA EPAM', 'Ing. Gabriela Mendoza Pico', 'Analista de Sistemas', 'sistemas@epam.gob.ec', '052623040'],
  ['UNIVERSIDAD LAICA ELOY ALFARO DE MANABI', 'Ing. Mike Machuca Alcívar', 'Administrador de la FCVT', 'mike.machuca@uleam.edu.ec', '052623740'],
  ['DIRECCION DISTRITAL DE EDUCACION 13D02', 'Lcdo. Jorge Intriago Bravo', 'Responsable de TIC', 'tic@13d02.educacion.gob.ec', '052625050'],
  ['CORPORACION TECNOLOGICA DEL PACIFICO', 'Ing. Andrea Cañarte Delgado', 'Gerente de Proyectos', 'talento@ctpacifico.ec', '052626060'],
];
const TUTORES = [
  'Ing. Juan Carlos Sendón Varela, Mg.', 'Ing. José Jacinto Reyes Cárdenas, Mg.',
  'Ing. Gina Alexandra Zambrano Loor, Mg.', 'Ing. Marcos Vinicio Cedeño Palma, Mg.',
  'Ing. Ana Lucía Bravo Moreira, Mg.',
];
const NIVELES = ['Séptimo Nivel', 'Octavo Nivel', 'Noveno Nivel'];
const TIPOS = ['Prácticas Laborales I', 'Prácticas Laborales II', 'Prácticas de Servicio Comunitario'];
// Área de la empresa donde se desempeña el estudiante: la solicitud oficial la
// imprime tal cual, así que se escribe como la nombra la empresa.
const AREAS = ['TI', 'Sistemas', 'Soporte Técnico', 'Desarrollo de Software', 'Redes y Comunicaciones'];
const PERIODO = '2024-1';

/**
 * Padrón real, si está extraído.
 *
 * Cuando existe, los datos de prueba salen del padrón de campo en vez de la
 * muestra sintética de arriba: mismos estudiantes, mismas empresas y mismas
 * asignaciones que maneja la Facultad. El FORMATO no cambia —columnas,
 * fórmulas, listas y estilos son los mismos—, solo cambia lo que se escribe.
 *
 * Se regenera con `node scripts/datos/extraer-datos-reales.js`.
 */
let PADRON = null;
try {
  PADRON = require('./datos/padron-practicas.json');
} catch { /* sin padrón se usa la muestra sintética */ }

/** Lo que se escribe en cada hoja: del padrón si lo hay, de la muestra si no. */
const ESTUDIANTES = PADRON ? PADRON.estudiantes : NOMBRES.map((nombre, i) => {
  const cedula = String(1316000100 + i);
  return {
    cedula,
    nombre,
    correo: `e${cedula}@live.uleam.edu.ec`,
    carrera: 'Tecnologías de la Información',
    celular: `09${String(60000001 + i)}`,
    tipo: TIPOS[i % 2 === 0 ? 1 : 0],
    nivel: NIVELES[i % 2 === 0 ? 1 : 0],
    horas: i % 2 === 0 ? 240 : 120,
    periodo: PERIODO,
  };
});

const EMPRESAS_FILAS = PADRON
  ? PADRON.empresas.map((e) => [e.nombre, e.contacto, e.cargo, e.email, e.telefono])
  : EMPRESAS;

const TUTORES_FILAS = PADRON ? PADRON.tutores : TUTORES;

const PRACTICAS = PADRON ? PADRON.practicas : NOMBRES.map((nombre, i) => ({
  estudiante: nombre,
  empresa: EMPRESAS[i % EMPRESAS.length][0],
  tutor: TUTORES[i % TUTORES.length],
  area: AREAS[i % AREAS.length],
}));

/* ─────────────── estilos ─────────────── */
const AZUL = 'FF1F3864';
const titulo = (ws, texto, cols) => {
  ws.mergeCells(1, 1, 1, cols);
  const c = ws.getCell(1, 1);
  c.value = texto;
  c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 26;
};
const cabecera = (ws, headers, calculadas = []) => {
  const r = ws.getRow(2);
  headers.forEach((h, i) => {
    const c = r.getCell(i + 1);
    c.value = h;
    c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: calculadas.includes(i + 1) ? 'FF667085' : 'FF1F2937' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: calculadas.includes(i + 1) ? 'FFF3F4F6' : 'FFDCE6F1' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF9BA7B4' } } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  r.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 2 }];
};

/* ─────────────── construcción ─────────────── */
async function construir({ salida, conDatos }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UniBridge';
  wb.created = new Date();

  /* ── Instrucciones ── */
  const ins = wb.addWorksheet('📖 Instrucciones');
  ins.columns = [{ width: 4 }, { width: 104 }];
  titulo(ins, 'CÓMO LLENAR ESTA PLANTILLA', 2);
  const pasos = [
    '',
    'Esta plantilla es relacional: toda la información se carga una sola vez en los tres',
    'directorios, y la hoja de Prácticas se arma eligiendo de listas desplegables.',
    '',
    'Paso 1 — Hoja «Estudiantes»',
    'Registra a cada estudiante con su cédula, nombre, correo, carrera y celular, y también',
    'el tipo de práctica, el nivel académico, las horas y el período que le corresponden.',
    '',
    'Paso 2 — Hoja «Empresas»',
    'Registra cada empresa receptora con su contacto o representante (companyContactName), el cargo',
    'de esa persona (companyPosition), su correo y su teléfono. Este contacto y su cargo son los que',
    'aparecen como destinatario en los oficios (Solicitud de Prácticas y Designación).',
    '',
    'Paso 3 — Hoja «Tutores Académicos»',
    'Registra a los docentes que harán el seguimiento. La última columna cuenta sola cuántos',
    'estudiantes le tocan a cada uno.',
    '',
    'Paso 4 — Hoja «Prácticas»',
    'Aquí solo se eligen TRES cosas por fila, y las tres son listas desplegables:',
    '   · Apellidos y Nombres del estudiante',
    '   · Empresa receptora',
    '   · Tutor académico',
    'Las demás columnas se completan solas. Las verás en gris cursiva: no las escribas a mano.',
    '',
    'Paso 5 — Subir al sistema',
    'Guarda el archivo y súbelo en Importaciones. El sistema muestra una vista previa antes',
    'de guardar nada.',
  ];
  pasos.forEach((t, i) => {
    const c = ins.getCell(3 + i, 2);
    c.value = t;
    const esTitulo = /^Paso \d/.test(t);
    c.font = { name: 'Calibri', size: 11, bold: esTitulo, color: { argb: esTitulo ? AZUL : 'FF334155' } };
  });

  /* ── Estudiantes ── */
  const est = wb.addWorksheet(HOJA_EST);
  titulo(est, 'DIRECTORIO DE ESTUDIANTES  ·  aquí va todo lo del estudiante y de su práctica', 10);
  cabecera(est, ['N°', 'Cédula', 'Apellidos y Nombres', 'Correo Institucional', 'Carrera', 'Celular',
    'Tipo de Práctica', 'Nivel Académico', 'Horas', 'Periodo']);
  est.columns = [{ width: 5 }, { width: 13 }, { width: 36 }, { width: 32 }, { width: 26 }, { width: 13 },
    { width: 26 }, { width: 15 }, { width: 8 }, { width: 10 }];
  if (conDatos) {
    ESTUDIANTES.forEach((e, i) => {
      est.getRow(3 + i).values = [
        i + 1, e.cedula, e.nombre, e.correo, e.carrera, e.celular,
        e.tipo, e.nivel, e.horas, e.periodo,
      ];
      est.getCell(3 + i, 2).numFmt = '@';
      est.getCell(3 + i, 6).numFmt = '@';   // el celular lleva cero delante
    });
  }
  for (let f = 3; f <= FILAS; f++) {
    est.getCell(f, 7).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${TIPOS.join(',')}"`] };
    est.getCell(f, 8).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${NIVELES.join(',')}"`] };
  }

  /* ── Empresas ── */
  const emp = wb.addWorksheet(HOJA_EMP);
  titulo(emp, 'DIRECTORIO DE EMPRESAS RECEPTORAS', 6);
  cabecera(emp, ['N°', 'Nombre Empresa', 'Contacto / Destinatario de la Empresa', 'Cargo del Contacto / Destinatario', 'Email', 'Teléfono']);
  emp.columns = [{ width: 5 }, { width: 42 }, { width: 36 }, { width: 38 }, { width: 30 }, { width: 13 }];
  if (conDatos) EMPRESAS_FILAS.forEach((e, i) => { emp.getRow(3 + i).values = [i + 1, ...e]; emp.getCell(3 + i, 6).numFmt = '@'; });

  /* ── Tutores ── */
  const tut = wb.addWorksheet(HOJA_TUT);
  titulo(tut, 'TUTORES ACADÉMICOS', 3);
  cabecera(tut, ['N°', 'Nombre Completo con Título', 'N° Estudiantes Asignados'], [3]);
  tut.columns = [{ width: 5 }, { width: 44 }, { width: 22 }];
  const nTut = conDatos ? TUTORES_FILAS.length : 12;
  for (let i = 0; i < nTut; i++) {
    const f = 3 + i;
    tut.getCell(f, 1).value = i + 1;
    if (conDatos) tut.getCell(f, 2).value = TUTORES_FILAS[i];
    // Cuenta en vivo cuántas filas de la hoja de Prácticas llevan a este tutor.
    const cta = tut.getCell(f, 3);
    cta.value = { formula: `IF($B${f}="","",COUNTIF('${HOJA_PRA}'!$K$3:$K$${FILAS},$B${f}))` };
    cta.alignment = { horizontal: 'center' };
    cta.font = { bold: true, color: { argb: 'FF1F3864' } };
  }

  /* ── Prácticas ── */
  const pra = wb.addWorksheet(HOJA_PRA);
  titulo(pra, 'ASIGNACIÓN DE PRÁCTICAS  ·  elija estudiante, empresa y tutor; el resto se completa solo', 15);
  const CALC = [2, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15];
  // «Área de desempeño» es el último dato que se escribe a mano: la solicitud
  // oficial la imprime en «se desarrollen específicamente en el área de: ___».
  cabecera(pra, ['N°', 'Cédula', 'Apellidos y Nombres', 'Correo Institucional', 'Carrera',
    'Empresa Receptora', 'Contacto / Destinatario de la Empresa', 'Cargo del Contacto / Destinatario', 'Email Empresa', 'Teléfono Empresa',
    'Tutor Académico', 'Tipo de Práctica', 'Nivel Académico', 'Horas', 'Periodo',
    'Área de Desempeño'], CALC);
  pra.columns = [{ width: 5 }, { width: 13 }, { width: 36 }, { width: 32 }, { width: 24 },
    { width: 38 }, { width: 32 }, { width: 34 }, { width: 28 }, { width: 15 },
    { width: 38 }, { width: 24 }, { width: 15 }, { width: 7 }, { width: 10 },
    { width: 22 }];

  const rgo = (hoja, col) => `'${hoja}'!$${col}$3:$${col}$${FILAS}`;
  // Se busca por nombre, así que INDEX/MATCH en vez de VLOOKUP: permite traer
  // también la cédula, que en el directorio está a la izquierda del nombre.
  const desdeEstudiante = (f, col) =>
    ({ formula: `IFERROR(INDEX(${rgo(HOJA_EST, col)},MATCH($C${f},${rgo(HOJA_EST, 'C')},0)),"")` });
  const desdeEmpresa = (f, col) =>
    ({ formula: `IFERROR(INDEX(${rgo(HOJA_EMP, col)},MATCH($F${f},${rgo(HOJA_EMP, 'B')},0)),"")` });

  for (let i = 0; i < FILAS - 2; i++) {
    const f = 3 + i;
    const r = pra.getRow(f);
    r.getCell(1).value = { formula: `IF($C${f}="","",ROW()-2)` };
    r.getCell(2).value = desdeEstudiante(f, 'B');   // cédula
    r.getCell(2).numFmt = '@';
    const conFila = conDatos && i < PRACTICAS.length;
    if (conFila) r.getCell(3).value = PRACTICAS[i].estudiante;         // elección 1
    r.getCell(4).value = desdeEstudiante(f, 'D');   // correo
    r.getCell(5).value = desdeEstudiante(f, 'E');   // carrera
    if (conFila) r.getCell(6).value = PRACTICAS[i].empresa;            // elección 2
    r.getCell(7).value = desdeEmpresa(f, 'C');      // contacto empresa
    r.getCell(8).value = desdeEmpresa(f, 'D');      // cargo contacto
    r.getCell(9).value = desdeEmpresa(f, 'E');      // correo empresa
    r.getCell(10).value = desdeEmpresa(f, 'F');     // teléfono empresa
    if (conFila) r.getCell(11).value = PRACTICAS[i].tutor;            // elección 3
    r.getCell(12).value = desdeEstudiante(f, 'G');  // tipo de práctica
    r.getCell(13).value = desdeEstudiante(f, 'H');  // nivel académico
    r.getCell(14).value = desdeEstudiante(f, 'I');  // horas
    r.getCell(15).value = desdeEstudiante(f, 'J');  // periodo
    if (conFila) r.getCell(16).value = PRACTICAS[i].area;              // se escribe a mano

    CALC.forEach((c) => { r.getCell(c).font = { color: { argb: 'FF667085' }, italic: true, size: 10.5 }; });
    [3, 6, 11, 16].forEach((c) => {
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E6' } };
      r.getCell(c).font = { size: 10.5 };
    });
  }

  /* Las tres únicas elecciones */
  const lista = (col, formulae) => {
    for (let f = 3; f <= FILAS; f++) {
      pra.getCell(f, col).dataValidation = {
        type: 'list', allowBlank: true, formulae, showErrorMessage: true,
        errorTitle: 'Valor no permitido', error: 'Elige un valor de la lista del directorio correspondiente.',
      };
    }
  };
  lista(3, [rgo(HOJA_EST, 'C')]);
  lista(6, [rgo(HOJA_EMP, 'B')]);
  lista(11, [rgo(HOJA_TUT, 'B')]);

  const ruta = path.join(DESTINO, salida);
  await wb.xlsx.writeFile(ruta);
  console.log(`  ✅ ${salida}`);
}

(async () => {
  await construir({ salida: 'Plantilla Practicas - En Blanco.xlsx', conDatos: false });
  // El nombre lleva el conteo: al crecer el padrón, el archivo lo dice
  await construir({ salida: 'Datos de Prueba - ' + ESTUDIANTES.length + ' Estudiantes.xlsx', conDatos: true });
  await construir({ salida: 'Datos de Prueba - Practicas.xlsx', conDatos: true });
  console.log('\n  Estructura única: los datos de la práctica viven en la ficha del estudiante.');
  console.log('  En la hoja Prácticas solo se eligen nombre, empresa y tutor.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
