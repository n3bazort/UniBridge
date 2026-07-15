const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const defaultCode = '2024-1';
  const existing = await prisma.academicPeriod.findUnique({
    where: { code: defaultCode }
  });

  if (!existing) {
    await prisma.academicPeriod.create({
      data: {
        code: defaultCode,
        name: 'Periodo 2024-1 (Default)',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-06-30'),
        isActive: true,
      }
    });
    console.log(`Created default AcademicPeriod: ${defaultCode}`);
  } else {
    console.log(`AcademicPeriod ${defaultCode} already exists.`);
  }

  // Find other periods in practices and create them if missing
  const practices = await prisma.practice.findMany({
    select: { academicPeriod: true },
    distinct: ['academicPeriod']
  });

  for (const p of practices) {
    if (p.academicPeriod !== defaultCode) {
      const pExisting = await prisma.academicPeriod.findUnique({
        where: { code: p.academicPeriod }
      });
      if (!pExisting) {
        await prisma.academicPeriod.create({
          data: {
            code: p.academicPeriod,
            name: `Periodo ${p.academicPeriod} (Auto-generado)`,
            startDate: new Date(),
            endDate: new Date(),
            isActive: false,
          }
        });
        console.log(`Created auto-generated AcademicPeriod: ${p.academicPeriod}`);
      }
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
