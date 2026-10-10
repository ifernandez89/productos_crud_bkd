import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Cargar variables de entorno
const envPath = join(__dirname, '../.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?/);
    if (match) process.env[match[1]] = match[2].trim();
  }
}

const prisma = new PrismaClient();
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3:latest';

// Catálogo de Fase 2: Cábala & Teosofía Esotérica (8 libros)
const fase2Books = [
  {
    title: 'Keter: El éxtasis de la nada',
    author: 'Mario Javier Sabán',
    category: 'Cábala',
    file: 'docs/books/Keter - Mario Javier Sabán.pdf',
    indexId: 'lib-mario-javier-sab-n-keter-mario-javier-sa'
  },
  {
    title: 'Los Secretos de Dios: Sefer Atzilut',
    author: 'Mario Javier Sabán',
    category: 'Cábala',
    file: 'docs/books/Los Secretos de Dios. Sefer Atzilut - Mario Javier Sabán.pdf',
    indexId: 'lib-mario-javier-sab-n-los-secretos-de-dios-'
  },
  {
    title: 'La Doctrina Secreta',
    author: 'Helena Petrovna Blavatsky',
    category: 'Teosofía',
    file: 'docs/books/doctrina_secreta.pdf',
    indexId: 'lib-helena-petrovna-blavatsky-helena-petrovn'
  },
  {
    title: 'The Etheric Double: The Health Aura of Man',
    author: 'Arthur E. Powell',
    category: 'Teosofía',
    file: 'docs/books/Arthur-E-Powell-The-Etheric-Double-The-Health-Aura-of-Man.pdf',
    indexId: 'lib-arthur-e-powell-the-etheric-double-the-h'
  },
  {
    title: 'La Vía del Tarot',
    author: 'Alejandro Jodorowsky & Marianne Costa',
    category: 'Tarot y Simbolismo',
    file: 'docs/books/La vía del tarot, Alejandro Jodorowsky.pdf',
    indexId: 'lib-la-v-a-del-tarot-alejandro-jodorowsky-pd'
  },
  {
    title: 'Curso de Esoterismo Práctico - Lección 0 (Chilam IX)',
    author: 'Tradición Esotérica',
    category: 'Esoterismo',
    file: 'docs/books/esoterismo practico/Dispuesto - Chilam IX.pdf',
    indexId: 'lib-esoterismo-practico-dispuesto-chilam-ix-'
  },
  {
    title: 'Curso de Esoterismo Práctico - Lección 1',
    author: 'Tradición Esotérica',
    category: 'Esoterismo',
    file: 'docs/books/esoterismo practico/[AFR] Curso de Esoterismo Práctico - Lección Nº 01.pdf',
    indexId: 'lib-esoterismo-practico-afr-curso-de-esoteri'
  },
  {
    title: 'Curso de Esoterismo Práctico - Lección 2',
    author: 'Tradición Esotérica',
    category: 'Esoterismo',
    file: 'docs/books/esoterismo practico/[AFR] Curso de Esoterismo Práctico - Lección Nº 02.pdf',
    indexId: 'lib-esoterismo-practico-afr-curso-de-esoteri'
  }
];

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Error HTTP Embedding: ${res.status} ${res.statusText}`);
  }
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
      if (currentChunk) {
        chunks.push(currentChunk);
      }
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

  if (currentChunk && currentChunk.length > 40) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function cooldown(seconds = 7) {
  process.stdout.write(`  ❄️  Pausa de enfriamiento GPU (${seconds}s): `);
  for (let s = seconds; s > 0; s--) {
    process.stdout.write(`${s}s `);
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('✓\n');
}

async function main() {
  console.log('========================================================================');
  console.log('🔯 FASE 2: INGESTA MODULAR — CÁBALA & TEOSOFÍA ESOTÉRICA (8 LIBROS)');
  console.log('========================================================================');
  console.log(`• Hardware:           NVIDIA GeForce RTX 5070 (12 GB VRAM)`);
  console.log(`• Modelo Vectorial:   ${EMBEDDING_MODEL} (1024D)`);
  console.log(`• Libros de la tanda: ${fase2Books.length} obras`);
  console.log(`• Base de Datos:      PostgreSQL (Prisma)\n`);

  const tTotalStart = Date.now();
  let totalChunksIngested = 0;

  for (let i = 0; i < fase2Books.length; i++) {
    const book = fase2Books[i];
    const fullPath = join(process.cwd(), book.file);

    console.log(`\n------------------------------------------------------------------------`);
    console.log(`📖 [Libro ${i + 1}/${fase2Books.length}] "${book.title}"`);
    console.log(`   Autor:     ${book.author}`);
    console.log(`   Archivo:   ${book.file}`);

    if (!existsSync(fullPath)) {
      console.warn(`   ⚠️ Archivo no encontrado en disco: ${fullPath}. Omitiendo.`);
      continue;
    }

    // 1. Extracción de texto PDF
    const tExtract = Date.now();
    let text = '';
    let pages = 0;
    try {
      const buffer = readFileSync(fullPath);
      const parser = new PDFParse({ data: buffer });
      const res = await parser.getText();
      await parser.destroy();
      pages = res.total || 0;
      text = (res.text || '').replace(/\0/g, '').trim();
    } catch (e) {
      console.error(`   ❌ Error extrayendo PDF: ${e.message}`);
      continue;
    }

    if (!text || text.length < 100) {
      console.warn(`   ⚠️ El PDF no contiene texto extraíble legible. Omitiendo.`);
      continue;
    }

    const extractSec = ((Date.now() - tExtract) / 1000).toFixed(1);
    console.log(`   ✓ Texto extraído: ${pages} págs | ${text.length.toLocaleString()} caracteres (${extractSec}s)`);

    // 2. Limpieza de versión anterior en BD si existiera
    const existing = await prisma.document.findFirst({ where: { title: book.title } });
    if (existing) {
      await prisma.chunk.deleteMany({ where: { documentId: existing.id } });
      await prisma.document.delete({ where: { id: existing.id } });
    }

    // 3. Crear Documento en PostgreSQL
    const doc = await prisma.document.create({
      data: {
        title: book.title,
        category: book.category,
        source: book.file,
        content: text.slice(0, 50000),
        status: 'indexing',
      },
    });

    // 4. Chunking
    const chunks = chunkText(text, 1400, 200).map((c, idx) => ({
      documentId: doc.id,
      docTitle: book.title,
      chunkIndex: idx + 1,
      content: c,
    }));

    console.log(`   ⚡ Vectorizando ${chunks.length} chunks en GPU (RTX 5070)...`);

    // 5. Ingesta Vectorial en GPU por Batches de 8
    const tEmbed = Date.now();
    const BATCH_SIZE = 8;
    let processed = 0;

    for (let bIdx = 0; bIdx < chunks.length; bIdx += BATCH_SIZE) {
      const batch = chunks.slice(bIdx, bIdx + BATCH_SIZE);

      const batchVectors = await Promise.all(
        batch.map(async (item) => {
          const vector = await getEmbedding(item.content);
          return { ...item, vector };
        })
      );

      for (const item of batchVectors) {
        await prisma.chunk.create({
          data: {
            documentId: item.documentId,
            content: item.content,
            embeddingId: `cabala-${item.documentId}-${item.chunkIndex}`,
            metadata: JSON.stringify({
              docTitle: item.docTitle,
              index: item.chunkIndex,
              vector: item.vector,
            }),
          },
        });
      }

      processed += batch.length;
      const pct = ((processed / chunks.length) * 100).toFixed(0);
      const rate = ((processed / ((Date.now() - tEmbed) || 1)) * 1000).toFixed(1);
      process.stdout.write(`   ↳ [${pct}%] ${processed}/${chunks.length} chunks guardados | ${rate} vec/s...\r`);
    }

    // Marcar como ready en BD
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'ready', progressIndex: 100, progressEmbed: 100 },
    });

    const embedSec = ((Date.now() - tEmbed) / 1000).toFixed(1);
    const avgRate = ((chunks.length / ((Date.now() - tEmbed) / 1000))).toFixed(1);
    console.log(`\n   ✅ Completado en ${embedSec}s (${avgRate} vec/s) — Documento ID: ${doc.id}`);

    totalChunksIngested += chunks.length;

    // Cooldown para la RTX 5070 entre libros
    if (i < fase2Books.length - 1) {
      await cooldown(7);
    }
  }

  // Actualizar library-index.json a ready
  const indexPath = join(process.cwd(), 'src/jarvis/knowledge/library-index.json');
  if (existsSync(indexPath)) {
    try {
      const idxData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      fase2Books.forEach((fb) => {
        const item = idxData.documentos.find((d) => d.id === fb.indexId || d.titulo === fb.title);
        if (item) item.embeddings = 'ready';
      });
      writeFileSync(indexPath, JSON.stringify(idxData, null, 2));
      console.log(`\n📋 Índice library-index.json actualizado con éxito (8 obras marcadas en "ready").`);
    } catch (e) {
      console.warn(`Advertencia actualizando library-index.json: ${e.message}`);
    }
  }

  const totalMin = ((Date.now() - tTotalStart) / 1000 / 60).toFixed(2);
  console.log('\n========================================================================');
  console.log(`🎉 FASE 2 COMPLETADA CON ÉXITO EN ${totalMin} MINUTOS 🎉`);
  console.log(`• Total chunks vectorizados: ${totalChunksIngested.toLocaleString()}`);
  console.log(`• 8 libros de Cábala y Teosofía disponibles para RAG en PostgreSQL`);
  console.log(`• GPU RTX 5070 en reposo.`);
  console.log('========================================================================\n');
}

main()
  .catch((e) => {
    console.error('Error fatal en Fase 2:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
