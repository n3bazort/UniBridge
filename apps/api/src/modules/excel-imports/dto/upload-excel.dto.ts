import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadExcelDto {
  @ApiProperty({ example: 'uuid-de-la-facultad' })
  @IsUUID()
  facultyId!: string;
}
