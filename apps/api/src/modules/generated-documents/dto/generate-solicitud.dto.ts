import { IsUUID, IsNotEmpty, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateSolicitudDto {
  @ApiProperty({ example: 'uuid-del-template' })
  @IsUUID()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty()
  studentIds!: string[];

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  overwrite?: boolean;

  @ApiProperty({ required: false, example: false, description: 'Entregar el oficio en PDF (conversión vía LibreOffice) en vez de DOCX' })
  @IsOptional()
  asPdf?: boolean;
}
