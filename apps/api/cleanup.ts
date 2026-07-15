import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
  console.log('Buscando documentos generados...');
  const docs = await prisma.generatedDocument.findMany({
    orderBy: { createdAt: 'desc' }
  });

  const map = new Map<string, string>(); // Key: studentId_templateId -> Value: id of the latest doc
  const idsToDelete: string[] = [];

  for (const doc of docs) {
    const key = `${doc.studentId}_${doc.templateId}`;
    if (map.has(key)) {
      idsToDelete.push(doc.id);
    } else {
      map.set(key, doc.id);
    }
  }

  console.log(`Se encontraron ${docs.length} documentos totales.`);
  console.log(`Se mantendrán ${map.size} documentos más recientes.`);
  console.log(`Se eliminarán ${idsToDelete.length} documentos duplicados antiguos.`);

  if (idsToDelete.length > 0) {
    await prisma.generatedDocument.deleteMany({
      where: { id: { in: idsToDelete } }
    });
    console.log('Documentos duplicados eliminados exitosamente.');
  } else {
    console.log('No hay duplicados para eliminar.');
  }
}

cleanup()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
