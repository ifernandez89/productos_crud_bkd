const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { PrismaClient } = require('@prisma/client');

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3:latest';
const BASE_AUDIO_DIR = 'I:\\Musica\\Audiolibros y mas';
const TRANSCRIPT_DIR = path.join(BASE_AUDIO_DIR, '_transcripciones');
const PYTHON_SCRIPT = path.join(process.cwd(), 'scripts', 'transcribe_audiobook.py');

if (!fs.existsSync(TRANSCRIPT_DIR) && fs.existsSync(BASE_AUDIO_DIR)) {
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
}

function inferMetadata(filename) {
  const raw = filename.replace(/\.(mp3|m4a|mp4|wav|ogg)$/i, '').trim();

  let author = 'Desconocido';
  let category = 'Filosofía y Espiritualidad';
  let title = raw;

  if (/ramacharaka/i.test(raw)) {
    author = 'Yogi Ramacharaka';
    category = 'Yoga y Filosofía Oriental';
  } else if (/leadbeater/i.test(raw)) {
    author = 'Charles Webster Leadbeater';
    category = 'Teosofía y Esoterismo';
  } else if (/powell|powel/i.test(raw)) {
    author = 'Arthur E. Powell';
    category = 'Teosofía y Esoterismo';
  } else if (/blavatsky/i.test(raw)) {
    author = 'Helena Petrovna Blavatsky';
    category = 'Teosofía y Esoterismo';
  } else if (/judge/i.test(raw)) {
    author = 'William Quan Judge';
    category = 'Teosofía y Mesmerismo';
  } else if (/garc[ií]a l[oó]pez/i.test(raw)) {
    author = 'Anastasio García López';
    category = 'Espiritismo y Filosofía';
  } else if (/ferenczi/i.test(raw)) {
    author = 'Sándor Ferenczi';
    category = 'Psicoanálisis';
  } else if (/freud/i.test(raw)) {
    author = 'Sigmund Freud';
    category = 'Psicoanálisis e Hipnosis';
  } else if (/garnier|doble cu[aá]ntico/i.test(raw)) {
    author = 'Jean-Pierre Garnier Malet';
    category = 'Física Cuántica y Conciencia';
  } else if (/samael|weor/i.test(raw)) {
    author = 'Samael Aun Weor';
    category = 'Gnosis y Cábala';
  } else if (/steiner/i.test(raw)) {
    author = 'Rudolf Steiner';
    category = 'Antroposofía';
  } else if (/kardec/i.test(raw)) {
    author = 'Allan Kardec';
    category = 'Espiritismo';
  } else if (/parise/i.test(raw)) {
    author = 'José Luis Parise';
    category = 'Psicoanálisis y Hermetismo';
  } else if (/haramein/i.test(raw)) {
    author = 'Nassim Haramein';
    category = 'Física Unificada';
  }

  title = raw
    .replace(/^y2mate\.com\s*-\s*/i, '')
    .replace(/\(AUDIOLIBRO\).*/i, '')
    .replace(/Audio\s*Libro\s*Completo.*/i, '')
    .replace(/_[A-Za-z0-9_-]{10,}_[0-9]+p/g, '')
    .replace(/^\d+[-_]/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { cleanTitle: title, author, category };
}

function sanitizeSlug(filename) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
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

function chunkText(text, chunkSize = 1200, overlap = 150) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const nextBreak = text.indexOf('\n', end);
      const nextPeriod = text.indexOf('. ', end);
      if (nextPeriod !== -1 && nextPeriod - end < 100) {
        end = nextPeriod + 1;
      } else if (nextBreak !== -1 && nextBreak - end < 100) {
        end = nextBreak;
      }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }
    start += chunkSize - overlap;
  }
  return chunks;
}

function getFilesRecursively(dir, exts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_transcripciones') {
        results = results.concat(getFilesRecursively(full, exts));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!exts || exts.includes(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

async function transcribeFileWithWhisper(audioPath, jsonPath) {
  // Comprobar cache en disco
  if (fs.existsSync(jsonPath) && fs.statSync(jsonPath).size > 10) {
    try {
      const cached = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (cached.fullText && cached.fullText.trim().length > 0) {
        console.log(`   📂 [Cache Disco] Reutilizando transcripción existente (${cached.fullText.length.toLocaleString()} caracteres).`);
        return {
          fullText: cached.fullText,
          cached: true,
          audioDurationSec: cached.audioDurationSec || 0,
        };
      }
    } catch (e) {
      console.warn(`   ⚠️ Error leyendo cache, regenerando: ${e.message}`);
    }
  }

  console.log(`   🎙️  Transcribiendo con faster-whisper (CUDA GPU)...`);
  const tStart = Date.now();
  const { stdout } = await execFileAsync('python', [
    PYTHON_SCRIPT,
    '--input',
    audioPath,
    '--output',
    jsonPath,
    '--model',
    'base',
  ], { maxBuffer: 1024 * 1024 * 50 });

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log(`   ✓ Transcripción completada en ${elapsed}s (${(data.fullText || '').length.toLocaleString()} caracteres).`);

  return {
    fullText: data.fullText || '',
    cached: false,
    audioDurationSec: data.audioDurationSec || 0,
  };
}

async function main() {
  console.log('========================================================================');
  console.log('🎙️  JARBEES BATCH AUDIOBOOK INGESTION ENGINE');
  console.log('========================================================================');
  console.log(`• Directorio:       ${BASE_AUDIO_DIR}`);
  console.log(`• Modelo Whisper:   faster-whisper (base) con CUDA`);
  console.log(`• Modelo Vectorial: ${EMBEDDING_MODEL} (Ollama)\n`);

  if (!fs.existsSync(BASE_AUDIO_DIR)) {
    console.error(`❌ Directorio no existe: ${BASE_AUDIO_DIR}`);
    return;
  }

  const audioExts = ['.mp3', '.m4a', '.mp4', '.wav', '.ogg'];
  const allAudios = getFilesRecursively(BASE_AUDIO_DIR, audioExts);
  const ambientFilter = /frecuencia|sonido 8d|olas del mar|playamar|tambor chamanico|canales|música chamanica/i;

  const existingDocs = await prisma.document.findMany({
    select: { id: true, title: true, source: true, status: true, _count: { select: { chunks: true } } },
  });

  const candidates = allAudios
    .filter(filePath => {
      const filename = path.basename(filePath);
      return !ambientFilter.test(filename) && filename.toLowerCase() !== 'thumbs.db';
    })
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);

  console.log(`Encontrados ${allAudios.length} archivos de audio en total.`);
  console.log(`Candidatos con locución/texto: ${candidates.length} archivos.`);

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const audioPath = candidates[i];
    const filename = path.basename(audioPath);
    const meta = inferMetadata(filename);
    const slug = sanitizeSlug(filename);
    const jsonPath = path.join(TRANSCRIPT_DIR, `${slug}.json`);

    // Comprobar si ya existe en la BD
    const existing = existingDocs.find(d => {
      if (d.source && d.source.toLowerCase() === audioPath.toLowerCase()) return true;
      if (d.source && d.source.toLowerCase().includes(filename.toLowerCase())) return true;
      if (d.title && d.title.toLowerCase() === meta.cleanTitle.toLowerCase()) return true;
      return false;
    });

    if (existing && existing.status === 'ready' && existing._count.chunks > 0) {
      skippedCount++;
      continue;
    }

    console.log(`\n[${i + 1}/${candidates.length}] 🎧 Procesando: "${meta.cleanTitle}" (${meta.author})`);
    console.log(`   Archivo: ${filename} | Categoría: ${meta.category}`);

    try {
      // 1. Transcribir (o leer cache en disco)
      const { fullText } = await transcribeFileWithWhisper(audioPath, jsonPath);

      if (!fullText || fullText.trim().length < 50) {
        console.warn(`   ⚠️ Transcripción vacía o irrelevante. Omitiendo.`);
        skippedCount++;
        continue;
      }

      // 2. Chunks
      const rawChunks = chunkText(fullText, 1200, 150);
      console.log(`   ✓ Generando ${rawChunks.length} chunks y embeddings bge-m3 en GPU...`);

      // 3. Crear o actualizar Document en Prisma
      let docId = existing ? existing.id : null;
      if (docId) {
        await prisma.chunk.deleteMany({ where: { documentId: docId } });
        await prisma.document.update({
          where: { id: docId },
          data: {
            title: meta.cleanTitle,
            category: meta.category,
            source: audioPath,
            content: fullText.slice(0, 50000),
            status: 'indexing',
          },
        });
      } else {
        const newDoc = await prisma.document.create({
          data: {
            title: meta.cleanTitle,
            category: meta.category,
            source: audioPath,
            content: fullText.slice(0, 50000),
            status: 'indexing',
          },
        });
        docId = newDoc.id;
      }

      // 4. Vectorización en GPU por lotes de 8
      const BATCH_SIZE = 8;
      const tStartEmbed = Date.now();
      for (let b = 0; b < rawChunks.length; b += BATCH_SIZE) {
        const batch = rawChunks.slice(b, b + BATCH_SIZE);
        const vectors = await Promise.all(batch.map(c => getEmbedding(c)));

        for (let j = 0; j < batch.length; j++) {
          const chunkIdx = b + j + 1;
          await prisma.chunk.create({
            data: {
              documentId: docId,
              content: batch[j],
              embeddingId: `audio-${docId}-${chunkIdx}`,
              metadata: JSON.stringify({
                audiobook: true,
                docTitle: meta.cleanTitle,
                author: meta.author,
                index: chunkIdx,
                vector: vectors[j],
              }),
            },
          });
        }
      }

      await prisma.document.update({
        where: { id: docId },
        data: {
          status: 'ready',
          progressIndex: 100.0,
          progressEmbed: 100.0,
        },
      });

      const elapsed = ((Date.now() - tStartEmbed) / 1000).toFixed(1);
      console.log(`   ✅ [ID: ${docId}] "${meta.cleanTitle}" indexado con ${rawChunks.length} chunks en ${elapsed}s.`);
      processedCount++;
    } catch (err) {
      console.error(`   ❌ Error procesando "${filename}": ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n========================================================================');
  console.log('🎉 RESUMEN FINAL DE INGESTA DE AUDIOLIBROS');
  console.log('========================================================================');
  console.log(`• Audiolibros procesados:   ${processedCount}`);
  console.log(`• Ya existentes en BD:      ${skippedCount}`);
  console.log(`• Errores:                  ${errorCount}`);
  console.log('========================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
