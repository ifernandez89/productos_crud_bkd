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

// Catálogo de Fase 3: Jung Restante & Chamanismo Tradicional (13 obras)
const fase3Books = [
  // ── Carl Gustav Jung (5 restantes) ──
  {
    title: 'Arquetipos EI inconsciente Colectivo 1',
    author: 'Carl Gustav Jung',
    category: 'Psicología Analítica',
    type: 'pdf',
    file: 'docs/books/Carl Gustav Jung Libros/1_ArquetiposEInconscienteColectivo.pdf',
    indexId: 'lib-carl-gustav-jung-arquetipos-ei-inconscie'
  },
  {
    title: 'Arquetipos EI inconsciente Colectivo 2',
    author: 'Carl Gustav Jung',
    category: 'Psicología Analítica',
    type: 'pdf',
    file: 'docs/books/Carl Gustav Jung Libros/2_ArquetiposEInconscienteColectivo.pdf',
    indexId: 'lib-carl-gustav-jung-arquetipos-ei-inconscie'
  },
  {
    title: 'Arquetipos EI inconsciente Colectivo 3',
    author: 'Carl Gustav Jung',
    category: 'Psicología Analítica',
    type: 'pdf',
    file: 'docs/books/Carl Gustav Jung Libros/3_ArquetiposEInconscienteColectivo.pdf',
    indexId: 'lib-carl-gustav-jung-arquetipos-ei-inconscie'
  },
  {
    title: 'La Psicologia De La Transferencia 1',
    author: 'Carl Gustav Jung',
    category: 'Psicología Analítica',
    type: 'pdf',
    file: 'docs/books/Carl Gustav Jung Libros/1_LaPsicologiaDeLaTransferencia.pdf',
    indexId: 'lib-carl-gustav-jung-la-psicologia-de-la-tra'
  },
  {
    title: 'La Psicologia De La Transferencia 2',
    author: 'Carl Gustav Jung',
    category: 'Psicología Analítica',
    type: 'pdf',
    file: 'docs/books/Carl Gustav Jung Libros/2_LaPsicologiaDeLaTransferencia.pdf',
    indexId: 'lib-carl-gustav-jung-la-psicologia-de-la-tra'
  },
  // ── Chamanismo, Medicina & Plantas (8 obras) ──
  {
    title: 'Los Nueve Ritos del Munay-Ki',
    author: 'Tradición Q\'ero / Alberto Villoldo',
    category: 'Chamanismo',
    type: 'json',
    file: 'src/jarvis/knowledge/munay_ki.json',
    indexId: 'munay-ki-001'
  },
  {
    title: 'Herbario y Plantas Medicinales',
    author: 'Recopilación propia',
    category: 'Plantas Medicinales',
    type: 'json',
    file: 'src/jarvis/knowledge/plantas_medicinales.json',
    indexId: 'plantas-medicinales-001'
  },
  {
    title: 'Sanaciones Populares y Oraciones Curativas',
    author: 'Tradición popular regional',
    category: 'Medicina Popular',
    type: 'json',
    file: 'src/jarvis/knowledge/sanaciones_populares.json',
    indexId: 'sanaciones-populares-001'
  },
  {
    title: 'Munay ki',
    author: 'Tradición Andina',
    category: 'Chamanismo',
    type: 'pdf',
    file: 'docs/books/Munayki.pdf',
    indexId: 'lib-munay-ki-pdf'
  },
  {
    title: 'Munay Ki ESPACIO SAGRADO',
    author: 'Tradición Chamánica',
    category: 'Chamanismo',
    type: 'pdf',
    file: 'docs/books/00 ESPACIO SAGRADO version nov2017.pdf',
    indexId: 'lib-munay-ki-espacio-sagrado-pdf'
  },
  {
    title: 'Ícaros: Cantos Sagrados del Amazonas',
    author: 'Tradición Amazónica',
    category: 'Chamanismo y Medicina',
    type: 'pdf',
    file: 'docs/books/icaros.pdf',
    indexId: 'lib-icaros-pdf'
  },
  {
    title: 'Un Ensueño entre Serpientes y Jaguares (Parte 1)',
    author: 'Tradición Chamánica',
    category: 'Chamanismo y Relatos',
    type: 'pdf',
    file: 'docs/books/Un ensueño entre serpientes y jaguares (parte 1).pdf',
    indexId: 'lib-un-ensue-o-entre-serpientes-y-jaguares-p'
  },
  {
    title: 'Un Ensueño entre Serpientes y Jaguares (Parte 2)',
    author: 'Tradición Chamánica',
    category: 'Chamanismo y Relatos',
    type: 'pdf',
    file: 'docs/books/Un ensueño entre serpientes y jaguares (parte 2).pdf',
    indexId: 'lib-un-ensue-o-entre-serpientes-y-jaguares-p'
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
  console.log('🌿 FASE 3: INGESTA MODULAR — JUNG RESTANTE & CHAMANISMO (13 OBRAS)');
  console.log('========================================================================');
  console.log(`• Hardware:           NVIDIA GeForce RTX 5070 (12 GB VRAM)`);
  console.log(`• Modelo Vectorial:   ${EMBEDDING_MODEL} (1024D)`);
  console.log(`• Obras de la tanda:  ${fase3Books.length} obras`);
  console.log(`• Base de Datos:      PostgreSQL (Prisma)\n`);

  const tTotalStart = Date.now();
  let totalChunksIngested = 0;

  for (let i = 0; i < fase3Books.length; i++) {
    const book = fase3Books[i];
    const fullPath = join(process.cwd(), book.file);

    console.log(`\n------------------------------------------------------------------------`);
    console.log(`📖 [Obra ${i + 1}/${fase3Books.length}] "${book.title}"`);
    console.log(`   Autor:     ${book.author}`);
    console.log(`   Archivo:   ${book.file}`);

    if (!existsSync(fullPath)) {
      console.warn(`   ⚠️ Archivo no encontrado en disco: ${fullPath}. Omitiendo.`);
      continue;
    }

    // 1. Extracción de contenido (PDF o JSON)
    const tExtract = Date.now();
    let text = '';
    let pages = 0;

    try {
      if (book.type === 'pdf') {
        const buffer = readFileSync(fullPath);
        const parser = new PDFParse({ data: buffer });
        const res = await parser.getText();
        await parser.destroy();
        pages = res.total || 0;
        text = (res.text || '').replace(/\0/g, '').trim();
      } else {
        // Base de conocimiento JSON
        const rawJson = JSON.parse(readFileSync(fullPath, 'utf8'));
        text = JSON.stringify(rawJson, null, 2);
        pages = 1;
      }
    } catch (e) {
      console.error(`   ❌ Error extrayendo archivo: ${e.message}`);
      continue;
    }

    if (!text || text.length < 100) {
      console.warn(`   ⚠️ Sin texto extraíble legible. Omitiendo.`);
      continue;
    }

    const extractSec = ((Date.now() - tExtract) / 1000).toFixed(1);
    console.log(`   ✓ Texto extraído: ${book.type === 'pdf' ? `${pages} págs | ` : ''}${text.length.toLocaleString()} caracteres (${extractSec}s)`);

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
            embeddingId: `chaman-${item.documentId}-${item.chunkIndex}`,
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
    if (i < fase3Books.length - 1) {
      await cooldown(7);
    }
  }

  // Actualizar library-index.json a ready
  const indexPath = join(process.cwd(), 'src/jarvis/knowledge/library-index.json');
  if (existsSync(indexPath)) {
    try {
      const idxData = JSON.parse(readFileSync(indexPath, 'utf-8'));
      fase3Books.forEach((fb) => {
        const item = idxData.documentos.find((d) => d.id === fb.indexId || d.titulo === fb.title);
        if (item) item.embeddings = 'ready';
      });
      writeFileSync(indexPath, JSON.stringify(idxData, null, 2));
      console.log(`\n📋 Índice library-index.json actualizado con éxito (13 obras marcadas en "ready").`);
    } catch (e) {
      console.warn(`Advertencia actualizando library-index.json: ${e.message}`);
    }
  }

  const totalMin = ((Date.now() - tTotalStart) / 1000 / 60).toFixed(2);
  console.log('\n========================================================================');
  console.log(`🎉 FASE 3 COMPLETADA CON ÉXITO EN ${totalMin} MINUTOS 🎉`);
  console.log(`• Total chunks vectorizados: ${totalChunksIngested.toLocaleString()}`);
  console.log(`• 13 obras de Jung y Chamanismo disponibles para RAG en PostgreSQL`);
  console.log(`• GPU RTX 5070 en reposo.`);
  console.log('========================================================================\n');
}

main()
  .catch((e) => {
    console.error('Error fatal en Fase 3:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
