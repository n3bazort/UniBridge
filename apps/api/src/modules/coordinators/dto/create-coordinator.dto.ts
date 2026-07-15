import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCoordinatorDto {
  @ApiProperty({ example: 'uuid-del-usuario' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'uuid-de-la-facultad' })
  @IsUUID()
  facultyId!: string;
}
