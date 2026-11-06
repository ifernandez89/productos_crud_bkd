const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.staging' });

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const chunks = await prisma.chunk.findMany({
    where: { content: { contains: 'Erickson', mode: 'insensitive' } },
    select: { id: true, documentId: true, content: true },
    take: 5
  });
  for (const c of chunks) {
    const doc = await prisma.document.findUnique({ where: { id: c.documentId }, select: { title: true } });
    console.log(`Chunk ${c.id} from Doc "${doc ? doc.title : 'unknown'}"`);
    console.log(c.content.slice(0, 150) + '...\n');
  }
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });

