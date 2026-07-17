import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const docId = 52;
  
  // Usar queryRaw para contar los embeddings no nulos
  const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint as count
    FROM "Chunk"
    WHERE "documentId" = ${docId}
      AND "embedding" IS NOT NULL
  `;
  const count = Number(countRows[0].count);

  const total = await prisma.chunk.count({
    where: { documentId: docId }
  });

  console.log(`📊 Chunks con embedding en DB para doc 52: ${count} de ${total}`);
  
  const doc = await prisma.document.findUnique({
    where: { id: docId }
  });
  console.log(`Status del doc: ${doc?.status}`);
  console.log(`Progreso Embed: ${doc?.progressEmbed}%`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
