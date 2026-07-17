import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'juan.perez@uleam.edu.ec' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: Role, example: Role.COORDINATOR })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({ description: 'Facultad a cargo (o se deriva del programId)' })
  @IsOptional()
  @IsUUID()
  facultyId?: string;

  @ApiPropertyOptional({ description: 'Carrera que coordina (deriva la facultad)' })
  @IsOptional()
  @IsUUID()
  programId?: string;
}
