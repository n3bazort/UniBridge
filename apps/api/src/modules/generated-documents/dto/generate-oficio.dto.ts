import { IsUUID, IsNotEmpty, IsArray, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OFICIO_KINDS, OficioKind } from '../oficio.util';

/**
 * Emisión de uno de los dos oficios en Word. `kind` decide cuál: los dos se
 * emiten agrupados por empresa y con su propia numeración.
 */
export class GenerateOficioDto {
  @ApiProperty({ enum: OFICIO_KINDS, example: 'DESIGNACION' })
  @IsIn(OFICIO_KINDS)
  kind!: OficioKind;

  @ApiProperty({ example: 'uuid-del-template' })
  @IsUUID()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty()
  studentIds!: string[];

  @ApiProperty({ required: false, example: true, description: 'Reemplaza el oficio vigente del mismo tipo' })
  @IsOptional()
  overwrite?: boolean;

  @ApiProperty({ required: false, example: false, description: 'Entregar el oficio en PDF (conversión vía LibreOffice) en vez de DOCX' })
  @IsOptional()
  asPdf?: boolean;
}
