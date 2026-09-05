import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * El docente NO viaja en el cuerpo: se reconoce leyendo la cabecera del acta.
 * Antes existía un `tutorId` seleccionable, que permitía registrar el acta a
 * nombre de un docente distinto del que la firma. Tampoco existe ya
 * `cedulasPegadas`: sin el PDF no hay columna «Condición» que comprobar.
 */
export class ConfirmCompletionDto {
  @ApiPropertyOptional({ description: 'Período académico; por defecto, el activo' })
  @IsOptional()
  @IsString()
  academicPeriod?: string;

  @ApiPropertyOptional({
    description: 'Prácticas a aprobar de entre las que el acta aprueba. Sin lista, se aprueban todas.',
    type: [String],
  })
  /**
   * El acta se sube como `multipart/form-data`, y ahí TODO llega como texto:
   * la lista viaja serializada en JSON y hay que devolverla a su forma antes de
   * validarla. Sin esto, el servidor respondía «practiceIds must be an array»
   * ante una petición perfectamente correcta.
   *
   * Se acepta también la forma repetida (`practiceIds=a&practiceIds=b`), que es
   * como la mandaría un formulario HTML normal. Con un solo elemento esa forma
   * llega como cadena suelta, no como array de uno: por eso se envuelve.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    const texto = value.trim();
    if (texto === '') return [];
    if (texto.startsWith('[')) {
      try { return JSON.parse(texto); } catch { return value; }
    }
    return [texto];
  })
  @IsArray()
  @IsUUID('4', { each: true, message: 'Alguna de las prácticas indicadas no es válida' })
  practiceIds?: string[];
}
