import { IsString, IsUUID, IsOptional, IsInt, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PracticeStatus } from '@prisma/client';

export class CreatePracticeDto {
  @ApiProperty()
  @IsUUID()
  studentId!: string;

  @ApiProperty()
  @IsUUID()
  companyId!: string;

  @ApiProperty()
  @IsUUID()
  facultyId!: string;

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
}
