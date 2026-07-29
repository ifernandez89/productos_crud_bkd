import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Cambiando estado de Obras Completas (ID 10) a READY en BD...');
  const doc = await prisma.document.update({
    where: { id: 10 },
    data: { status: 'ready' }
  });
  console.log(`✅ Estado actualizado a: ${doc.status}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
