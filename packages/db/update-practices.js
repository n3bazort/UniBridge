const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Starting data update...");

  // 1. Ensure Faculty "Ciencias de la Vida y Tecnología" exists
  let faculty = await prisma.faculty.findFirst({
    where: { name: 'Ciencias de la Vida y Tecnología' }
  });
  if (!faculty) {
    faculty = await prisma.faculty.create({
      data: { name: 'Ciencias de la Vida y Tecnología', description: 'FCVT' }
    });
    console.log("Created faculty:", faculty.name);
  }

  // 2. Ensure Program "Tecnologías de la Información" exists
  let program = await prisma.program.findFirst({
    where: { name: 'Tecnologías de la Información' }
  });
  if (!program) {
    program = await prisma.program.create({
      data: { name: 'Tecnologías de la Información', facultyId: faculty.id }
    });
    console.log("Created program:", program.name);
  }

  // Update all students to be in this faculty and program (as requested "todos estos estudiantes")
  await prisma.student.updateMany({
    data: {
      facultyId: faculty.id,
      programId: program.id
    }
  });
  console.log("Updated all students to FCVT and TI");

  // 3. Update 'zgames' students to '2025-2'
  const zgamesCompanies = await prisma.company.findMany({
    where: { name: { contains: 'zgames', mode: 'insensitive' } }
  });
  
  if (zgamesCompanies.length > 0) {
    const zgamesIds = zgamesCompanies.map(c => c.id);
    const updated = await prisma.practice.updateMany({
      where: { companyId: { in: zgamesIds } },
      data: { academicPeriod: '2025-2' }
    });
    console.log(`Updated ${updated.count} practices in zgames to 2025-2`);
  }

  // 4. Auto-calculate statuses
  const practices = await prisma.practice.findMany({
    include: { company: true }
  });

  let pendingCount = 0;
  let completedCount = 0;

  for (const p of practices) {
    let newStatus = p.status;
    
    // Check missing fields
    const isMissingData = !p.company.contactName || !p.tutorName || !p.academicLevel || !p.practiceLevel;
    
    if (isMissingData) {
      newStatus = 'PENDING';
      pendingCount++;
    } else {
      newStatus = 'COMPLETED';
      completedCount++;
    }
    
    // Keep DELAYED if already delayed? We just created the enum. Let's leave them pending/completed.
    
    await prisma.practice.update({
      where: { id: p.id },
      data: { status: newStatus }
    });
  }
  
  console.log(`Finished updating statuses: ${pendingCount} PENDING, ${completedCount} COMPLETED`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
