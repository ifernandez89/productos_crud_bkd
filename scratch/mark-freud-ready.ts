import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Marcando Obras Completas (ID=52) como READY...');
  
  const result = await prisma.document.update({
    where: { id: 52 },
    data: { status: 'ready' }
  });

  console.log(`✅ Completado. Status anterior: indexing, Status nuevo: ${result.status}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
