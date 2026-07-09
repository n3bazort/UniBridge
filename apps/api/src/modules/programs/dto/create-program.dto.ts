import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProgramDto {
  @ApiProperty({ example: 'Ingeniería en Sistemas' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
