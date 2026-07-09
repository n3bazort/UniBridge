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
}
