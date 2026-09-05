import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { leerActaPdf } from './acta.parser';

/**
 * Comprueba que las actas fabricadas para la demostración las lea el MISMO
 * lector que usa el sistema en producción.
 *
 * No basta con que se vean bien: el lector agrupa los fragmentos de texto por
 * su altura en la página, así que un acta con el contenido correcto pero mal
 * colocado no se lee. Subir una así a mitad de la defensa, delante del
 * tribunal, es exactamente el momento en que no se puede descubrir.
 *
 * Se salta si la carpeta `demo/` no está generada, igual que el spec del acta
 * real: quien clona el repositorio no debería ver un test rojo por eso.
 */
const DEMO = join(__dirname, '..', '..', '..', '..', '..', 'demo', '02-actas');

const ACTAS = [
  {
    archivo: 'Acta 1207141 - Practicas Laborales II - Sendon Varela.pdf',
    numero: '1207141', nivel: '8', codigo: 'IS-806', paralelo: 'A',
    profesor: 'SENDON VARELA JUAN CARLOS',
    filas: [
      { dni: '1315900001', aprueba: true },
      { dni: '1315900002', aprueba: true },
      { dni: '1315900003', aprueba: true },
      { dni: '1315900004', aprueba: false },
    ],
  },
  {
    archivo: 'Acta 1207142 - Practicas Laborales I - Loor Zambrano.pdf',
    numero: '1207142', nivel: '7', codigo: 'IS-706', paralelo: 'B',
    profesor: 'LOOR ZAMBRANO DIANA CAROLINA',
    filas: [
      { dni: '1315900005', aprueba: true },
      { dni: '1315900006', aprueba: true },
      { dni: '1315900007', aprueba: true },
      { dni: '1315900008', aprueba: false },
    ],
  },
];

const hayActas = ACTAS.every((a) => existsSync(join(DEMO, a.archivo)));
const siHayActas = hayActas ? describe : describe.skip;

siHayActas('actas de la demostración', () => {
  for (const esperada of ACTAS) {
    describe(esperada.archivo, () => {
      let acta: Awaited<ReturnType<typeof leerActaPdf>>;

      beforeAll(async () => {
        acta = await leerActaPdf(readFileSync(join(DEMO, esperada.archivo)));
      }, 30000);

      it('lee el encabezado que identifica al acta', () => {
        expect(acta.cabecera.actaNumber).toBe(esperada.numero);
        expect(acta.cabecera.level).toBe(esperada.nivel);
        expect(acta.cabecera.courseCode).toBe(esperada.codigo);
        expect(acta.cabecera.parallel).toBe(esperada.paralelo);
        expect(acta.cabecera.professorRaw).toBe(esperada.profesor);
      });

      it('reconstruye una fila por estudiante, sin sobras', () => {
        expect(acta.filas).toHaveLength(esperada.filas.length);
      });

      it('distingue quién aprueba de quién reprueba', () => {
        for (const f of esperada.filas) {
          const leida = acta.filas.find((x) => x.dni === f.dni);
          expect(leida).toBeDefined();
          expect(leida!.aprueba).toBe(f.aprueba);
        }
      });

      it('no confunde el «Generado por p13…» del pie con una cédula', () => {
        expect(acta.filas.some((f) => f.dni === '1309857827')).toBe(false);
      });
    });
  }
});
