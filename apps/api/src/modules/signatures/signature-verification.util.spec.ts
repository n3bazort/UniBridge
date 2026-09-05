import { matchDocumentCode, assertPdfHasDigitalSignature } from './signature-verification.util';

describe('matchDocumentCode', () => {
  // El formato real que emite el sistema hoy: la secuencia va delante y el
  // periodo detrás. La versión anterior de esta prueba daba por bueno un
  // formato inventado («CERT-2026-1-00042») que el sistema nunca produjo, así
  // que pasaba en verde mientras el circuito de firma estaba roto en producción.
  const LOTE = ['00042-TI-CERT-2025-2', '00043-TI-CERT-2025-2'];

  it('reconoce el archivo tal como sale del ZIP', () => {
    expect(matchDocumentCode('00042-TI-CERT-2025-2.pdf', LOTE)).toBe('00042-TI-CERT-2025-2');
  });

  it('tolera el sufijo "-signed" que añade FirmaEC', () => {
    expect(matchDocumentCode('00042-TI-CERT-2025-2-signed.pdf', LOTE)).toBe('00042-TI-CERT-2025-2');
  });

  it('tolera prefijos, espacios y copias numeradas del navegador', () => {
    expect(matchDocumentCode('firmado 00042-TI-CERT-2025-2 (1).pdf', LOTE)).toBe('00042-TI-CERT-2025-2');
  });

  it('es insensible a mayúsculas y minúsculas', () => {
    expect(matchDocumentCode('00042-ti-cert-2025-2.pdf', LOTE)).toBe('00042-TI-CERT-2025-2');
  });

  it('funciona con cualquier patrón de numeración, no solo con uno', () => {
    // La numeración se configura por plantilla: el emparejamiento no puede
    // depender de que el código tenga una forma concreta.
    expect(matchDocumentCode('2026-TECN-017.pdf', ['2026-TECN-017'])).toBe('2026-TECN-017');
    expect(matchDocumentCode('055-FCVT-2026-1-TI.docx', ['055-FCVT-2026-1-TI'])).toBe('055-FCVT-2026-1-TI');
  });

  it('aguanta que le cambien los separadores', () => {
    expect(matchDocumentCode('00042_TI_CERT_2025_2.pdf', LOTE)).toBe('00042-TI-CERT-2025-2');
  });

  it('no confunde un código que es subcadena de otro', () => {
    const lote = ['1-TI-CERT-2025-2', '21-TI-CERT-2025-2'];
    expect(matchDocumentCode('21-TI-CERT-2025-2.pdf', lote)).toBe('21-TI-CERT-2025-2');
  });

  it('devuelve null si el archivo no es de este lote', () => {
    expect(matchDocumentCode('documento_final.pdf', LOTE)).toBeNull();
    expect(matchDocumentCode('99999-TI-CERT-2025-2.pdf', LOTE)).toBeNull();
  });

  it('devuelve null si el lote no tiene códigos', () => {
    expect(matchDocumentCode('00042-TI-CERT-2025-2.pdf', [])).toBeNull();
  });
});

describe('assertPdfHasDigitalSignature', () => {
  const signedPdf = Buffer.from(
    '%PDF-1.7\n1 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached ' +
    '/ByteRange [0 1234 5678 910] /Contents <deadbeef> >>\nendobj\n%%EOF',
    'latin1',
  );

  const unsignedPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF', 'latin1');

  const notAPdf = Buffer.from('hola mundo, esto es texto plano');

  it('acepta un PDF con firma digital embebida (CAdES/FirmaEC)', () => {
    expect(() => assertPdfHasDigitalSignature(signedPdf, 'CERT-2026-1-00001.pdf')).not.toThrow();
  });

  it('acepta un PDF firmado estilo Adobe (adbe.pkcs7)', () => {
    const adobePdf = Buffer.from(
      '%PDF-1.6\n<< /Type/Sig /SubFilter /adbe.pkcs7.detached /ByteRange [0 100 200 300] >>\n%%EOF',
      'latin1',
    );
    expect(() => assertPdfHasDigitalSignature(adobePdf, 'x.pdf')).not.toThrow();
  });

  it('rechaza un PDF sin firma', () => {
    expect(() => assertPdfHasDigitalSignature(unsignedPdf, 'CERT-2026-1-00001.pdf'))
      .toThrow(/no contiene una firma digital/);
  });

  it('rechaza un archivo que no es PDF', () => {
    expect(() => assertPdfHasDigitalSignature(notAPdf, 'archivo.txt'))
      .toThrow(/no es un PDF válido/);
  });
});
