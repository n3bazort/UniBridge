import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SignerRole, Role } from '@prisma/client';

export class CreateSignerDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Si se omite, se genera una contraseña temporal' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Cargo, ej. "Decano de la Facultad"' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: SignerRole })
  @IsOptional()
  @IsEnum(SignerRole)
  signerRole?: SignerRole;

  @ApiPropertyOptional({ description: 'ID de la facultad si es Coordinador' })
  @IsOptional()
  @IsString()
  facultyId?: string;

  @ApiPropertyOptional({ description: 'ID de la carrera que coordina' })
  @IsOptional()
  @IsString()
  programId?: string;
}
