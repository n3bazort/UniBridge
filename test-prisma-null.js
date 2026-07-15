const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Testing with { facultyId: null }...');
  try {
    await prisma.practice.groupBy({
      by: ['companyId'],
      _count: { studentId: true },
      where: { facultyId: null },
      orderBy: { _count: { studentId: 'desc' } },
      take: 5,
    });
    console.log('Success with { facultyId: null }');
  } catch(e) { console.error('Error with null:', e.message); }
}

main().finally(() => prisma.$disconnect());
