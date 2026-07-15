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
}
