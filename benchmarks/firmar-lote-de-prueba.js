/**
 * HERRAMIENTA DE PRUEBA. No forma parte del sistema.
 *
 * El sistema no firma: los documentos se firman fuera, con FirmaEC, y se suben
 * ya firmados. Pero FirmaEC solo acepta certificados de entidades acreditadas,
 * de modo que sin una firma real no habría manera de ensayar el circuito de
 * carga y verificación.
 *
 * Este script cubre ese hueco: toma los PDF de un lote descargado y los firma
 * con un certificado de prueba, imitando lo que FirmaEC devolvería. Sirve para
 * probar la subida, la verificación y el avance del circuito; nada más.
 *
 * Uso:
 *   node benchmarks/firmar-lote-de-prueba.js <carpeta-del-lote> [decano|responsable]
 *
 * Ejemplo:
 *   node benchmarks/firmar-lote-de-prueba.js "C:/Users/micro/Downloads/LOTE-2026-00001" decano
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CERTS = path.join(RAIZ, 'certificados-prueba');
const CLAVE = 'prueba1234';

const TOKENS = {
  decano: 'Certificado de PRUEBA - Decano.p12',
  responsable: 'Certificado de PRUEBA - Responsable.p12',
};

const carpeta = process.argv[2];
const quien = (process.argv[3] || 'decano').toLowerCase();

if (!carpeta) {
  console.error('Indica la carpeta con los PDF del lote.');
  console.error('  node benchmarks/firmar-lote-de-prueba.js "<carpeta>" [decano|responsable]');
  process.exit(1);
}
if (!TOKENS[quien]) {
  console.error(`Firmante no reconocido: "${quien}". Usa "decano" o "responsable".`);
  process.exit(1);
}
if (!fs.existsSync(carpeta)) {
  console.error(`No existe la carpeta: ${carpeta}`);
  process.exit(1);
}
const tokenPath = path.join(CERTS, TOKENS[quien]);
if (!fs.existsSync(tokenPath)) {
  console.error(`Falta el certificado de prueba: ${tokenPath}`);
  console.error('Se regenera con OpenSSL; ver certificados-prueba/README.md');
  process.exit(1);
}

let signpdf, P12Signer, plainAddPlaceholder;
try {
  signpdf = require('@signpdf/signpdf').default;
  ({ P12Signer } = require('@signpdf/signer-p12'));
  ({ plainAddPlaceholder } = require('@signpdf/placeholder-plain'));
} catch {
  console.error('Faltan las librerías de firma de prueba. Instálalas con:');
  console.error('  npm i -D @signpdf/signpdf @signpdf/signer-p12 @signpdf/placeholder-plain -w @ppp/api');
  process.exit(1);
}

(async () => {
  const token = fs.readFileSync(tokenPath);
  const salida = path.join(carpeta, 'firmados');
  fs.mkdirSync(salida, { recursive: true });

  const pdfs = fs.readdirSync(carpeta).filter((f) => f.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 0) {
    console.error(`No hay PDF en ${carpeta}`);
    process.exit(1);
  }

  console.log(`Firmando ${pdfs.length} documento(s) como ${quien}, con certificado de PRUEBA.\n`);
  let ok = 0;
  for (const nombre of pdfs) {
    try {
      const original = fs.readFileSync(path.join(carpeta, nombre));
      const conHueco = plainAddPlaceholder({
        pdfBuffer: original,
        reason: 'Prueba del circuito de firma',
        contactInfo: '',
        name: quien === 'decano' ? 'Decano de la Facultad' : 'Responsable de Practicas',
        location: 'Ecuador',
        signatureLength: 12288,
      });
      const firmado = await signpdf.sign(conHueco, new P12Signer(token, { passphrase: CLAVE }));
      fs.writeFileSync(path.join(salida, nombre), firmado);
      console.log(`  OK   ${nombre}`);
      ok++;
    } catch (e) {
      console.log(`  ERR  ${nombre}: ${e.message}`);
    }
  }
  token.fill(0); // el token no se conserva en memoria más de lo necesario

  console.log(`\n${ok} de ${pdfs.length} documento(s) firmados.`);
  console.log(`Carpeta de salida: ${salida}`);
  console.log('\nSúbelos al panel del firmante para probar la verificación y el avance del circuito.');
  console.log('Recuerda: son firmas de PRUEBA, no acreditadas. En uso real se firma con FirmaEC.');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
