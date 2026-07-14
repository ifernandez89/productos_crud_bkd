import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateEmbeddings() {
  console.log('Migrando embeddings de Chunk...');

  try {
    const chunks = await prisma.chunk.findMany({
      where: { embeddingId: { not: null } },
      select: { id: true, embeddingId: true },
    });

    console.log(`Total chunks con embeddingId: ${chunks.length}`);
    let migrated = 0;
    let failed = 0;

    for (const chunk of chunks) {
      try {
        const vec = JSON.parse(chunk.embeddingId!);
        if (!Array.isArray(vec) || vec.length !== 768) {
          console.warn(`Chunk ${chunk.id}: embedding inválido (dims: ${vec?.length})`);
          failed++;
          continue;
        }

        // Insertar usando $queryRaw porque Prisma no soporta vector nativo
        await prisma.$queryRaw`
          UPDATE "Chunk"
          SET "embedding" = ${vec}::vector
          WHERE "id" = ${chunk.id}
        `;

        migrated++;
        if (migrated % 100 === 0) console.log(`  ${migrated}/${chunks.length}...`);
      } catch (err: any) {
        console.warn(`Chunk ${chunk.id}: error - ${err.message}`);
        failed++;
      }
    }

    console.log(`✅ Chunks migrados: ${migrated}, fallidos: ${failed}`);

    // Repetir para MemoryChunk
    console.log('\nMigrando embeddings de MemoryChunk...');
    const memChunks = await prisma.memoryChunk.findMany({
      where: { embeddingId: { not: null } },
      select: { id: true, embeddingId: true },
    });

    let migratedMem = 0;
    for (const mc of memChunks) {
      try {
        const vec = JSON.parse(mc.embeddingId!);
        if (Array.isArray(vec) && vec.length === 768) {
          await prisma.$queryRaw`
            UPDATE "MemoryChunk"
            SET "embedding" = ${vec}::vector
            WHERE "id" = ${mc.id}
          `;
          migratedMem++;
        }
      } catch { /* skip */ }
    }

    console.log(`✅ MemoryChunks migrados: ${migratedMem}`);
  } catch (err: any) {
    console.error(`Error durante la migración: ${err.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

migrateEmbeddings();
