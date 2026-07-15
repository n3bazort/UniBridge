import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SignerRole } from '@prisma/client';

export class CreateInvitationDto {
  @ApiProperty({ enum: SignerRole })
  @IsEnum(SignerRole)
  signerRole: SignerRole;

  @ApiPropertyOptional({ description: 'Si se fija, el registro exigirá este correo' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Nombre pre-llenado en el formulario' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Días de validez del link (1-30, por defecto 7)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
