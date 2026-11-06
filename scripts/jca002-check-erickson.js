const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.staging' });

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const muldoonDoc = await prisma.document.findUnique({
    where: { id: 15 },
    select: { id: true, title: true }
  });
  console.log('Doc 15:', muldoonDoc);

  const ericksonChunks = await prisma.chunk.count({
    where: { content: { contains: 'Erickson', mode: 'insensitive' } }
  });
  console.log(`Chunks containing 'Erickson': ${ericksonChunks}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

