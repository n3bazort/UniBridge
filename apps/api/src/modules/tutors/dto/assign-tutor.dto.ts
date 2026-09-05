import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class AssignTutorDto {
  @ApiProperty({ description: 'Prácticas que reciben el docente', type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Selecciona al menos una práctica' })
  @IsUUID('4', { each: true, message: 'Alguna de las prácticas indicadas no es válida' })
  practiceIds: string[];

  @ApiPropertyOptional({ description: 'Docente a asignar. Sin valor, se retira el tutor actual.' })
  @IsOptional()
  @ValidateIf((o) => o.tutorId !== null)
  @IsUUID('4', { message: 'El docente indicado no es válido' })
  tutorId?: string | null;
}
