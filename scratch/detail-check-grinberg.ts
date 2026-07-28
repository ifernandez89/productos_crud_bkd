import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';
import { DocumentRepository } from '../src/jarvis/repositories/document.repository';
import { PrismaService } from '../src/prisma/prisma.service';

async function detailCheck() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const corpusService = app.get(CorpusSelectorService);
  const documentRepo = app.get(DocumentRepository);

  const index = corpusService.getIndex();
  const grinbergDocs = index.documentos.filter((d: any) =>
    /jacobo grinberg|grinberg zylberbaum/i.test(d.autor ?? '') ||
    /jacobo grinberg|grinberg zylberbaum/i.test(d.titulo ?? '') ||
    /jacobo grinberg|grinberg zylberbaum/i.test(d.archivo ?? '')
  );

  console.log(`=== ANÁLISIS DETALLADO DE LIBROS DE JACOBO GRINBERG (${grinbergDocs.length} EN ÍNDICE) ===\n`);

  let countReady = 0;
  let countIncomplete = 0;
  let countNotStarted = 0;

  for (let i = 0; i < grinbergDocs.length; i++) {
    const doc = grinbergDocs[i];
    const existing = await documentRepo.findDocumentByExactTitle(doc.titulo);
    
    if (!existing) {
      countNotStarted++;
      console.log(`[${i+1}/${grinbergDocs.length}] ❌ NO EN BD: "${doc.titulo}"`);
      console.log(`     Archivo: ${doc.archivo}`);
    } else if (existing.status === 'ready') {
      countReady++;
      const chunkCount = await prisma.chunk.count({ where: { documentId: existing.id } });
      console.log(`[${i+1}/${grinbergDocs.length}] ✅ LISTO (READY): "${doc.titulo}" (ID: ${existing.id}, Chunks: ${chunkCount}, Emb: ${existing.progressEmbed}%, Sum: ${existing.progressSummary}%)`);
    } else {
      countIncomplete++;
      console.log(`[${i+1}/${grinbergDocs.length}] ⚠️ INCOMPLETO/INTERRUMPIDO: "${doc.titulo}" (ID: ${existing.id}, Status: "${existing.status}", Progreso: Ind=${existing.progressIndex}%, Emb=${existing.progressEmbed}%, Sum=${existing.progressSummary}%)`);
    }
  }

  console.log(`\n================ RESUMEN ===============`);
  console.log(`- Total en biblioteca: ${grinbergDocs.length}`);
  console.log(`- Completos (READY): ${countReady}`);
  console.log(`- Interrumpidos / En progreso: ${countIncomplete}`);
  console.log(`- Pendientes por iniciar: ${countNotStarted}`);

  await app.close();
  process.exit(0);
}

detailCheck().catch(err => {
  console.error(err);
  process.exit(1);
});
