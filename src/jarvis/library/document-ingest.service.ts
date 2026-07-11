import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { EmbeddingsService } from './embeddings.service';
import { OllamaProvider } from '../llm/ollama.provider';
import { DocumentEnrichmentService } from './document-enrichment.service';

// pdf-parse v2: API basada en clase — new PDFParse({ data: buffer }).getText()
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');

export interface IngestResult {
  documentId: number;
  title: string;
  chunks: number;
  category?: string;
  answer?: string; // resumen o respuesta a la pregunta del usuario
}

@Injectable()
export class DocumentIngestService {
  private readonly logger = new Logger(DocumentIngestService.name);

  private readonly CHUNK_SIZE    = 800;
  private readonly CHUNK_OVERLAP = 80;

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly embeddingsService: EmbeddingsService,
    private readonly ollamaProvider: OllamaProvider,
    private readonly enrichmentService: DocumentEnrichmentService,
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
    question?: string,
  ): Promise<IngestResult> {
    this.logger.log(`[pdf:incoming] título="${title}" | tamaño=${buffer.length} bytes`);

    let text: string;
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      this.logger.log(`[pdf:parse] OK — páginas=${result.total ?? '?'} | chars=${result.text?.length ?? 0}`);
      text = result.text?.trim();
      if (!text) throw new Error('PDF sin texto extraíble (puede ser un PDF escaneado/imagen)');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[pdf:parse] ERROR en "${title}": ${msg}`);
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

    // Enriquecimiento en background — no bloquea la respuesta al usuario
    this.enrichmentService.enrich(doc.id, title, text).catch((err) => {
      this.logger.warn(`[enrichment] error background en "${title}": ${err?.message ?? err}`);
    });

    // Generar respuesta con el contenido del PDF
    const answer = await this.answerFromText(text, title, question);

    return { documentId: doc.id, title, chunks, category: category ?? 'pdf', answer };
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

  // ── Respuesta con LLM sobre el contenido del documento ─────────────────────

  private async answerFromText(text: string, title: string, question?: string): Promise<string> {
    // Limitar el texto al modelo — usar los primeros 6000 chars para no saturar el contexto
    const excerpt = text.length > 6000
      ? text.slice(0, 6000) + '\n\n[... contenido truncado ...]'
      : text;

    const systemPrompt = `Sos un asistente experto en análisis de documentos. 
Respondé siempre en español argentino, de forma clara y estructurada.
Si el usuario hizo una pregunta, respondela exclusivamente con el contenido del documento.
Si no hizo pregunta, generá un resumen completo del documento.`;

    const userPrompt = question
      ? `Documento: "${title}"\n\n${excerpt}\n\n---\nPregunta del usuario: ${question}`
      : `Hacé un resumen completo y estructurado del siguiente documento: "${title}"\n\n${excerpt}`;

    this.logger.log(`[pdf:llm] generando ${question ? 'respuesta a pregunta' : 'resumen'} para "${title}"`);

    try {
      const response = await this.ollamaProvider.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        maxTokens: 800,
      });
      return response.content;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[pdf:llm] no se pudo generar respuesta: ${msg}`);
      return `✅ PDF "${title}" guardado correctamente (${text.length} chars). El modelo LLM no estaba disponible para generar un resumen.`;
    }
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
