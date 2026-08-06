import { Module } from '@nestjs/common';
import { PracticeLabelsService } from './practice-labels.service';
import { PracticeLabelsController } from './practice-labels.controller';

@Module({
  controllers: [PracticeLabelsController],
  providers: [PracticeLabelsService],
  exports: [PracticeLabelsService],
})
export class PracticeLabelsModule {}
