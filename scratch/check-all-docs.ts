import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAll() {
  console.log('=== DOCUMENTOS EN LA BASE DE DATOS ===');
  const docs = await prisma.document.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          chunks: true,
          chapters: true,
        }
      }
    },
    orderBy: { id: 'asc' }
  });

  for (const doc of docs) {
    console.log(`Doc ID: ${doc.id} | Status: ${doc.status} | Title: "${doc.title}" | Chunks: ${doc._count.chunks} | Capítulos: ${doc._count.chapters} | Updated: ${doc.updatedAt.toISOString()}`);
  }
}

checkAll()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
