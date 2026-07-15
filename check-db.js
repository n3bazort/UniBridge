const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const practices = await prisma.practice.count();
  const students = await prisma.student.count();
  console.log(`Practices: ${practices}, Students: ${students}`);
}
main().finally(() => prisma.$disconnect());
