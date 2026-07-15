import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExcelImportProcessor } from './excel-import.processor';

// El procesador de 'document-generation' vive en GeneratedDocumentsModule
// (necesita GeneratedDocumentsService y ponerlo aquí crearía dependencia circular).
@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'excel-import' },
      { name: 'document-generation' },
    ),
  ],
  providers: [ExcelImportProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
