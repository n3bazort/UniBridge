import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('document-generation')
export class DocumentGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentGenerationProcessor.name);

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`[BullMQ Worker] Iniciando generación de documentos masivos. Job ID: ${job.id}`);
    
    // Aquí integraremos PDFMe y Docxtemplater en background.
    
    return { success: true };
  }
}
