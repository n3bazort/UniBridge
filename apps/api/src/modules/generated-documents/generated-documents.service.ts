import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DocumentEngineService } from '../document-engine/document-engine.service';
import * as crypto from 'crypto';

@Injectable()
export class GeneratedDocumentsService {
  constructor(
    private prisma: PrismaService,
    private documentEngine: DocumentEngineService,
  ) {}

  async generate(templateId: string, studentId: string, generatedById?: string) {
    // 1. Obtener template
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId }
    });
    if (!template) throw new NotFoundException('Template no encontrado');

    // 2. Obtener datos del estudiante y sus relaciones
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        program: true,
        faculty: true,
        practices: { include: { company: true } }
      }
    });
    if (!student) throw new NotFoundException('Estudiante no encontrado');

    // 3. Preparar diccionario de variables
    const currentPractice = student.practices[0];
    const dataToInject = {
      studentName: `${student.firstName} ${student.lastName}`,
      studentDni: student.dni,
      programName: student.program?.name || 'N/A',
      facultyName: student.faculty?.name || 'N/A',
      companyName: currentPractice?.company?.name || 'N/A',
      totalHours: currentPractice?.totalHours?.toString() || '0',
      tutorName: currentPractice?.tutorName || 'N/A',
      practiceLevel: currentPractice?.practiceLevel || 'N/A',
      academicLevel: currentPractice?.academicLevel || 'N/A',
      academicPeriod: currentPractice?.academicPeriod || 'N/A',
      currentDate: new Date().toLocaleDateString('es-ES'),
    };

    // 4. Delegar al Motor de Documentos
    const ext = template.type === 'DOCX' ? '.docx' : '.pdf';
    
    // Format: Apellidos_Empresa(max 8)_ddmmaa
    const lastNameSanitized = student.lastName.replace(/[^a-zA-Z0-9]/g, '');
    const companySanitized = (currentPractice?.company?.name || 'Varios').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    const dateObj = new Date();
    const ddmmaa = `${String(dateObj.getDate()).padStart(2, '0')}${String(dateObj.getMonth() + 1).padStart(2, '0')}${String(dateObj.getFullYear()).slice(2)}`;
    
    const filename = `${lastNameSanitized}_${companySanitized}_${ddmmaa}${ext}`;
    
    const fileUrl = await this.documentEngine.generateDocument(
      template.type as 'PDF' | 'DOCX',
      template.content,
      dataToInject,
      filename
    );

    // 5. Guardar el registro final en BD
    return this.prisma.generatedDocument.create({
      data: {
        templateId,
        studentId,
        fileUrl,
        generatedById,
      }
    });
  }

  async findAll() {
    return this.prisma.generatedDocument.findMany({
      include: { student: true, template: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findByStudent(studentId: string) {
    return this.prisma.generatedDocument.findMany({
      where: { studentId },
      include: { template: true },
      orderBy: { createdAt: 'desc' }
    });
  }
  async generateBatch(templateId: string, studentIds: string[], generatedById?: string) {
    // Procesar en segundo plano para no bloquear la UI ni saturar la RAM con múltiples Puppeteers a la vez
    setTimeout(async () => {
      for (const studentId of studentIds) {
        try {
          await this.generate(templateId, studentId, generatedById);
        } catch (error) {
          console.error(`Error generando documento en lote para estudiante ${studentId}:`, error);
        }
      }
    }, 0);

    return { 
      message: 'Generación en lote iniciada en segundo plano', 
      count: studentIds.length 
    };
  }

  async generateSolicitudGrouped(templateId: string, studentIds: string[], generatedById?: string) {
    // 1. Obtener template
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId }
    });
    if (!template || template.type !== 'DOCX') {
      throw new NotFoundException('Template DOCX no encontrado');
    }

    // 2. Obtener estudiantes y sus prácticas
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        program: true,
        faculty: true,
        user: true,
        practices: { include: { company: true } }
      }
    });

    if (students.length === 0) throw new NotFoundException('No se encontraron estudiantes');

    // Asumimos que todos van a la misma empresa porque se agruparon en el UI
    const firstStudent = students[0];
    const currentPractice = firstStudent.practices[0];
    const company = currentPractice?.company;
    const faculty = firstStudent.faculty;
    const program = firstStudent.program;

    if (!company) throw new NotFoundException('Los estudiantes seleccionados no tienen una empresa asignada');

    // 3. Preparar diccionario de variables reales
    // oficioId: Generamos un código corto alfanumérico único para el documento
    const oficioId = crypto.randomBytes(2).toString('hex').toUpperCase();

    const dataToInject = {
      oficioId: oficioId,
      currentDate: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
      companyContactName: company.contactName || 'Responsable',
      companyRecipientName: company.recipientName || 'Director(a)',
      facultyName: faculty?.name || 'Facultad de Ciencias de la Vida y Tecnologías',
      academicPeriod: currentPractice?.academicPeriod || '2026-1',
      companyName: company.name,
      academicTutorName: currentPractice?.tutorName || 'Docente Tutor',
      programName: program?.name || 'Carrera',
      students: students.map(s => {
        const p = s.practices[0];
        return {
          lastName: s.lastName,
          firstName: s.firstName,
          dni: s.dni,
          phone: (s as any).phone || 'N/A', // Nota: El teléfono no existe en la base de datos
          email: s.user?.email || 'N/A',
          totalHours: p?.totalHours?.toString() || '0'
        };
      })
    };

    // 4. Delegar al Motor de Documentos
    const companySanitized = company.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const companyFormatted = companySanitized.charAt(0).toUpperCase() + companySanitized.slice(1);
    
    const dateObj = new Date();
    const ddmmyy = `${String(dateObj.getDate()).padStart(2, '0')}${String(dateObj.getMonth() + 1).padStart(2, '0')}${String(dateObj.getFullYear()).slice(2)}`;
    
    const filename = `Solicitud_${oficioId}_${companyFormatted}_${ddmmyy}.docx`;
    
    const fileUrl = await this.documentEngine.generateDocument(
      'DOCX',
      template.content, // Path al DOCX original
      dataToInject,
      filename
    );

    // 5. Guardar el registro en GeneratedDocument para TODOS los estudiantes involucrados.
    await this.prisma.generatedDocument.createMany({
      data: studentIds.map(id => ({
        templateId,
        studentId: id,
        fileUrl,
        generatedById,
      }))
    });

    return { fileUrl, message: 'Oficio generado correctamente' };
  }
}
