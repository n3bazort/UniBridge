import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as ExcelJS from 'exceljs';
import { unlink } from 'fs/promises';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OpenSearchService } from '../opensearch/opensearch.service';

interface ExcelJobData {
  importId: string;
  filePath: string;
  facultyId: string;
  uploadedBy: string;
}

interface RowError {
  row: number;
  reason: string;
}

@Processor('excel-import')
export class ExcelImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExcelImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openSearchService: OpenSearchService
  ) {
    super();
  }

  async process(job: Job<ExcelJobData>): Promise<void> {
    const { importId, filePath, facultyId } = job.data;

    this.logger.log(`[Job ${job.id}] Iniciando procesamiento: ${filePath}`);

    // 1. Marcar el Import como PROCESSING
    await this.prisma.excelImport.update({
      where: { id: importId },
      data: { status: 'PROCESSING' },
    });

    const errorLogs: RowError[] = [];
    let processedRows = 0;
    let successRows = 0;

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];

      // Recolectar todas las filas primero (eachRow es síncrono, no se puede usar con await)
      const rows: ExcelJS.Row[] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // Saltar cabecera
        rows.push(row);
      });

      // 2. Procesar fila por fila de forma secuencial y correctamente asíncrona
      for (const row of rows) {
        const rowNumber = row.number;
        processedRows++;

        // Extraer columnas: A=dni, B=firstName, C=lastName, D=email, E=programId
        const dni = row.getCell(1).text?.trim();
        const firstName = row.getCell(2).text?.trim();
        const lastName = row.getCell(3).text?.trim();
        const email = row.getCell(4).text?.trim();
        const programId = row.getCell(5).text?.trim();

        // 3. Validación básica de campos obligatorios
        if (!dni || !firstName || !lastName || !email || !programId) {
          errorLogs.push({
            row: rowNumber,
            reason: `Faltan campos obligatorios (dni, firstName, lastName, email, programId).`,
          });
          continue;
        }

        try {
          // 4. Crear o actualizar usuario (upsert por email) — password hasheado
          const hashedPassword = await bcrypt.hash(`temporal-${dni}`, 10);
          const user = await this.prisma.user.upsert({
            where: { email },
            update: {},
            create: {
              email,
              password: hashedPassword,
              role: 'STUDENT',
            },
          });

          // 5. Crear o actualizar perfil del estudiante (upsert por dni)
          const student = await this.prisma.student.upsert({
            where: { dni },
            update: { firstName, lastName },
            create: {
              userId: user.id,
              facultyId,
              programId,
              dni,
              firstName,
              lastName,
            },
          });

          // 6. Indexar en OpenSearch (falla silenciosamente para no bloquear el import)
          try {
            await this.openSearchService.indexStudent({
              id: student.id,
              firstName: student.firstName,
              lastName: student.lastName,
              dni: student.dni,
              programName: programId,
              academicPeriod: '2024-1',
            });
          } catch (osError) {
            this.logger.warn(`Error indexando estudiante ${student.id} en OpenSearch: ${osError}`);
          }

          successRows++;
        } catch (rowError) {
          this.logger.warn(`[Job ${job.id}] Error en fila ${rowNumber}: ${rowError}`);
          errorLogs.push({
            row: rowNumber,
            reason: `Error al insertar: ${(rowError as Error).message}`,
          });
        }

        // Reportar progreso al worker de BullMQ
        await job.updateProgress(Math.round((processedRows / rows.length) * 100));
      }

      // 7. Marcar como COMPLETADO
      await this.prisma.excelImport.update({
        where: { id: importId },
        data: {
          status: 'COMPLETED',
          errorLogs: errorLogs.length > 0 ? (errorLogs as any) : undefined,
        },
      });

      this.logger.log(
        `[Job ${job.id}] Finalizado. Procesadas: ${processedRows}, Exitosas: ${successRows}, Errores: ${errorLogs.length}`,
      );
    } catch (globalError) {
      // 8. Error crítico: marcar como FAILED
      this.logger.error(`[Job ${job.id}] Error crítico: ${globalError}`);
      await this.prisma.excelImport.update({
        where: { id: importId },
        data: {
          status: 'FAILED',
          errorLogs: [{ reason: (globalError as Error).message }] as any,
        },
      });
    } finally {
      // 9. Eliminar archivo temporal del disco
      try {
        await unlink(filePath);
        this.logger.log(`[Job ${job.id}] Archivo temporal eliminado: ${filePath}`);
      } catch {
        this.logger.warn(`[Job ${job.id}] No se pudo eliminar el archivo temporal: ${filePath}`);
      }
    }
  }
}
