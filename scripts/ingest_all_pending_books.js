const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PDFParse } = require('pdf-parse');

const prisma = new PrismaClient();
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3:latest';

function inferCategory(filename) {
  const f = filename.toLowerCase();
  if (f.includes('kybalion') || f.includes('hermes') || f.includes('eliphas') || f.includes('salomon')) return 'Hermetismo y Ocultismo';
  if (f.includes('saban') || f.includes('kabbalah') || f.includes('daat') || f.includes('bereshith') || f.includes('letras')) return 'Cábala y Misticismo';
  if (f.includes('astral') || f.includes('monroe') || f.includes('buhlman') || f.includes('cuerpo') || f.includes('viaje')) return 'Proyección Astral';
  if (f.includes('bardo') || f.includes('muertos') || f.includes('popol') || f.includes('munay') || f.includes('chaman') || f.includes('tabaco') || f.includes('telektonon')) return 'Tradiciones y Chamanismo';
  if (f.includes('pigna') || f.includes('mitos') || f.includes('historia')) return 'Historia Argentina';
  if (f.includes('planta') || f.includes('maleza') || f.includes('herbarium') || f.includes('hierba') || f.includes('tinte') || f.includes('monte')) return 'Botánica y Plantas Medicinales';
  if (f.includes('biodescodificacion') || f.includes('sanacion') || f.includes('cromoterapia') || f.includes('cosmetica')) return 'Salud Natural';
  if (f.includes('bicicleta') || f.includes('mecanica') || f.includes('attacking') || f.includes('macrame') || f.includes('taller')) return 'Manuales Técnicos';
  if (f.includes('uritorco') || f.includes('mutilacion') || f.includes('ovni') || f.includes('extraterrestre')) return 'Fenómenos Paranormales y Ufología';
  if (f.includes('esoterismo') || f.includes('hechizo') || f.includes('autodefensa')) return 'Esoterismo';
  if (f.includes('astrologia') || f.includes('astral')) return 'Astrología';
  return 'Filosofía y Espiritualidad';
}

function cleanTitle(filename) {
  return path.basename(filename, path.extname(filename))
    .replace(/^\[AFR\]\s*/i, '')
    .replace(/_/g, ' ')
    .replace(/[-]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });
  if (!res.ok) throw new Error(`Embedding request failed: ${res.statusText}`);
  const data = await res.json();
  return data.embedding;
}

function chunkText(text, chunkSize = 1400, overlap = 200) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 40);

  const chunks = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + ' ' + para).length <= chunkSize) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      if (para.length > chunkSize) {
        let start = 0;
        while (start < para.length) {
          const end = Math.min(start + chunkSize, para.length);
          chunks.push(para.slice(start, end).trim());
          start += chunkSize - overlap;
        }
        currentChunk = '';
      } else {
        currentChunk = para;
      }
    }
  }
  if (currentChunk && currentChunk.length > 40) chunks.push(currentChunk);
  return chunks;
}

function getFilesRecursively(dir, exts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getFilesRecursively(full, exts));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!exts || exts.includes(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

async function main() {
  console.log('========================================================================');
  console.log('📚 INGESTA INTEGRAL DE LIBROS Y DOCUMENTOS PDF PENDIENTES');
  console.log('========================================================================');
  console.log(`• Modelo Vectorial: ${EMBEDDING_MODEL} en Ollama (Aceleración RTX 5070)`);
  console.log(`• Base de Datos:    PostgreSQL (Prisma)\n`);

  const booksDir = path.resolve('docs/books');
  const allPdfFiles = getFilesRecursively(booksDir, ['.pdf']);
  console.log(`Encontrados ${allPdfFiles.length} archivos PDF en docs/books y subcarpetas.`);

  // Obtener documentos existentes
  const existingDocs = await prisma.document.findMany({
    select: { id: true, title: true, source: true, status: true, _count: { select: { chunks: true } } }
  });

  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < allPdfFiles.length; i++) {
    const filePath = allPdfFiles[i];
    const filename = path.basename(filePath);
    const relSource = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const title = cleanTitle(filename);
    const category = inferCategory(filename);

    // Verificar si ya existe en BD con chunks listos
    const existing = existingDocs.find(d => {
      if (d.source && d.source.toLowerCase().includes(filename.toLowerCase())) return true;
      if (d.title && d.title.toLowerCase() === title.toLowerCase()) return true;
      return false;
    });

    if (existing && existing.status === 'ready' && existing._count.chunks > 0) {
      skippedCount++;
      continue;
    }

    // Comprobar archivo descartado
    if (filename.includes('Codex.Seraphinianus')) {
      console.log(`[${i + 1}/${allPdfFiles.length}] ⏭️ Omitiendo "${filename}" (obra puramente gráfica sin texto).`);
      skippedCount++;
      continue;
    }

    console.log(`\n[${i + 1}/${allPdfFiles.length}] 📖 Procesando: "${title}" (${category})`);
    console.log(`   Ruta: ${relSource}`);

    // Extraer texto
    let text = '';
    let pages = 0;
    try {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: buffer });
      const res = await parser.getText();
      await parser.destroy();
      pages = res.total || 0;
      text = (res.text || '').replace(/\0/g, '').trim();
      const cleanChars = text.replace(/-- \d+ of \d+ --/g, '').trim();

      if (cleanChars.length < 200) {
        console.warn(`   ⚠️ Archivo sin capa de texto legible (${cleanChars.length} chars, posible escaneo). Omitiendo.`);
        skippedCount++;
        continue;
      }
    } catch (parseErr) {
      console.error(`   ❌ Error extrayendo texto de "${filename}": ${parseErr.message}`);
      failedCount++;
      continue;
    }

    // Dividir en chunks
    const rawChunks = chunkText(text, 1400, 200);
    console.log(`   ✓ Extraídos ${pages} págs | ${text.length.toLocaleString()} caracteres -> ${rawChunks.length} chunks.`);

    if (rawChunks.length === 0) {
      console.warn(`   ⚠️ 0 chunks generados. Omitiendo.`);
      skippedCount++;
      continue;
    }

    try {
      // Si existe documento previo vacío o en cuarentena, limpiar chunks
      let docId = existing ? existing.id : null;
      if (docId) {
        await prisma.chunk.deleteMany({ where: { documentId: docId } });
        await prisma.document.update({
          where: { id: docId },
          data: { status: 'indexing', content: text.slice(0, 50000) }
        });
      } else {
        const newDoc = await prisma.document.create({
          data: {
            title,
            category,
            source: relSource,
            content: text.slice(0, 50000),
            status: 'indexing'
          }
        });
        docId = newDoc.id;
      }

      // Vectorizar en GPU por lotes de 8
      const BATCH_SIZE = 8;
      const tStart = Date.now();
      for (let b = 0; b < rawChunks.length; b += BATCH_SIZE) {
        const batch = rawChunks.slice(b, b + BATCH_SIZE);
        const vectors = await Promise.all(batch.map(c => getEmbedding(c)));

        for (let j = 0; j < batch.length; j++) {
          const chunkIdx = b + j + 1;
          await prisma.chunk.create({
            data: {
              documentId: docId,
              content: batch[j],
              embeddingId: `doc-${docId}-${chunkIdx}`,
              metadata: JSON.stringify({
                docTitle: title,
                index: chunkIdx,
                vector: vectors[j]
              })
            }
          });
        }

        const pct = Math.round(((b + batch.length) / rawChunks.length) * 100);
        process.stdout.write(`   ↳ [${pct}%] ${b + batch.length}/${rawChunks.length} chunks vectorizados...\r`);
      }

      await prisma.document.update({
        where: { id: docId },
        data: {
          status: 'ready',
          progressIndex: 100.0,
          progressEmbed: 100.0
        }
      });

      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      console.log(`\n   ✅ [ID: ${docId}] "${title}" indexado con ${rawChunks.length} chunks en ${elapsed}s.`);
      processedCount++;
    } catch (ingestErr) {
      console.error(`   ❌ Error guardando en base de datos: ${ingestErr.message}`);
      failedCount++;
    }
  }

  console.log('\n========================================================================');
  console.log('🎉 RESUMEN FINAL DE INGESTA DE LIBROS');
  console.log('========================================================================');
  console.log(`• Nuevos libros procesados: ${processedCount}`);
  console.log(`• Ya existentes / Omitidos:  ${skippedCount}`);
  console.log(`• Errores:                  ${failedCount}`);
  console.log('========================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
