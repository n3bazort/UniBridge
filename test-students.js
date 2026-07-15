const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const data = await prisma.student.findMany({
      skip: 0, take: 10,
      include: {
        user: { select: { email: true } },
        program: { select: { name: true } },
        faculty: { select: { name: true } }
      }
    });
    console.log('Success, rows:', data.length);
  } catch (e) {
    console.error('Error in students findAll:', e);
  }
}

main().finally(() => prisma.$disconnect());
