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

  @ApiProperty({ example: '2024-1' })
  @IsString()
  academicPeriod!: string;

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
}
