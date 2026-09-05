/**
 * Utilidades puras del circuito de firma. Se mantienen fuera del servicio
 * para poder probarlas de forma aislada (sin BD, Redis ni MinIO).
 */

/**
 * ¿A cuál de los documentos del lote corresponde el archivo que subió el
 * firmante?
 *
 * Antes esto se resolvía adivinando el código con una expresión regular fija
 * («CERT-…-00042»). Eso ataba el circuito de firma a un formato de numeración
 * concreto, y la numeración es justamente lo que cada Facultad configura por
 * plantilla: en cuanto el patrón real pasó a ser «00042-TI-CERT-2025-2», la
 * expresión dejó de reconocer nada y no se podía subir ni una sola firma.
 * Ningún patrón fijo podía ser correcto, porque el patrón es un dato.
 *
 * Así que no se adivina: se compara con los códigos que ESE lote contiene. El
 * firmante sube el archivo con el nombre que traía el ZIP, quizá con los
 * añadidos de FirmaEC o del navegador («-signed», «(1)», «firmado …»), y basta
 * con que el código siga dentro.
 *
 * @param filename       nombre del archivo subido
 * @param codigosDelLote documentCode de los ítems vigentes del lote
 * @returns el código que corresponde, o null si el archivo no es de este lote
 */
export function matchDocumentCode(filename: string, codigosDelLote: string[]): string | null {
  const sinExtension = filename.replace(/\.[A-Za-z0-9]+$/, '').toUpperCase();
  // Los más largos primero: si un código es subcadena de otro, gana el preciso
  const candidatos = codigosDelLote
    .filter((c): c is string => !!c)
    .sort((a, b) => b.length - a.length);

  // 1ª pasada: el código tal cual, con sus separadores
  for (const codigo of candidatos) {
    if (sinExtension.includes(codigo.toUpperCase())) return codigo;
  }

  // 2ª pasada: ignorando guiones, espacios y puntos, por si al archivo le
  // cambiaron los separadores al pasar por otra herramienta
  const soloAlfanumerico = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nombrePlano = soloAlfanumerico(sinExtension);
  for (const codigo of candidatos) {
    if (nombrePlano.includes(soloAlfanumerico(codigo))) return codigo;
  }

  return null;
}

/**
 * Verificación ligera de firma digital PAdES/PKCS#7 embebida:
 * todo PDF firmado (FirmaEC, Adobe, etc.) contiene un diccionario de firma
 * con /ByteRange y /SubFilter. No valida la cadena de confianza (eso lo
 * hace FirmaEC/Adobe al verificar), pero impide subir archivos sin firmar.
 *
 * @throws Error si el archivo no es un PDF o no contiene firma digital.
 */
export function assertPdfHasDigitalSignature(buffer: Buffer, filename: string): void {
  const head = buffer.subarray(0, 5).toString('latin1');
  if (!head.startsWith('%PDF')) {
    throw new Error(`${filename} no es un PDF válido`);
  }
  const content = buffer.toString('latin1');
  const hasByteRange = content.includes('/ByteRange');
  const hasSigType = content.includes('/Type /Sig') || content.includes('/Type/Sig')
    || content.includes('adbe.pkcs7') || content.includes('ETSI.CAdES');
  if (!hasByteRange || !hasSigType) {
    throw new Error(`${filename} no contiene una firma digital. Fírmalo con FirmaEC antes de subirlo.`);
  }
}
