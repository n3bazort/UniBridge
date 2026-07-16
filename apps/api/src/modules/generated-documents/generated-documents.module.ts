import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GeneratedDocumentsService } from './generated-documents.service';
import { GeneratedDocumentsController } from './generated-documents.controller';
import { DocumentGenerationProcessor } from './document-generation.processor';
import { DocumentEngineModule } from '../document-engine/document-engine.module';
import { MinioModule } from '../minio/minio.module';
import { PracticesModule } from '../practices/practices.module';

@Module({
  imports: [
    DocumentEngineModule,
    MinioModule,
    PracticesModule,
    BullModule.registerQueue({ name: 'document-generation' }),
  ],
  controllers: [GeneratedDocumentsController],
  providers: [GeneratedDocumentsService, DocumentGenerationProcessor],
  exports: [GeneratedDocumentsService],
})
export class GeneratedDocumentsModule {}
