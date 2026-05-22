import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExcelImportProcessor } from './excel-import.processor';
import { DocumentGenerationProcessor } from './document-generation.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'excel-import' },
      { name: 'document-generation' },
    ),
  ],
  providers: [ExcelImportProcessor, DocumentGenerationProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
