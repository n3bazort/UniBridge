import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Cargar variables de entorno desde packages/db
dotenv.config({ path: path.resolve(__dirname, '../../packages/db/.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando el sembrado de la BD...');

  // Ensure uploads/images directory exists
  const imagesDir = path.resolve(__dirname, 'uploads/images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // Copy template image
  const sourceImage = path.resolve(__dirname, '../../apps/web/public/templates/Certificado Real.png');
  const targetImageName = 'bg-certificado-real.png';
  const targetImage = path.resolve(imagesDir, targetImageName);
  if (fs.existsSync(sourceImage)) {
    fs.copyFileSync(sourceImage, targetImage);
    console.log('✅ Imagen de fondo de certificado copiada a uploads/images');
  }

  // ─── Limpieza (hijos → padres para respetar llaves foráneas) ───
  const wipe = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* tabla vacía o inexistente */ } };
  await wipe(() => prisma.signatureBatchItem.deleteMany({}));
  await wipe(() => prisma.signatureBatch.deleteMany({}));
  await wipe(() => prisma.generationBatch.deleteMany({}));
  await wipe(() => prisma.excelImport.deleteMany({}));
  await wipe(() => prisma.auditLog.deleteMany({}));
  await wipe(() => prisma.generatedDocument.deleteMany({}));
  await wipe(() => prisma.documentSequence.deleteMany({}));
  await wipe(() => prisma.documentTemplate.deleteMany({}));
  await wipe(() => prisma.practice.deleteMany({}));
  await wipe(() => (prisma as any).userInvitation?.deleteMany({}));
  await wipe(() => prisma.signerProfile.deleteMany({}));
  await wipe(() => prisma.student.deleteMany({}));
  await wipe(() => prisma.program.deleteMany({}));
  await wipe(() => prisma.coordinator.deleteMany({}));
  await wipe(() => prisma.company.deleteMany({}));
  await wipe(() => prisma.academicPeriod.deleteMany({}));
  await wipe(() => prisma.faculty.deleteMany({}));
  await wipe(() => prisma.refreshToken.deleteMany({}));
  await wipe(() => prisma.user.deleteMany({}));

  const pass = await bcrypt.hash('@adminadmin007', 10);

  // ─── Facultad, programas y período académico ───
  const faculty = await prisma.faculty.create({
    data: { name: 'Facultad de Ciencias Informáticas', description: 'FCI - ULEAM' },
  });

  const progTI = await prisma.program.create({
    data: { name: 'Ingeniería en Tecnologías de la Información', facultyId: faculty.id },
  });
  const progSW = await prisma.program.create({
    data: { name: 'Ingeniería de Software', facultyId: faculty.id },
  });

  await prisma.academicPeriod.create({
    data: {
      code: '2024-1',
      name: 'Período Académico 2024 (1)',
      startDate: new Date('2024-05-01'),
      endDate: new Date('2024-09-30'),
      isActive: true,
      deanName: 'Ing. Jorge Luis Palma Macías, PhD',
      directorName: 'Ing. Gina Alexandra Zambrano Loor, Mg.',
    },
  });

  // ─── ADMINISTRADOR (persona real) ───
  const admin = await prisma.user.create({
    data: {
      email: 'j.bazurto@uleam.edu.ec',
      password: pass,
      role: 'ADMIN',
      firstName: 'Josué David',
      lastName: 'Bazurto Zambrano',
    },
  });
  console.log(`✅ Admin: ${admin.firstName} ${admin.lastName} <${admin.email}>`);

  // ─── COORDINADORA (persona real) + vínculo con la facultad ───
  const coordUser = await prisma.user.create({
    data: {
      email: 'm.cedeno@uleam.edu.ec',
      password: pass,
      role: 'COORDINATOR',
      firstName: 'María Fernanda',
      lastName: 'Cedeño Vélez',
    },
  });
  await prisma.coordinator.create({ data: { userId: coordUser.id, facultyId: faculty.id } });
  console.log(`✅ Coordinadora: ${coordUser.firstName} ${coordUser.lastName} <${coordUser.email}>`);

  // ─── FIRMANTES (autoridades) ───
  await prisma.user.create({
    data: {
      email: 'j.palma@uleam.edu.ec',
      password: pass,
      role: 'SIGNER',
      firstName: 'Jorge Luis',
      lastName: 'Palma Macías',
      signerProfile: {
        create: {
          signerRole: 'DEAN',
          fullName: 'Ing. Jorge Luis Palma Macías, PhD',
          title: 'Decano de la Facultad de Ciencias Informáticas',
        },
      },
    },
  });
  await prisma.user.create({
    data: {
      email: 'g.zambrano@uleam.edu.ec',
      password: pass,
      role: 'SIGNER',
      firstName: 'Gina Alexandra',
      lastName: 'Zambrano Loor',
      signerProfile: {
        create: {
          signerRole: 'DIRECTOR',
          fullName: 'Ing. Gina Alexandra Zambrano Loor, Mg.',
          title: 'Responsable de Prácticas Preprofesionales',
        },
      },
    },
  });
  console.log('✅ Firmantes: Decano (Palma) y Responsable de Prácticas (Zambrano)');

  // ─── Empresas / instituciones receptoras ───
  const companies = await Promise.all([
    prisma.company.create({ data: { name: 'Corporación Tecnológica del Pacífico S.A.', address: 'Av. 4 de Noviembre, Manta', contactName: 'Ing. Ricardo Andrade Moreira', email: 'talento@ctpacifico.ec', phone: '05-262-1010', recipientName: 'Ing. Ricardo Andrade Moreira' } }),
    prisma.company.create({ data: { name: 'GAD Municipal del Cantón Manta', address: 'Malecón Escénico, Manta', contactName: 'Lcda. Patricia Solórzano Cedeño', email: 'sistemas@manta.gob.ec', phone: '05-262-0500', recipientName: 'Lcda. Patricia Solórzano Cedeño' } }),
    prisma.company.create({ data: { name: 'Sistemas y Redes Delgado Cía. Ltda.', address: 'Av. Universitaria, Portoviejo', contactName: 'Ing. Byron Delgado Loor', email: 'contacto@srdelgado.ec', phone: '05-263-3200', recipientName: 'Ing. Byron Delgado Loor' } }),
  ]);
  console.log(`✅ ${companies.length} empresas creadas`);

  // ─── Estudiantes (personas reales) ───
  type S = { email: string; first: string; last: string; dni: string; phone: string; prog: string };
  const students: S[] = [
    { email: 'a.mendoza@uleam.edu.ec',  first: 'Anthony Steeven', last: 'Mendoza Chávez',  dni: '1315678901', phone: '0985123456', prog: progTI.id },
    { email: 'd.cedeno@uleam.edu.ec',   first: 'Doménica Nicole', last: 'Cedeño Bravo',    dni: '1316789012', phone: '0986234567', prog: progTI.id },
    { email: 'k.loor@uleam.edu.ec',     first: 'Kevin Alexander', last: 'Loor Zambrano',   dni: '1317890123', phone: '0987345678', prog: progSW.id },
    { email: 'g.palma@estu.uleam.edu.ec', first: 'Génesis Anahí', last: 'Palma Moreira',   dni: '1318901234', phone: '0988456789', prog: progTI.id },
    { email: 'b.vera@uleam.edu.ec',     first: 'Bryan Josué',     last: 'Vera Delgado',     dni: '1319012345', phone: '0989567890', prog: progSW.id },
    { email: 'm.intriago@uleam.edu.ec', first: 'Melany Dayana',   last: 'Intriago Macías',  dni: '1320123456', phone: '0981678901', prog: progTI.id },
  ];

  const studentRecords: { id: string; first: string; last: string }[] = [];
  for (const s of students) {
    const u = await prisma.user.create({
      data: {
        email: s.email,
        password: pass,
        role: 'STUDENT',
        firstName: s.first,
        lastName: s.last,
        studentProfile: {
          create: {
            dni: s.dni,
            firstName: s.first,
            lastName: s.last,
            phone: s.phone,
            facultyId: faculty.id,
            programId: s.prog,
          },
        },
      },
      include: { studentProfile: true },
    });
    if (u.studentProfile) studentRecords.push({ id: u.studentProfile.id, first: s.first, last: s.last });
  }
  console.log(`✅ ${studentRecords.length} estudiantes creados (login principal: a.mendoza@uleam.edu.ec)`);

  // ─── Prácticas con estados variados (para poblar tableros y reportes) ───
  const plan = [
    { si: 0, ci: 0, status: 'IN_PROGRESS' as const, hours: 120, tutor: 'Ing. Ricardo Andrade Moreira',  level: 'Prácticas Preprofesionales II', acad: 'Séptimo Nivel' },
    { si: 1, ci: 1, status: 'COMPLETED' as const,   hours: 240, tutor: 'Lcda. Patricia Solórzano Cedeño', level: 'Prácticas Preprofesionales II', acad: 'Octavo Nivel' },
    { si: 2, ci: 2, status: 'IN_PROGRESS' as const, hours: 96,  tutor: 'Ing. Byron Delgado Loor',        level: 'Prácticas Preprofesionales I',  acad: 'Sexto Nivel' },
    { si: 3, ci: 0, status: 'PENDING' as const,     hours: 0,   tutor: 'Ing. Ricardo Andrade Moreira',  level: 'Prácticas Preprofesionales I',  acad: 'Sexto Nivel' },
    { si: 4, ci: 1, status: 'COMPLETED' as const,   hours: 200, tutor: 'Lcda. Patricia Solórzano Cedeño', level: 'Prácticas Preprofesionales II', acad: 'Octavo Nivel' },
    { si: 5, ci: 2, status: 'DELAYED' as const,     hours: 60,  tutor: 'Ing. Byron Delgado Loor',        level: 'Prácticas Preprofesionales I',  acad: 'Séptimo Nivel' },
  ];
  for (const p of plan) {
    await prisma.practice.create({
      data: {
        studentId: studentRecords[p.si].id,
        companyId: companies[p.ci].id,
        facultyId: faculty.id,
        academicPeriod: '2024-1',
        status: p.status,
        totalHours: p.hours,
        tutorName: p.tutor,
        practiceLevel: p.level,
        academicLevel: p.acad,
        startDate: new Date('2024-05-06'),
        endDate: p.status === 'COMPLETED' ? new Date('2024-08-30') : null,
      },
    });
  }
  console.log(`✅ ${plan.length} prácticas creadas (estados variados)`);

  // ─── Plantilla oficial de certificado (editor visual → Puppeteer) ───
  await prisma.documentTemplate.create({
    data: {
      name: 'Certificado de Prácticas Oficial',
      type: 'PDF',
      content: {
        width: 1123,
        height: 794,
        background: '/uploads/images/bg-certificado-real.png',
        elements: [
          { type: 'text', content: 'LA FACULTAD DE CIENCIAS INFORMÁTICAS', x: 0, y: 180, fontSize: 22, fontFamily: 'Arial', fontWeight: 'bold', textAlign: 'center', color: '#000000', width: 1123 },
          { type: 'text', content: 'CONFIERE EL PRESENTE CERTIFICADO A:', x: 0, y: 230, fontSize: 16, fontFamily: 'Arial', fontWeight: 'normal', textAlign: 'center', color: '#444444', width: 1123 },
          { type: 'text', content: '{{studentName}}', x: 0, y: 280, fontSize: 32, fontFamily: 'Georgia', fontWeight: 'bold', textAlign: 'center', color: '#000000', width: 1123 },
          { type: 'text', content: 'Por haber culminado satisfactoriamente las <b>{{totalHours}} horas</b> de Prácticas Preprofesionales correspondiente a "<b>{{practiceLevel}} ({{academicLevel}})</b>", realizadas en la empresa <b>{{companyName}}</b> y supervisadas por el tutor empresarial/académico <b>{{tutorName}}</b>, en el periodo académico <b>{{academicPeriod}}</b>.\n\nEste certificado se expide en honor a su destacado desempeño, responsabilidad y compromiso.', x: 120, y: 380, fontSize: 18, fontFamily: 'Arial', fontWeight: 'normal', textAlign: 'justify', color: '#333333', width: 883 },
          { type: 'text', content: 'Manta, {{currentDate}}', x: 120, y: 520, fontSize: 16, fontFamily: 'Arial', fontWeight: 'normal', textAlign: 'left', color: '#000000', width: 883 },
          { type: 'text', content: '___________________________________\nIng. Jorge Luis Palma Macías, PhD\nDECANO DE LA FACULTAD', x: 200, y: 650, fontSize: 14, fontFamily: 'Arial', fontWeight: 'bold', textAlign: 'center', color: '#000000', width: 300 },
          { type: 'text', content: '___________________________________\nIng. Gina Alexandra Zambrano Loor, Mg.\nRESPONSABLE DE PRÁCTICAS', x: 623, y: 650, fontSize: 14, fontFamily: 'Arial', fontWeight: 'bold', textAlign: 'center', color: '#000000', width: 300 },
        ],
      },
      facultyId: faculty.id,
    },
  });

  console.log('✅ Sembrado completo: facultad, programas, período, usuarios, empresas, estudiantes, prácticas y plantilla.');
  console.log('\n──────── CREDENCIALES (contraseña: @adminadmin007) ────────');
  console.log('  Administrador : j.bazurto@uleam.edu.ec');
  console.log('  Coordinadora  : m.cedeno@uleam.edu.ec');
  console.log('  Decano        : j.palma@uleam.edu.ec');
  console.log('  Responsable   : g.zambrano@uleam.edu.ec');
  console.log('  Estudiante    : a.mendoza@uleam.edu.ec');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
