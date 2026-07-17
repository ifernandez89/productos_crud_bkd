import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Buscando documento "Obras Completas"...');
  
  const doc = await prisma.document.findFirst({
    where: {
      title: {
        contains: 'Obras Completas',
        mode: 'insensitive'
      }
    },
    include: {
      _count: {
        select: {
          chunks: true,
          chapters: true
        }
      }
    }
  });

  if (!doc) {
    console.log('❌ No se encontró el documento "Obras Completas" en la base de datos.');
    return;
  }

  console.log(`✅ Encontrado: ID=${doc.id}, Título="${doc.title}", Status="${doc.status}"`);
  console.log(`📊 Chunks totales en DB: ${doc._count.chunks}`);
  console.log(`📚 Capítulos en DB: ${doc._count.chapters}`);

  // Mostrar algunos chunks de ejemplo
  const chunks = await prisma.chunk.findMany({
    where: { documentId: doc.id },
    take: 5,
    select: {
      id: true,
      content: true,
      section: {
        select: {
          title: true,
          chapter: {
            select: { title: true }
          }
        }
      }
    }
  });

  console.log('\n📝 Primeros 5 chunks en la base de datos:');
  chunks.forEach((c, i) => {
    const chapterTitle = c.section?.chapter?.title || 'Sin capítulo';
    const sectionTitle = c.section?.title || 'Sin sección';
    console.log(`[${i+1}] ID=${c.id} | Capítulo: "${chapterTitle}" | Sección: "${sectionTitle}"`);
    console.log(`    Contenido (truncado): ${c.content.slice(0, 150)}...\n`);
  });
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
