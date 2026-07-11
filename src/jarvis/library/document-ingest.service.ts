import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { EmbeddingsService } from './embeddings.service';

// pdf-parse: diagnóstico de exportación en runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseModule = require('pdf-parse');

// Log de diagnóstico — visible en logs al arrancar el servidor
const _pdfModuleType   = typeof pdfParseModule;
const _pdfDefaultType  = typeof pdfParseModule?.default;
const _pdfKeys         = Object.keys(pdfParseModule ?? {}).slice(0, 10).join(', ');
console.log(`[pdf-parse:init] module type=${_pdfModuleType} | default type=${_pdfDefaultType} | keys=[${_pdfKeys}]`);

// Resolver la función correcta según la estructura real del módulo
const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }> =
  typeof pdfParseModule === 'function'
    ? pdfParseModule
    : typeof pdfParseModule?.default === 'function'
      ? pdfParseModule.default
      : typeof pdfParseModule?.pdf === 'function'
        ? pdfParseModule.pdf
        : pdfParseModule; // último recurso — fallará con el error original si no es función

export interface IngestResult {
  documentId: number;
  title: string;
  chunks: number;
  category?: string;
}

@Injectable()
export class DocumentIngestService {
  private readonly logger = new Logger(DocumentIngestService.name);

  // Tamaño de chunk en caracteres (overlap del 10%)
  private readonly CHUNK_SIZE    = 800;
  private readonly CHUNK_OVERLAP = 80;

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  // ── Ingesta desde texto plano o markdown ────────────────────────────────────

  async ingestText(
    title: string,
    content: string,
    category?: string,
    source?: string,
  ): Promise<IngestResult> {
    const doc = await this.documentRepo.createDocument({ title, content, category, source });
    const chunks = await this.buildAndSaveChunks(doc.id, content);

    this.logger.log(`[library] ingestado "${title}" — ${chunks} chunks`);
    return { documentId: doc.id, title, chunks, category };
  }

  // ── Ingesta desde buffer de PDF ─────────────────────────────────────────────

  async ingestPdf(
    buffer: Buffer,
    title: string,
    category?: string,
    source?: string,
  ): Promise<IngestResult> {
    this.logger.log(`[pdf:incoming] título="${title}" | tamaño=${buffer.length} bytes | categoría=${category ?? 'pdf'}`);
    this.logger.log(`[pdf:parser] función disponible=${typeof pdfParse === 'function'} | tipo=${typeof pdfParse}`);

    let text: string;
    try {
      this.logger.log(`[pdf:parse] iniciando extracción de texto...`);
      const parsed = await pdfParse(buffer);
      this.logger.log(`[pdf:parse] OK — páginas=${parsed.numpages} | chars=${parsed.text?.length ?? 0}`);
      text = parsed.text?.trim();
      if (!text) throw new Error('PDF sin texto extraíble (puede ser un PDF escaneado/imagen)');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[pdf:parse] ERROR en "${title}": ${msg}`);
      this.logger.error(`[pdf:parse] pdfParseModule keys: ${Object.keys(pdfParseModule ?? {}).join(', ')}`);
      throw new BadRequestException(`No pude extraer texto del PDF: ${msg}`);
    }

    const doc = await this.documentRepo.createDocument({
      title,
      content:  text,
      category: category ?? 'pdf',
      source,
    });

    const chunks = await this.buildAndSaveChunks(doc.id, text);
    this.logger.log(`[library] PDF "${title}" ingestado — ${chunks} chunks`);
    return { documentId: doc.id, title, chunks, category: category ?? 'pdf' };
  }

  // ── Ingesta desde URL (Scraping) ─────────────────────────────────────────────

  async ingestUrl(
    url: string,
    category?: string,
  ): Promise<IngestResult> {
    let html: string;
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Jarvis/1.0',
        },
      });
      html = response.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`No pude descargar la URL: ${msg}`);
    }

    const $ = cheerio.load(html);
    
    // Remover elementos no deseados
    $('script, style, noscript, nav, footer, header, iframe').remove();
    
    let title = $('title').text().trim() || url;
    let text = $('body').text();
    
    // Limpiar texto
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) throw new BadRequestException('No se pudo extraer texto de la página');

    return this.ingestText(title, text, category ?? 'web', url);
  }

  // ── Chunking deslizante ─────────────────────────────────────────────────────

  private async buildAndSaveChunks(documentId: number, content: string): Promise<number> {
    const chunks = this.splitIntoChunks(content);
    for (const [i, chunkContent] of chunks.entries()) {
      let embeddingStr: string | null = null;
      try {
        const vec = await this.embeddingsService.generateEmbedding(chunkContent);
        embeddingStr = JSON.stringify(vec); // Fallback store as string
      } catch (err) {
        this.logger.warn(`No se pudo generar el embedding para chunk ${i}: ${err.message}`);
      }

      await this.documentRepo.createChunk({
        documentId,
        content: chunkContent,
        embeddingId: embeddingStr,
        metadata: { chunkIndex: i, totalChunks: chunks.length },
      });
    }
    return chunks.length;
  }

  private splitIntoChunks(text: string): string[] {
    // Primero intenta dividir por párrafos
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 30);

    const chunks: string[] = [];

    for (const para of paragraphs) {
      if (para.length <= this.CHUNK_SIZE) {
        chunks.push(para);
      } else {
        // Párrafo largo: ventana deslizante
        let start = 0;
        while (start < para.length) {
          const end = Math.min(start + this.CHUNK_SIZE, para.length);
          chunks.push(para.slice(start, end).trim());
          start += this.CHUNK_SIZE - this.CHUNK_OVERLAP;
        }
      }
    }

    return chunks.filter((c) => c.length > 20);
  }
}
