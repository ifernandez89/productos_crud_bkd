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

    // Heurística de timeout por inactividad de progreso (espera hasta 15 minutos en libros gigantes)
    const currentProgress = (doc.progressIndex ?? 0) + (doc.progressEmbed ?? 0) + (doc.progressSummary ?? 0);
    if (currentProgress === lastProgress) {
      sameProgressCount++;
      if (sameProgressCount > 180) { // 15 minutos sin cambios (útil para obras gigantescas como Obras Completas)
        console.log(`[Monitor] ⚠️ ALERTA: No se detectó progreso durante 15 minutos en "${title}". Continuando con la ejecución.`);
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
  const targetAuthor = process.argv[2];

  console.log('====================================================');
  console.log('🤖 INICIANDO EXTRACCIÓN DE CONOCIMIENTO POR AUTOR 🤖');
  console.log('====================================================');

  console.log('\nBootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const prisma = app.get(PrismaService);
  const corpusService = app.get(CorpusSelectorService);
  const ingestService = app.get(DocumentIngestService);
  const documentRepo = app.get(DocumentRepository);

  // Obtener autores disponibles en el índice
  const index = corpusService.getIndex();
  const allAuthors = Array.from(new Set(index.documentos.map((d: any) => d.autor))).filter(Boolean) as string[];

  if (!targetAuthor) {
    console.log('\n❌ ERROR: Por favor, especifica un autor como argumento del comando.');
    console.log('\nUso correcto:');
    console.log('  npx ts-node scripts/ingest-author.ts "<Nombre del Autor>"');
    console.log('\nAutores detectados en la biblioteca:');
    allAuthors.forEach(a => console.log(`  - ${a}`));
    console.log('====================================================');
    await app.close();
    return;
  }

  // Buscar coincidencia flexible de autor
  const matchedAuthor = allAuthors.find(a => a.toLowerCase().includes(targetAuthor.toLowerCase()));

  if (!matchedAuthor) {
    console.log(`\n❌ ERROR: No se encontró ningún autor en el índice que coincida con "${targetAuthor}".`);
    console.log('Autores disponibles en la biblioteca:');
    allAuthors.forEach(a => console.log(`  - ${a}`));
    console.log('====================================================');
    await app.close();
    return;
  }

  console.log(`\nAutor seleccionado: "${matchedAuthor}"`);
  
  const authorDocs = index.documentos.filter((d: any) => d.autor === matchedAuthor);
  console.log(`Encontrados ${authorDocs.length} documentos para este autor en el índice.`);
  console.log('----------------------------------------------------');

  // Clasificar estado actual de los libros
  const pendingDocs: any[] = [];
  const readyDocs: any[] = [];

  for (const doc of authorDocs) {
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
    console.log(`¡Todos los libros de "${matchedAuthor}" están completamente indexados!`);
    await app.close();
    return;
  }

  // Procesar secuencialmente
  console.log(`\nIniciando procesamiento de los ${pendingDocs.length} libros pendientes...`);
  
  for (let i = 0; i < pendingDocs.length; i++) {
    const { doc, db } = pendingDocs[i];
    console.log(`\n====================================================`);
    console.log(`📖 [${i + 1}/${pendingDocs.length}] Ingestando: "${doc.titulo}"`);
    console.log(`   Archivo: ${doc.archivo}`);
    console.log(`====================================================`);

    let docId: number;

    try {
      if (db) {
        docId = db.id;
        console.log(`El documento ya existe en la BD (ID: ${docId}). Estado: ${db.status}.`);
        if (db.status === 'quarantined' || db.status === 'not_indexed') {
          console.log(`Re-aprobando e iniciando indexación jerárquica...`);
          await ingestService.approveDocument(docId);
        } else {
          console.log(`Monitoreando proceso activo...`);
        }
      } else {
        console.log(`Cargando documento en la base de datos...`);
        docId = await corpusService.lazyLoadDocument(doc, ingestService, documentRepo);
      }

      // Esperar a que el libro actual esté completamente indexado
      await waitAndMonitor(prisma, docId, doc.titulo);

      console.log('Tomando 5 segundos de descanso para enfriar el hardware...');
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (err: any) {
      console.error(`❌ Error procesando el libro "${doc.titulo}":`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log(`🎉 PROCESAMIENTO DE "${matchedAuthor}" FINALIZADO 🎉`);
  console.log('====================================================');

  await app.close();
}

main().catch(err => {
  console.error('Error fatal durante la ejecución:', err);
  process.exit(1);
});
