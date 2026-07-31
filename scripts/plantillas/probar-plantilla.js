/**
 * Rellena una plantilla con datos de prueba usando la misma configuracion que
 * el motor del sistema. Sirve para comprobar que los marcadores estan bien
 * puestos antes de subir nada.
 */
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');

const plantilla = process.argv[2];
const salida = process.argv[3];
const cuantos = Number(process.argv[4] || 3);

const NOMBRES = [
  ['BARCIA PICO JERSON FERNANDO', '1314405844', 'MENDOZA CUZME LUIS JACINTO'],
  ['DELGADO FLORES KEIVEN JOEL', '1754842274', 'MENDOZA CUZME LUIS JACINTO'],
  ['ZAMBRANO ZAMBRANO JUDY MONSERRATE', '1316745494', 'MENDOZA CUZME LUIS JACINTO'],
  ['CASTRO VELEZ MARIA FERNANDA', '1315554821', 'PONCE ALAVA MARIA ELENA'],
  ['LOOR MERO ANTHONY DAVID', '1317788455', 'PONCE ALAVA MARIA ELENA'],
];

const datos = {
  oficioCode: '2026-TECN-017',
  oficioId: '2026-TECN-017',
  documentCode: '2026-TECN-017',
  currentDate: 'julio 27 de 2026',
  companyContactName: 'Ing. Jordy Abraham Anchundia Anchundia',
  companyPosition: 'Jefe de Tecnolog\u00edas de la Informaci\u00f3n',
  companyRecipientName: 'Jefe de Tecnolog\u00edas de la Informaci\u00f3n',
  companyName: 'Epespo',
  facultyName: 'Facultad de Ciencias de la Vida y Tecnolog\u00edas',
  programName: 'TECNOLOG\u00cdAS DE LA INFORMACI\u00d3N',
  academicPeriod: '2026-1',
  vacancyCount: String(cuantos),
  // Concordancia: la plantilla elige singular o plural con {{#varios}}
  varios: cuantos > 1,
  uno: cuantos === 1,
  vacancyCountWords: ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco'][cuantos] || String(cuantos),
  totalHours: '120',
  practiceLevel: 'Pr\u00e1cticas Laborales II',
  practiceLevelShort: 'II',
  workArea: 'TI',
  academicTutorName: 'Ing. Luis Mendoza Cuzme, Mg.',
  deanName: 'Dra. Decana de la Facultad',
  directorName: 'Blgo. Ricardo Castillo Ruperti, MSc.',
  responsableName: 'Blgo. Ricardo Castillo Ruperti, MSc.',
  responsableDni: '1311920613',
  responsablePhone: '0999279120',
  responsableEmail: 'fcvt.copracticasp@uleam.edu.ec',
  students: NOMBRES.slice(0, cuantos).map(([n, d, t]) => ({
    fullName: n,
    lastName: n.split(' ').slice(0, 2).join(' ') + ' ',
    firstName: n.split(' ').slice(2).join(' '),
    dni: d,
    programName: 'TECNOLOG\u00cdAS DE LA INFORMACI\u00d3N',
    totalHours: '120',
    practiceLevel: 'Pr\u00e1cticas Laborales II',
    practiceLevelShort: 'II',
    workArea: 'TI',
    tutorName: t,
  })),
};

const doc = new Docxtemplater(new PizZip(fs.readFileSync(plantilla)), {
  paragraphLoop: true,
  linebreaks: true,
  delimiters: { start: '{{', end: '}}' },
  nullGetter() { return ''; },
});
doc.render(datos);
fs.writeFileSync(salida, doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('generado: ' + salida);
