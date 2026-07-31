import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OFICIO_KINDS } from '../../generated-documents/oficio.util';

export class CreateDocxTemplateDto {
  @ApiProperty({ example: 'Solicitud de Inicio' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Se toma automáticamente del JWT si no se envía' })
  @IsOptional()
  @IsUUID()
  facultyId?: string;

  @ApiPropertyOptional({
    enum: OFICIO_KINDS,
    description: 'Cuál de los dos oficios reproduce la plantilla. Si no se envía se asume SOLICITUD.',
  })
  @IsOptional()
  @IsIn(OFICIO_KINDS)
  kind?: string;
}
