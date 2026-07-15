import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterSignerDto {
  @ApiProperty({ description: 'Token de la invitación' })
  @IsString()
  token: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ description: 'Cargo, ej. "Director de Carrera"' })
  @IsOptional()
  @IsString()
  title?: string;
}
