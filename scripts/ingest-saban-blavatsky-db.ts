import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CorpusSelectorService } from '../src/jarvis/knowledge/corpus-selector.service';
import { DocumentIngestService } from '../src/jarvis/library/document-ingest.service';
import { DocumentRepository } from '../src/jarvis/repositories/document.repository';
import { PrismaService } from '../src/prisma/prisma.service';

async function waitAndMonitor(prisma: PrismaService, documentId: number, title: string) {
  console.log(`\n[Monitor] Monitoreando progreso para "${title}" (ID: ${documentId})...`);
  let sameProgressCount = 0;
  let lastProgress = -1;

  while (true) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        status: true,
        progressIndex: true,
        progressEmbed: true,
        progressSummary: true,
      }
    });

    if (!doc) {
      console.log(`[Monitor] ❌ ERROR: El documento ID ${documentId} no existe en BD.`);
      break;
    }

    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`[Monitor] [RAM: ${memUsage}MB] Estado: ${doc.status} | Estructural: ${doc.progressIndex ?? 0}% | Embeddings: ${doc.progressEmbed ?? 0}% | Resumen: ${doc.progressSummary ?? 0}%`);

    if (doc.status === 'ready') {
      console.log(`[Monitor] 🎉 ¡Éxito! "${title}" está completamente indexado y listo.`);
      break;
    }

    if (doc.status === 'not_indexed') {
      console.log(`[Monitor] ⚠️ ADVERTENCIA: La indexación de "${title}" falló o quedó en "not_indexed".`);
      break;
    }

    const currentProgress = (doc.progressIndex ?? 0) + (doc.progressEmbed ?? 0) + (doc.progressSummary ?? 0);
    if (currentProgress === lastProgress) {
      sameProgressCount++;
      if (sameProgressCount > 180) { // 15 minutos timeout inactividad
        console.log(`[Monitor] ⚠️ ALERTA: No se detectó progreso durante 15 minutos en "${title}". Continuando.`);
        break;
      }
    } else {
      sameProgressCount = 0;
      lastProgress = currentProgress;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

async function main() {
  console.log('========================================================================');
  console.log('🚀 INICIANDO INDEXACIÓN EN BD - MARIO SABÁN Y HELENA BLAVATSKY 🚀');
  console.log('========================================================================\n');

  console.log('Cargando contexto de la aplicación NestJS...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const prisma = app.get(PrismaService);
  const corpusService = app.get(CorpusSelectorService);
  const ingestService = app.get(DocumentIngestService);
  const documentRepo = app.get(DocumentRepository);

  const index = corpusService.getIndex();
  const targetDocs = index.documentos.filter((d: any) => {
    const normAuthor = (d.autor || '').toLowerCase();
    const normFile = (d.archivo || '').toLowerCase();
    const normTitle = (d.titulo || '').toLowerCase();

    const isSaban = normAuthor.includes('sabán') || normAuthor.includes('saban') || normFile.includes('mario javier sabán') || normTitle.includes('sabán') || normTitle.includes('keter') || normTitle.includes('atzilut') || normTitle.includes('bereshith') || normTitle.includes('daat');
    const isBlavatsky = normAuthor.includes('blavatsky') || normFile.includes('blavatsky') || normTitle.includes('blavatsky') || normTitle.includes('doctrina secreta');

    return isSaban || isBlavatsky;
  });

  const pendingDocs: any[] = [];
  for (const doc of targetDocs) {
    const existing = await documentRepo.findDocumentByExactTitle(doc.titulo);
    if (!existing || existing.status !== 'ready') {
      pendingDocs.push({ doc, db: existing });
    }
  }

  console.log(`📚 Total libros identificados de Sabán y Blavatsky: ${targetDocs.length}`);
  console.log(`🟡 Nuevos pendientes de indexación profunda en BD: ${pendingDocs.length}\n`);

  if (pendingDocs.length === 0) {
    console.log('✨ Todos los libros de Mario Sabán y Helena Blavatsky ya están indexados en la base de datos (READY).');
    await app.close();
    return;
  }

  for (let i = 0; i < pendingDocs.length; i++) {
    const { doc, db } = pendingDocs[i];
    console.log(`\n====================================================`);
    console.log(`📖 [${i + 1}/${pendingDocs.length}] Procesando: "${doc.titulo}" (${doc.autor})`);
    console.log(`====================================================`);

    let docId: number;
    try {
      if (db) {
        docId = db.id;
        console.log(`Documento encontrado en BD (ID: ${docId}, Estado: ${db.status}).`);
        if (db.status === 'quarantined' || db.status === 'not_indexed') {
          console.log(`Re-aprobando e iniciando indexación...`);
          await ingestService.approveDocument(docId);
        }
      } else {
        console.log(`Cargando documento a BD mediante lazyLoadDocument...`);
        docId = await corpusService.lazyLoadDocument(doc, ingestService, documentRepo);
      }

      await waitAndMonitor(prisma, docId, doc.titulo);

      console.log('Esperando 3 segundos entre libros...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (err: any) {
      console.error(`❌ Error procesando "${doc.titulo}":`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 PROCESAMIENTO E INDEXACIÓN EN BD COMPLETADOS 🎉');
  console.log('====================================================');

  await app.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
