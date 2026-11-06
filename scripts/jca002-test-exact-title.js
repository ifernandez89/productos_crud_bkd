const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env' });
const prismaProd = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
require('dotenv').config({ path: '.env.staging', override: true });
const prismaStage = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const prodDoc = await prismaProd.document.findFirst({ where: { title: { contains: 'sintergica', mode: 'insensitive' } } });
  console.log('Production doc:', prodDoc ? `${prodDoc.id} "${prodDoc.title}"` : 'NONE');

  const stageDoc = await prismaStage.document.findFirst({ where: { title: { contains: 'sintergica', mode: 'insensitive' } } });
  console.log('Staging doc:', stageDoc ? `${stageDoc.id} "${stageDoc.title}"` : 'NONE');

  await prismaProd.$disconnect();
  await prismaStage.$disconnect();
}
main();
