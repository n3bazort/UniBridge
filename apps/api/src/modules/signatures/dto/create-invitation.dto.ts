import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SignerRole, Role } from '@prisma/client';

export class CreateInvitationDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ enum: SignerRole })
  @IsOptional()
  @IsEnum(SignerRole)
  signerRole?: SignerRole;

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

  @ApiPropertyOptional({ description: 'ID de la facultad si es Coordinador' })
  @IsOptional()
  @IsString()
  facultyId?: string;

  @ApiPropertyOptional({ description: 'ID de la carrera que coordina' })
  @IsOptional()
  @IsString()
  programId?: string;
}
