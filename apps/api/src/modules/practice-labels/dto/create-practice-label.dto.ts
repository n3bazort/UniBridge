import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePracticeLabelDto {
  @ApiProperty({ example: 'La empresa no aprueba aún' })
  @IsString()
  @MinLength(1, { message: 'La etiqueta necesita un nombre' })
  @MaxLength(40, { message: 'El nombre no puede pasar de 40 caracteres' })
  name: string;

  @ApiProperty({ example: '#f59e0b', description: 'Color en hexadecimal' })
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'El color debe ser hexadecimal, por ejemplo #f59e0b' })
  color: string;

  @ApiPropertyOptional({ description: 'Posición en la lista del selector' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
