const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting data deletion...');
  
  await prisma.signatureBatchItem.deleteMany({});
  console.log('Deleted SignatureBatchItems');

  await prisma.signatureBatch.deleteMany({});
  console.log('Deleted SignatureBatches');

  await prisma.generatedDocument.deleteMany({});
  console.log('Deleted GeneratedDocuments');
  
  await prisma.practice.deleteMany({});
  console.log('Deleted Practices');
  
  await prisma.student.deleteMany({});
  console.log('Deleted Students');
  
  await prisma.user.deleteMany({
    where: {
      role: 'STUDENT'
    }
  });
  console.log('Deleted Student Users');
  
  await prisma.company.deleteMany({});
  console.log('Deleted Companies');

  console.log('Data cleared successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
