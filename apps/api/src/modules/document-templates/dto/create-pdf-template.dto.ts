import { IsString, IsNotEmpty, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePdfTemplateDto {
  @ApiProperty({ example: 'Certificado de Aprobación' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Estructura JSON de elementos Konva' })
  @IsObject()
  @IsNotEmpty()
  content!: any;

  @ApiPropertyOptional({ description: 'Se toma automáticamente del JWT si no se envía' })
  @IsOptional()
  @IsUUID()
  facultyId?: string;
}
