import { extractDocumentCode, assertPdfHasDigitalSignature } from './signature-verification.util';

describe('extractDocumentCode', () => {
  it('extrae el código de un certificado con nombre limpio', () => {
    expect(extractDocumentCode('CERT-2026-1-00042.pdf')).toBe('CERT-2026-1-00042');
  });

  it('extrae el código de un oficio', () => {
    expect(extractDocumentCode('OFIC-2026-1-00007.pdf')).toBe('OFIC-2026-1-00007');
  });

  it('tolera el sufijo "-signed" que añade FirmaEC', () => {
    expect(extractDocumentCode('CERT-2026-1-00042-signed.pdf')).toBe('CERT-2026-1-00042');
  });

  it('tolera prefijos y espacios añadidos por el usuario', () => {
    expect(extractDocumentCode('firmado CERT-2026-1-00042 (1).pdf')).toBe('CERT-2026-1-00042');
  });

  it('es insensible a mayúsculas/minúsculas', () => {
    expect(extractDocumentCode('cert-2026-1-00042.pdf')).toBe('CERT-2026-1-00042');
  });

  it('devuelve null si no hay código reconocible', () => {
    expect(extractDocumentCode('documento_final.pdf')).toBeNull();
    expect(extractDocumentCode('CERT.pdf')).toBeNull();
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
