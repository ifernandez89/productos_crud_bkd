import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function check() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const corpusService = app.get(CorpusSelectorService);

  const index = corpusService.getIndex();
  const grinbergIndexDocs = index.documentos.filter((d: any) =>
    /jacobo grinberg|grinberg zylberbaum/i.test(d.autor ?? '') ||
    /jacobo grinberg|grinberg zylberbaum/i.test(d.titulo ?? '') ||
    /jacobo grinberg|grinberg zylberbaum/i.test(d.archivo ?? '')
  );

  console.log('=== DOCUMENTOS EN INDICE LIBROS.JSON ===');
  console.log(`Total: ${grinbergIndexDocs.length}`);
  
  const allDbDocs = await prisma.document.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      progressIndex: true,
      progressEmbed: true,
      progressSummary: true,
      source: true,
      _count: {
        select: { chunks: true, chapters: true }
      }
    }
  });

  const dbGrinberg = allDbDocs.filter(d => 
    /grinberg/i.test(d.title) || /grinberg/i.test(d.source ?? '')
  );

  console.log('\n=== DOCUMENTOS EN BD (GRINBERG) ===');
  console.log(`Total en BD: ${dbGrinberg.length}`);
  for (const d of dbGrinberg) {
    console.log(`ID: ${d.id} | Titulo: "${d.title}" | Estado: ${d.status} | Chunks: ${d._count.chunks} | Capítulos: ${d._count.chapters} | Progreso: Ind=${d.progressIndex}% Emb=${d.progressEmbed}% Sum=${d.progressSummary}%`);
  }

  // Cross reference index vs db
  const readyTitles = new Set(dbGrinberg.filter(d => d.status === 'ready').map(d => d.title.toLowerCase()));
  const pending = grinbergIndexDocs.filter(d => !readyTitles.has(d.titulo.toLowerCase()));

  console.log('\n=== PENDIENTES O INCOMPLETOS ===');
  console.log(`Total incompletos/pendientes: ${pending.length}`);
  for (const p of pending) {
    const matchedDb = dbGrinberg.find(d => d.title.toLowerCase() === p.titulo.toLowerCase());
    if (matchedDb) {
      console.log(`- "${p.titulo}" -> BD Estado: ${matchedDb.status} (Chunks: ${matchedDb._count.chunks}, Emb: ${matchedDb.progressEmbed}%)`);
    } else {
      console.log(`- "${p.titulo}" -> No ingresado en BD`);
    }
  }

  await app.close();
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
