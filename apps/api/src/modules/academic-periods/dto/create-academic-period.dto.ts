import { IsString, IsDateString, IsBoolean, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAcademicPeriodDto {
  @ApiProperty({ example: '2025-1', description: 'Código único del período (ej: 2025-1)' })
  @IsString()
  @MinLength(3)
  code: string;

  @ApiProperty({ example: 'Primer Período 2025', description: 'Nombre descriptivo del período' })
  @IsString()
  @MinLength(3)
  name: string;

  @ApiProperty({ example: '2025-03-01', description: 'Fecha de inicio (ISO 8601)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-08-31', description: 'Fecha de fin (ISO 8601)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: true, description: 'Marcar como período activo (desactiva los otros)' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Dr. Juan Pérez', description: 'Nombre del Decano para documentos' })
  @IsString()
  @IsOptional()
  deanName?: string;

  @ApiPropertyOptional({ example: 'Ing. María García', description: 'Nombre del Director para documentos' })
  @IsString()
  @IsOptional()
  directorName?: string;

  // Los oficios oficiales imprimen estos tres datos bajo la firma del
  // Responsable de Prácticas. Cambian cuando cambia la persona del cargo.
  @ApiPropertyOptional({ example: '1311920613', description: 'Cédula del Responsable de Prácticas' })
  @IsString()
  @IsOptional()
  directorDni?: string;

  @ApiPropertyOptional({ example: '0999279120', description: 'Teléfono del Responsable de Prácticas' })
  @IsString()
  @IsOptional()
  directorPhone?: string;

  @ApiPropertyOptional({ example: 'practicas@uleam.edu.ec', description: 'Correo del Responsable de Prácticas' })
  @IsString()
  @IsOptional()
  directorEmail?: string;
}
