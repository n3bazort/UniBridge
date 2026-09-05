import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateReasonDto } from './create-reason.dto';

export class UpdateReasonDto extends PartialType(CreateReasonDto) {
  @ApiPropertyOptional({ description: 'Un motivo desactivado deja de ofrecerse, pero no se borra' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
