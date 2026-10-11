const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector extension enabled successfully!');
    await prisma.$executeRawUnsafe('ALTER TABLE "Chunk" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);');
    console.log('✅ Column Chunk.embedding added successfully!');
  } catch (err) {
    console.error('❌ Could not enable pgvector extension:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
