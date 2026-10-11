/**
 * batch_ingest_books.js
 * Ingesta por lotes de los libros PDF de docs/books en PostgreSQL
 * Genera chunks semánticos y embeddings bge-m3 en pgvector.
 */

const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { DocumentIngestService } = require('../dist/jarvis/library/document-ingest.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

function inferBookCategory(filename) {
  const f = filename.toLowerCase();
  if (f.includes('kybalion') || f.includes('hermes') || f.includes('eliphas') || f.includes('salomon')) return 'Hermetismo y Ocultismo';
  if (f.includes('saban') || f.includes('kabbalah') || f.includes('daat') || f.includes('bereshith') || f.includes('letras')) return 'Cábala y Misticismo';
  if (f.includes('astral') || f.includes('monroe') || f.includes('buhlman') || f.includes('cuerpo') || f.includes('viaje')) return 'Proyección Astral';
  if (f.includes('bardo') || f.includes('muertos') || f.includes('popol') || f.includes('munay') || f.includes('chaman')) return 'Tradiciones y Chamanismo';
  if (f.includes('pigna') || f.includes('mitos') || f.includes('historia')) return 'Historia Argentina';
  if (f.includes('planta') || f.includes('maleza') || f.includes('herbarium') || f.includes('hierba') || f.includes('tinte')) return 'Botánica y Plantas Medicinales';
  if (f.includes('biodescodificacion') || f.includes('sanacion') || f.includes('cromoterapia') || f.includes('cosmetica')) return 'Salud Natural';
  if (f.includes('bicicleta') || f.includes('mecanica')) return 'Manuales Técnicos';
  return 'Filosofía y Espiritualidad';
}

function cleanBookTitle(filename) {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/_/g, ' ')
    .replace(/[-]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('====================================================');
  console.log('📚 INGESTA POR LOTES DE LIBROS PDF (docs/books)');
  console.log('====================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const ingestService = app.get(DocumentIngestService);
  const prisma = app.get(PrismaService);

  const booksDir = path.resolve(process.cwd(), 'docs/books');
  if (!fs.existsSync(booksDir)) {
    console.error(`❌ Directorio no encontrado: ${booksDir}`);
    await app.close();
    return;
  }

  const allFiles = fs.readdirSync(booksDir).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`Encontrados ${allFiles.length} archivos PDF en docs/books.`);

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const filename = allFiles[i];
    const fullPath = path.join(booksDir, filename);
    const title = cleanBookTitle(filename);
    const category = inferBookCategory(filename);

    console.log(`\n[${i + 1}/${allFiles.length}] Procesando: "${title}" (${category})`);

    // Verificar si ya existe en la base de datos
    const existing = await prisma.document.findFirst({
      where: {
        OR: [
          { title: { equals: title, mode: 'insensitive' } },
          { source: { contains: filename, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ready') {
        console.log(`   ⏭️ Ya existe e indexado en BD (ID: ${existing.id}). Omitiendo.`);
        skippedCount++;
        continue;
      } else {
        console.log(`   ⚙️ Existente con estado "${existing.status}", aprobando docId ${existing.id}...`);
        try {
          await ingestService.approveDocument(existing.id);
          console.log(`   ✅ Doc ID ${existing.id} completado.`);
          processedCount++;
        } catch (err) {
          console.error(`   ❌ Error aprobando ID ${existing.id}: ${err.message}`);
          errorCount++;
        }
        continue;
      }
    }

    try {
      const buffer = fs.readFileSync(fullPath);
      // Validar tamaño mínimo
      if (buffer.length < 1000) {
        console.warn(`   ⚠️ Archivo demasiado pequeño o vacío (${buffer.length} bytes), omitiendo.`);
        skippedCount++;
        continue;
      }

      console.log(`   📄 Extrayendo texto y chunking... (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
      const ingestRes = await ingestService.ingestPdf(buffer, title, category, `docs/books/${filename}`);

      console.log(`   🧠 Generando embeddings bge-m3 para Doc ID ${ingestRes.documentId} (${ingestRes.chunks} chunks)...`);
      await ingestService.approveDocument(ingestRes.documentId);

      console.log(`   ✅ [Éxito] "${title}" indexado con ${ingestRes.chunks} chunks.`);
      processedCount++;
    } catch (err) {
      console.error(`   ❌ Error procesando "${filename}": ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n====================================================');
  console.log('📊 RESUMEN FINAL DE INGESTA DE LIBROS');
  console.log('====================================================');
  console.log(`• Total escaneados:   ${allFiles.length}`);
  console.log(`• Nuevos procesados:  ${processedCount}`);
  console.log(`• Omitidos (ya en BD): ${skippedCount}`);
  console.log(`• Errores:            ${errorCount}`);
  console.log('====================================================\n');

  await app.close();
}

main().catch(err => {
  console.error('Error fatal en batch_ingest_books:', err);
  process.exit(1);
});
