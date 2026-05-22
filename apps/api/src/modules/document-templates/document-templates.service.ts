import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class DocumentTemplatesService {
  constructor(private prisma: PrismaService) {}

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

  async createDocxTemplate(name: string, filePath: string, facultyId?: string) {
    let assignedFacultyId = facultyId;
    if (!assignedFacultyId) {
      // Si el Admin sube y no tiene facultyId en el token, asignamos la primera facultad
      const firstFaculty = await this.prisma.faculty.findFirst();
      if (!firstFaculty) throw new Error('No hay facultades en la BD para asignar');
      assignedFacultyId = firstFaculty.id;
    }

    return this.prisma.documentTemplate.create({
      data: {
        name,
        type: 'DOCX',
        content: filePath,
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

    // 2. Si es una plantilla DOCX, eliminar el archivo físico del disco
    if (template.type === 'DOCX' && typeof template.content === 'string') {
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

    // 3. Eliminar la plantilla de la base de datos
    return this.prisma.documentTemplate.delete({
      where: { id },
    });
  }
}
