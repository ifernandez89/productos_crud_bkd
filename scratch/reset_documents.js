const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting reset of all processed books...');
  
  // Use a transaction to ensure all database operations succeed or fail together
  await prisma.$transaction(async (tx) => {
    // 1. Delete all chunks
    const chunkDelete = await tx.chunk.deleteMany();
    console.log(`Deleted ${chunkDelete.count} chunks.`);

    // 2. Delete all chapters (will cascade delete all sections)
    const chapterDelete = await tx.chapter.deleteMany();
    console.log(`Deleted ${chapterDelete.count} chapters.`);

    // 3. Reset all documents to 'not_indexed' status with cleared summaries and progress
    const docUpdate = await tx.document.updateMany({
      data: {
        summary: null,
        status: 'not_indexed',
        progressIndex: 0.0,
        progressEmbed: 0.0,
        progressSummary: 0.0,
        timesUsed: 0,
        lastUsed: null,
      },
    });
    console.log(`Reset status and summaries for ${docUpdate.count} documents.`);
  });

  console.log('Reset complete successfully.');
}

main()
  .catch((e) => {
    console.error('Error resetting documents:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
