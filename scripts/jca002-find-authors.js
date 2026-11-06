const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.staging' });

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const docs = await prisma.document.findMany({
    where: {
      OR: [
        { title: { contains: 'Erickson', mode: 'insensitive' } },
        { title: { contains: 'Milton', mode: 'insensitive' } },
        { title: { contains: 'Muldoon', mode: 'insensitive' } },
        { title: { contains: 'Zweig', mode: 'insensitive' } },
        { title: { contains: 'Judge', mode: 'insensitive' } }
      ]
    },
    select: { id: true, title: true }
  });
  console.log('Matching documents in staging:', docs);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

