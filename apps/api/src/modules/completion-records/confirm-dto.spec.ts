import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConfirmCompletionDto } from './dto/confirm-completion.dto';

/**
 * El acta viaja como multipart/form-data, donde TODO llega como texto. Este
 * spec fija las tres formas en que puede llegar la lista de prácticas, porque
 * la que rompía —el JSON serializado— devolvía «practiceIds must be an array»
 * ante una petición perfectamente correcta.
 */
const A = '3f1e8a2b-1c4d-4e5f-8a9b-0c1d2e3f4a5b';
const B = '7d2c9b3e-5a6f-4b7c-9d8e-1f2a3b4c5d6e';

const validar = (practiceIds: unknown) => {
  const dto = plainToInstance(ConfirmCompletionDto, { practiceIds });
  return { dto, errores: validateSync(dto) };
};

describe('ConfirmCompletionDto · practiceIds', () => {
  it('acepta el JSON serializado que manda el formulario', () => {
    const { dto, errores } = validar(JSON.stringify([A, B]));
    expect(errores).toHaveLength(0);
    expect(dto.practiceIds).toEqual([A, B]);
  });

  it('acepta un único valor suelto, que no llega como array', () => {
    const { dto, errores } = validar(A);
    expect(errores).toHaveLength(0);
    expect(dto.practiceIds).toEqual([A]);
  });

  it('acepta un array ya formado', () => {
    const { dto, errores } = validar([A, B]);
    expect(errores).toHaveLength(0);
    expect(dto.practiceIds).toEqual([A, B]);
  });

  it('trata la cadena vacía como lista vacía', () => {
    const { dto, errores } = validar('');
    expect(errores).toHaveLength(0);
    expect(dto.practiceIds).toEqual([]);
  });

  it('sigue rechazando un identificador que no es UUID', () => {
    const { errores } = validar(JSON.stringify([A, 'no-soy-un-uuid']));
    expect(errores).toHaveLength(1);
    expect(JSON.stringify(errores)).toContain('no es válida');
  });
});
