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

  @ApiPropertyOptional({ description: 'Facultad a cargo (requerida cuando el rol es COORDINATOR)' })
  @IsOptional()
  @IsUUID()
  facultyId?: string;
}
