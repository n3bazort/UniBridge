import { Module } from '@nestjs/common';
import { CompletionRecordsService } from './completion-records.service';
import { CompletionRecordsController } from './completion-records.controller';
import { MinioModule } from '../minio/minio.module';

@Module({
  imports: [MinioModule],
  controllers: [CompletionRecordsController],
  providers: [CompletionRecordsService],
  exports: [CompletionRecordsService],
})
export class CompletionRecordsModule {}
