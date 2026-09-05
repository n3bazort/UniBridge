/**
 * Pasa las actas generadas por el MISMO lector que usa el sistema.
 *
 * No sirve de nada un acta que se vea bien y el servidor no sepa leer: el
 * lector agrupa los fragmentos por su altura en la página y cualquier
 * descuadre lo rompe. Descubrirlo delante del tribunal no es una opción.
 *
 * La comprobación vive donde vive el lector —`acta.demo.spec.ts`, junto al
 * spec del acta real— para que se ejecute también con el resto de la batería
 * y no se quede obsoleta aquí en un rincón.
 *
 * Uso:  node demo/02-actas/verificar-actas.cjs
 */
const { spawnSync } = require('child_process');
const path = require('path');

const API = path.join(__dirname, '..', '..', 'apps', 'api');

console.log('Comprobando las actas contra el lector del sistema...\n');

const r = spawnSync('npx', ['jest', 'acta.demo'], {
  cwd: API,
  stdio: 'inherit',
  shell: true,
  // El lector carga pdfjs, que es solo-ESM: sin esta bandera Jest no lo importa.
  env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' },
});

process.exitCode = r.status ?? 1;
console.log(r.status === 0
  ? '\nLas actas se leen correctamente. Listas para subir.'
  : '\nAlguna comprobación falló: NO subas estas actas todavía.');
