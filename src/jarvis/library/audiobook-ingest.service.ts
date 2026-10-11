import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentRepository } from '../repositories/document.repository';
import { EmbeddingsService } from './embeddings.service';
import { OllamaProvider } from '../llm/ollama.provider';
import { DocumentSynthesisService } from './document-synthesis.service';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface AudiobookItem {
  id: string;
  name: string;
  cleanTitle: string;
  author: string;
  suggestedCategory: string;
  sizeMB: number;
  filePath: string;
  extension: string;
  isTranscribed: boolean;
  isIngested: boolean;
  documentId?: number;
}

export interface AudiobookIngestResult {
  success: boolean;
  documentId: number;
  title: string;
  author: string;
  category: string;
  totalChunks: number;
  audioDurationSec: number;
  transcriptionDurationSec: number;
  cached: boolean;
}

@Injectable()
export class AudiobookIngestService {
  private readonly logger = new Logger(AudiobookIngestService.name);
  private readonly baseDir = 'I:\\Musica\\Audiolibros y mas';
  private readonly transcriptDir: string;
  private readonly scriptPath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentRepo: DocumentRepository,
    private readonly embeddingsService: EmbeddingsService,
    private readonly ollamaProvider: OllamaProvider,
    private readonly synthesisService: DocumentSynthesisService,
  ) {
    this.transcriptDir = path.join(this.baseDir, '_transcripciones');
    this.scriptPath = path.join(process.cwd(), 'scripts', 'transcribe_audiobook.py');

    if (!fs.existsSync(this.transcriptDir) && fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.transcriptDir, { recursive: true });
      } catch (err) {
        this.logger.warn(`No se pudo crear carpeta de transcripciones: ${err.message}`);
      }
    }
  }

  /**
   * Lista todos los audiolibros disponibles en I:\Musica\Audiolibros y mas
   */
  async listAvailableAudiobooks(): Promise<AudiobookItem[]> {
    if (!fs.existsSync(this.baseDir)) {
      return [];
    }

    const audioExtensions = new Set(['.mp3', '.m4a', '.mp4', '.wav', '.ogg']);
    const files: string[] = [];

    const scanDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory() && entry.name !== '_transcripciones') {
            scanDir(full);
          } else if (entry.isFile() && audioExtensions.has(path.extname(entry.name).toLowerCase())) {
            files.push(full);
          }
        }
      } catch (e) {
        this.logger.warn(`Error leyendo directorio ${dir}: ${e.message}`);
      }
    };

    scanDir(this.baseDir);

    const existingDocs = await this.prisma.document.findMany({
      select: { id: true, title: true, source: true },
    });
    const docSourceMap = new Map(
      existingDocs
        .filter((d) => d.source)
        .map((d) => [d.source!.toLowerCase().trim(), d.id]),
    );
    const docTitleMap = new Map(
      existingDocs.map((d) => [d.title.toLowerCase().trim(), d.id]),
    );

    return files.map((filePath) => {
      const filename = path.basename(filePath);
      const ext = path.extname(filename).toLowerCase();
      const stats = fs.statSync(filePath);
      const sizeMB = Math.round((stats.size / (1024 * 1024)) * 10) / 10;

      const { cleanTitle, author, category } = this.inferMetadata(filename);

      const safeSlug = this.sanitizeSlug(filename);
      const transcriptJson = path.join(this.transcriptDir, `${safeSlug}.json`);
      const isTranscribed = fs.existsSync(transcriptJson);

      const matchingDocId =
        docSourceMap.get(filePath.toLowerCase().trim()) ||
        docTitleMap.get(cleanTitle.toLowerCase().trim());

      return {
        id: safeSlug,
        name: filename,
        cleanTitle,
        author,
        suggestedCategory: category,
        sizeMB,
        filePath,
        extension: ext,
        isTranscribed,
        isIngested: !!matchingDocId,
        documentId: matchingDocId,
      };
    });
  }

  /**
   * Transcribe un archivo de audio con faster-whisper respetando cache en disco
   */
  async transcribeAudio(
    filePath: string,
    modelSize = 'base',
  ): Promise<{ fullText: string; audioDurationSec: number; transcriptionDurationSec: number; cached: boolean }> {
    const filename = path.basename(filePath);
    const safeSlug = this.sanitizeSlug(filename);
    const outJsonPath = path.join(this.transcriptDir, `${safeSlug}.json`);

    // Regla: Comprobar cache en disco
    if (fs.existsSync(outJsonPath) && fs.statSync(outJsonPath).size > 0) {
      try {
        const cached = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
        this.logger.log(`[Audiobook] Reutilizando transcripción en caché para "${filename}"`);
        return {
          fullText: cached.fullText || '',
          audioDurationSec: cached.audioDurationSec || 0,
          transcriptionDurationSec: cached.transcriptionDurationSec || 0,
          cached: true,
        };
      } catch (err) {
        this.logger.warn(`Error leyendo caché de ${outJsonPath}: ${err.message}`);
      }
    }

    this.logger.log(`[Audiobook] Iniciando transcripción con faster-whisper (${modelSize}) de: "${filename}"`);
    const pythonExe = 'python';

    try {
      const { stdout } = await execFileAsync(pythonExe, [
        this.scriptPath,
        '--input',
        filePath,
        '--output',
        outJsonPath,
        '--model',
        modelSize,
      ]);

      const parsed = JSON.parse(stdout.trim());
      const data = fs.existsSync(outJsonPath)
        ? JSON.parse(fs.readFileSync(outJsonPath, 'utf8'))
        : { fullText: '' };

      return {
        fullText: data.fullText || '',
        audioDurationSec: parsed.audioDurationSec || 0,
        transcriptionDurationSec: parsed.transcriptionDurationSec || 0,
        cached: false,
      };
    } catch (err) {
      this.logger.error(`Error ejecutando transcripción en Python: ${err.message}`);
      throw new BadRequestException(`Fallo en transcripción del audiolibro: ${err.message}`);
    }
  }

  /**
   * Ingesta completa de un audiolibro hacia la base de datos de JarBees (Texto, Chunks, Embeddings e Insights)
   */
  async ingestAudiobook(
    filePath: string,
    categoryOverride?: string,
  ): Promise<AudiobookIngestResult> {
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(`Archivo de audio no encontrado: ${filePath}`);
    }

    const filename = path.basename(filePath);
    const meta = this.inferMetadata(filename);
    const category = categoryOverride || meta.category;

    // 1. Transcripción (o recuperación de disco)
    const { fullText, audioDurationSec, transcriptionDurationSec, cached } =
      await this.transcribeAudio(filePath);

    if (!fullText || fullText.trim().length === 0) {
      throw new BadRequestException('El archivo de audio no generó texto transcribible.');
    }

    // 2. Comprobar si ya existe el documento en la base de datos
    let doc = await this.prisma.document.findFirst({
      where: {
        OR: [
          { title: { equals: meta.cleanTitle, mode: 'insensitive' } },
          { source: filePath },
        ],
      },
    });

    if (!doc) {
      doc = await this.prisma.document.create({
        data: {
          title: meta.cleanTitle,
          content: fullText,
          category,
          source: filePath,
          status: 'indexing',
        },
      });
      this.logger.log(`[Audiobook] Documento creado en BD (ID: ${doc.id}) "${meta.cleanTitle}"`);
    } else {
      this.logger.log(`[Audiobook] Documento ya existente en BD (ID: ${doc.id}), actualizando chunks.`);
      await this.prisma.chunk.deleteMany({ where: { documentId: doc.id } });
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { content: fullText, status: 'indexing' },
      });
    }

    // 3. Crear chunks semánticos (~1000 caracteres con solapamiento)
    const rawChunks = this.chunkText(fullText, 1000, 150);
    this.logger.log(`[Audiobook] Creando ${rawChunks.length} chunks y vectores bge-m3...`);

    const createdChunks: { id: number; content: string }[] = [];
    for (let i = 0; i < rawChunks.length; i++) {
      const c = rawChunks[i];
      const chunkRecord = await this.documentRepo.createChunk({
        documentId: doc.id,
        content: c,
        metadata: {
          audiobook: true,
          chunkIndex: i,
          totalChunks: rawChunks.length,
          author: meta.author,
          sourceFile: filename,
        },
      });
      createdChunks.push({ id: chunkRecord.id, content: c });
    }

    // 4. Generar embeddings y guardar en pgvector (límite de concurrencia = 3)
    const limit = 3;
    let idx = 0;
    const worker = async () => {
      while (idx < createdChunks.length) {
        const chunk = createdChunks[idx++];
        try {
          const vector = await this.embeddingsService.generateEmbedding(chunk.content);
          await this.documentRepo.saveChunkEmbedding(chunk.id, vector);
        } catch (embErr) {
          this.logger.warn(`Fallo en embedding para chunk ${chunk.id}: ${embErr.message}`);
        }
      }
    };

    const workers = Array.from({ length: Math.min(limit, createdChunks.length) }, () => worker());
    await Promise.all(workers);

    // 5. Marcar documento como ready
    await this.documentRepo.updateDocumentStatus(doc.id, 'ready');

    // 6. Generar DocumentInsight cognitivo
    try {
      await this.synthesisService.synthesizeDocument(doc.id, category, true);
    } catch (synthErr) {
      this.logger.warn(`No se pudo generar insight inmediato: ${synthErr.message}`);
    }

    this.logger.log(`✅ [Audiobook] "${meta.cleanTitle}" ingestado exitosamente con ${createdChunks.length} chunks.`);

    return {
      success: true,
      documentId: doc.id,
      title: meta.cleanTitle,
      author: meta.author,
      category,
      totalChunks: createdChunks.length,
      audioDurationSec,
      transcriptionDurationSec,
      cached,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private inferMetadata(filename: string): { cleanTitle: string; author: string; category: string } {
    const raw = filename.replace(/\.(mp3|m4a|mp4|wav|ogg)$/i, '').trim();

    let author = 'Desconocido';
    let category = 'Filosofía';
    let title = raw;

    if (/ramacharaka/i.test(raw)) {
      author = 'Yogi Ramacharaka';
      category = 'Yoga';
    } else if (/leadbeater/i.test(raw)) {
      author = 'Charles Webster Leadbeater';
      category = 'Esoterismo';
    } else if (/powell/i.test(raw)) {
      author = 'Arthur E. Powell';
      category = 'Esoterismo';
    } else if (/bailey/i.test(raw)) {
      author = 'Alice A. Bailey';
      category = 'Esoterismo';
    } else if (/steiner/i.test(raw)) {
      author = 'Rudolf Steiner';
      category = 'Antroposofía';
    } else if (/haramein/i.test(raw)) {
      author = 'Nassim Haramein';
      category = 'Ciencia';
    } else if (/kardec/i.test(raw)) {
      author = 'Allan Kardec';
      category = 'Parapsicología';
    } else if (/adoum/i.test(raw)) {
      author = 'Jorge Elías Adoum';
      category = 'Esoterismo';
    } else if (/samael|weor/i.test(raw)) {
      author = 'Samael Aun Weor';
      category = 'Esoterismo';
    } else if (/parise/i.test(raw)) {
      author = 'José Luis Parise';
      category = 'Psicoanálisis y Hermetismo';
    } else if (/anunnaki|sumeria|tiamat|marduk/i.test(raw)) {
      author = 'Tradición Sumeria';
      category = 'Mitología e Historia Antigua';
    } else if (/mesmer|zweig/i.test(raw)) {
      author = 'Stefan Zweig';
      category = 'Historia y Psicología';
    } else if (/sankaracharya|shankaracharya/i.test(raw)) {
      author = 'Adi Shankaracharya';
      category = 'Filosofía Oriental';
    }

    // Limpiar patrones de títulos comunes
    title = raw
      .replace(/^y2mate\.com\s*-\s*/i, '')
      .replace(/\(AUDIOLIBRO\).*/i, '')
      .replace(/Audio\s*Libro\s*Completo.*/i, '')
      .replace(/_[A-Za-z0-9_-]{10,}_[0-9]+p/g, '')
      .replace(/^\d+[-_]/, '')
      .trim();

    return { cleanTitle: title, author, category };
  }

  private sanitizeSlug(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80);
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
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

  /**
   * Ingesta por lotes de todos los audiolibros disponibles.
   * Filtra archivos de meditación/sonido puro si se desea, procesa secuencialmente
   * respetando la persistencia incremental y caché en disco.
   */
  async ingestAllAvailableAudiobooks(options?: {
    skipPureAmbient?: boolean;
    maxFiles?: number;
  }): Promise<{
    totalScanned: number;
    processed: number;
    skippedAlreadyIngested: number;
    errors: Array<{ file: string; error: string }>;
    results: AudiobookIngestResult[];
  }> {
    const list = await this.listAvailableAudiobooks();
    const results: AudiobookIngestResult[] = [];
    const errors: Array<{ file: string; error: string }> = [];
    let skippedAlreadyIngested = 0;

    const ambientFilter = /sonido 8d|olas del mar|playamar|tambor chamanico|canales|frecuencia/i;

    const targetList = list.filter((item) => {
      if (options?.skipPureAmbient && ambientFilter.test(item.name)) {
        return false;
      }
      return true;
    });

    const toProcess = options?.maxFiles ? targetList.slice(0, options.maxFiles) : targetList;

    this.logger.log(`[Batch Audiobook] Iniciando ingesta en lote de ${toProcess.length} archivos de audio...`);

    for (const item of toProcess) {
      if (item.isIngested) {
        this.logger.log(`[Batch Audiobook] Omitiendo "${item.name}" (ya ingestado en BD, ID: ${item.documentId})`);
        skippedAlreadyIngested++;
        continue;
      }

      try {
        this.logger.log(`[Batch Audiobook] Procesando: "${item.name}" (${item.sizeMB} MB)...`);
        const result = await this.ingestAudiobook(item.filePath, item.suggestedCategory);
        results.push(result);
      } catch (err: any) {
        this.logger.error(`[Batch Audiobook] Error en "${item.name}": ${err.message}`);
        errors.push({ file: item.name, error: err.message });
      }
    }

    return {
      totalScanned: list.length,
      processed: results.length,
      skippedAlreadyIngested,
      errors,
      results,
    };
  }
}
