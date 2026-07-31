/**
 * Utilidades para editar un .docx conservando su formato.
 *
 * El problema central: Word parte un mismo texto en varios <w:r>/<w:t> segun el
 * historial de edicion. Una sustitucion ingenua falla porque la cadena buscada
 * no vive en un solo nodo. Aqui se localiza el rango sobre el texto concatenado
 * y se reescribe repartido entre los nodos que lo cubren.
 */
const PizZip = require('pizzip');
const fs = require('fs');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const desesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function abrir(ruta) {
  return new PizZip(fs.readFileSync(ruta));
}

/** Trocea una cadena XML en elementos de primer nivel del tipo pedido. */
function trocear(xml, etiquetas = ['p', 'tbl', 'sectPr']) {
  const out = [];
  const re = new RegExp('<w:(' + etiquetas.join('|') + ')(?:\\s[^>]*)?(/?)>', 'g');
  let m;
  while ((m = re.exec(xml))) {
    const et = m[1];
    if (m[2] === '/') { out.push({ et, ini: m.index, fin: re.lastIndex }); continue; }
    const abre = new RegExp('<w:' + et + '(?:\\s[^>]*)?>', 'g');
    const cier = new RegExp('</w:' + et + '>', 'g');
    let prof = 1, i = re.lastIndex;
    while (prof > 0) {
      abre.lastIndex = i; cier.lastIndex = i;
      const a = abre.exec(xml), c = cier.exec(xml);
      if (!c) break;
      if (a && a.index < c.index) { prof++; i = a.index + a[0].length; }
      else { prof--; i = c.index + c[0].length; }
    }
    out.push({ et, ini: m.index, fin: i });
    re.lastIndex = i;
  }
  return out.map((e) => ({ ...e, xml: xml.slice(e.ini, e.fin) }));
}

/** Nodos <w:t> de un fragmento con su desplazamiento en el texto concatenado. */
function nodosDeTexto(frag) {
  const nodos = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\/>/g;
  let m, off = 0;
  while ((m = re.exec(frag))) {
    const contenido = m[1] ?? '';
    const texto = desesc(contenido);
    const iniContenido = m[0].endsWith('/>') ? m.index + m[0].length : m.index + m[0].indexOf('>') + 1;
    nodos.push({
      iniNodo: m.index,
      finNodo: m.index + m[0].length,
      iniContenido,
      finContenido: iniContenido + contenido.length,
      texto,
      off,
    });
    off += texto.length;
  }
  return nodos;
}

const textoDe = (frag) => nodosDeTexto(frag).map((n) => n.texto).join('');

/**
 * Sustituye `buscar` por `poner` dentro de un fragmento, aunque el texto este
 * repartido en varios nodos. El reemplazo hereda el formato del primer nodo que
 * toca, que es lo que se espera al cambiar un dato por su marcador.
 */
function sustituirEnFragmento(frag, buscar, poner) {
  const nodos = nodosDeTexto(frag);
  const completo = nodos.map((n) => n.texto).join('');
  const pos = completo.indexOf(buscar);
  if (pos < 0) return null;

  const fin = pos + buscar.length;
  const tocados = nodos.filter((n) => n.off < fin && n.off + n.texto.length > pos);
  if (tocados.length === 0) return null;

  // Se reescribe de atras hacia adelante para no invalidar los offsets
  let salida = frag;
  for (let i = tocados.length - 1; i >= 0; i--) {
    const n = tocados[i];
    const desde = Math.max(0, pos - n.off);
    const hasta = Math.min(n.texto.length, fin - n.off);
    const nuevo = i === 0
      ? n.texto.slice(0, desde) + poner + n.texto.slice(hasta)
      : n.texto.slice(0, desde) + n.texto.slice(hasta);
    salida = salida.slice(0, n.iniContenido) + esc(nuevo) + salida.slice(n.finContenido);
  }
  return salida;
}

/**
 * Sustituye en todo el documento. `veces` limita cuantas ocurrencias cambia
 * (por defecto todas). Devuelve { xml, hechos }.
 */
function sustituir(xml, buscar, poner, veces = Infinity) {
  let hechos = 0;
  let actual = xml;
  while (hechos < veces) {
    // Se opera parrafo a parrafo: asi el texto concatenado no cruza fronteras
    const partes = trocear(actual, ['p']);
    let cambio = false;
    for (const p of partes) {
      if (!textoDe(p.xml).includes(buscar)) continue;
      const nuevo = sustituirEnFragmento(p.xml, buscar, poner);
      if (nuevo === null) continue;
      actual = actual.slice(0, p.ini) + nuevo + actual.slice(p.fin);
      hechos++;
      cambio = true;
      break;
    }
    if (!cambio) break;
  }
  return { xml: actual, hechos };
}

/** Sustituye y falla ruidosamente si no encontro nada: los silencios cuestan. */
function sustituirOFallar(xml, buscar, poner, veces = 1) {
  const r = sustituir(xml, buscar, poner, veces);
  if (r.hechos === 0) throw new Error('No se encontro el texto: ' + JSON.stringify(buscar.slice(0, 70)));
  return r.xml;
}

/**
 * Marca un parrafo para que no se separe del siguiente. Un bloque de firma
 * partido entre dos hojas —el nombre en una y el cargo en la otra— no lo firma
 * nadie, y la tabla de estudiantes crece segun el lote.
 */
function pegarAlSiguiente(pXml) {
  if (pXml.includes('<w:keepNext/>')) return pXml;
  if (pXml.includes('<w:pPr>')) return pXml.replace('<w:pPr>', '<w:pPr><w:keepNext/>');
  return pXml.replace(/^(<w:p(?:\s[^>]*)?>)/, '$1<w:pPr><w:keepNext/></w:pPr>');
}

/**
 * Aplica `pegarAlSiguiente` a los parrafos del cuerpo cuyo indice este en la
 * lista. Devuelve el xml completo del documento.
 */
function pegarBloque(xml, desdeTexto, hastaTexto) {
  const ini = xml.indexOf('<w:body>') + 8;
  const fin = xml.lastIndexOf('</w:body>');
  let cuerpo = xml.slice(ini, fin);
  const els = trocear(cuerpo);
  const iDesde = els.findIndex((e) => e.et === 'p' && textoDe(e.xml).includes(desdeTexto));
  // El cierre se busca DESPUES del inicio: frases como «Universidad Laica Eloy
  // Alfaro de Manabi» tambien aparecen en el saludo, mucho antes del bloque.
  const relativo = els.slice(iDesde + 1).findIndex((e) => e.et === 'p' && textoDe(e.xml).includes(hastaTexto));
  const iHasta = relativo < 0 ? -1 : iDesde + 1 + relativo;
  if (iDesde < 0 || iHasta < 0 || iHasta < iDesde) {
    throw new Error('No se pudo delimitar el bloque: ' + desdeTexto + ' .. ' + hastaTexto);
  }
  // De atras hacia adelante para no mover los offsets
  for (let i = iHasta; i >= iDesde; i--) {
    if (els[i].et !== 'p') continue;
    cuerpo = cuerpo.slice(0, els[i].ini) + pegarAlSiguiente(els[i].xml) + cuerpo.slice(els[i].fin);
  }
  return { xml: xml.slice(0, ini) + cuerpo + xml.slice(fin), parrafos: iHasta - iDesde + 1 };
}

/**
 * Concordancia dentro de la plantilla.
 *
 * Un mismo oficio puede amparar a varios estudiantes o a uno solo —segun el
 * alcance configurado, y tambien porque un grupo puede tener un unico
 * integrante—, asi que el cuerpo tiene que decirlo bien en los dos casos.
 * docxtemplater resuelve secciones condicionales, de modo que las dos
 * redacciones viven en el formato y no clavadas en el codigo: si la Facultad
 * cambia la frase, se edita en Word.
 *
 *   {{#varios}}…{{/varios}}   se conserva cuando el papel ampara a dos o mas
 *   {{^varios}}…{{/varios}}   se conserva cuando ampara a uno
 */
const SI_VARIOS = (plural, singular) =>
  `{{#varios}}${plural}{{/varios}}{{^varios}}${singular}{{/varios}}`;

/** Guarda el paquete con el document.xml (y opcionalmente otros) modificado. */
function guardar(zip, ruta, cambios) {
  Object.entries(cambios).forEach(([nombre, contenido]) => zip.file(nombre, contenido));
  fs.writeFileSync(ruta, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

module.exports = { abrir, trocear, nodosDeTexto, textoDe, sustituir, sustituirOFallar, sustituirEnFragmento, pegarAlSiguiente, pegarBloque, guardar, esc, SI_VARIOS };
