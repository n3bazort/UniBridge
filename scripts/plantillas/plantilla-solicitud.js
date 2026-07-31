/**
 * Construye la plantilla de la SOLICITUD (PAP-001) a partir del original
 * diligenciado: sustituye cada dato por su marcador y deja la tabla como un
 * bucle de estudiantes, sin tocar el formato institucional.
 *
 * Produce dos variantes:
 *   maestra  con la firma y el sello (va a MinIO, almacen privado)
 *   publica  sin firma ni sello (descargable desde el sistema como ejemplo)
 */
const T = require('./docx-tools');
const fs = require('fs');
const path = require('path');

const ORIGEN = 'docs/formatos-oficiales/PAP-001 - Solicitud de practicas (original diligenciado).docx';
const SALIDA_MAESTRA = process.argv[2];
const SALIDA_PUBLICA = process.argv[3];

const zip = T.abrir(ORIGEN);
let xml = zip.file('word/document.xml').asText();

// ─────────────── 1. Datos del oficio ───────────────
const cambios = [
  ['OFICIO No. 2026-TECN-017', 'OFICIO No. {{oficioCode}}'],
  ['Manta, julio 27 de 2026', 'Manta, {{currentDate}}'],
  ['Para: Ing. Jordy Abraham Anchundia Anchundia', 'Para: {{companyContactName}}'],
  ['Cargo: Jefe de Tecnologias de la Informacion'.replace('Tecnologias', 'Tecnolog\u00edas').replace('Informacion', 'Informaci\u00f3n'),
   'Cargo: {{companyPosition}}'],
  ['Empresa: Epespo', 'Empresa: {{companyName}}'],

  // El cuerpo nombra la facultad una vez; la despedida la repite mas abajo
  ['de parte de la Facultad de Ciencias de la Vida y Tecnolog\u00edas de la Universidad',
   'de parte de la {{facultyName}} de la Universidad'],

  // Condiciones del grupo. El oficio puede pedir varias vacantes o una sola, y
  // el cuerpo tiene que concordar en los dos casos: la concordancia la resuelve
  // la propia plantilla con {{#varios}} / {{^varios}}.
  ['la apertura de tres vacantes para estudiantes pertenecientes a la carrera de Tecnolog\u00edas de la Informaci\u00f3n',
   'la apertura de {{vacancyCountWords}} ' +
   T.SI_VARIOS('vacantes para estudiantes pertenecientes', 'vacante para un estudiante perteneciente') +
   ' a la carrera de {{programName}}'],
  ['para que puedan realizar sus 120 horas',
   'para que ' + T.SI_VARIOS('puedan', 'pueda') + ' realizar sus {{totalHours}} horas'],
  ['pre-profesionales II ', 'pre-profesionales {{practiceLevelShort}} '],
  ['empresa, la n\u00f3mina de los estudiantes es la siguiente:',
   'empresa, ' + T.SI_VARIOS('la n\u00f3mina de los estudiantes es la siguiente', 'el estudiante es el siguiente') + ':'],
  ['Dada la formaci\u00f3n t\u00e9cnica de los estudiantes',
   'Dada la formaci\u00f3n t\u00e9cnica ' + T.SI_VARIOS('de los estudiantes', 'del estudiante')],
  ['la participaci\u00f3n de nuestros estudiantes ser\u00e1',
   'la participaci\u00f3n de ' + T.SI_VARIOS('nuestros estudiantes', 'nuestro estudiante') + ' ser\u00e1'],
  ['en el \u00e1rea de: TI', 'en el \u00e1rea de: {{workArea}}'],

  // Bloque de firma
  ['Blgo. Ricardo Castillo Ruperti MSc.', '{{responsableName}}'],
  ['C.I.: 1311920613', 'C.I.: {{responsableDni}}'],
  ['Telf:. 0999279120', 'Telf:. {{responsablePhone}}'],
  ['Correo electr\u00f3nico: fcvt.copracticasp@uleam.edu.ec', 'Correo electr\u00f3nico: {{responsableEmail}}'],
];

for (const [buscar, poner] of cambios) {
  xml = T.sustituirOFallar(xml, buscar, poner, 1);
  console.log('  ok  ' + JSON.stringify(buscar.slice(0, 52)));
}

// La ultima linea de la despedida vuelve a nombrar la facultad
xml = T.sustituirOFallar(xml, 'Facultad de Ciencias de la Vida y Tecnolog\u00edas', '{{facultyName}}', 1);
console.log('  ok  facultad en la despedida');

// ─────────────── 2. Tabla: una fila que se repite ───────────────
const cuerpoIni = xml.indexOf('<w:body>') + 8;
const cuerpoFin = xml.lastIndexOf('</w:body>');
let cuerpo = xml.slice(cuerpoIni, cuerpoFin);

const tabla = T.trocear(cuerpo, ['tbl'])[0];
let tblXml = tabla.xml;
const filas = T.trocear(tblXml, ['tr']);
if (filas.length !== 4) throw new Error('Se esperaban 4 filas y hay ' + filas.length);

// La fila de titulos se repite al pasar de hoja: un listado largo sin encabezado
// obliga a volver a la pagina anterior para saber que columna es cual.
let cabecera = filas[0].xml;
if (!cabecera.includes('<w:tblHeader/>')) {
  cabecera = cabecera.includes('<w:trPr>')
    ? cabecera.replace('<w:trPr>', '<w:trPr><w:tblHeader/>')
    : cabecera.replace(/^(<w:tr[^>]*>)/, '$1<w:trPr><w:tblHeader/></w:trPr>');
}

// La primera fila de datos se convierte en el bucle; las otras dos se van
let plantillaFila = filas[1].xml;
const celdas = T.trocear(plantillaFila, ['tc']);
if (celdas.length !== 3) throw new Error('Se esperaban 3 celdas y hay ' + celdas.length);

const reemplazoCelda = [
  ['BARCIA PICO JERSON FERNANDO', '{{#students}}{{fullName}}'],
  ['1314405844', '{{dni}}'],
  ['TECNOLOG\u00cdAS DE LA INFORMACI\u00d3N', '{{programName}}{{/students}}'],
];
for (let i = celdas.length - 1; i >= 0; i--) {
  const [buscar, poner] = reemplazoCelda[i];
  const nuevaCelda = T.sustituirEnFragmento(celdas[i].xml, buscar, poner);
  if (nuevaCelda === null) throw new Error('No se encontro en la celda ' + i + ': ' + buscar);
  plantillaFila = plantillaFila.slice(0, celdas[i].ini) + nuevaCelda + plantillaFila.slice(celdas[i].fin);
}

const tblNueva = tblXml.slice(0, filas[0].ini) + cabecera + plantillaFila + tblXml.slice(filas[3].fin);
cuerpo = cuerpo.slice(0, tabla.ini) + tblNueva + cuerpo.slice(tabla.fin);
xml = xml.slice(0, cuerpoIni) + cuerpo + xml.slice(cuerpoFin);
console.log('  ok  tabla convertida en bucle {{#students}}');

// ─────────────── 3. El cierre no se parte entre hojas ───────────────
// La tabla crece con el lote: con cinco estudiantes el bloque de firma se
// quedaba a caballo entre dos paginas, con el nombre en una y el cargo en la
// otra. Marcado asi, si no cabe pasa entero a la hoja siguiente.
const pegado = T.pegarBloque(xml, 'Agradezco de antemano', 'Universidad Laica Eloy Alfaro de Manab');
xml = pegado.xml;
console.log('  ok  cierre pegado (' + pegado.parrafos + ' parrafos)');

// ─────────────── 4. Variante maestra (con firma y sello) ───────────────
zip.file('word/document.xml', xml);
fs.writeFileSync(SALIDA_MAESTRA, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('\nmaestra  -> ' + path.basename(SALIDA_MAESTRA));

// ─────────────── 4. Variante publica (sin firma ni sello) ───────────────
// Se retiran los dibujos del cuerpo, sus relaciones y los propios archivos de
// imagen: una firma escaneada dentro de un archivo descargable sin contrasena
// es una firma que cualquiera puede recortar y reutilizar.
const rels = zip.file('word/_rels/document.xml.rels').asText();
const usados = [...xml.matchAll(/<a:blip r:embed="(rId\d+)"/g)].map((m) => m[1]);
console.log('  imagenes en el cuerpo: ' + JSON.stringify(usados));

let xmlPublico = xml;
for (const rId of usados) {
  const dibujos = T.trocear(xmlPublico, ['drawing']);
  const objetivo = dibujos.find((d) => d.xml.includes('r:embed="' + rId + '"'));
  if (!objetivo) throw new Error('No se encontro el dibujo de ' + rId);
  xmlPublico = xmlPublico.slice(0, objetivo.ini) + xmlPublico.slice(objetivo.fin);
}

let relsPublico = rels;
const mediaABorrar = [];
for (const rId of usados) {
  const re = new RegExp('<Relationship Id="' + rId + '"[^>]*Target="([^"]+)"[^>]*/>', 'g');
  const m = re.exec(relsPublico);
  if (m) {
    mediaABorrar.push('word/' + m[1].replace(/^\.\//, ''));
    relsPublico = relsPublico.replace(m[0], '');
  }
}
console.log('  media retirada: ' + JSON.stringify(mediaABorrar));

const zipPublico = T.abrir(SALIDA_MAESTRA);
zipPublico.file('word/document.xml', xmlPublico);
zipPublico.file('word/_rels/document.xml.rels', relsPublico);
for (const archivo of mediaABorrar) {
  // Solo si ninguna otra parte del paquete la sigue usando (el logo del
  // encabezado comparte carpeta y debe quedarse)
  const enUso = Object.keys(zipPublico.files)
    .filter((f) => /_rels\/.+\.rels$/.test(f) && f !== 'word/_rels/document.xml.rels')
    .some((f) => zipPublico.file(f).asText().includes(archivo.replace('word/', '')));
  if (enUso) { console.log('  (se conserva ' + archivo + ': la usa otra parte)'); continue; }
  zipPublico.remove(archivo);
}
fs.writeFileSync(SALIDA_PUBLICA, zipPublico.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('publica  -> ' + path.basename(SALIDA_PUBLICA));
