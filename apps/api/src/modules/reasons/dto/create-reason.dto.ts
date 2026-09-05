import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReasonScope } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateReasonDto {
  @ApiProperty({
    example: 'PRACTICA_SUSPENDIDA',
    description: 'Código estable. Es lo que agrupan los reportes, así que no se puede cambiar después.',
  })
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_ ]{2,39}$/, {
    message: 'El código empieza por letra y solo admite letras, números y guiones bajos',
  })
  code: string;

  @ApiProperty({ example: 'La práctica quedó suspendida por la empresa' })
  @IsString()
  @MinLength(3, { message: 'La etiqueta es demasiado corta' })
  @MaxLength(80, { message: 'La etiqueta no puede pasar de 80 caracteres' })
  label: string;

  @ApiProperty({
    enum: ReasonScope,
    description: 'PRACTICE para bajas, DOCUMENT para invalidaciones, BOTH si sirve en ambas',
  })
  @IsEnum(ReasonScope, { message: 'El ámbito debe ser PRACTICE, DOCUMENT o BOTH' })
  scope: ReasonScope;

  @ApiPropertyOptional({ description: 'Posición en el selector' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
