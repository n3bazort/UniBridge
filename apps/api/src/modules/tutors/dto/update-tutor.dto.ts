import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTutorDto } from './create-tutor.dto';

export class UpdateTutorDto extends PartialType(CreateTutorDto) {
  @ApiPropertyOptional({
    description: 'Un docente desactivado no aparece en el selector, pero sus prácticas lo conservan',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
