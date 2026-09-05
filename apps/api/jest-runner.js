/**
 * Arranca Jest con soporte de módulos ESM.
 *
 * El lector del acta usa `pdfjs-dist`, que solo se publica como ESM. Dentro
 * del entorno aislado de Jest, un import dinámico necesita el interruptor
 * `--experimental-vm-modules` de Node, y ese interruptor solo puede ponerse en
 * la línea de arranque. De ahí este envoltorio: `npm test` lo invoca con el
 * flag y él delega en Jest tal cual.
 *
 * `require` resuelve hacia arriba hasta el node_modules de la raíz, que es
 * donde el monorepo iza las dependencias compartidas.
 */
require('jest-cli/bin/jest');
