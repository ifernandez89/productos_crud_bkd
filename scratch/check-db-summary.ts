import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const doc = await prisma.document.findFirst({
    where: {
      title: {
        contains: 'Obras Completas'
      }
    }
  });

  if (!doc) {
    console.log('Doc not found');
  } else {
    console.log(`Doc ID: ${doc.id}`);
    console.log(`Title: ${doc.title}`);
    console.log(`Status: ${doc.status}`);
    console.log(`Summary length: ${doc.summary?.length}`);
    console.log(`Summary snippet:`);
    console.log(doc.summary?.slice(0, 400));
  }

  await prisma.$disconnect();
}

main();
