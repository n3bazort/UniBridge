const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const data = await prisma.practice.findMany({
      skip: 0,
      take: 1155,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { 
          include: {
            user: { select: { email: true } },
            program: { select: { name: true } }
          }
        },
        company: true
      }
    });
    console.log('Success, rows:', data.length);
  } catch (e) {
    console.error('Error in findAll:', e);
  }
}

main().finally(() => prisma.$disconnect());
