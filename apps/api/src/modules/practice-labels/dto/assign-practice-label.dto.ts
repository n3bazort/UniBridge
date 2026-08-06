import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';

/** Asignación en bloque: la misma etiqueta para todas las prácticas indicadas. */
export class AssignPracticeLabelDto {
  @ApiProperty({ type: [String], description: 'Prácticas que reciben la etiqueta' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Hay que indicar al menos una práctica' })
  @IsUUID('4', { each: true })
  practiceIds: string[];

  @ApiPropertyOptional({ description: 'Etiqueta a asignar; omitir o null la retira' })
  @IsOptional()
  @IsUUID('4')
  labelId?: string | null;
}
