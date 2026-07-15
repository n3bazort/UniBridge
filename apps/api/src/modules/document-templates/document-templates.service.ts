import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../minio/minio.service';
import * as crypto from 'crypto';

@Injectable()
export class DocumentTemplatesService {
  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  /**
   * Sube una imagen de fondo a MinIO (key "templates/backgrounds/...").
   * Devuelve la key durable (para guardar en el template) y una URL
   * prefirmada de 7 días para la vista previa inmediata en el editor.
   */
  async uploadBackgroundImage(buffer: Buffer, originalName: string, mimetype: string) {
    const ext = (originalName.split('.').pop() || 'png').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const objectKey = `templates/backgrounds/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    await this.minio.uploadBuffer(buffer, objectKey, mimetype || 'image/png');
    const url = await this.minio.getPresignedUrl(objectKey, 7 * 24 * 3600);
    return { key: objectKey, url };
  }

  /** URL prefirmada (para mostrar) de una imagen de fondo guardada en MinIO. */
  async getBackgroundUrl(key: string) {
    if (!key || !key.startsWith('templates/backgrounds/')) {
      throw new BadRequestException('Key de imagen inválida');
    }
    const url = await this.minio.getPresignedUrl(key, 7 * 24 * 3600);
    return { url };
  }

  async createPdfTemplate(name: string, content: any, facultyId?: string) {
    let targetFacultyId = facultyId;

    // Si no viene facultyId (ej. es ADMIN y no seleccionó una), asignamos la primera disponible
    if (!targetFacultyId) {
      const defaultFaculty = await this.prisma.faculty.findFirst();
      if (!defaultFaculty) {
        throw new BadRequestException('No hay facultades registradas en el sistema.');
      }
      targetFacultyId = defaultFaculty.id;
    }

    return this.prisma.documentTemplate.create({
      data: {
        name,
        type: 'PDF',
        content,
        facultyId: targetFacultyId,
      },
    });
  }

  async updatePdfTemplate(id: string, name: string, content: any) {
    return this.prisma.documentTemplate.update({
      where: { id },
      data: {
        name,
        content,
      },
    });
  }

  /**
   * Guarda el DOCX en MinIO (key "templates/...") en lugar del filesystem local.
   * Así funciona igual en Docker, con varias instancias o tras un redeploy.
   */
  async createDocxTemplate(name: string, fileBuffer: Buffer, originalName: string, facultyId?: string) {
    let assignedFacultyId = facultyId;
    if (!assignedFacultyId) {
      // Si el Admin sube y no tiene facultyId en el token, asignamos la primera facultad
      const firstFaculty = await this.prisma.faculty.findFirst();
      if (!firstFaculty) throw new BadRequestException('No hay facultades en la BD para asignar');
      assignedFacultyId = firstFaculty.id;
    }

    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `templates/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
    await this.minio.uploadBuffer(
      fileBuffer,
      objectKey,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    return this.prisma.documentTemplate.create({
      data: {
        name,
        type: 'DOCX',
        content: objectKey,
        facultyId: assignedFacultyId,
      },
    });
  }

  async findAll() {
    return this.prisma.documentTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException('Template no encontrado');
    return template;
  }

  async rename(id: string, name: string) {
    return this.prisma.documentTemplate.update({
      where: { id },
      data: { name },
    });
  }

  async remove(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException('Template no encontrado');

    // 1. Eliminar documentos generados asociados para evitar fallos de clave foránea
    await this.prisma.generatedDocument.deleteMany({
      where: { templateId: id },
    });

    // 2. Si es una plantilla DOCX, eliminar el archivo físico
    if (template.type === 'DOCX' && typeof template.content === 'string') {
      if (template.content.startsWith('templates/')) {
        // Plantilla en MinIO
        await this.minio.removeObject(template.content);
      } else {
        // Compatibilidad: plantilla antigua en el filesystem local
        try {
          const fs = require('fs');
          const path = require('path');
          const resolvedPath = path.resolve(template.content);
          if (fs.existsSync(resolvedPath)) {
            fs.unlinkSync(resolvedPath);
          }
        } catch (err) {
          console.error('Error al eliminar el archivo físico del template:', err);
        }
      }
    }

    // 3. Eliminar la plantilla de la base de datos
    return this.prisma.documentTemplate.delete({
      where: { id },
    });
  }
}
