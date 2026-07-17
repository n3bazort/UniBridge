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

  /**
   * El content de una plantilla DOCX puede ser un string (key de MinIO,
   * formato original) o un objeto { path, isDefault?, codePrefix?, codeSuffix? }
   * (formato nuevo con configuración). Este helper normaliza ambos.
   */
  static docxContent(content: any): { path: string; isDefault?: boolean; docTypeAbbr?: string; codeSuffix?: string; codePrefix?: string } {
    if (typeof content === 'string') return { path: content };
    return content || { path: '' };
  }

  /**
   * Marca una plantilla como predeterminada de su tipo y DESMARCA todas las
   * demás del mismo tipo en la misma transacción: nunca puede haber dos.
   */
  async setDefault(id: string) {
    const target = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Template no encontrado');

    const sameType = await this.prisma.documentTemplate.findMany({ where: { type: target.type } });

    await this.prisma.$transaction(
      sameType.map((t) => {
        const isTarget = t.id === id;
        let content: any;
        if (t.type === 'DOCX') {
          content = { ...DocumentTemplatesService.docxContent(t.content), isDefault: isTarget };
        } else {
          content = { ...(t.content as any), isDefault: isTarget };
        }
        return this.prisma.documentTemplate.update({ where: { id: t.id }, data: { content } });
      }),
    );

    return { id, type: target.type, message: `"${target.name}" es ahora la plantilla predeterminada de ${target.type}` };
  }

  /**
   * Configura la numeración del oficio DOCX: prefijo y sufijo editables
   * alrededor del número secuencial {{oficioId}}, que es inamovible porque
   * garantiza la unicidad del documento.
   */
  async updateDocxConfig(id: string, config: { docTypeAbbr?: string; codeSuffix?: string; codePrefix?: string }) {
    const template = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template no encontrado');
    if (template.type !== 'DOCX') throw new BadRequestException('Solo aplica a plantillas DOCX');

    const current = DocumentTemplatesService.docxContent(template.content);
    const content = {
      ...current,
      docTypeAbbr: config.docTypeAbbr ?? current.docTypeAbbr ?? 'SPP',
      codePrefix: config.codePrefix ?? current.codePrefix ?? '',
      codeSuffix: config.codeSuffix ?? current.codeSuffix ?? '',
    };
    await this.prisma.documentTemplate.update({ where: { id }, data: { content } });
    return { id, docTypeAbbr: content.docTypeAbbr, codeSuffix: content.codeSuffix, codePrefix: content.codePrefix };
  }

  /**
   * Descarga de la plantilla original:
   *  - DOCX → URL prefirmada del archivo Word subido
   *  - PDF  → el diseño (JSON) como archivo, para respaldo o migración
   */
  async getDownloadInfo(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template no encontrado');

    const safeName = template.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _.-]/g, '').trim() || 'plantilla';

    if (template.type === 'DOCX') {
      const docxPath = DocumentTemplatesService.docxContent(template.content).path;
      if (!docxPath.startsWith('templates/')) {
        throw new BadRequestException('Esta plantilla antigua no está en el almacenamiento descargable');
      }
      const url = await this.minio.getPresignedUrl(docxPath, 900, `${safeName}.docx`);
      return { kind: 'url' as const, url, filename: `${safeName}.docx` };
    }

    // PDF: el "archivo" es el diseño JSON del editor
    return {
      kind: 'json' as const,
      filename: `${safeName}.diseno.json`,
      content: template.content,
    };
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
    if (template.type === 'DOCX') {
      const docxPath = DocumentTemplatesService.docxContent(template.content).path;
      if (docxPath.startsWith('templates/')) {
        // Plantilla en MinIO
        await this.minio.removeObject(docxPath);
      } else if (docxPath) {
        // Compatibilidad: plantilla antigua en el filesystem local
        try {
          const fs = require('fs');
          const path = require('path');
          const resolvedPath = path.resolve(docxPath);
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
