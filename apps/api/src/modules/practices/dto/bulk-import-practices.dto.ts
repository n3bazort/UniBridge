import { IsString, IsArray, ValidateNested, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkImportStudentRowDto {
  @ApiProperty({ example: '0912345678' })
  @IsString()
  @IsNotEmpty()
  dni: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Pérez García' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'juan.perez@uleam.edu.ec' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 'Ingeniería en Sistemas' })
  @IsString()
  @IsOptional()
  programName?: string;

  @ApiPropertyOptional({ example: '0991234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Empresa ABC S.A.' })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiPropertyOptional({ example: 'Ing. Carlos Tutor' })
  @IsString()
  @IsOptional()
  companyTutor?: string;

  @ApiPropertyOptional({ example: 'empresa@correo.com' })
  @IsString()
  @IsOptional()
  companyEmail?: string;

  @ApiPropertyOptional({ example: '0987654321' })
  @IsString()
  @IsOptional()
  companyPhone?: string;

  @ApiPropertyOptional({ example: 'Gerente General' })
  @IsString()
  @IsOptional()
  destinatarioOficio?: string;

  @ApiPropertyOptional({ example: 'Dr. Tutor Académico' })
  @IsString()
  @IsOptional()
  tutorName?: string;

  @ApiPropertyOptional({ example: 'PRIMERA' })
  @IsString()
  @IsOptional()
  practiceLevel?: string;

  @ApiPropertyOptional({ example: 'TERCER NIVEL' })
  @IsString()
  @IsOptional()
  academicLevel?: string;

  @ApiPropertyOptional({ example: 480 })
  @IsNumber()
  @IsOptional()
  totalHours?: number;

  @ApiPropertyOptional({ example: '2025-1' })
  @IsString()
  @IsOptional()
  academicPeriod?: string;
}

export class BulkImportPracticesDto {
  @ApiProperty({ example: 'Ingeniería en Sistemas' })
  @IsString()
  @IsNotEmpty()
  programName: string;

  @ApiProperty({ type: [BulkImportStudentRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportStudentRowDto)
  students: BulkImportStudentRowDto[];
}
