import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDocxTemplateDto {
  @ApiProperty({ example: 'Solicitud de Inicio' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Se toma automáticamente del JWT si no se envía' })
  @IsOptional()
  @IsUUID()
  facultyId?: string;
}
