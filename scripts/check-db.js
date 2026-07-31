const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const practicePeriods = await prisma.practice.groupBy({
    by: ['academicPeriod'],
    _count: true,
  });
  console.log('=== PRACTICE PERIODS ===');
  console.log(practicePeriods);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
