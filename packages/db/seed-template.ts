import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const faculty = await prisma.faculty.findFirst();
    if (!faculty) {
      console.log('Error: No se encontró ninguna facultad en la base de datos para asociar la plantilla.');
      return;
    }

    const existingTemplate = await prisma.documentTemplate.findFirst({
      where: { name: 'Certificado de Prácticas Oficial' }
    });

    if (existingTemplate) {
      console.log('La plantilla oficial ya existe en la base de datos.');
      const content = existingTemplate.content as any;
      if (!content.isDefault) {
         await prisma.documentTemplate.update({
           where: { id: existingTemplate.id },
           data: { content: { ...content, isDefault: true } }
         });
         console.log('Plantilla actualizada para ser la predeterminada.');
      }
      return;
    }

    const template = await prisma.documentTemplate.create({
      data: {
        name: 'Certificado de Prácticas Oficial',
        type: 'PDF',
        facultyId: faculty.id,
        content: {
          isDefault: true,
          elements: [
            {
              type: 'text',
              value: 'CERTIFICADO DE PRÁCTICAS PRE PROFESIONALES',
              style: {
                fontSize: 24,
                bold: true,
                alignment: 'center',
                margin: [0, 0, 0, 20]
              }
            },
            {
              type: 'text',
              value: 'Se certifica que el/la estudiante {{studentName}} con DNI {{studentDni}}, ha culminado satisfactoriamente sus prácticas pre profesionales en la empresa {{companyName}}, cumpliendo un total de {{totalHours}} horas.',
              style: {
                fontSize: 12,
                alignment: 'justify',
                margin: [0, 0, 0, 20]
              }
            }
          ]
        }
      }
    });
    console.log('Plantilla oficial creada exitosamente:', template.name);
  } catch (error) {
    console.error('Error poblando la plantilla:', error);
  } finally {
    await prisma.$disconnect();
  }
}
main();
