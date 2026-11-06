import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentRepository } from '../repositories/document.repository';
import { EmbeddingsService } from './embeddings.service';
import { OllamaProvider } from '../llm/ollama.provider';
import { DocumentSynthesisService } from './document-synthesis.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
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
  private readonly baseDir: string;
  private readonly transcriptDir: string;
  private readonly scriptPath: string;
  private static readonly ALLOWED_AUDIO_EXTENSIONS = new Set([
    '.mp3',
    '.m4a',
    '.mp4',
    '.wav',
    '.ogg',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentRepo: DocumentRepository,
    private readonly embeddingsService: EmbeddingsService,
    private readonly ollamaProvider: OllamaProvider,
    private readonly synthesisService: DocumentSynthesisService,
  ) {
    this.baseDir = path.resolve(
      process.env.JARBEES_AUDIOBOOKS_DIR || 'I:\\Musica\\Audiolibros y mas',
    );
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
   * Valida y resuelve de forma canónica una ruta de audiolibro (DEV-001-B1: SEC-02).
   * - Rechaza rutas UNC, secuencias de traversal (..), bytes nulos y extensiones fuera de whitelist
   *   ANTES de realizar cualquier consulta al sistema de archivos (elimina el oráculo de archivos).
   * - Comprueba que la ruta canónica real (resolviendo enlaces simbólicos / junctions) permanezca
   *   estrictamente confinada dentro de baseDir.
   */
  validateAuthorizedAudioPath(rawFilePath: string): string {
    if (!rawFilePath || typeof rawFilePath !== 'string') {
      throw new ForbiddenException(
        'SecurityKernel: ruta de archivo inválida o vacía.',
      );
    }

    const trimmed = rawFilePath.trim();
    if (
      trimmed.length === 0 ||
      trimmed.includes('\0') ||
      /^(\\\\|\/\/)/.test(trimmed) ||
      /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(trimmed)
    ) {
      throw new ForbiddenException(
        'SecurityKernel: acceso denegado. Se detectó traversal, ruta UNC o formato prohibido.',
      );
    }

    const ext = path.extname(trimmed).toLowerCase();
    if (!AudiobookIngestService.ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
      throw new ForbiddenException(
        'SecurityKernel: acceso denegado. Extensión de archivo no autorizada para ingesta de audio.',
      );
    }

    const canonicalBase = path.resolve(this.baseDir);
    const resolvedCandidate = path.resolve(canonicalBase, trimmed);

    const isInsideLexically = this.isSubPath(canonicalBase, resolvedCandidate);
    if (!isInsideLexically) {
      throw new ForbiddenException(
        'SecurityKernel: acceso denegado. La ruta solicitada está fuera del directorio autorizado.',
      );
    }

    // DEV-001-B1.1 (F-B1-08): Resolver realpathSync y verificar confinamiento canónico ANTES de
    // distinguir errores de existencia, unificando todas las respuestas de rechazo en 403 Forbidden
    // para eliminar cualquier oráculo secundario sobre junctions o directorios intermedios.
    let realBase: string;
    let realTarget: string;
    try {
      realBase = fs.realpathSync(canonicalBase);
      realTarget = fs.realpathSync(resolvedCandidate);
    } catch {
      throw new ForbiddenException(
        'SecurityKernel: acceso denegado. El archivo de audiolibro no está autorizado o no es accesible dentro del directorio confinado.',
      );
    }

    if (!this.isSubPath(realBase, realTarget)) {
      throw new ForbiddenException(
        'SecurityKernel: acceso denegado. La ruta canónica real escapa del directorio autorizado.',
      );
    }

    let candidateLstat: fs.Stats;
    let targetLstat: fs.Stats;
    try {
      candidateLstat = fs.lstatSync(resolvedCandidate);
      targetLstat = fs.lstatSync(realTarget);
    } catch {
      throw new ForbiddenException(
        'SecurityKernel: acceso denegado. El archivo de audiolibro no está autorizado o no es accesible dentro del directorio confinado.',
      );
    }

    if (
      candidateLstat.isSymbolicLink() ||
      !candidateLstat.isFile() ||
      targetLstat.isSymbolicLink() ||
      !targetLstat.isFile()
    ) {
      throw new ForbiddenException(
        'SecurityKernel: acceso denegado. Se rechazan enlaces simbólicos, junctions o directorios.',
      );
    }

    return realTarget;
  }

  /**
   * Abre el archivo validado por descriptor (fd), verifica invariancia de inodo/dispositivo (fstat === lstat)
   * y genera una copia efímera aislada desde el fd para el subproceso Python, cerrando la ventana TOCTOU (F-B1-08).
   */
  stageVerifiedAudioFileForSubprocess(safeFilePath: string): {
    stagedPath: string;
    cleanup: () => void;
  } {
    const lstat = fs.lstatSync(safeFilePath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      throw new ForbiddenException(
        'SecurityKernel: TOCTOU detectado antes de abrir descriptor de audio.',
      );
    }

    const fd = fs.openSync(safeFilePath, fs.constants.O_RDONLY);
    let stagedPath = '';
    try {
      const fstat = fs.fstatSync(fd);
      if (
        !fstat.isFile() ||
        fstat.dev !== lstat.dev ||
        (lstat.ino !== 0 && fstat.ino !== 0 && fstat.ino !== lstat.ino) ||
        fstat.size !== lstat.size
      ) {
        throw new ForbiddenException(
          'SecurityKernel: discrepancia TOCTOU entre lstat y fstat en el descriptor de archivo.',
        );
      }

      const ext = path.extname(safeFilePath).toLowerCase();
      const randomId = crypto.randomBytes(12).toString('hex');
      stagedPath = path.join(os.tmpdir(), `jarbees_audio_stage_${randomId}${ext}`);

      const outFd = fs.openSync(
        stagedPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        0o600,
      );
      try {
        const buffer = Buffer.allocUnsafe(64 * 1024);
        let bytesRead = 0;
        let position = 0;
        while (
          (bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position)) > 0
        ) {
          fs.writeSync(outFd, buffer, 0, bytesRead);
          position += bytesRead;
        }
      } finally {
        fs.closeSync(outFd);
      }
    } finally {
      fs.closeSync(fd);
    }

    return {
      stagedPath,
      cleanup: () => {
        if (stagedPath && fs.existsSync(stagedPath)) {
          try {
            fs.unlinkSync(stagedPath);
          } catch {
            // Ignorar error de limpieza efímera
          }
        }
      },
    };
  }

  private isSubPath(parentDir: string, targetPath: string): boolean {
    const normParent =
      process.platform === 'win32'
        ? path.resolve(parentDir).toLowerCase()
        : path.resolve(parentDir);
    const normTarget =
      process.platform === 'win32'
        ? path.resolve(targetPath).toLowerCase()
        : path.resolve(targetPath);

    const rel = path.relative(normParent, normTarget);
    return (
      Boolean(rel) &&
      !rel.startsWith('..') &&
      !path.isAbsolute(rel) &&
      !rel.startsWith('_transcripciones')
    );
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
    const safeFilePath = this.validateAuthorizedAudioPath(filePath);
    const filename = path.basename(safeFilePath);
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
    const staged = this.stageVerifiedAudioFileForSubprocess(safeFilePath);

    try {
      const { stdout } = await execFileAsync(pythonExe, [
        this.scriptPath,
        '--input',
        staged.stagedPath,
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
    } finally {
      staged.cleanup();
    }
  }

  /**
   * Ingesta completa de un audiolibro hacia la base de datos de JarBees (Texto, Chunks, Embeddings e Insights)
   */
  async ingestAudiobook(
    filePath: string,
    categoryOverride?: string,
  ): Promise<AudiobookIngestResult> {
    const safeFilePath = this.validateAuthorizedAudioPath(filePath);

    const filename = path.basename(safeFilePath);
    const meta = this.inferMetadata(filename);
    const category = categoryOverride || meta.category;

    // 1. Transcripción (o recuperación de disco)
    const { fullText, audioDurationSec, transcriptionDurationSec, cached } =
      await this.transcribeAudio(safeFilePath);

    if (!fullText || fullText.trim().length === 0) {
      throw new BadRequestException('El archivo de audio no generó texto transcribible.');
    }

    // 2. Comprobar si ya existe el documento en la base de datos
    let doc = await this.prisma.document.findFirst({
      where: {
        OR: [
          { title: { equals: meta.cleanTitle, mode: 'insensitive' } },
          { source: safeFilePath },
        ],
      },
    });

    if (!doc) {
      doc = await this.prisma.document.create({
        data: {
          title: meta.cleanTitle,
          content: fullText,
          category,
          source: safeFilePath,
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
