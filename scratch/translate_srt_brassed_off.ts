import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

interface SrtBlock {
  index: number;
  timeframe: string;
  lines: string[];
}

const inputPath = 'C:\\Users\\nacho\\Downloads\\Brassed Off (1996)\\Brassed-Off-1996-1080p-BluRay.srt';
const outputDownloadsPath = 'C:\\Users\\nacho\\Downloads\\Brassed Off (1996)\\Brassed-Off-1996-1080p-BluRay.es.srt';
const outputStoragePath = path.join(process.cwd(), 'storage', 'translated', 'Brassed-Off-1996-1080p-BluRay_es.srt');
const cachePath = path.join(process.cwd(), 'scratch', 'brassed_off_srt_cache.json');

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const model = process.env.OLLAMA_TRADUCTOR_MODEL || 'RogerBen/hy-mt1.5-1.8b:latest';

function parseSrt(filePath: string): SrtBlock[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawBlocks = normalized.split(/\n\n+/);

  const blocks: SrtBlock[] = [];

  for (const raw of rawBlocks) {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length >= 2 && lines[1].includes('-->')) {
      const index = parseInt(lines[0], 10);
      const timeframe = lines[1];
      const textLines = lines.slice(2);
      blocks.push({
        index,
        timeframe,
        lines: textLines
      });
    }
  }

  return blocks;
}

function loadCache(): Record<number, string> {
  if (fs.existsSync(cachePath)) {
    try {
      const data = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.warn('[Cache] Error reading cache file, starting fresh.');
    }
  }
  return {};
}

function saveCache(cache: Record<number, string>) {
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

async function translateSingle(text: string): Promise<string> {
  const system = `You are a professional film subtitle translator (English to Spanish).
Translate accurately into natural Spanish. Keep speaker tags like "MAN:" or "DANNY:".
Translate sound effects like "(HONKING HORN)" to "(BOCINAZO)".
Output ONLY the Spanish translation line, with no explanations or extra formatting.`;

  try {
    const res = await axios.post(`${ollamaHost}/api/generate`, {
      model,
      system,
      prompt: `Translate this subtitle text to Spanish:\n${text}`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 256
      }
    }, { timeout: 30000 });

    let translated = res.data?.response?.trim() || text;
    translated = translated.replace(/^Traducción:\s*/i, '').trim();
    return translated;
  } catch (err: any) {
    console.error(`Single translation failed for "${text}":`, err?.message || err);
    return text; // Fallback to original text if error
  }
}

async function translateBatch(blocksBatch: SrtBlock[]): Promise<Record<number, string>> {
  const result: Record<number, string> = {};
  
  const formattedLines = blocksBatch.map(b => {
    const joinedText = b.lines.join(' / ');
    return `[${b.index}] ${joinedText}`;
  }).join('\n');

  const system = `You are a professional film subtitle translator translating English movie subtitles into natural Spanish.
Translate each line accurately.
Keep the exact line number prefix like [1], [2], etc.
Preserve speaker names like "DANNY:" or "MAN:".
Translate sound effects in parentheses like "(HONKING HORN)" to "(BOCINAZO)".
Keep multi-line subtitle breaks marked with "/".
Output ONLY the translated items formatted as:
[ID] Spanish translation
Do not add commentary, chat, or extra text.`;

  const prompt = `Translate the following subtitle lines to Spanish:\n\n${formattedLines}`;

  try {
    const res = await axios.post(`${ollamaHost}/api/generate`, {
      model,
      system,
      prompt,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 2048
      }
    }, { timeout: 60000 });

    const rawResponse = res.data?.response || '';
    const lines = rawResponse.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s*\[(\d+)\]\s*(.+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const translatedText = match[2].trim();
        result[id] = translatedText;
      }
    }
  } catch (err: any) {
    console.warn(`Batch translation request failed: ${err?.message || err}`);
  }

  // Fallback check for missing items in batch
  for (const block of blocksBatch) {
    if (!result[block.index] || result[block.index].trim().length === 0) {
      const originalJoined = block.lines.join(' / ');
      console.log(`[Fallback] Item [${block.index}] missing from batch response. Translating individually...`);
      const singleTr = await translateSingle(originalJoined);
      result[block.index] = singleTr;
    }
  }

  return result;
}

async function main() {
  console.log('=== TRADUCTOR DE SUBTÍTULOS SRT ===');
  console.log(`Modelo Ollama: ${model}`);
  console.log(`Archivo de entrada: ${inputPath}`);

  const blocks = parseSrt(inputPath);
  console.log(`Total de bloques SRT parseados: ${blocks.length}`);

  const cache = loadCache();
  const cachedCount = Object.keys(cache).length;
  console.log(`Bloques previamente traducidos cargados desde disco (.json): ${cachedCount}/${blocks.length}`);

  const BATCH_SIZE = 15;
  const pendingBlocks = blocks.filter(b => !cache[b.index] || cache[b.index].trim().length === 0);

  console.log(`Bloques pendientes por traducir: ${pendingBlocks.length}`);

  const startTime = Date.now();
  let processedCount = cachedCount;

  for (let i = 0; i < pendingBlocks.length; i += BATCH_SIZE) {
    const chunk = pendingBlocks.slice(i, i + BATCH_SIZE);
    const batchStart = Date.now();

    const translatedBatch = await translateBatch(chunk);

    for (const [idStr, translatedText] of Object.entries(translatedBatch)) {
      const id = parseInt(idStr, 10);
      cache[id] = translatedText;
    }

    // PERSISTENCIA INCREMENTAL EN DISCO OBLIGATORIA DESPUÉS DE CADA BATCH
    saveCache(cache);

    processedCount = Object.keys(cache).length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const batchTime = Math.round((Date.now() - batchStart) / 1000);

    console.log(`[Progreso] ${processedCount}/${blocks.length} (${Math.round((processedCount / blocks.length) * 100)}%) | Batch time: ${batchTime}s | Tiempo transcurrido: ${elapsed}s`);
  }

  console.log('\n✅ Traducción completada. Construyendo archivo SRT final con los mismos exactos tiempos originales...');

  // Construir archivo SRT final
  const outputLines: string[] = [];

  for (const block of blocks) {
    outputLines.push(block.index.toString());
    outputLines.push(block.timeframe);

    const translatedRaw = cache[block.index] || block.lines.join('\n');
    // Convert '/' separators back to newlines for multi-line subtitles
    const formattedText = translatedRaw
      .split('/')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n');

    outputLines.push(formattedText);
    outputLines.push(''); // Ligne en blanco separadora
  }

  const finalSrtContent = outputLines.join('\n');

  // Guardar en Downloads
  const targetDir = path.dirname(outputDownloadsPath);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(outputDownloadsPath, finalSrtContent, 'utf-8');
  console.log(`[Salida 1] Guardado en: ${outputDownloadsPath}`);

  // Guardar copia en storage/translated
  const storageDir = path.dirname(outputStoragePath);
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(outputStoragePath, finalSrtContent, 'utf-8');
  console.log(`[Salida 2] Guardado en: ${outputStoragePath}`);

  console.log(`\n🎉 PROCESO FINALIZADO CON ÉXITO.`);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
