const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { firstName: { contains: 'test', mode: 'insensitive' } },
          { lastName: { contains: 'test', mode: 'insensitive' } }
        ]
      },
      select: { id: true }
    });
    
    const ids = students.map(s => s.id);
    
    if (ids.length > 0) {
      await prisma.generatedDocument.deleteMany({ where: { studentId: { in: ids } } });
      await prisma.practice.deleteMany({ where: { studentId: { in: ids } } });
      const res = await prisma.student.deleteMany({ where: { id: { in: ids } } });
      console.log('Deleted students:', res.count);
    } else {
      console.log('No test students found.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
