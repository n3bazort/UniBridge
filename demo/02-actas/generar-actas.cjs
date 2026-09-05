/**
 * Genera las actas de calificaciones de la demostración.
 *
 * Calca el acta real de Secretaría General que vive como fixture en
 * `apps/api/src/modules/completion-records/__fixtures__/`: misma cabecera,
 * mismas columnas y mismas coordenadas. Importa porque el lector del sistema
 * (`acta.parser.ts`) NO lee el flujo de texto: agrupa los fragmentos por su
 * altura en la página y los ordena por su posición horizontal. Un PDF con el
 * mismo texto pero mal colocado no se lee.
 *
 * Cada acta lleva una fila con REPRUEBA a propósito. Es lo que demuestra que
 * el lector mira la columna «Condición» y no da por aprobado a todo el que
 * aparece con diez dígitos.
 *
 * Uso:  node demo/02-actas/generar-actas.cjs
 */
const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require(
  path.join(__dirname, '..', '..', 'node_modules', 'pdf-lib'));
const D = require('../datos-demo.cjs');

const ANCHO = 792, ALTO = 612;   // Carta apaisada, como el acta original

// Columnas de la tabla, en la misma proporción que el acta real.
const COL = { no: 40, dni: 95, nombre: 200, parcial: 500, final: 565, condicion: 640 };

const porDni = new Map(D.ESTUDIANTES.map((e) => [e.dni, e]));

async function generarActa(acta) {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([ANCHO, ALTO]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const tinta = rgb(0, 0, 0);

  const escribir = (txt, x, y, { fuente = normal, tam = 9 } = {}) =>
    pagina.drawText(String(txt), { x, y, size: tam, font: fuente, color: tinta });

  const centrar = (txt, y, { fuente = normal, tam = 9 } = {}) => {
    const w = fuente.widthOfTextAtSize(String(txt), tam);
    escribir(txt, (ANCHO - w) / 2, y, { fuente, tam });
  };

  const tutor = D.TUTORES[acta.tutor];

  // ── Cabecera institucional ──
  centrar('UNIVERSIDAD LAICA "ELOY ALFARO" DE MANABI', ALTO - 50, { fuente: negrita, tam: 11 });
  centrar('SECRETARIA GENERAL', ALTO - 68, { fuente: negrita, tam: 10 });
  centrar(`PERIODO: ${D.PERIODO} PRACTICAS PREPROFESIONALES`, ALTO - 96, { fuente: negrita, tam: 10 });

  // ── Identificación del acta ──
  let y = ALTO - 130;
  escribir('No. Acta:', 40, y, { fuente: negrita });
  escribir(`${acta.numero} - Version ${acta.version}`, 110, y);
  escribir('Nivel:', 520, y, { fuente: negrita });
  escribir(acta.nivel, 570, y);
  escribir('Codigo:', 610, y, { fuente: negrita });
  escribir(acta.codigo, 660, y);

  y -= 16;
  escribir('Facultad:', 40, y, { fuente: negrita });
  escribir('CIENCIAS DE LA VIDA Y TECNOLOGIAS', 110, y);
  escribir('Paralelo:', 520, y, { fuente: negrita });
  escribir(acta.paralelo, 570, y);

  y -= 16;
  escribir('Carrera:', 40, y, { fuente: negrita });
  escribir('SOFTWARE 2024 - NS', 110, y);

  y -= 16;
  escribir('Asignatura:', 40, y, { fuente: negrita });
  escribir(acta.asignatura.normalize('NFD').replace(/[̀-ͯ]/g, ''), 110, y);

  y -= 16;
  escribir('Profesor:', 40, y, { fuente: negrita });
  escribir(tutor.actaProfesor.normalize('NFD').replace(/[̀-ͯ]/g, ''), 110, y);

  // ── Encabezado de la tabla ──
  y -= 34;
  escribir('No', COL.no, y, { fuente: negrita });
  escribir('Cedula', COL.dni, y, { fuente: negrita });
  escribir('ACTA DE CALIFICACIONES', COL.nombre, y, { fuente: negrita });
  escribir('Par. 1', COL.parcial, y, { fuente: negrita });
  escribir('Final', COL.final, y, { fuente: negrita });
  escribir('Condicion', COL.condicion, y, { fuente: negrita });

  pagina.drawLine({
    start: { x: 36, y: y - 6 }, end: { x: ANCHO - 36, y: y - 6 },
    thickness: 0.7, color: rgb(0.4, 0.4, 0.4),
  });

  // ── Filas ──
  //
  // Cada estudiante se dibuja en UNA sola altura. El acta real se genera
  // columna a columna y las alturas quedan algo descuadradas; aquí se alinean,
  // que es el caso fácil para el lector y el que interesa demostrar.
  y -= 24;
  acta.filas.forEach((f, i) => {
    const est = porDni.get(f.dni);
    if (!est) throw new Error(`El acta ${acta.numero} nombra una cédula que no está en los datos demo: ${f.dni}`);
    escribir(i + 1, COL.no, y);
    escribir(f.dni, COL.dni, y);
    escribir(D.nombreActa(est), COL.nombre, y);
    escribir(f.nota, COL.parcial, y);
    escribir(f.nota, COL.final, y);
    escribir(f.condicion, COL.condicion, y);
    y -= 22;
  });

  // ── Pie ──
  //
  // El «Generado por p13…» del acta real son diez dígitos que NO son de ningún
  // estudiante: se reproduce a propósito, porque el lector tiene que seguir
  // ignorándolo. Si algún día lo contara como una cédula, esta acta lo delata.
  y -= 30;
  centrar('Validar unicamente en FirmaEC.', y, { tam: 8 });
  y -= 14;
  centrar('Firmado electronicamente por:', y, { tam: 8 });
  y -= 22;
  centrar(tutor.actaProfesor.normalize('NFD').replace(/[̀-ͯ]/g, ''), y, { fuente: negrita, tam: 9 });
  y -= 16;
  centrar('PROFESOR', y, { tam: 8 });

  escribir('Generado por p1309857827', 40, 40, { tam: 8 });
  escribir('1/1', ANCHO / 2 - 8, 40, { tam: 8 });
  escribir('24 de agosto de 2026 09:00:00', ANCHO - 190, 40, { tam: 8 });

  const bytes = await doc.save();
  const destino = path.join(__dirname, acta.archivo);
  fs.writeFileSync(destino, bytes);

  const aprueban = acta.filas.filter((f) => f.condicion === 'APRUEBA').length;
  console.log(`generada: ${acta.archivo}`);
  console.log(`          ${tutor.nombre}`);
  console.log(`          ${acta.filas.length} estudiantes · ${aprueban} aprueban · ${acta.filas.length - aprueban} reprueba\n`);
}

(async () => {
  for (const acta of D.ACTAS) await generarActa(acta);
  console.log('Verifica que el sistema las lea con:  node demo/02-actas/verificar-actas.cjs');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
});
