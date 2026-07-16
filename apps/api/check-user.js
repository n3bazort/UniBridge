const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const u = await prisma.user.findUnique({where:{email:'prueba.firmante@uleam.edu.ec'}});
  console.log('User exists:', !!u);
  await prisma.$disconnect();
})();
