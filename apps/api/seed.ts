import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno desde packages/db
dotenv.config({ path: path.resolve(__dirname, '../../packages/db/.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando el sembrado de la BD...');
  
  // Clear tables
  await prisma.generatedDocument.deleteMany({});
  await prisma.documentTemplate.deleteMany({});
  await prisma.practice.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.program.deleteMany({});
  await prisma.company.deleteMany({});
  await prisma.coordinator.deleteMany({});
  await prisma.faculty.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({});

  const hashedPassword = await bcrypt.hash('Admin123!', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'admin@uleam.edu.ec' },
    update: {},
    create: {
      email: 'admin@uleam.edu.ec',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });
  
  console.log('✅ Usuario Admin maestro creado exitosamente!');
  console.log(`Email: ${user.email}`);
  console.log(`Password: Admin123!`);

  const coordinator = await prisma.user.upsert({
    where: { email: 'coordinator@uleam.edu.ec' },
    update: {},
    create: {
      email: 'coordinator@uleam.edu.ec',
      password: hashedPassword,
      role: 'COORDINATOR',
    },
  });
  console.log('✅ Usuario Coordinator creado exitosamente!');

  const faculty = await prisma.faculty.upsert({
    where: { name: 'Facultad de Ciencias Informáticas' },
    update: {},
    create: { name: 'Facultad de Ciencias Informáticas', description: 'FCI' },
  });

  const program = await prisma.program.upsert({
    where: { id: '00000000-0000-0000-0000-000000000000' }, // Use dummy ID or findFirst in real life, but here we can just create if not exists by name? No unique on name. Let's create normally or use a known ID
    update: {},
    create: { id: '11111111-1111-1111-1111-111111111111', name: 'Ingeniería en Sistemas', facultyId: faculty.id },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@uleam.edu.ec' },
    update: {},
    create: {
      email: 'student@uleam.edu.ec',
      password: hashedPassword,
      role: 'STUDENT',
      studentProfile: {
        create: {
          dni: '1312345678',
          firstName: 'Juan',
          lastName: 'Pérez',
          facultyId: faculty.id,
          programId: '11111111-1111-1111-1111-111111111111'
        }
      }
    },
  });
  console.log('✅ Usuario Student creado exitosamente con perfil!');

  const company = await prisma.company.upsert({
    where: { name: 'Tech Solutions SA' },
    update: {},
    create: { name: 'Tech Solutions SA', address: 'Manta', contactName: 'Ing. López' },
  });

  // Ensure we get the student profile ID
  const studentProfile = await prisma.student.findUnique({ where: { dni: '1312345678' } });

  if (studentProfile) {
    await prisma.practice.create({
      data: {
        studentId: studentProfile.id,
        companyId: company.id,
        facultyId: faculty.id,
        status: 'IN_PROGRESS',
        totalHours: 80,
      }
    });
  }

  await prisma.documentTemplate.create({
    data: {
      name: 'Certificado de Prácticas Oficial',
      type: 'PDF',
      content: {
        width: 1123,
        height: 794,
        background: null,
        elements: [
          {
            type: 'text',
            content: 'LA FACULTAD DE CIENCIAS INFORMÁTICAS',
            x: 0,
            y: 180,
            fontSize: 22,
            fontFamily: 'Arial',
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            width: 1123
          },
          {
            type: 'text',
            content: 'CONFIERE EL PRESENTE CERTIFICADO A:',
            x: 0,
            y: 230,
            fontSize: 16,
            fontFamily: 'Arial',
            fontWeight: 'normal',
            textAlign: 'center',
            color: '#444444',
            width: 1123
          },
          {
            type: 'text',
            content: '{{studentName}}',
            x: 0,
            y: 280,
            fontSize: 32,
            fontFamily: 'Georgia',
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            width: 1123
          },
          {
            type: 'text',
            content: 'Por haber culminado satisfactoriamente las <b>{{totalHours}} horas</b> de Prácticas Preprofesionales correspondiente a "<b>{{practiceLevel}} ({{academicLevel}})</b>", realizadas en la empresa <b>{{companyName}}</b> y supervisadas por el tutor empresarial/académico <b>{{tutorName}}</b>, en el periodo académico <b>{{academicPeriod}}</b>.\n\nEste certificado se expide en honor a su destacado desempeño, responsabilidad y compromiso.',
            x: 120,
            y: 380,
            fontSize: 18,
            fontFamily: 'Arial',
            fontWeight: 'normal',
            textAlign: 'justify',
            color: '#333333',
            width: 883
          },
          {
            type: 'text',
            content: 'Manta, {{currentDate}}',
            x: 120,
            y: 520,
            fontSize: 16,
            fontFamily: 'Arial',
            fontWeight: 'normal',
            textAlign: 'left',
            color: '#000000',
            width: 883
          },
          {
            type: 'text',
            content: '___________________________________\n[Nombre de la Decana]\nDECANA DE LA FACULTAD',
            x: 200,
            y: 650,
            fontSize: 14,
            fontFamily: 'Arial',
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            width: 300
          },
          {
            type: 'text',
            content: '___________________________________\n[Nombre de Responsable]\nRESPONSABLE DE PRÁCTICAS',
            x: 623,
            y: 650,
            fontSize: 14,
            fontFamily: 'Arial',
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            width: 300
          }
        ]
      },
      facultyId: faculty.id
    }
  });

  console.log('✅ Datos de prueba, facultades, estudiantes y plantillas creados exitosamente!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
