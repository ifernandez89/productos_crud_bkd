import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|odt|ods|odp|rtf|html?|epub|mobi)$/i;

async function main() {
  // Find all docs with file extensions in title
  const all = await prisma.document.findMany({
    select: { id: true, title: true },
  });

  const toFix = all.filter(d => EXTENSIONS.test(d.title));
  
  if (toFix.length === 0) {
    console.log('No hay documentos con extensiones en el titulo.');
    return;
  }

  console.log(`Encontre ${toFix.length} documento(s) con extensiones en el titulo:`);
  for (const doc of toFix) {
    const newTitle = doc.title.replace(EXTENSIONS, '').trim();
    console.log(`  [id:${doc.id}] "${doc.title}" -> "${newTitle}"`);
    await prisma.document.update({
      where: { id: doc.id },
      data: { title: newTitle },
    });
  }
  console.log('Titulos corregidos.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
