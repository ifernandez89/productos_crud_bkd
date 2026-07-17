import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const doc = await prisma.document.findFirst({
      where: { title: 'Test de Ingesta Jerárquica de Astronomía' },
      include: {
        chapters: true,
      },
    });

    console.log('--- DOCUMENT STATUS ---');
    if (!doc) {
      console.log('Document not found!');
      return;
    }
    console.log(`ID: ${doc.id}`);
    console.log(`Title: ${doc.title}`);
    console.log(`Status: ${doc.status}`);
    console.log(`Progress Index: ${doc.progressIndex}`);
    console.log(`Progress Embed: ${doc.progressEmbed}`);
    console.log(`Progress Summary: ${doc.progressSummary}`);
    console.log(`Document Summary: ${doc.summary}`);
    console.log('--- CHAPTERS ---');
    for (const ch of doc.chapters) {
      console.log(`Chapter: ${ch.title} (Order: ${ch.order})`);
      console.log(`Summary: ${ch.summary}`);
    }
  } catch (err: any) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
