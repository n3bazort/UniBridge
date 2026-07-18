import { IsString, MinLength, Matches, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentPassword123' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: 'NewPass123!' })
  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  @Matches(/(?=.*[A-Z])/, { message: 'La nueva contraseña debe tener al menos una letra mayúscula' })
  @Matches(/(?=.*[0-9])/, { message: 'La nueva contraseña debe tener al menos un número' })
  @Matches(/(?=.*[!@#$%^&*])/, { message: 'La nueva contraseña debe tener al menos un carácter especial (!@#$%^&*)' })
  newPassword!: string;
}
