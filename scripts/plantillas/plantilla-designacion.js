/**
 * Construye la plantilla de la DESIGNACION de estudiantes y tutor a partir del
 * original diligenciado.
 *
 * Dos cambios de fondo respecto al original:
 *  - El oficio se emite agrupado por empresa, asi que la tabla pasa a ser un
 *    bucle y el cuerpo se pone en plural.
 *  - El cierre se reordena a dos columnas para que las dos firmas quepan en la
 *    misma hoja, con espacio suficiente para firmar sobre el papel.
 *
 * Produce la variante maestra (con firma y sello) y la publica (sin ellos).
 */
const T = require('./docx-tools');
const fs = require('fs');
const path = require('path');

const ORIGEN = 'docs/formatos-oficiales/Designacion de estudiante y tutor (original diligenciado).docx';
const SALIDA_MAESTRA = process.argv[2];
const SALIDA_PUBLICA = process.argv[3];

const zip = T.abrir(ORIGEN);
let xml = zip.file('word/document.xml').asText();

const FUENTE = '<w:rFonts w:ascii="Baskerville Old Face" w:hAnsi="Baskerville Old Face"/>';
const IDIOMA = '<w:lang w:val="es-EC"/>';

// La concordancia la resuelve T.SI_VARIOS, compartido con la solicitud
const SI_VARIOS = T.SI_VARIOS;

// ─────────────── 1. Datos del oficio ───────────────
const cambios = [
  ['OF\u00cdCIO No. 055-FCVT-2026-1-TI', 'OF\u00cdCIO No. {{oficioCode}}'],
  ['Manta, junio 29 de 2026', 'Manta, {{currentDate}}'],
  ['Para: Ing. Jonathan Campuzano', 'Para: {{companyContactName}}'],
  ['Cargo: Jefe de Recursos Humanos', 'Cargo: {{companyPosition}}'],
  ['Instituci\u00f3n: FISHECUADOR', 'Instituci\u00f3n: {{companyName}}'],

  // Asunto: el nivel de la practica es variable y el oficio puede amparar a
  // uno o a varios, asi que la concordancia la resuelve la propia plantilla
  ['Asunto: Designaci\u00f3n de estudiante para la realizaci\u00f3n de Pr\u00e1cticas Preprofesionales II y asignaci\u00f3n',
   'Asunto: Designaci\u00f3n de ' + SI_VARIOS('estudiantes', 'estudiante') +
   ' para la realizaci\u00f3n de Pr\u00e1cticas Preprofesionales {{practiceLevelShort}} y asignaci\u00f3n'],

  ['en nombre de la Facultad de Ciencias de la Vida y Tecnolog\u00eda de la Universidad',
   'en nombre de la {{facultyName}} de la Universidad'],

  // El oficio puede amparar a todo el grupo de la empresa o a uno solo
  ['se ha designado al siguiente estudiante para realizar sus',
   'se ha designado ' + SI_VARIOS('a los siguientes estudiantes', 'al siguiente estudiante') +
   ' para realizar sus'],
  ['Preprofesionales II:', 'Preprofesionales {{practiceLevelShort}}:'],
  ['El estudiante deber\u00e1 cumplir un total de horas asignadas',
   SI_VARIOS('Los estudiantes deber\u00e1n', 'El estudiante deber\u00e1') + ' cumplir el total de horas asignadas'],
  ['evaluar el desempe\u00f1o de los practicantes',
   'evaluar el desempe\u00f1o ' + SI_VARIOS('de los practicantes', 'del practicante')],
];

for (const [buscar, poner] of cambios) {
  xml = T.sustituirOFallar(xml, buscar, poner, 1);
  console.log('  ok  ' + JSON.stringify(buscar.slice(0, 52)));
}

// ─────────────── 2. Tabla: una fila que se repite ───────────────
{
  const ini = xml.indexOf('<w:body>') + 8;
  const fin = xml.lastIndexOf('</w:body>');
  let cuerpo = xml.slice(ini, fin);

  const tabla = T.trocear(cuerpo, ['tbl'])[0];
  let tblXml = tabla.xml;
  const filas = T.trocear(tblXml, ['tr']);
  if (filas.length !== 2) throw new Error('Se esperaban 2 filas y hay ' + filas.length);

  let cabecera = filas[0].xml;
  if (!cabecera.includes('<w:tblHeader/>')) {
    cabecera = cabecera.includes('<w:trPr>')
      ? cabecera.replace('<w:trPr>', '<w:trPr><w:tblHeader/>')
      : cabecera.replace(/^(<w:tr[^>]*>)/, '$1<w:trPr><w:tblHeader/></w:trPr>');
  }

  let plantillaFila = filas[1].xml;
  const celdas = T.trocear(plantillaFila, ['tc']);
  if (celdas.length !== 5) throw new Error('Se esperaban 5 celdas y hay ' + celdas.length);

  const porCelda = [
    ['BARCIA LANDA CARLOS JOSUE', '{{#students}}{{fullName}}'],
    ['1351819519', '{{dni}}'],
    ['TECNOLOG\u00cdAS DE LA INFORMACI\u00d3N', '{{programName}}'],
    ['120', '{{totalHours}}'],
    ['MENDOZA CUZME LUIS JACINTO', '{{tutorName}}{{/students}}'],
  ];
  for (let i = celdas.length - 1; i >= 0; i--) {
    const [buscar, poner] = porCelda[i];
    const nueva = T.sustituirEnFragmento(celdas[i].xml, buscar, poner);
    if (nueva === null) throw new Error('No se encontro en la celda ' + i + ': ' + buscar);
    plantillaFila = plantillaFila.slice(0, celdas[i].ini) + nueva + plantillaFila.slice(celdas[i].fin);
  }

  const nueva = tblXml.slice(0, filas[0].ini) + cabecera + plantillaFila + tblXml.slice(filas[1].fin);
  cuerpo = cuerpo.slice(0, tabla.ini) + nueva + cuerpo.slice(tabla.fin);
  xml = xml.slice(0, ini) + cuerpo + xml.slice(fin);
  console.log('  ok  tabla convertida en bucle {{#students}}');
}

// ─────────────── 3. Se retiran las imagenes flotantes del original ───────────────
// Estaban ancladas a los parrafos «Agradecemos…» y «Atentamente,». Al reordenar
// el cierre en dos columnas se vuelven a colocar dentro de la celda izquierda,
// para que viajen con la firma a la que pertenecen.
const RID_SELLO = 'rId10';
const RID_FIRMA = 'rId11';
for (const rId of [RID_SELLO, RID_FIRMA]) {
  const dibujos = T.trocear(xml, ['drawing']);
  const objetivo = dibujos.find((d) => d.xml.includes('r:embed="' + rId + '"'));
  if (!objetivo) throw new Error('No se encontro el dibujo de ' + rId);
  xml = xml.slice(0, objetivo.ini) + xml.slice(objetivo.fin);
}
console.log('  ok  anclajes originales retirados');

// ─────────────── 4. Cierre a dos columnas ───────────────
/**
 * Imagen flotante dentro de la celda. Va anclada y no en linea a proposito: una
 * imagen en linea ocupa alto real —el sello mide 2,8 cm— y empujaba el oficio a
 * una segunda hoja. Anclada se superpone al hueco de firma sin gastar espacio,
 * que es el mismo recurso que usa el original de la Facultad.
 */
const imagen = (rId, cx, cy, id, nombre, x, y) => `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>` +
  `<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="2516${id}" ` +
  `behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
  `<wp:simplePos x="0" y="0"/>` +
  `<wp:positionH relativeFrom="column"><wp:posOffset>${x}</wp:posOffset></wp:positionH>` +
  `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${y}</wp:posOffset></wp:positionV>` +
  `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
  `<wp:wrapNone/>` +
  `<wp:docPr id="${id}" name="${nombre}"/>` +
  `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
  `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
  `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:nvPicPr><pic:cNvPr id="${id}" name="${nombre}"/><pic:cNvPicPr/></pic:nvPicPr>` +
  `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
  `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
  `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
  `</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;

/**
 * Formato de caracter del cierre. `par` recibe SIEMPRE runs ya construidos y
 * `txt` es el unico sitio donde se escapa texto: mezclar ambas cosas en un solo
 * argumento hacia que el XML de una imagen terminara escapado y visible como
 * texto en el documento.
 */
const rpr = ({ negrita = false, tamano = null } = {}) =>
  `<w:rPr>${FUENTE}${negrita ? '<w:b/><w:bCs/>' : ''}` +
  `${tamano ? `<w:sz w:val="${tamano}"/><w:szCs w:val="${tamano}"/>` : ''}${IDIOMA}</w:rPr>`;

/** Un run con texto plano (se escapa aqui, y solo aqui). */
const txt = (contenido, opciones = {}) =>
  `<w:r>${rpr(opciones)}<w:t xml:space="preserve">${T.esc(contenido)}</w:t></w:r>`;

/**
 * Parrafo del cierre: sin espaciado y alineado a la izquierda. La alineacion
 * explicita hace falta porque el cuerpo del oficio esta justificado, y heredarlo
 * estiraba «Responsable de Practicas Preprofesionales» de lado a lado de la
 * columna.
 */
const par = (runs = '', opciones = {}) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>` +
  `<w:ind w:left="0" w:firstLine="0"/><w:jc w:val="left"/>${rpr(opciones)}</w:pPr>${runs}</w:p>`;

const SIN_BORDES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map((l) => `<w:${l} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`).join('');

// La firma conserva su tamano original; el sello se reduce un 20 % para que los
// dos quepan lado a lado dentro de la columna izquierda (8,6 cm de ancho).
// Dos lineas en blanco de hueco para firmar; la firma y el sello se superponen
// a ese hueco, como el sello estampado sobre el papel.
const celdaIzquierda =
  par(imagen(RID_FIRMA, 810260, 752475, 101, 'Firma del Responsable de Practicas', 152400, -342900) +
      imagen(RID_SELLO, 891540, 804230, 102, 'Sello del Responsable de Practicas', 1600200, -457200)) +
  par() +
  par(txt('{{responsableName}}')) +
  par(txt('Responsable de Pr\u00e1cticas Preprofesionales', { negrita: true }) +
      txt(' ') +
      txt('{{facultyName}}', { negrita: true })) +
  par(txt('Universidad Laica Eloy Alfaro de Manab\u00ed'));

// A la derecha, el tutor academico: mismo hueco en blanco para firmar sobre el
// papel, su nombre impreso y la lista de copias del oficio.
const celdaDerecha =
  par() + par() +
  par(txt('{{academicTutorName}}')) +
  par(txt('Tutor Acad\u00e9mico', { negrita: true })) +
  par() +
  par(txt('cc. ') + txt('Tutor acad\u00e9mico', { tamano: 20 })) +
  par(txt('      Estudiante', { tamano: 20 }));

const celda = (ancho, contenido) =>
  `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>` +
  `<w:tcMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>` +
  `</w:tcPr>${contenido}</w:tc>`;

const cierre =
  `<w:tbl><w:tblPr><w:tblW w:w="9209" w:type="dxa"/><w:tblInd w:w="-142" w:type="dxa"/>` +
  `<w:tblBorders>${SIN_BORDES}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
  `<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/>` +
  `</w:tblPr><w:tblGrid><w:gridCol w:w="4900"/><w:gridCol w:w="4309"/></w:tblGrid>` +
  // cantSplit: la fila no se puede partir, asi que las dos firmas caen siempre
  // en la misma hoja
  `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
  celda(4900, celdaIzquierda) + celda(4309, celdaDerecha) +
  `</w:tr></w:tbl>` +
  par();   // Word exige un parrafo despues de una tabla al final del cuerpo

{
  const ini = xml.indexOf('<w:body>') + 8;
  const fin = xml.lastIndexOf('</w:body>');
  let cuerpo = xml.slice(ini, fin);
  const els = T.trocear(cuerpo);

  const iNombre = els.findIndex((e) => e.et === 'p' && T.textoDe(e.xml).includes('Blgo. Ricardo Castillo Ruperti'));
  const iEstudiante = els.findIndex((e) => e.et === 'p' && T.textoDe(e.xml).trim() === 'Estudiante');
  if (iNombre < 0 || iEstudiante < 0) throw new Error('No se pudo delimitar el cierre a reemplazar');

  cuerpo = cuerpo.slice(0, els[iNombre].ini) + cierre + cuerpo.slice(els[iEstudiante].fin);
  xml = xml.slice(0, ini) + cuerpo + xml.slice(fin);
  console.log('  ok  cierre a dos columnas (reemplazo ' + (iEstudiante - iNombre + 1) + ' parrafos)');
}

// El «Atentamente,» debe quedar junto al cierre que introduce
const pegado = T.pegarBloque(xml, 'Agradecemos de antemano', 'Atentamente,');
xml = pegado.xml;
console.log('  ok  despedida pegada al cierre');

// ─────────────── 5. Variantes ───────────────
zip.file('word/document.xml', xml);
fs.writeFileSync(SALIDA_MAESTRA, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('\nmaestra  -> ' + path.basename(SALIDA_MAESTRA));

let xmlPublico = xml;
for (const rId of [RID_SELLO, RID_FIRMA]) {
  const dibujos = T.trocear(xmlPublico, ['drawing']);
  const objetivo = dibujos.find((d) => d.xml.includes('r:embed="' + rId + '"'));
  if (!objetivo) throw new Error('No se encontro el dibujo de ' + rId + ' en la variante publica');
  xmlPublico = xmlPublico.slice(0, objetivo.ini) + xmlPublico.slice(objetivo.fin);
}

let relsPublico = zip.file('word/_rels/document.xml.rels').asText();
const mediaABorrar = [];
for (const rId of [RID_SELLO, RID_FIRMA]) {
  const re = new RegExp('<Relationship Id="' + rId + '"[^>]*Target="([^"]+)"[^>]*/>');
  const m = re.exec(relsPublico);
  if (m) { mediaABorrar.push('word/' + m[1].replace(/^\.\//, '')); relsPublico = relsPublico.replace(m[0], ''); }
}

const zipPublico = T.abrir(SALIDA_MAESTRA);
zipPublico.file('word/document.xml', xmlPublico);
zipPublico.file('word/_rels/document.xml.rels', relsPublico);
for (const archivo of mediaABorrar) {
  const enUso = Object.keys(zipPublico.files)
    .filter((f) => /_rels\/.+\.rels$/.test(f) && f !== 'word/_rels/document.xml.rels')
    .some((f) => zipPublico.file(f).asText().includes(archivo.replace('word/', '')));
  if (enUso) { console.log('  (se conserva ' + archivo + ': la usa el encabezado)'); continue; }
  zipPublico.remove(archivo);
}
console.log('  media retirada: ' + JSON.stringify(mediaABorrar));
fs.writeFileSync(SALIDA_PUBLICA, zipPublico.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('publica  -> ' + path.basename(SALIDA_PUBLICA));
