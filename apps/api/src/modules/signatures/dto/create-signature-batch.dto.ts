import { IsArray, IsOptional, IsString, IsUUID, ArrayNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSignatureBatchDto {
  @ApiProperty({ description: 'IDs de los documentos generados a incluir en el lote' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  documentIds: string[];

  @ApiPropertyOptional({ description: 'Nombre descriptivo del lote' })
  @IsOptional()
  @IsString()
  name?: string;
}
