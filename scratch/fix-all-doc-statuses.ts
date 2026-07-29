import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Asegurando que TODOS los documentos con chunks en BD estén en estado READY...');
  const docs = await prisma.document.findMany({
    include: {
      _count: { select: { chunks: true } }
    }
  });

  for (const doc of docs) {
    if (doc._count.chunks > 0 && doc.status !== 'ready') {
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: 'ready' }
      });
      console.log(`✅ Doc ID ${doc.id} ("${doc.title}") actualizado a status: ready (${doc._count.chunks} chunks).`);
    } else {
      console.log(`ℹ️ Doc ID ${doc.id} ("${doc.title}") status actual: ${doc.status} (${doc._count.chunks} chunks).`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
