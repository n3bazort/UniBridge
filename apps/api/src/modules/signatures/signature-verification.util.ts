/**
 * Utilidades puras del circuito de firma. Se mantienen fuera del servicio
 * para poder probarlas de forma aislada (sin BD, Redis ni MinIO).
 */

/**
 * Extrae el documentCode del nombre de archivo. Tolera los sufijos que
 * añaden FirmaEC/Adobe al firmar (ej. "CERT-2026-1-00042-signed.pdf").
 */
export function extractDocumentCode(filename: string): string | null {
  const match = filename.match(/(CERT|OFIC|SOLICITUD)-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*?-\d{3,5}/i);
  return match ? match[0].toUpperCase() : null;
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
