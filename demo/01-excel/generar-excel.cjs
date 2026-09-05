/**
 * Genera los dos libros de Excel de la demostración.
 *
 *   1. «Datos correctos»    — se importa sin una sola advertencia.
 *   2. «Datos con errores»  — cada fila rompe algo distinto, a propósito.
 *
 * ── Por qué se parte de la plantilla y no de un libro en blanco ──
 *
 * La primera versión reconstruía el libro desde cero copiando a mano los
 * anchos y los colores. Salía parecido, pero solo parecido: la plantilla real
 * lleva además novecientas noventa validaciones —los desplegables de
 * estudiante, empresa y docente—, formato condicional y la hoja de
 * instrucciones. Todo eso se perdía.
 *
 * Ahora se abre `_plantilla-base.xlsx`, que es la plantilla oficial tal como
 * la descarga la aplicación, y solo se le escriben los datos. Se hereda el
 * formato entero sin tener que replicarlo, y si la Facultad cambia la
 * plantilla basta con reemplazar ese archivo.
 *
 * Las filas de datos arrancan en la 3: la 1 es el título en banda azul y la 2
 * los encabezados.
 *
 * Uso:  node demo/01-excel/generar-excel.cjs
 */
const path = require('path');
const ExcelJS = require(path.join(__dirname, '..', '..', 'node_modules', 'exceljs'));
const D = require('../datos-demo.cjs');

const DESTINO = __dirname;
const BASE = path.join(__dirname, '_plantilla-base.xlsx');
const PRIMERA_FILA = 3;

const celular = (i) => `09${String(60000000 + i * 137).slice(0, 8)}`;

/**
 * Vuelca las filas en una hoja respetando su formato.
 *
 * Se escribe celda a celda y no con `addRow` a propósito: las filas de la
 * plantilla ya vienen con su estilo y su validación puestos, y sustituirlas
 * enteras se los llevaría por delante.
 */
function volcar(ws, filas) {
  filas.forEach((valores, n) => {
    const fila = ws.getRow(PRIMERA_FILA + n);
    valores.forEach((v, i) => {
      fila.getCell(i + 1).value = (v === '' || v === null || v === undefined) ? null : v;
    });
    fila.commit?.();
  });
}

async function construir(estudiantes, empresas, tutores) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(BASE);

  volcar(wb.getWorksheet('👥 Estudiantes'), estudiantes.map((e, i) => [
    i + 1, e.dni, e.nombre, e.correo, e.carrera, e.celular,
    e.tipo, e.nivel, e.horas, e.periodo,
  ]));

  volcar(wb.getWorksheet('🏢 Empresas'), empresas.map((c, i) => [
    i + 1, c.nombre, c.contacto, c.cargo, c.email, c.telefono,
  ]));

  volcar(wb.getWorksheet('👨‍🏫 Tutores Académicos'), tutores.map((t, i) => [
    i + 1, t.nombre, null,
  ]));

  // ── Prácticas: solo las cuatro columnas que se eligen ──
  //
  // Esta hoja se llena SOLA. Doce de sus dieciséis columnas son fórmulas
  // INDEX/MATCH que tiran de las otras dos hojas: en cuanto se elige el
  // estudiante aparecen su cédula, su correo, su carrera, sus horas y su
  // período; en cuanto se elige la empresa, su destinatario y su contacto.
  //
  // Escribir un valor encima de esas celdas no «rellena» nada: borra la
  // fórmula. Y como Excel las guarda como fórmulas compartidas —una maestra y
  // el resto apuntando a ella—, romper las primeras filas deja huérfanas a las
  // ciento setenta y ocho siguientes, y el libro ni siquiera se puede escribir.
  //
  // Los datos completos viven en «Estudiantes» y «Empresas», que sí se llenan
  // enteras. Aquí solo se decide quién va a dónde y con qué docente.
  const practicas = wb.getWorksheet('📋 Prácticas');
  const COL = { nombre: 3, empresa: 6, tutor: 11, area: 16 };
  estudiantes.forEach((e, n) => {
    const fila = practicas.getRow(PRIMERA_FILA + n);
    fila.getCell(COL.nombre).value = e.nombre || null;
    fila.getCell(COL.empresa).value = e.empresa || null;
    fila.getCell(COL.tutor).value = e.tutor || null;
    fila.getCell(COL.area).value = e.area || null;
  });

  return wb;
}

/**
 * Guarda avisando en claro si el archivo está abierto.
 *
 * Windows bloquea el .xlsx mientras Excel lo tiene abierto y Node responde con
 * un EBUSY y su volcado de pila. Ejecutándose con doble clic eso es una pared:
 * el mensaje real —«ciérralo y vuelve a intentarlo»— queda enterrado.
 */
async function guardar(wb, nombre) {
  try {
    await wb.xlsx.writeFile(path.join(DESTINO, nombre));
    return true;
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      console.error(`\n  NO SE PUDO ESCRIBIR: ${nombre}`);
      console.error('  El archivo está abierto en Excel. Ciérralo y vuelve a ejecutar esto.\n');
      process.exitCode = 1;
      return false;
    }
    throw e;
  }
}

(async () => {
  // ── Libro correcto ──
  const correctos = D.ESTUDIANTES.map((e, i) => {
    const emp = D.EMPRESAS[e.empresa];
    return {
      dni: e.dni,
      nombre: D.nombreCompleto(e),
      correo: D.correo(e),
      carrera: D.CARRERA,
      celular: celular(i),
      tipo: e.tipo,
      nivel: e.nivel,
      horas: e.horas,
      periodo: D.PERIODO,
      empresa: emp.nombre,
      empresaContacto: emp.contacto,
      empresaCargo: emp.cargo,
      empresaEmail: emp.email,
      empresaTelefono: emp.telefono,
      tutor: D.TUTORES[e.tutor].nombre,
      area: e.area,
    };
  });

  if (await guardar(await construir(correctos, D.EMPRESAS, D.TUTORES), 'Demo - Datos correctos.xlsx')) {
    console.log('generado: Demo - Datos correctos.xlsx  ·', correctos.length,
      'estudiantes · Prácticas se autocompleta con sus fórmulas');
  }

  // ── Libro con errores sembrados ──
  //
  // Cada fila rompe UNA cosa y solo una: si una fila acumulara varios defectos,
  // la pantalla mostraría el primero y no se vería si detecta los demás.
  const rotos = correctos.map((e) => ({ ...e }));

  rotos[0].dni = '13159000';                        // cédula de 8 dígitos
  rotos[1].dni = rotos[2].dni;                      // cédula duplicada
  rotos[2].correo = 'no-es-un-correo';              // correo mal formado
  rotos[3].horas = -40;                             // horas negativas
  rotos[4].horas = '';                              // horas vacías
  rotos[5].empresa = 'EMPRESA QUE NO EXISTE S.A.';  // empresa fuera del directorio
  rotos[6].tutor = 'Ing. Fantasma Inexistente, Mg.'; // docente fuera del directorio
  rotos[7].nombre = 'Macías';                       // un solo apellido, sin nombres
  rotos[8].periodo = '2019-1';                      // período que no es el activo
  rotos[9].nivel = '';                              // nivel académico vacío
  rotos[10].tipo = '';                              // tipo de práctica vacío
  rotos[11].area = '';                              // área de desempeño vacía
  rotos[12].dni = '';                               // sin cédula
  rotos[13].empresa = '';                           // sin empresa
  rotos[14].celular = 'abcdefghij';                 // celular no numérico

  // Una empresa del directorio sin destinatario: los oficios lo imprimen, así
  // que sin eso la solicitud sale con un hueco.
  const empresasRotas = D.EMPRESAS.map((c) => ({ ...c }));
  empresasRotas[3].contacto = '';
  empresasRotas[3].cargo = '';

  if (await guardar(await construir(rotos, empresasRotas, D.TUTORES), 'Demo - Datos con errores.xlsx')) {
    console.log('generado: Demo - Datos con errores.xlsx ·', rotos.length,
      'estudiantes, 16 defectos sembrados');
  }
})().catch((e) => {
  console.error('\nERROR:', e.message, '\n');
  process.exitCode = 1;
});
