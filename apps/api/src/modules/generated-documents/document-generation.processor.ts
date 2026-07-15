import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { GeneratedDocumentsService, DocumentGenerationJob } from './generated-documents.service';

/**
 * Worker de generación masiva de documentos.
 *
 * Concurrencia 4: procesa 4 documentos en paralelo (Puppeteer reutiliza
 * una única instancia de navegador con varias páginas). BullMQ maneja
 * reintentos con backoff exponencial y persiste la cola en Redis, por lo
 * que un reinicio del servidor NO pierde los trabajos pendientes.
 */
@Processor('document-generation', { concurrency: 4 })
export class DocumentGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentGenerationProcessor.name);

  constructor(private readonly generatedDocuments: GeneratedDocumentsService) {
    super();
  }

  async process(job: Job<DocumentGenerationJob>): Promise<any> {
    const { batchId, templateId, studentId, generatedById } = job.data;
    try {
      const doc = await this.generatedDocuments.generate(templateId, studentId, generatedById);
      await this.generatedDocuments.reportJobResult(batchId, true);
      return { success: true, documentId: doc.id };
    } catch (error) {
      this.logger.error(`Job ${job.id} falló para estudiante ${studentId}: ${error?.message}`);
      // Solo contar el fallo cuando se agotaron los reintentos
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.generatedDocuments.reportJobResult(batchId, false);
      }
      throw error;
    }
  }
}
