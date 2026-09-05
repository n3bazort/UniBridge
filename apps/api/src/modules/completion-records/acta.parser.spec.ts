import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { leerActaPdf } from './acta.parser';

/**
 * Se prueba contra el acta real que emite Secretaría General, no contra un
 * PDF fabricado: lo que hay que demostrar es justamente que el lector aguanta
 * cómo genera el sistema académico sus documentos.
 */
const ACTA = join(__dirname, '__fixtures__', 'acta-practicas-laborales-ii.pdf');
const hayActa = existsSync(ACTA);
const siHayActa = hayActa ? describe : describe.skip;

siHayActa('leerActaPdf · acta de calificaciones de Secretaría General', () => {
  let acta: Awaited<ReturnType<typeof leerActaPdf>>;

  beforeAll(async () => {
    acta = await leerActaPdf(readFileSync(ACTA));
  }, 30000);

  it('lee el encabezado que identifica al acta', () => {
    expect(acta.cabecera.actaNumber).toBe('1207140');
    expect(acta.cabecera.actaVersion).toBe('1');
    expect(acta.cabecera.academicPeriod).toBe('2026-1');
    expect(acta.cabecera.subject).toBe('PRÁCTICAS LABORALES II');
    expect(acta.cabecera.courseCode).toBe('IS-806');
    expect(acta.cabecera.level).toBe('8');
    expect(acta.cabecera.parallel).toBe('F');
    expect(acta.cabecera.professorRaw).toBe('SANTANA CEDEÑO HIRAIDA MONSERRATE');
  });

  it('empareja cada cédula con SU nombre, aunque el PDF se dibuje por columnas', () => {
    // Este es el caso que rompe a los extractores por orden de lectura: el
    // acta escribe las ocho cédulas seguidas y después los ocho nombres.
    expect(acta.filas).toHaveLength(8);
    expect(acta.filas[0]).toMatchObject({ dni: '1351344765', nombre: 'BOSADA BOSADA JESUS ANDRES' });
    expect(acta.filas[7]).toMatchObject({ dni: '1315591303', nombre: 'VELEZ NUÑEZ GABRIEL ALEXANDER' });
  });

  it('lee la condición de cada estudiante', () => {
    expect(acta.filas.every((f) => f.condicion === 'APRUEBA')).toBe(true);
    expect(acta.filas.every((f) => f.aprueba)).toBe(true);
  });

  it('no toma por estudiante el número del pie del documento', () => {
    // «Generado por p1309857827» son diez dígitos que no son de nadie.
    expect(acta.filas.map((f) => f.dni)).not.toContain('1309857827');
  });

  it('no deja filas sin interpretar', () => {
    expect(acta.descartadas).toEqual([]);
  });
});
