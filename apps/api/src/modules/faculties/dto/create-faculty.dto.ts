import { IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFacultyDto {
  @ApiProperty({ example: 'Facultad de Ciencias Informáticas' })
  @IsString()
  @MinLength(3)
  name!: string;

  @ApiPropertyOptional({ example: 'Facultad dedicada a las TICs' })
  @IsString()
  @IsOptional()
  description?: string;
}
