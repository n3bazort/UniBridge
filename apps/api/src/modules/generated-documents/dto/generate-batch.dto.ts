import { IsUUID, IsNotEmpty, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateBatchDto {
  @ApiProperty({ example: 'uuid-del-template' })
  @IsUUID()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty()
  studentIds!: string[];
}
