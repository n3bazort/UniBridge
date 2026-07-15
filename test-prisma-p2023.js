const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Testing groupBy companyId...');
  try {
    await prisma.practice.groupBy({
      by: ['companyId'],
      _count: { studentId: true },
      orderBy: { _count: { studentId: 'desc' } },
      take: 5,
    });
    console.log('groupBy companyId ok');
  } catch(e) { console.error('Error 1:', e.message); }

  console.log('Testing aggregate totalHours...');
  try {
    await prisma.practice.aggregate({
      _sum: { totalHours: true },
    });
    console.log('aggregate totalHours ok');
  } catch(e) { console.error('Error 2:', e.message); }

  console.log('Testing groupBy studentId...');
  try {
    await prisma.practice.groupBy({
      by: ['studentId'],
      where: { status: 'IN_PROGRESS' },
    });
    console.log('groupBy studentId ok');
  } catch(e) { console.error('Error 3:', e.message); }
  
  console.log('Testing groupBy status...');
  try {
    await prisma.practice.groupBy({
      by: ['status'],
      _count: { studentId: true },
    });
    console.log('groupBy status ok');
  } catch(e) { console.error('Error 4:', e.message); }
  
  console.log('Testing groupBy academicPeriod...');
  try {
    await prisma.practice.groupBy({
      by: ['academicPeriod'],
      _count: { studentId: true },
    });
    console.log('groupBy academicPeriod ok');
  } catch(e) { console.error('Error 5:', e.message); }
}

main().finally(() => prisma.$disconnect());
