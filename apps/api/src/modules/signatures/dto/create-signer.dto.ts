import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SignerRole } from '@prisma/client';

export class CreateSignerDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Si se omite, se genera una contraseña temporal' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ description: 'Cargo, ej. "Decano de la Facultad"' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ enum: SignerRole })
  @IsEnum(SignerRole)
  signerRole: SignerRole;
}
