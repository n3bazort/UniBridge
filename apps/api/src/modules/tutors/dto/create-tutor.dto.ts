import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export class CreateTutorDto {
  @ApiProperty({ example: 'Ing. Juan Carlos Sendón Varela, Mg.' })
  @IsString()
  @MinLength(4, { message: 'El nombre del docente es demasiado corto' })
  @MaxLength(120, { message: 'El nombre no puede pasar de 120 caracteres' })
  fullName: string;

  @ApiPropertyOptional({ description: 'Carrera a la que pertenece el docente' })
  @IsOptional()
  @IsUUID('4', { message: 'La carrera indicada no es válida' })
  programId?: string;

  @ApiPropertyOptional({ example: '1312345678' })
  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'La cédula debe tener exactamente 10 dígitos' })
  dni?: string;

  @ApiPropertyOptional({ example: 'juan.sendon@uleam.edu.ec' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  email?: string;

  @ApiPropertyOptional({ example: '0999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'Mg.', description: 'Título tal como el oficio lo imprime' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  title?: string;

  @ApiPropertyOptional({
    example: 20,
    description: 'Tope de estudiantes por período. Se deja en 20 salvo excepción justificada.',
  })
  @IsOptional()
  @IsInt({ message: 'El tope debe ser un número entero' })
  @Min(1, { message: 'El tope no puede ser menor que 1' })
  @Max(100, { message: 'Un tope mayor que 100 no es un tope: revisa el dato' })
  maxStudents?: number;
}
