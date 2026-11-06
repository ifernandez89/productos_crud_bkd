const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.staging' });

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const docs = await prisma.document.findMany({ select: { id: true, title: true } });
  console.log(`Staging documents (${docs.length}):`);
  docs.forEach(d => console.log(` - "${d.title}" (id: ${d.id})`));
  const chunkCount = await prisma.chunk.count();
  console.log(`Total chunks in staging: ${chunkCount}`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

