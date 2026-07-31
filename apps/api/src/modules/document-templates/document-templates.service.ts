import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MinioService } from '../minio/minio.service';
import * as crypto from 'crypto';
import { OFICIO_KINDS, OFICIO_SCOPES } from '../generated-documents/oficio.util';

/** Los dos oficios en Word que la Facultad emite. */
const DOCX_KINDS = OFICIO_KINDS;

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
  async createDocxTemplate(name: string, fileBuffer: Buffer, originalName: string, facultyId?: string, kind?: string) {
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
        // La plantilla declara de qué oficio es: la Facultad usa dos formatos en
        // Word y emitir uno con el cuerpo del otro produciría un documento falso.
        content: { path: objectKey, kind: DOCX_KINDS.includes(kind as any) ? kind : 'SOLICITUD' },
        facultyId: assignedFacultyId,
      },
    });
  }

  /**
   * El content de una plantilla DOCX puede ser un string (key de MinIO,
   * formato original) o un objeto { path, isDefault?, codePrefix?, codeSuffix? }
   * (formato nuevo con configuración). Este helper normaliza ambos.
   *
   * Las plantillas anteriores a los dos formatos no declaran `kind`: se asumen
   * de solicitud, que era el único oficio que existía cuando se subieron.
   */
  static docxContent(content: any): {
    path: string; kind: string; scope: string; isDefault?: boolean; docTypeAbbr?: string;
    codeSuffix?: string; codePrefix?: string; codePattern?: string; fileBaseName?: string;
  } {
    if (typeof content === 'string') return { path: content, kind: 'SOLICITUD', scope: 'GRUPO' };
    const obj = content || {};
    return { ...obj, path: obj.path || '', kind: obj.kind || 'SOLICITUD', scope: obj.scope || 'GRUPO' };
  }

  /**
   * Marca una plantilla como predeterminada y desmarca las que competían con
   * ella en la misma transacción: nunca puede haber dos.
   *
   * En DOCX el ámbito es el tipo de oficio, no el formato de archivo: la
   * solicitud y la designación tienen cada una su predeterminada, porque son
   * documentos distintos que se emiten en momentos distintos.
   */
  async setDefault(id: string) {
    const target = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Template no encontrado');

    const sameType = await this.prisma.documentTemplate.findMany({ where: { type: target.type } });
    const targetKind = target.type === 'DOCX'
      ? DocumentTemplatesService.docxContent(target.content).kind
      : null;

    const compiten = sameType.filter((t) =>
      t.type !== 'DOCX' || DocumentTemplatesService.docxContent(t.content).kind === targetKind);

    await this.prisma.$transaction(
      compiten.map((t) => {
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

    const ambito = targetKind === 'DESIGNACION' ? 'designación de estudiantes'
      : targetKind === 'SOLICITUD' ? 'solicitud de prácticas'
      : target.type;
    return { id, type: target.type, kind: targetKind, message: `"${target.name}" es ahora la plantilla predeterminada de ${ambito}` };
  }

  /**
   * Configura la numeración del oficio DOCX: prefijo y sufijo editables
   * alrededor del número secuencial {{oficioId}}, que es inamovible porque
   * garantiza la unicidad del documento.
   */
  async updateDocxConfig(id: string, config: {
    docTypeAbbr?: string; codeSuffix?: string; codePrefix?: string;
    kind?: string; scope?: string; codePattern?: string; fileBaseName?: string;
  }) {
    const template = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template no encontrado');
    if (template.type !== 'DOCX') throw new BadRequestException('Solo aplica a plantillas DOCX');
    if (config.kind && !DOCX_KINDS.includes(config.kind as any)) {
      throw new BadRequestException(`Tipo de oficio no reconocido: ${config.kind}`);
    }
    if (config.scope && !OFICIO_SCOPES.includes(config.scope as any)) {
      throw new BadRequestException(`Alcance no reconocido: ${config.scope}`);
    }

    const current = DocumentTemplatesService.docxContent(template.content);
    const content = {
      ...current,
      kind: config.kind ?? current.kind,
      scope: config.scope ?? current.scope,
      docTypeAbbr: config.docTypeAbbr ?? current.docTypeAbbr ?? 'SPP',
      codePrefix: config.codePrefix ?? current.codePrefix ?? '',
      codeSuffix: config.codeSuffix ?? current.codeSuffix ?? '',
      // Vacío significa «usa el patrón que trae el sistema para este oficio»
      codePattern: config.codePattern ?? current.codePattern ?? '',
      fileBaseName: config.fileBaseName ?? current.fileBaseName ?? '',
    };
    if (!content.codePattern) delete (content as any).codePattern;
    if (!content.fileBaseName) delete (content as any).fileBaseName;
    await this.prisma.documentTemplate.update({ where: { id }, data: { content } });
    return { id, ...content };
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

  /**
   * Obtiene la lista de secuencias de numeración por tipo de oficio para el periodo indicado.
   */
  async getSequences(periodCode?: string) {
    let targetPeriod = periodCode;
    if (!targetPeriod) {
      const active = await this.prisma.academicPeriod.findFirst({ where: { isActive: true } });
      targetPeriod = active?.code || '2026-1';
    }

    const sequences = await this.prisma.documentSequence.findMany({
      where: { periodCode: targetPeriod },
    });

    const kinds = ['SOLICITUD', 'DESIGNACION'];
    return kinds.map((kind) => {
      const found = sequences.find((s) => s.type === kind);
      const lastNumber = found ? found.lastNumber : 0;
      return {
        type: kind,
        periodCode: targetPeriod,
        lastNumber,
        nextNumber: lastNumber + 1,
      };
    });
  }

  /**
   * Permite retomar o cambiar la numeración del próximo oficio a emitir.
   */
  async updateSequence(type: string, nextNumber: number, periodCode?: string) {
    let targetPeriod = periodCode;
    if (!targetPeriod) {
      const active = await this.prisma.academicPeriod.findFirst({ where: { isActive: true } });
      targetPeriod = active?.code || '2026-1';
    }

    // Si el usuario quiere que el próximo número sea nextNumber, guardamos lastNumber = nextNumber - 1
    const lastNumber = Math.max(0, Number(nextNumber) - 1);

    const sequence = await this.prisma.documentSequence.upsert({
      where: {
        type_periodCode: { type, periodCode: targetPeriod },
      },
      update: { lastNumber },
      create: { type, periodCode: targetPeriod, lastNumber },
    });

    return {
      type: sequence.type,
      periodCode: sequence.periodCode,
      lastNumber: sequence.lastNumber,
      nextNumber: sequence.lastNumber + 1,
    };
  }
}
