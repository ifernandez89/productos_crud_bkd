import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { EmbeddingsService } from './embeddings.service';
import { OllamaProvider } from '../llm/ollama.provider';
import { DocumentEnrichmentService } from './document-enrichment.service';
import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import { PrismaService } from '../../prisma/prisma.service';
import { HierarchicalParserService } from './hierarchical-parser.service';

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

  private readonly CHUNK_SIZE = 1200;
  private readonly CHUNK_OVERLAP = 150;

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly embeddingsService: EmbeddingsService,
    private readonly ollamaProvider: OllamaProvider,
    private readonly enrichmentService: DocumentEnrichmentService,
    private readonly hierarchicalParser: HierarchicalParserService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Ingesta desde texto plano o markdown ────────────────────────────────────

  async ingestText(
    title: string,
    content: string,
    category?: string,
    source?: string,
  ): Promise<IngestResult> {
    // Limpiar título y contenido
    const cleanTitle = this.sanitizeTitle(title);
    const cleanContent = this.sanitizeText(content);

    const detectedCategory =
      category ?? (await this.detectCategory(cleanTitle, cleanContent));
    const doc = await this.documentRepo.createDocument({
      title: cleanTitle,
      content: cleanContent,
      category: detectedCategory,
      source,
      status: 'quarantined',
    });

    if (process.env.SKIP_QUARANTINE === 'true') {
      this.logger.log(
        `Bypassing quarantine for text "${cleanTitle}" because SKIP_QUARANTINE is true`,
      );
      await this.approveDocument(doc.id);
    }

    this.logger.log(
      `[library] ingestado "${cleanTitle}" en cuarentena — categoría: ${detectedCategory}`,
    );
    return {
      documentId: doc.id,
      title: cleanTitle,
      chunks: 0,
      category: detectedCategory,
    };
  }

  // ── Ingesta desde buffer de PDF ─────────────────────────────────────────────

  async ingestPdf(
    buffer: Buffer,
    title: string,
    category?: string,
    source?: string,
    question?: string,
  ): Promise<IngestResult> {
    this.logger.log(
      `[pdf:incoming] título="${title}" | tamaño=${buffer.length} bytes`
    );

    // Validar y sanitizar seguridad estructural del PDF
    const safeBuffer = await this.ensureNoDangerousCatalogActions(
      buffer,
      title,
      source
    );

    let text: string;
    try {
      const parser = new PDFParse({ data: safeBuffer });
      const result = await parser.getText();
      await parser.destroy();
      this.logger.log(
        `[pdf:parse] OK — páginas=${result.total ?? '?'} | chars=${result.text?.length ?? 0}`,
      );
      text = result.text?.trim();
      if (!text)
        throw new Error(
          'PDF sin texto extraíble (puede ser un PDF escaneado/imagen)',
        );

      // Limpiar caracteres nulos y otros caracteres problemáticos para PostgreSQL
      text = this.sanitizeText(text);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[pdf:parse] ERROR en "${title}": ${msg}`);
      throw new BadRequestException(`No pude extraer texto del PDF: ${msg}`);
    }

    // Limpiar el título también (quitando extensiones y caracteres problemáticos)
    const cleanTitle = this.sanitizeTitle(title);
    const detectedCategory =
      category ?? (await this.detectCategory(cleanTitle, text));

    const doc = await this.documentRepo.createDocument({
      title: cleanTitle,
      content: text,
      category: detectedCategory,
      source,
      status: 'quarantined',
    });

    this.logger.log(
      `[library] PDF "${cleanTitle}" ingestado en cuarentena — categoría: ${detectedCategory}`,
    );

    if (process.env.SKIP_QUARANTINE === 'true') {
      this.logger.log(
        `Bypassing quarantine for PDF "${cleanTitle}" because SKIP_QUARANTINE is true`,
      );
      await this.approveDocument(doc.id);
    }

    // Generar respuesta con el contenido del PDF
    const answer = await this.answerFromText(text, cleanTitle, question);

    return {
      documentId: doc.id,
      title: cleanTitle,
      chunks: 0,
      category: detectedCategory,
      answer,
    };
  }

  // ── Ingesta desde URL (Scraping) ─────────────────────────────────────────────

  async ingestUrl(url: string, category?: string): Promise<IngestResult> {
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

    const title = $('title').text().trim() || url;
    let text = $('body').text();

    // Limpiar texto
    text = text.replace(/\s+/g, ' ').trim();
    if (!text)
      throw new BadRequestException('No se pudo extraer texto de la página');

    // Sanitizar antes de guardar
    const cleanTitle = this.sanitizeText(title);
    const cleanText = this.sanitizeText(text);

    const detectedCategory =
      category ?? (await this.detectCategory(cleanTitle, cleanText));
    return this.ingestText(cleanTitle, cleanText, detectedCategory, url);
  }

  // ── Respuesta con LLM sobre el contenido del documento ─────────────────────

  private async answerFromText(
    text: string,
    title: string,
    question?: string,
  ): Promise<string> {
    // Limitar el texto al modelo — usar los primeros 6000 chars para no saturar el contexto
    const excerpt =
      text.length > 6000
        ? text.slice(0, 6000) + '\n\n[... contenido truncado ...]'
        : text;

    const systemPrompt = `Sos un asistente experto en análisis de documentos. 
Respondé siempre en español argentino, de forma clara y estructurada.
Si el usuario hizo una pregunta, respondela exclusivamente con el contenido del documento.
Si no hizo pregunta, generá un resumen completo del documento.`;

    const userPrompt = question
      ? `Documento: "${title}"\n\n${excerpt}\n\n---\nPregunta del usuario: ${question}`
      : `Hacé un resumen completo y estructurado del siguiente documento: "${title}"\n\n${excerpt}`;

    this.logger.log(
      `[pdf:llm] generando ${question ? 'respuesta a pregunta' : 'resumen'} para "${title}"`,
    );

    try {
      const response = await this.ollamaProvider.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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

  // ── Chunking y embeddings ───────────────────────────────────────────────────

  private async buildAndSaveChunks(
    documentId: number,
    content: string,
  ): Promise<Array<{ id: number; content: string }>> {
    const chunks = this.splitIntoChunks(content);
    const savedChunks: { id: number; content: string }[] = [];

    for (const [i, chunkContent] of chunks.entries()) {
      const safeContent = this.sanitizeText(chunkContent);
      if (!safeContent) continue;

      const chunk = await this.documentRepo.createChunk({
        documentId,
        content: safeContent,
        metadata: { chunkIndex: i, totalChunks: chunks.length },
      });
      savedChunks.push({ id: chunk.id, content: safeContent });
    }

    this.logger.log(
      `[ingest] ${savedChunks.length} chunks guardados para doc id=${documentId}`,
    );
    return savedChunks;
  }

  private async processDocumentEmbeddings(
    documentId: number,
    chunks: Array<{ id: number; content: string }>,
  ): Promise<void> {
    if (chunks.length === 0) {
      await this.documentRepo.updateDocumentStatus(documentId, 'ready');
      this.logger.log(`[ingest] docId=${documentId} marcado READY sin chunks`);
      return;
    }

    const failed: number[] = [];
    const limit = 3;
    let index = 0;

    const worker = async () => {
      while (index < chunks.length) {
        const chunk = chunks[index++];
        try {
          const vector = await this.embeddingsService.generateEmbedding(
            chunk.content,
          );
          await this.documentRepo.saveChunkEmbedding(chunk.id, vector);
        } catch (err: any) {
          failed.push(chunk.id);
          this.logger.warn(
            `[ingest] chunk id=${chunk.id} embedding failed: ${err?.message ?? err}`,
          );
        }
      }
    };

    // Lanzar trabajadores en paralelo con límite de concurrencia de 3
    const workers = Array.from({ length: Math.min(limit, chunks.length) }, () =>
      worker(),
    );

    await Promise.all(workers);

    await this.documentRepo.updateDocumentStatus(documentId, 'ready');
    this.logger.log(
      `[ingest] docId=${documentId} marcado READY — chunks=${chunks.length} — failedEmbeddings=${failed.length}`,
    );
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

  // ── Detección automática de categoría ────────────────────────────────────────

  /**
   * Detecta la categoría de un documento automáticamente:
   * 1. Primero intenta con el título usando keywords
   * 2. Si no hay match, analiza el contenido (primeros 2000 chars) con keywords
   * 3. Si sigue sin match, usa el LLM para clasificar (fallback inteligente)
   */
  private async detectCategory(
    title: string,
    content: string,
  ): Promise<string> {
    // 1. Intentar detectar desde el título
    const categoryFromTitle = this.detectCategoryFromKeywords(title);
    if (categoryFromTitle) {
      this.logger.log(
        `[category] detectada desde título: "${categoryFromTitle}"`,
      );
      return categoryFromTitle;
    }

    // 2. Intentar detectar desde el contenido (primeros 2000 chars para velocidad)
    const excerpt = content.slice(0, 2000).toLowerCase();
    const categoryFromContent = this.detectCategoryFromKeywords(excerpt);
    if (categoryFromContent) {
      this.logger.log(
        `[category] detectada desde contenido: "${categoryFromContent}"`,
      );
      return categoryFromContent;
    }

    // 3. Fallback: usar LLM para clasificar (solo cuando no hay match claro)
    this.logger.log(`[category] sin match de keywords → usando LLM`);
    return this.detectCategoryWithLLM(title, content.slice(0, 1500));
  }

  /**
   * Detecta categoría usando keywords (rápido, sin llamadas a LLM).
   * Prioriza matches más específicos primero.
   */
  private detectCategoryFromKeywords(text: string): string | null {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // ── MEDICINA & SALUD ──
    if (
      /(medicina|medic|salud|enfermedad|tratamiento|farma|terapia|clinica|hospital|diagnostico|sintoma|paciente|doctor|enfermero|cirugia|antibiotico|vacuna|inmun|patologia|anatomia|fisiologia|epidemiologia)/i.test(
        normalized,
      )
    ) {
      return 'medicina';
    }

    // ── PLANTAS MEDICINALES (más específico que medicina general) ──
    if (
      /(planta medicinal|hierba medicinal|fitoterapia|herbal|botanica medicinal|remedios naturales|medicina natural|medicina herbaria|herbolaria)/i.test(
        normalized,
      )
    ) {
      return 'plantas_medicinales';
    }

    // ── AGRICULTURA & AGRONOMÍA ──
    if (
      /(agricultura|agronomia|cultivo|cosecha|semilla|fertilizante|riego|suelo|siembra|agropecuario|horticultura|agroecologia)/i.test(
        normalized,
      )
    ) {
      return 'agricultura';
    }

    // ── DESARROLLO & PROGRAMACIÓN ──
    if (
      /(nestjs|nodejs|typescript|javascript|react|vue|angular|python|rust|golang|framework|api rest|graphql|backend|frontend|desarrollo|programacion|codigo|software)/i.test(
        normalized,
      )
    ) {
      return 'desarrollo';
    }

    // ── INTELIGENCIA ARTIFICIAL ──
    if (
      /(\bia\b|inteligencia artificial|machine learning|deep learning|llm|openai|chatgpt|modelo de lenguaje|red neuronal|transformer)/i.test(
        normalized,
      )
    ) {
      return 'ia';
    }

    // ── ASTROLOGÍA (va ANTES que astronomía para evitar falsos matches) ──
    if (
      /(astrologia|carta astral|carta natal|signo zodiacal|horoscopo|ascendente|casa astrologica|luna natal|sol natal|paracelso|alquimia|hermetismo|hermes trimegisto|tarot|numerologia|kabbalah|ocultismo|botanica oculta|magia|esoter)/i.test(
        normalized,
      )
    ) {
      return 'astrologia';
    }

    // ── ASTRONOMÍA ──
    if (
      /(astronomia|galaxia|cosmos|universo|telescopio|nasa|satelite|orbital|agujero negro|nebulosa|constelacion)/i.test(
        normalized,
      )
    ) {
      return 'astronomia';
    }

    // ── CIENCIAS ──
    if (
      /(fisica|cuantic|relatividad|energia|particula|cern)/i.test(normalized)
    ) {
      return 'fisica';
    }
    if (
      /(quimica|molecula|atomo|reaccion|elemento|compuesto|laboratorio)/i.test(
        normalized,
      )
    ) {
      return 'quimica';
    }
    if (
      /(biologia|celula|adn|genetica|evolucion|organismo|ecosistema)/i.test(
        normalized,
      )
    ) {
      return 'biologia';
    }
    if (
      /(matematica|ecuacion|teorema|calculo|algebra|geometria)/i.test(
        normalized,
      )
    ) {
      return 'matematicas';
    }

    // ── NEGOCIOS & ECONOMÍA ──
    if (
      /(economia|finanzas|mercado|inversion|banco|capital|comercio|empresa|negocio|contabilidad|impuesto)/i.test(
        normalized,
      )
    ) {
      return 'economia';
    }

    // ── DERECHO & LEGAL ──
    if (
      /(derecho|legal|ley|jurisprudencia|constitucion|codigo|abogado|juez|tribunal|sentencia|demanda)/i.test(
        normalized,
      )
    ) {
      return 'derecho';
    }

    // ── HISTORIA ──
    if (
      /(historia|historic|siglo|epoca|revolucion|guerra|antiguo|medieval|civilizacion)/i.test(
        normalized,
      )
    ) {
      return 'historia';
    }

    // ── ARTE & CULTURA ──
    if (
      /(arte|pintura|escultura|museo|galeria|artista|renacimiento|barroco|impresionismo)/i.test(
        normalized,
      )
    ) {
      return 'arte';
    }
    if (
      /(literatura|novela|poesia|autor|escritor|libro|cuento|narrativa)/i.test(
        normalized,
      )
    ) {
      return 'literatura';
    }
    if (
      /(musica|cancion|album|compositor|instrumento|sinfonia|opera)/i.test(
        normalized,
      )
    ) {
      return 'musica';
    }

    // ── TECNOLOGÍA ──
    if (
      /(tecnologia|software|hardware|gadget|computadora|procesador|internet|cloud|ciberseguridad)/i.test(
        normalized,
      )
    ) {
      return 'tecnologia';
    }

    // ── EDUCACIÓN ──
    if (
      /(educacion|pedagogia|didactica|escuela|universidad|alumno|profesor|enseñanza|aprendizaje)/i.test(
        normalized,
      )
    ) {
      return 'educacion';
    }

    // ── DEPORTES ──
    if (
      /(deporte|futbol|basket|tenis|atletismo|olimpico|campeonato|entrenamiento|jugador)/i.test(
        normalized,
      )
    ) {
      return 'deportes';
    }

    // ── COCINA & GASTRONOMÍA ──
    if (
      /(cocina|receta|gastronomia|ingrediente|chef|plato|comida|restaurante)/i.test(
        normalized,
      )
    ) {
      return 'gastronomia';
    }

    return null;
  }

  /**
   * Usa el LLM para clasificar el documento cuando no hay match de keywords.
   * Devuelve una categoría corta y específica.
   */
  private async detectCategoryWithLLM(
    title: string,
    contentExcerpt: string,
  ): Promise<string> {
    const systemPrompt = `Sos un clasificador de documentos experto.
Analizá el título y contenido del documento y devolvé UNA SOLA PALABRA que represente su categoría principal.

Categorías comunes:
- medicina, plantas_medicinales, salud, biologia, quimica, fisica, matematicas
- desarrollo, ia, tecnologia, ciberseguridad
- economia, finanzas, negocios, marketing
- derecho, politica, historia, filosofia
- literatura, arte, musica, cine
- deportes, gastronomia, turismo, educacion
- agricultura, veterinaria, ambiente

Respondé SOLO con la categoría (una palabra, sin explicaciones).`;

    const userPrompt = `Título: "${title}"\n\nContenido:\n${contentExcerpt.slice(0, 1000)}`;

    try {
      const response = await this.ollamaProvider.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 20,
      });

      // Limpiar y normalizar la respuesta
      const category = response.content
        .trim()
        .toLowerCase()
        .replace(/[^a-z_]/g, '')
        .slice(0, 50);

      return category || 'general';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[category:llm] error al clasificar: ${msg}`);
      // Fallback final: extraer del título o usar "general"
      return this.fallbackCategoryFromTitle(title);
    }
  }

  /**
   * Extrae una categoría básica del título cuando todo lo demás falla.
   */
  private fallbackCategoryFromTitle(title: string): string {
    const words = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4); // palabras significativas

    if (words.length > 0) {
      // Usar la primera palabra significativa como categoría
      return words[0];
    }

    return 'general';
  }

  /**
   * Limpia un título de documento:
   * - Elimina extensiones de archivo comunes (.pdf, .docx, .doc, .txt, .md, .xlsx, .pptx, .csv, .odt...)
   * - Aplica limpieza general de caracteres problemáticos
   * - Quita espacios extra al inicio/fin
   */
  sanitizeTitle(title: string): string {
    if (!title) return '';
    // Quitar extensiones de archivo comunes (case-insensitive)
    const withoutExt = title.replace(
      /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|odt|ods|odp|rtf|html?|epub|mobi)$/i,
      '',
    );
    return this.sanitizeText(withoutExt);
  }

  /**
   * Limpia el texto removiendo caracteres nulos y otros problemáticos para PostgreSQL.
   * Los caracteres nulos (0x00) causan errores en PostgreSQL con encoding UTF-8.
   */
  private sanitizeText(text: string): string {
    if (!text) return '';

    return (
      text
        // 1. Remover caracteres nulos (0x00)
        .replace(/\x00/g, '')
        // 2. Remover secuencias hex escape incompletas o inválidas (ej: \xNN sueltas)
        .replace(/\\x[0-9a-fA-F]{0,1}(?![0-9a-fA-F])/g, '')
        // 3. Remover bytes no imprimibles del rango C0/C1 excepto \t \n \r
        .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '')
        // 4. Reemplazar caracteres Unicode problemáticos para PostgreSQL
        .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
        // 5. Normalizar espacios múltiples (pero preservar saltos de línea)
        .replace(/[^\S\n]+/g, ' ')
        .trim()
    );
  }

  /**
   * Realiza un escaneo estructural de seguridad sobre el PDF usando pdf-lib.
   * Mitiga ataques estructurales y de interactividad peligrosa en entornos gubernamentales (Zero-Trust):
   * - Bloquea AcroForms interactivos.
   * - Bloquea OpenAction (disparadores de apertura).
   * - Bloquea Additional Actions (/AA) en el catálogo y páginas.
   * - Bloquea anotaciones ejecutables (/Launch, /JavaScript, /Screen).
   * - Bloquea archivos adjuntos ocultos (/EmbeddedFiles).
   */
  private async ensureNoDangerousCatalogActions(
    buffer: Buffer,
    title: string,
    source?: string
  ): Promise<Buffer> {
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      const context = pdfDoc.context;
      const catalog = pdfDoc.catalog;
      let modified = false;

      // 1. Sanitizar AcroForms si existen
      if (catalog.has(PDFName.of('AcroForm'))) {
        this.logger.warn(
          `[pdf:security] Removiendo AcroForm interactivo de "${title}" por seguridad.`
        );
        catalog.delete(PDFName.of('AcroForm'));
        modified = true;
      }

      // 2. Sanitizar OpenAction si existe
      if (catalog.has(PDFName.of('OpenAction'))) {
        this.logger.warn(
          `[pdf:security] Removiendo OpenAction de "${title}" por seguridad.`
        );
        catalog.delete(PDFName.of('OpenAction'));
        modified = true;
      }

      // 3. Sanitizar acciones adicionales (/AA) en catálogo
      if (catalog.has(PDFName.of('AA'))) {
        this.logger.warn(
          `[pdf:security] Removiendo acciones adicionales (/AA) de "${title}" por seguridad.`
        );
        catalog.delete(PDFName.of('AA'));
        modified = true;
      }

      // 4. Buscar acciones adicionales (/AA) en CADA página y removerlas
      const pages = pdfDoc.getPages();
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageRef = page.ref;
        if (!pageRef) continue;
        const pageDict = context.lookup(pageRef) as PDFDict;
        if (!pageDict) continue;

        if (pageDict.has(PDFName.of('AA'))) {
          this.logger.warn(
            `[pdf:security] Removiendo /AA de la página ${i + 1} de "${title}" por seguridad.`
          );
          pageDict.delete(PDFName.of('AA'));
          modified = true;
        }

        // Bloquear anotaciones de tipo /Launch, /JavaScript o /Screen (ejecución remota de código)
        const annots = pageDict.get(PDFName.of('Annots'));
        if (annots) {
          const annotsArray = context.lookup(annots) as PDFArray;
          if (annotsArray && typeof annotsArray.asArray === 'function') {
            const arr = annotsArray.asArray();
            arr.forEach((annotRef) => {
              const annotDict = context.lookup(annotRef) as PDFDict;
              if (annotDict && typeof annotDict.get === 'function') {
                const subType = annotDict
                  .get(PDFName.of('Subtype'))
                  ?.toString();
                if (subType === '/Screen' || subType === '/Link') {
                  const A = annotDict.get(PDFName.of('A'));
                  if (A) {
                    const action = context.lookup(A) as PDFDict;
                    const S = action?.get?.(PDFName.of('S'))?.toString();
                    if (S === '/Launch' || S === '/JavaScript') {
                      throw new BadRequestException(
                        'El PDF contiene enlaces con acciones ejecutables peligrosas.'
                      );
                    }
                  }
                }
              }
            });
          }
        }
      }

      // 5. Bloquear archivos embebidos en el árbol de nombres
      if (catalog.has(PDFName.of('Names'))) {
        const names = context.lookup(
          catalog.get(PDFName.of('Names'))
        ) as PDFDict;
        if (names && names.has(PDFName.of('EmbeddedFiles'))) {
          throw new BadRequestException(
            'El PDF contiene archivos adjuntos ocultos (/EmbeddedFiles).'
          );
        }
      }

      if (modified) {
        const sanitizedBytes = await pdfDoc.save();
        const newBuffer = Buffer.from(sanitizedBytes);

        // Escribir de vuelta al disco si se proveyó la ruta para que persista
        if (source) {
          const fs = require('fs');
          if (fs.existsSync(source)) {
            try {
              fs.writeFileSync(source, newBuffer);
              this.logger.log(
                `[pdf:security] PDF "${title}" sanitizado y guardado en disco: ${source}`
              );
            } catch (writeErr: any) {
              this.logger.warn(
                `[pdf:security] No se pudo guardar el PDF sanitizado en disco: ${writeErr.message}`
              );
            }
          }
        }
        return newBuffer;
      }

      return buffer;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;

      const isDev = process.env.NODE_ENV === 'development';
      const mensaje = isDev
        ? `Error estructural al analizar el PDF "${title}": ${e?.message ?? 'desconocido'}`
        : `El PDF "${title}" no se pudo verificar de forma segura y fue rechazado por seguridad.`;

      this.logger.error(
        `[pdf:security] Error en validación estructural de "${title}":`,
        e
      );
      throw new BadRequestException(mensaje);
    }
  }

  async approveDocument(documentId: number): Promise<void> {
    const doc = await this.documentRepo.getDocumentWithChunks(documentId);
    if (!doc)
      throw new BadRequestException(
        `Documento con ID ${documentId} no encontrado`,
      );

    // Cambiar estado a indexing
    await this.documentRepo.updateDocumentStatus(documentId, 'indexing');

    // Lanzar enriquecimiento en background (existente)
    this.enrichmentService
      .enrich(doc.id, doc.title, doc.content)
      .catch((err) => {
        this.logger.warn(
          `[enrichment] error background en "${doc.title}": ${err?.message ?? err}`,
        );
      });

    // Iniciar procesamiento jerárquico e incremental en segundo plano
    this.processHierarchicalIndexing(documentId, doc.title, doc.content).catch(
      (err) =>
        this.logger.error(
          `Error procesando indexación jerárquica para doc ${documentId}: ${err.message}`,
        ),
    );
  }

  private async processHierarchicalIndexing(
    documentId: number,
    title: string,
    content: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Iniciando indexación jerárquica para docId=${documentId} ("${title}")`,
      );

      // Fase 3: Identificación Estructural
      const chapters = this.hierarchicalParser.parseDocument(title, content);

      // Guardar estructura en la base de datos
      const savedChunks: Array<{ id: number; content: string }> = [];
      let totalChunks = 0;

      for (const ch of chapters) {
        for (const sec of ch.sections) {
          totalChunks += sec.chunks.length;
        }
      }

      this.logger.log(
        `Estructurando libro en ${chapters.length} capítulos y ${totalChunks} chunks`,
      );

      let chunkOrder = 0;
      for (const ch of chapters) {
        const dbChapter = await this.documentRepo.createChapter({
          documentId,
          title: ch.title,
          order: ch.order,
        });

        for (const sec of ch.sections) {
          const dbSection = await this.documentRepo.createSection({
            chapterId: dbChapter.id,
            title: sec.title,
          });

          for (const chunk of sec.chunks) {
            const dbChunk = await this.documentRepo.createChunk({
              documentId,
              sectionId: dbSection.id,
              content: chunk.content,
              metadata: { ...chunk.metadata, chunkOrder: chunkOrder++ },
            });
            savedChunks.push({ id: dbChunk.id, content: chunk.content });
          }
        }
      }

      // Actualizar progreso de indexación estructural (Fase 3 finalizada)
      await this.documentRepo.updateDocumentProgress(documentId, {
        progressIndex: 100.0,
      });

      // Fase 4: Cola de Embeddings de Baja Prioridad y Amortiguada en background
      this.processEmbeddingsSlowly(documentId, savedChunks).catch((err) =>
        this.logger.error(
          `Error en procesamiento lento de embeddings para doc ${documentId}: ${err.message}`,
        ),
      );

      // Fase 5: Resumen Recursivo MapReduce en background
      this.processRecursiveSummaries(documentId).catch((err) =>
        this.logger.error(
          `Error en resúmenes recursivos para doc ${documentId}: ${err.message}`,
        ),
      );
    } catch (err: any) {
      this.logger.error(
        `Error en processHierarchicalIndexing para docId=${documentId}: ${err.message}`,
        err.stack,
      );
      await this.documentRepo.updateDocumentStatus(documentId, 'not_indexed');
    }
  }

  private async processEmbeddingsSlowly(
    documentId: number,
    chunks: Array<{ id: number; content: string }>,
  ): Promise<void> {
    this.logger.log(
      `Iniciando generación lenta de embeddings para docId=${documentId} (${chunks.length} chunks)`,
    );

    // 1. Generar embeddings macro para Capítulos
    const dbChapters =
      await this.documentRepo.getChaptersByDocument(documentId);
    for (const dbCh of dbChapters) {
      try {
        const vector = await this.embeddingsService.generateEmbedding(
          `Capítulo: ${dbCh.title}`,
        );
        await this.documentRepo.saveChapterEmbedding(dbCh.id, vector);
      } catch (err: any) {
        this.logger.warn(
          `Error al generar embedding para capítulo ${dbCh.id}: ${err.message}`,
        );
      }
    }

    // 2. Generar embeddings macro para Secciones
    for (const dbCh of dbChapters) {
      const sections = await this.prisma.section.findMany({
        where: { chapterId: dbCh.id },
      });
      for (const dbSec of sections) {
        try {
          const vector = await this.embeddingsService.generateEmbedding(
            `Sección: ${dbSec.title} en el capítulo ${dbCh.title}`,
          );
          await this.documentRepo.saveSectionEmbedding(dbSec.id, vector);
        } catch (err: any) {
          this.logger.warn(
            `Error al generar embedding para sección ${dbSec.id}: ${err.message}`,
          );
        }
      }
    }

    // 3. Procesar chunks de forma amortiguada (lotes de 5 con delay de 2 segundos)
    const batchSize = 5;
    const delayMs = 2000;
    let processed = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (chunk) => {
          try {
            const vector = await this.embeddingsService.generateEmbedding(
              chunk.content,
            );
            await this.documentRepo.saveChunkEmbedding(chunk.id, vector);
          } catch (err: any) {
            this.logger.warn(
              `Error generando embedding para chunk ${chunk.id}: ${err.message}`,
            );
          }
        }),
      );

      processed += batch.length;
      const progress = Math.min(
        100.0,
        parseFloat(((processed / chunks.length) * 100).toFixed(1)),
      );
      await this.documentRepo.updateDocumentProgress(documentId, {
        progressEmbed: progress,
      });

      this.logger.log(
        `Progreso de embeddings para docId=${documentId}: ${progress}% (${processed}/${chunks.length})`,
      );

      if (i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    this.logger.log(
      `Finalizada la generación de embeddings para docId=${documentId}`,
    );
  }

  private async processRecursiveSummaries(documentId: number): Promise<void> {
    this.logger.log(`Iniciando resúmenes recursivos para docId=${documentId}`);

    const dbChapters =
      await this.documentRepo.getChaptersByDocument(documentId);
    const chapterSummaries: string[] = [];

    for (let idx = 0; idx < dbChapters.length; idx++) {
      const dbCh = dbChapters[idx];

      // Obtener todos los chunks del capítulo
      const sections = await this.prisma.section.findMany({
        where: { chapterId: dbCh.id },
        include: { chunks: true },
      });

      const chapterContent = sections
        .flatMap((s) => s.chunks.map((c) => c.content))
        .join('\n\n')
        .slice(0, 8000); // Límite de contexto razonable

      if (!chapterContent.trim()) {
        chapterSummaries.push(
          `Capítulo: ${dbCh.title} - Sin contenido disponible.`,
        );
        continue;
      }

      try {
        const systemPrompt = `Sos un asistente experto en resumir textos. Generá un resumen estructurado, conciso y preciso del capítulo en español argentino.`;
        const userPrompt = `Capítulo: "${dbCh.title}"\n\nContenido:\n${chapterContent}\n\nResumen del capítulo:`;

        const response = await this.ollamaProvider.generate({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          maxTokens: 500,
        });

        const summary = response.content.trim();
        await this.prisma.chapter.update({
          where: { id: dbCh.id },
          data: { summary },
        });

        chapterSummaries.push(`- **${dbCh.title}**: ${summary}`);

        const progress = Math.min(
          100.0,
          parseFloat((((idx + 1) / dbChapters.length) * 100).toFixed(1)),
        );
        await this.documentRepo.updateDocumentProgress(documentId, {
          progressSummary: progress,
        });
      } catch (err: any) {
        this.logger.warn(
          `Error generando resumen para capítulo ${dbCh.title}: ${err.message}`,
        );
        chapterSummaries.push(`- **${dbCh.title}**: [Resumen no disponible]`);
      }
    }

    // Generar la Ficha de Conocimiento (Knowledge Card)
    try {
      const combinedSummaries = chapterSummaries.join('\n\n');

      // Obtener los datos del documento (título y contenido completo)
      const docData = await this.prisma.document.findUnique({
        where: { id: documentId },
        select: { content: true, title: true },
      });
      const docTitle = docData?.title || 'Documento';
      const text = docData?.content || '';

      // 1. Extraer conceptos principales en JSON
      let concepts: string[] = [];
      try {
        const conceptPrompt = `Analizá la estructura y resúmenes de los capítulos de la obra.
Identificá los 8 a 12 conceptos o temas teóricos principales desarrollados (ej: "Inconsciente", "Sueños", "Libido", "Pulsión").
Devolvé ÚNICAMENTE un array JSON plano de strings con los nombres de estos conceptos. Sin bloques de código markdown, sin explicaciones. Ejemplo: ["Concepto1", "Concepto2"]`;

        const conceptResponse = await this.ollamaProvider.generate({
          messages: [
            {
              role: 'system',
              content:
                'Sos un extractor de conceptos clave. Devolvés únicamente un array de JSON limpio.',
            },
            {
              role: 'user',
              content: `${conceptPrompt}\n\nObra: "${docTitle}"\nResúmenes de capítulos:\n${combinedSummaries}\n\nConceptos:`,
            },
          ],
          maxTokens: 300,
        });

        // Intentar parsear el JSON de forma robusta
        let cleanJson = conceptResponse.content
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        const startIndex = cleanJson.indexOf('[');
        const endIndex = cleanJson.lastIndexOf(']');
        if (startIndex !== -1 && endIndex !== -1) {
          cleanJson = cleanJson.substring(startIndex, endIndex + 1);
        }
        concepts = JSON.parse(cleanJson);
      } catch (err: any) {
        this.logger.warn(
          `Error al extraer conceptos en JSON, usando fallback: ${err.message}`,
        );
        concepts = [
          'Inconsciente',
          'Sueños',
          'Pulsión',
          'Sexualidad',
          'Transferencia',
          'Yo',
          'Ello',
          'Superyó',
        ];
      }

      // Asegurar que es un array válido
      if (!Array.isArray(concepts) || concepts.length === 0) {
        concepts = [
          'Inconsciente',
          'Sueños',
          'Pulsión',
          'Sexualidad',
          'Transferencia',
          'Yo',
          'Ello',
          'Superyó',
        ];
      }

      // 2. Contar menciones en el texto completo del documento

      const conceptCounts = concepts.map((conceptItem: any) => {
        const concept =
          typeof conceptItem === 'string'
            ? conceptItem
            : conceptItem?.concept ||
              conceptItem?.name ||
              JSON.stringify(conceptItem);
        const escaped = concept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        const matches = text.match(regex);
        return {
          concept,
          count: matches ? matches.length : 0,
        };
      });

      // Ordenar por cantidad de menciones descendente
      conceptCounts.sort((a, b) => b.count - a.count);

      // Formatear la sección de conceptos
      const conceptsFormattedList = conceptCounts
        .map((cc) => `  - **${cc.concept}** (${cc.count} menciones)`)
        .join('\n');

      // 3. Generar la Ficha de Conocimiento Final
      const cardPrompt = `Sos un epistemólogo y bibliotecario experto. Generá una **Ficha de Conocimiento (Knowledge Card)** estructurada y profesional sobre la obra basándote en los resúmenes de sus capítulos y en los conceptos clave contados.
Respondé en español argentino y utilizá un estilo sobrio, claro y de alto valor conceptual.

La ficha debe estructurarse exactamente con las siguientes secciones markdown:

# 📖 [Título de la Obra]

- **Autor:** [Nombre del autor o "Desconocido"]
- **Categoría/Dominio:** [Dominio de la obra, ej: Psicoanálisis, Astronomía, Desarrollo]
- **Corriente/Escuela:** [Escuela de pensamiento, ej: Psicoanálisis clásico, Astrofísica, Programación Reactiva]
- **Nivel de Dificultad:** [Nivel entre ★ y ★★★★★]
- **Idioma:** [Idioma del texto]
- **Tamaño:** [Cantidad de palabras estimada en base al texto completo]
- **Aporte / Valoración:** [Nivel de aporte del documento a la biblioteca, ej: ★★★★★]
- **Tipo de Documento:** [Tipo de corpus, ej: Corpus fundacional, Manual de referencia, Guía práctica, Documentación de API, Ensayo]

---

### 🧠 Mapa del Conocimiento
Este corpus desarrolla principalmente:
[Una breve síntesis o mapa que describa la estructura temática general de la obra y qué desarrolla principalmente, usando viñetas temáticas y emojis explicativos]

---

### 🔍 Conceptos Detectados (Frecuencia en texto)
[Aquí debés copiar EXACTAMENTE la siguiente lista de conteo de conceptos que te proveo, sin alterarla ni resumirla]

---

### ❓ Preguntas que puede responder este libro
Este libro es especialmente útil para responder consultas como:
[Generá una lista de 4 o 5 preguntas teóricas profundas que el lector puede responder al consultar este libro. Usá viñetas con el check "✔ ¿Qué...?", "✔ ¿Cómo...?", "✔ ¿Por qué...?", etc.]

---

### 🔗 Relaciones y Contexto
- **Autores Relacionados:** [Autores del mismo dominio u opiniones opuestas, ej: Jung, Lacan]
- **Obras Relacionadas:** [Títulos de libros o corpus relacionados]
- **Ideal para responder:** [Lista de temas o conceptos ideales para responder, separados por comas]
- **Límites (No profundiza en):** [Qué áreas o disciplinas NO están cubiertas o explicadas en la obra, ej: Neurociencia moderna]

---

### 🌲 Grafo de Relaciones (Estructura ASCII)
[Dibujá un diagrama ASCII de árbol limpio que relacione el autor, conceptos centrales y ramificaciones principales. Ejemplo:
Autor/Tema
├── ConceptoA
│   ├── Subconcepto
│   └── Relacion
└── ConceptoB]

---

### 💡 ¿Por qué consultar este documento? (Aporte a la biblioteca)
[Un párrafo profundo y analítico explicando qué aporta esta obra a la biblioteca personal (¿Por qué debería consultar este documento?), cómo complementa otras obras y por qué el sistema JarBees debería elegir este corpus ante consultas de RAG]
`;

      const userCardInput = `Obra: "${docData?.title || 'Documento'}"
Palabras: ~${text.split(/\s+/).length}
Resúmenes de capítulos:
${combinedSummaries}

Lista de conceptos a copiar exactamente en "Conceptos Clave":
${conceptsFormattedList}`;

      const cardResponse = await this.ollamaProvider.generate({
        messages: [
          {
            role: 'system',
            content:
              'Sos un analista epistemológico experto en bases de conocimiento y catalogación de textos.',
          },
          {
            role: 'user',
            content: `${cardPrompt}\n\n---\n\nDATOS DE ENTRADA:\n${userCardInput}`,
          },
        ],
        maxTokens: 1200,
      });

      const knowledgeCard = cardResponse.content.trim();

      await this.documentRepo.updateDocumentProgress(documentId, {
        summary: knowledgeCard,
      });
    } catch (err: any) {
      this.logger.warn(
        `Error al generar la Ficha de Conocimiento: ${err.message}`,
      );
    }

    // Marcar el documento como listo (ready)
    await this.documentRepo.updateDocumentStatus(documentId, 'ready');
    this.logger.log(
      `Procesamiento jerárquico completado para docId=${documentId}. Estado cambiado a READY.`,
    );
  }
}
