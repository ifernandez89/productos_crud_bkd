import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Simular la búsqueda que hace el sistema cuando el usuario pregunta por Mario Saban
const queries = [
  'mario saban',
  'mario javier saban', 
  'keter extasis nada',
  'secretos de dios',
  'saban kabala',
];

for (const q of queries) {
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length >= 4);
  console.log(`\nQuery: "${q}" → terms: [${terms.join(', ')}]`);
  
  if (terms.length === 0) {
    console.log('  ⚠️  Todos los términos filtrados (< 4 chars)');
    continue;
  }

  const chunks = await prisma.chunk.findMany({
    where: { OR: terms.map(t => ({ content: { contains: t } })) },
    include: { document: { select: { id: true, title: true, category: true } } },
    take: 3,
  });
  
  if (chunks.length > 0) {
    console.log(`  ✅ ${chunks.length} chunks encontrados:`);
    chunks.forEach(c => console.log(`     Doc: "${c.document.title}" | chunk: ${c.content.slice(0,80)}...`));
  } else {
    console.log('  ❌ Sin chunks');
  }
}

// Verificar por qué "mario" y "saban" no matchean
console.log('\n── Problema: términos cortos filtrados ──');
console.log('"mario" tiene 5 chars → pasa el filtro >= 4');
console.log('"saban" tiene 5 chars → pasa el filtro >= 4');
console.log('"keter" tiene 5 chars → pasa el filtro >= 4');

// ¿Aparece "Sabán" o "Mario" en los chunks?
const keterChunks = await prisma.chunk.findMany({
  where: { document: { id: 3 } },
  select: { content: true },
  take: 5,
});
console.log('\nMuestra de chunks del doc ID 3 (Keter):');
keterChunks.forEach((c, i) => console.log(`  [${i+1}] ${c.content.slice(0, 200)}`));

await prisma.$disconnect();
