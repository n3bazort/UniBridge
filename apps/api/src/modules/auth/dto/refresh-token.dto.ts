import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ example: 'a9b8c7d6e5f4g3h2i1j0...' })
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}
