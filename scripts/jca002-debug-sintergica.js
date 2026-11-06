const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.staging' });
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const doc57 = await prisma.document.findUnique({ where: { id: 57 } });
  console.log('Doc 57:', doc57);

  const query = 'la teoria sintergica';
  const normalizedQuery = query.toLowerCase().replace(/[-_]+/g, ' ').trim();
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length >= 3);
  console.log('Terms:', terms);

  const sensitive = await prisma.document.findMany({
    where: {
      OR: terms.map(t => ({ title: { contains: t } }))
    }
  });
  console.log('Sensitive matches:', sensitive.map(d => d.title));

  const insensitive = await prisma.document.findMany({
    where: {
      OR: terms.map(t => ({ title: { contains: t, mode: 'insensitive' } }))
    }
  });
  console.log('Insensitive matches:', insensitive.map(d => d.title));

  await prisma.$disconnect();
}
main();

