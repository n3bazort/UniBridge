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

  async generateSequence(type: string, periodCode: string, overrideCode?: string): Promise<string> {
    if (overrideCode) return overrideCode;

    // Check if period exists, if not use a fallback or create it
    let period = await this.prisma.academicPeriod.findUnique({ where: { code: periodCode } });
    if (!period) {
       period = await this.prisma.academicPeriod.create({
         data: { code: periodCode, name: periodCode, startDate: new Date(), endDate: new Date() }
       });
    }

    const sequence = await this.prisma.documentSequence.upsert({
      where: {
        type_periodCode: { type, periodCode },
      },
      update: { lastNumber: { increment: 1 } },
      create: { type, periodCode, lastNumber: 1 },
    });

    const prefix = type === 'CERTIFICADO' ? 'CERT' : 'OFIC';
    return `${prefix}-${periodCode}-${String(sequence.lastNumber).padStart(3, '0')}`;
  }

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
    const academicPeriodCode = currentPractice?.academicPeriod || '2024-1';
    
    // Obtener configuración del periodo académico
    const period = await this.prisma.academicPeriod.findUnique({
      where: { code: academicPeriodCode }
    });
    
    // Generar código único de documento
    const documentCode = await this.generateSequence('CERTIFICADO', academicPeriodCode);

    const dataToInject = {
      documentCode, // Inject sequence code
      studentName: `${student.firstName} ${student.lastName}`,
      studentDni: student.dni,
      programName: student.program?.name || 'N/A',
      facultyName: student.faculty?.name || 'N/A',
      companyName: currentPractice?.company?.name || 'N/A',
      totalHours: currentPractice?.totalHours?.toString() || '0',
      tutorName: currentPractice?.tutorName || 'N/A',
      practiceLevel: currentPractice?.practiceLevel || 'N/A',
      academicLevel: currentPractice?.academicLevel || 'N/A',
      academicPeriod: academicPeriodCode,
      deanName: period?.deanName || 'Firma Autorizada Decano',
      directorName: period?.directorName || 'Firma Autorizada Director',
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
        documentCode,
        documentType: 'CERTIFICADO',
        status: 'VALID',
        generatedById,
      }
    });
  }

  async findAll() {
    return this.prisma.generatedDocument.findMany({
      include: { 
        student: {
          include: {
            practices: {
              include: {
                company: true
              }
            }
          }
        }, 
        template: true 
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findMyDocuments(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId }
    });
    if (!student) throw new NotFoundException('Estudiante no encontrado');

    return this.prisma.generatedDocument.findMany({
      where: { 
        studentId: student.id,
        status: 'VALID' // Solo mostrar los documentos vigentes al estudiante
      },
      include: { template: true },
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
    const academicPeriodCode = currentPractice?.academicPeriod || '2024-1';
    
    // Obtener configuración del periodo académico
    const period = await this.prisma.academicPeriod.findUnique({
      where: { code: academicPeriodCode }
    });
    
    // Generamos un código único secuencial para el oficio
    const oficioId = await this.generateSequence('SOLICITUD', academicPeriodCode);

    const dataToInject = {
      oficioId: oficioId,
      documentCode: oficioId,
      currentDate: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
      companyContactName: company.contactName || 'Responsable',
      companyRecipientName: company.recipientName || 'Director(a)',
      facultyName: faculty?.name || 'Facultad de Ciencias de la Vida y Tecnologías',
      academicPeriod: academicPeriodCode,
      deanName: period?.deanName || 'Firma Autorizada Decano',
      directorName: period?.directorName || 'Firma Autorizada Director',
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
    const docs = await this.prisma.generatedDocument.createMany({
      data: studentIds.map(studentId => ({
        templateId,
        studentId,
        fileUrl,
        documentCode: oficioId,
        documentType: 'SOLICITUD',
        status: 'VALID',
        generatedById,
      }))
    });

    return { fileUrl, message: 'Oficio generado correctamente' };
  }

  async invalidate(id: string, reason: string) {
    return this.prisma.generatedDocument.update({
      where: { id },
      data: {
        status: 'INVALIDATED',
        invalidatedAt: new Date(),
        invalidReason: reason,
      }
    });
  }

  async regenerate(id: string, generatedById?: string) {
    const oldDoc = await this.prisma.generatedDocument.findUnique({
      where: { id },
      include: { student: true }
    });

    if (!oldDoc) throw new NotFoundException('Documento no encontrado');

    // Invalidate old one first if not already
    await this.prisma.generatedDocument.update({
      where: { id },
      data: { status: 'SUPERSEDED' }
    });

    let newDoc;
    if (oldDoc.documentType === 'SOLICITUD') {
      newDoc = (await this.generateSolicitudGrouped(oldDoc.templateId, [oldDoc.studentId], generatedById)).fileUrl;
    } else {
      newDoc = await this.generate(oldDoc.templateId, oldDoc.studentId, generatedById);
    }
    
    // The previous methods create a new record in DB. 
    // We need to fetch it (it's the latest one for this student/template)
    const latestDoc = await this.prisma.generatedDocument.findFirst({
      where: { 
        studentId: oldDoc.studentId,
        templateId: oldDoc.templateId,
      },
      orderBy: { createdAt: 'desc' }
    });

    if (latestDoc) {
      await this.prisma.generatedDocument.update({
        where: { id: latestDoc.id },
        data: {
          version: oldDoc.version + 1,
          replacedById: oldDoc.id
        }
      });
    }

    return latestDoc;
  }
}
