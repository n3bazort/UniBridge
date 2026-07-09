import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ExcelImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    @InjectQueue('excel-import') private readonly excelQueue: Queue,
  ) {}

  async upload(
    file: Express.Multer.File | undefined,
    facultyId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Debes subir un archivo Excel (.xlsx)');
    }

    const userId = this.cls.get<string>('userId');

    // 1. Registrar el Import en BD con estado PENDING
    const excelImport = await this.prisma.excelImport.create({
      data: {
        fileName: file.originalname,
        fileUrl: file.path,
        status: 'PENDING',
        facultyId,
        uploadedBy: userId,
      },
    });

    // 2. Publicar el Job en la cola de Redis (Fire & Forget)
    await this.excelQueue.add(
      'process-excel',
      {
        importId: excelImport.id,
        filePath: file.path,
        facultyId,
        uploadedBy: userId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return {
      importId: excelImport.id,
      status: 'PENDING',
      message: 'El archivo fue recibido y está siendo procesado en segundo plano.',
    };
  }

  async findOne(id: string) {
    const record = await this.prisma.excelImport.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Import con ID ${id} no encontrado`);
    }

    return record;
  }

  findAll() {
    return this.prisma.excelImport.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
