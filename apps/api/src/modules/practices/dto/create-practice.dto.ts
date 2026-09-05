import { IsString, IsUUID, IsOptional, IsInt, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PracticeStatus } from '@prisma/client';

export class CreatePracticeDto {
  // Un BORRADOR es, por definición, una práctica a medio llenar: se guarda con
  // el estudiante y se completa la empresa después, o al revés. Por eso los
  // tres campos son opcionales AQUÍ y la exigencia se aplica en el servicio,
  // que sí sabe si lo que llega es un borrador o una práctica en firme.
  //
  // Antes los tres eran obligatorios y guardar un borrador devolvía
  // «facultyId must be a UUID» sin haber llegado a la lógica de negocio.
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Si no se envía, se resuelve del estudiante' })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

  @ApiPropertyOptional({ example: '2024-1', description: 'Se asigna automáticamente del periodo activo si no se envía' })
  @IsString()
  @IsOptional()
  academicPeriod?: string;

  @ApiPropertyOptional({ enum: PracticeStatus })
  @IsEnum(PracticeStatus)
  @IsOptional()
  status?: PracticeStatus;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  totalHours?: number;

  @ApiPropertyOptional({ description: 'Tutor institucional/empresarial' })
  @IsString()
  @IsOptional()
  tutorName?: string;

  @ApiPropertyOptional({ description: 'Nivel de práctica (ej. Prácticas Laborales II)' })
  @IsString()
  @IsOptional()
  practiceLevel?: string;

  @ApiPropertyOptional({ description: 'Nivel académico (ej. Octavo)' })
  @IsString()
  @IsOptional()
  academicLevel?: string;

  @ApiPropertyOptional({
    description: 'Área de la empresa donde se desempeñará. La solicitud oficial la imprime: "en el área de: ___"',
    example: 'TI',
  })
  @IsString()
  @IsOptional()
  workArea?: string;
}
