import { PartialType } from '@nestjs/swagger';
import { CreatePracticeLabelDto } from './create-practice-label.dto';

export class UpdatePracticeLabelDto extends PartialType(CreatePracticeLabelDto) {}
