import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty({ example: 'uuid-user' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'uuid-program' })
  @IsUUID()
  programId!: string;

  @ApiProperty({ example: 'uuid-faculty' })
  @IsUUID()
  facultyId!: string;

  @ApiProperty({ example: '1314151617' })
  @IsString()
  dni!: string;

  @ApiProperty({ example: 'Juan Carlos' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Pérez López' })
  @IsString()
  lastName!: string;
}
