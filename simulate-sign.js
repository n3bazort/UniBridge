const fs = require('fs');
const path = require('path');

const fileArg = process.argv[2];

if (!fileArg) {
  process.exit(1);
}

const inputPath = path.resolve(fileArg);

if (!fs.existsSync(inputPath)) {
  console.log(`❌ El archivo no existe: ${inputPath}`);
  process.exit(1);
}

// Leer el archivo original
const originalBuffer = fs.readFileSync(inputPath);

// Validar que sea PDF
if (originalBuffer.toString('latin1', 0, 4) !== '%PDF') {
  console.log(`❌ Ignorado (no es PDF): ${path.basename(inputPath)}`);
  process.exit(0);
}

// Comprobar si ya fue firmado simuladamente
const content = originalBuffer.toString('latin1');
const signatureCount = (content.match(/FAKE SIGNATURE FOR TESTING/g) || []).length;

if (signatureCount >= 2) {
  console.log(`⚠️ Ya tiene 2 firmas simuladas: ${path.basename(inputPath)}`);
  process.exit(0);
}

// Añadir el texto falso que engaña a la validación del sistema
const fakeSignatureData = Buffer.from("\n% FAKE SIGNATURE FOR TESTING\n/ByteRange [ 0 1000 2000 3000 ]\n/Type /Sig\nadbe.pkcs7\n", 'latin1');
const signedBuffer = Buffer.concat([originalBuffer, fakeSignatureData]);

// Generar el nuevo nombre de archivo
const parsed = path.parse(inputPath);
// Evitar poner -signed-signed si ya lo tiene (FirmaEC añade -signed)
const newName = parsed.name.endsWith('-signed') ? parsed.name : `${parsed.name}-signed`;
const outputPath = path.join(parsed.dir, `${newName}${parsed.ext}`);

// Escribir el nuevo archivo firmado
fs.writeFileSync(outputPath, signedBuffer);

// Si el nombre cambió (se le añadió -signed), eliminamos el original para "reemplazarlo"
if (outputPath !== inputPath) {
  fs.unlinkSync(inputPath);
}

console.log(`✅ ¡Firma simulada exitosa! Guardado como: ${path.basename(outputPath)}`);
