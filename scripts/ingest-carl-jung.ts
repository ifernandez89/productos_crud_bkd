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
      console.log(`[Monitor] ❌ ERROR: El documento con ID ${documentId} ya no existe en la base de datos.`);
      break;
    }

    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`[Monitor] [Memory: ${memUsage}MB] Estado: ${doc.status} | Estructural: ${doc.progressIndex}% | Embeddings: ${doc.progressEmbed}% | Resumen: ${doc.progressSummary}%`);

    if (doc.status === 'ready') {
      console.log(`[Monitor] 🎉 ¡Éxito! "${title}" está completamente indexado y listo.`);
      break;
    }

    if (doc.status === 'not_indexed') {
      console.log(`[Monitor] ⚠️ ADVERTENCIA: La indexación de "${title}" falló o quedó en "not_indexed".`);
      break;
    }

    // Heurística de timeout por inactividad de progreso
    const currentProgress = (doc.progressIndex ?? 0) + (doc.progressEmbed ?? 0) + (doc.progressSummary ?? 0);
    if (currentProgress === lastProgress) {
      sameProgressCount++;
      if (sameProgressCount > 60) { // 5 minutos sin cambios
        console.log(`[Monitor] ⚠️ ALERTA: No se detectó progreso durante 5 minutos en "${title}". Continuando con el siguiente libro.`);
        break;
      }
    } else {
      sameProgressCount = 0;
      lastProgress = currentProgress;
    }

    // Esperar 5 segundos antes de volver a consultar
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

async function main() {
  console.log('====================================================');
  console.log('🤖 INICIANDO EXTRACCIÓN DE CONOCIMIENTO - CARL JUNG 🤖');
  console.log('====================================================');
  
  console.log('\nBootstrapping NestJS application context (esto puede demorar unos segundos)...');
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('¡Contexto inicializado con éxito!');

  const prisma = app.get(PrismaService);
  const corpusService = app.get(CorpusSelectorService);
  const ingestService = app.get(DocumentIngestService);
  const documentRepo = app.get(DocumentRepository);

  // 1. Obtener todos los documentos del índice
  const index = corpusService.getIndex();
  const jungDocs = index.documentos.filter((d: any) => d.autor === 'Carl Gustav Jung');

  console.log(`\nEncontrados ${jungDocs.length} libros de Carl Gustav Jung en el índice.`);
  console.log('----------------------------------------------------');

  // 2. Clasificar el estado de los libros
  const pendingDocs: any[] = [];
  const readyDocs: any[] = [];

  for (const doc of jungDocs) {
    const existing = await documentRepo.findDocumentByExactTitle(doc.titulo);
    if (existing && existing.status === 'ready') {
      readyDocs.push({ doc, db: existing });
    } else {
      pendingDocs.push({ doc, db: existing });
    }
  }

  console.log(`🟢 Libros ya listos (READY en BD): ${readyDocs.length}`);
  readyDocs.forEach(d => console.log(`   - ${d.doc.titulo}`));
  
  console.log(`\n🟡 Libros pendientes de procesamiento: ${pendingDocs.length}`);
  pendingDocs.forEach(d => {
    const statusStr = d.db ? ` (Estado actual en BD: ${d.db.status})` : ' (No ingresado en BD)';
    console.log(`   - ${d.doc.titulo}${statusStr}`);
  });
  console.log('----------------------------------------------------');

  if (pendingDocs.length === 0) {
    console.log('¡Todos los libros de Carl Gustav Jung están completamente indexados!');
    await app.close();
    return;
  }

  // 3. Procesar secuencialmente (uno por uno) los libros pendientes
  console.log(`\nIniciando procesamiento secuencial de los ${pendingDocs.length} libros pendientes...`);
  
  for (let i = 0; i < pendingDocs.length; i++) {
    const { doc, db } = pendingDocs[i];
    console.log(`\n====================================================`);
    console.log(`📖 [${i + 1}/${pendingDocs.length}] Procesando: "${doc.titulo}"`);
    console.log(`   Archivo: ${doc.archivo}`);
    console.log(`====================================================`);

    let docId: number;

    try {
      if (db) {
        docId = db.id;
        console.log(`El documento ya existe con ID ${docId}. Estado: ${db.status}.`);
        if (db.status === 'quarantined' || db.status === 'not_indexed') {
          console.log(`Re-aprobando e iniciando indexación...`);
          await ingestService.approveDocument(docId);
        } else {
          console.log(`El documento ya está en estado "${db.status}". Monitoreando progreso...`);
        }
      } else {
        console.log(`Cargando documento usando lazy load...`);
        docId = await corpusService.lazyLoadDocument(doc, ingestService, documentRepo);
      }

      // Esperar a que finalice el procesamiento del documento actual
      await waitAndMonitor(prisma, docId, doc.titulo);

      // Una pausa de 3 segundos entre libros para dejar respirar a la CPU / GPU
      console.log('Tomando 3 segundos de descanso para enfriar el hardware...');
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (err: any) {
      console.error(`❌ Error procesando el libro "${doc.titulo}":`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 PROCESAMIENTO COMPLETADO 🎉');
  console.log('Todos los libros pendientes de Carl Gustav Jung han sido procesados.');
  console.log('====================================================');

  await app.close();
}

main().catch(err => {
  console.error('Error fatal durante la ejecución:', err);
  process.exit(1);
});
