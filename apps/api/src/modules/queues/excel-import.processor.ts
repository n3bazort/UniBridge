import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as ExcelJS from 'exceljs';
import { unlink } from 'fs/promises';
import { PrismaService } from '../../infrastructure/database/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {
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

      // 2. Procesar fila por fila (saltando la cabecera en fila 1)
      worksheet.eachRow({ includeEmpty: false }, async (row, rowNumber) => {
        if (rowNumber === 1) return; // Saltar cabecera
        processedRows++;

        // Extraer columnas del Excel: A=dni, B=firstName, C=lastName, D=email, E=programId
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
          return;
        }

        try {
          // 4. Crear o actualizar usuario (upsert por email)
          const user = await this.prisma.user.upsert({
            where: { email },
            update: {},
            create: {
              email,
              password: `temp-${dni}`, // Password temporal → debe cambiarse
              role: 'STUDENT',
            },
          });

          // 5. Crear o actualizar perfil del estudiante (upsert por dni)
          await this.prisma.student.upsert({
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

          successRows++;
        } catch (rowError) {
          this.logger.warn(`[Job ${job.id}] Error en fila ${rowNumber}: ${rowError}`);
          errorLogs.push({
            row: rowNumber,
            reason: `Error al insertar: ${(rowError as Error).message}`,
          });
        }
      });

      // 6. Marcar como COMPLETADO con resumen de errores
      await this.prisma.excelImport.update({
        where: { id: importId },
        data: {
          status: errorLogs.length > 0 ? 'COMPLETED' : 'COMPLETED',
          errorLogs: errorLogs.length > 0 ? (errorLogs as any) : undefined,
        },
      });

      this.logger.log(
        `[Job ${job.id}] Finalizado. Procesadas: ${processedRows}, Exitosas: ${successRows}, Errores: ${errorLogs.length}`,
      );
    } catch (globalError) {
      // 7. Error crítico: marcar como FAILED
      this.logger.error(`[Job ${job.id}] Error crítico: ${globalError}`);
      await this.prisma.excelImport.update({
        where: { id: importId },
        data: {
          status: 'FAILED',
          errorLogs: [{ reason: (globalError as Error).message }] as any,
        },
      });
    } finally {
      // 8. Eliminar archivo temporal del disco
      try {
        await unlink(filePath);
        this.logger.log(`[Job ${job.id}] Archivo temporal eliminado: ${filePath}`);
      } catch {
        this.logger.warn(`[Job ${job.id}] No se pudo eliminar el archivo temporal: ${filePath}`);
      }
    }
  }
}
