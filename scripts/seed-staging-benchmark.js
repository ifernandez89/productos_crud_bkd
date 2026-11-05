const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const envContent = fs.readFileSync('.env.staging', 'utf8');
const lines = envContent.split(/\r?\n/);
let stagingUrl = '';
for (const line of lines) {
  if (line.startsWith('DATABASE_URL=')) {
    stagingUrl = line.substring('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
    break;
  }
}

if (!stagingUrl.includes('jarbees_stage')) {
  console.error('ABORT: Target is not jarbees_stage');
  process.exit(1);
}

const pProd = new PrismaClient(); // reads .env (jarbees_data)
const pStage = new PrismaClient({ datasources: { db: { url: stagingUrl } } });

async function seed() {
  console.log('[seed-staging] Starting benchmark corpus seeding to jarbees_stage...');
  const targetDocIds = [15, 123, 246];

  for (const docId of targetDocIds) {
    const doc = await pProd.document.findUnique({ where: { id: docId } });
    if (!doc) {
      console.warn(`Doc ${docId} not found in prod, skipping`);
      continue;
    }

    const existingInStage = await pStage.document.findUnique({ where: { id: docId } });
    if (!existingInStage) {
      await pStage.document.create({
        data: {
          id: doc.id,
          sourceId: doc.sourceId,
          title: doc.title,
          content: doc.content,
          category: doc.category,
          source: doc.source,
          status: doc.status,
          timesUsed: doc.timesUsed,
          lastUsed: doc.lastUsed,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        },
      });
      console.log(`[seed-staging] Created Document ${doc.id}: "${doc.title}"`);
    }

    const chunks = await pProd.chunk.findMany({ where: { documentId: docId } });
    console.log(`[seed-staging] Copying ${chunks.length} chunks for doc ${docId}...`);
    
    // Batch insert chunks
    const stageChunks = await pStage.chunk.findMany({ where: { documentId: docId }, select: { id: true } });
    const existingChunkIds = new Set(stageChunks.map(c => c.id));
    const newChunks = chunks.filter(c => !existingChunkIds.has(c.id));

    if (newChunks.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < newChunks.length; i += 100) {
        const batch = newChunks.slice(i, i + 100).map(c => ({
          id: c.id,
          documentId: c.documentId,
          sectionId: c.sectionId,
          content: c.content,
          embeddingId: c.embeddingId,
          metadata: c.metadata,
          revocationStatus: c.revocationStatus,
          revokedAt: c.revokedAt,
        }));
        await pStage.chunk.createMany({ data: batch, skipDuplicates: true });
      }
      console.log(`[seed-staging] Successfully seeded ${newChunks.length} chunks for Doc ${docId}`);
    }
  }

  const finalDocCount = await pStage.document.count();
  const finalChunkCount = await pStage.chunk.count();
  console.log(`[seed-staging] COMPLETE. jarbees_stage has ${finalDocCount} docs and ${finalChunkCount} chunks.`);

  await pProd.$disconnect();
  await pStage.$disconnect();
}

seed().catch(err => {
  console.error('[seed-staging] ERROR:', err);
  process.exit(1);
});
