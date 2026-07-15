const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const students = await prisma.student.findMany({ where: { phone: null } });
  console.log(`Found ${students.length} students without phone`);

  for (const student of students) {
    const phone = '09' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    await prisma.student.update({
      where: { id: student.id },
      data: { phone }
    });
  }

  console.log(`Updated ${students.length} students with random phone numbers`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
