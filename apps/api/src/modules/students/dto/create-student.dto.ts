import { IsString, IsUUID, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty({ example: 'uuid-user', required: false })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiProperty({ example: 'uuid-program' })
  @IsUUID()
  programId!: string;

  @ApiProperty({ example: 'uuid-faculty', required: false })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

  @ApiProperty({ example: '1314151617' })
  @IsString()
  dni!: string;

  @ApiProperty({ example: 'Juan Carlos' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Pérez López' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: '0991234567', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'juan.perez@universidad.edu.ec', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;
}
