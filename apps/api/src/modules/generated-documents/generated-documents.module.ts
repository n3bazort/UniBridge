import { Module } from '@nestjs/common';
import { GeneratedDocumentsService } from './generated-documents.service';
import { GeneratedDocumentsController } from './generated-documents.controller';
import { DocumentEngineModule } from '../document-engine/document-engine.module';

@Module({
  imports: [DocumentEngineModule],
  controllers: [GeneratedDocumentsController],
  providers: [GeneratedDocumentsService],
})
export class GeneratedDocumentsModule {}
