/**
 * batch_ingest_audiobooks.js
 * Script de ejecución batch para ingestar audiolibros de I:\Musica\Audiolibros y mas
 * Cumple con las directivas de persistencia incremental en disco y reuso de cache.
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { AudiobookIngestService } = require('../dist/jarvis/library/audiobook-ingest.service');

async function main() {
  const args = process.argv.slice(2);
  let maxFiles = undefined;
  const maxIdx = args.indexOf('--max');
  if (maxIdx !== -1 && args[maxIdx + 1]) {
    maxFiles = parseInt(args[maxIdx + 1], 10);
  }

  console.log('====================================================');
  console.log('🎙️  JARBEES BATCH AUDIOBOOK INGESTION ENGINE');
  console.log('====================================================');
  console.log(`Modo: Procesamiento incremental con cache en disco`);
  if (maxFiles) console.log(`Límite configurado: ${maxFiles} archivos`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const ingestService = app.get(AudiobookIngestService);

  try {
    const summary = await ingestService.ingestAllAvailableAudiobooks({
      skipPureAmbient: true,
      maxFiles,
    });

    console.log('\n====================================================');
    console.log('✅ RESUMEN DE PROCESAMIENTO BATCH');
    console.log('====================================================');
    console.log(`Total escaneados:            ${summary.totalScanned}`);
    console.log(`Procesados e indexados:      ${summary.processed}`);
    console.log(`Omitidos (ya en BD):         ${summary.skippedAlreadyIngested}`);
    console.log(`Errores:                     ${summary.errors.length}`);

    if (summary.results.length > 0) {
      console.log('\nNuevos documentos indexados:');
      for (const r of summary.results) {
        console.log(`  • [ID: ${r.documentId}] ${r.title} (${r.author}) — ${r.totalChunks} chunks [${r.cached ? 'Cache disco' : 'Transcrito'}]`);
      }
    }

    if (summary.errors.length > 0) {
      console.log('\nDetalle de errores:');
      for (const e of summary.errors) {
        console.log(`  ❌ ${e.file}: ${e.error}`);
      }
    }
  } catch (err) {
    console.error('Error fatal durante la ingesta:', err);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
