import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateDocumentDto {
  @ApiProperty({ example: 'uuid-del-template' })
  @IsUUID()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({ example: 'uuid-del-estudiante' })
  @IsUUID()
  @IsNotEmpty()
  studentId!: string;
}
