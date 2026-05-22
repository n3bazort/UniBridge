import { Module } from '@nestjs/common';
import { DocumentEngineService } from './document-engine.service';
import { PdfDriver } from './pdf.driver';
import { DocxDriver } from './docx.driver';

@Module({
  providers: [DocumentEngineService, PdfDriver, DocxDriver],
  exports: [DocumentEngineService],
})
export class DocumentEngineModule {}
