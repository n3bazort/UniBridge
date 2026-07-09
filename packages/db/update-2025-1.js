const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Starting data update for 2025-1...");

  // Get all practices that are NOT 2025-2
  const practicesToUpdate = await prisma.practice.findMany({
    where: { 
      academicPeriod: { not: '2025-2' }
    },
    take: 30 // update about 30 practices to 2025-1
  });

  if (practicesToUpdate.length > 0) {
    const ids = practicesToUpdate.map(p => p.id);
    const updated = await prisma.practice.updateMany({
      where: { id: { in: ids } },
      data: { academicPeriod: '2025-1' }
    });
    console.log(`Updated ${updated.count} practices to 2025-1`);
  } else {
    console.log("No practices found to update.");
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
