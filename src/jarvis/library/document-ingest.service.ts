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
    // Limpiar título y contenido
    const cleanTitle = this.sanitizeText(title);
    const cleanContent = this.sanitizeText(content);
    
    const detectedCategory = category ?? await this.detectCategory(cleanTitle, cleanContent);
    const doc = await this.documentRepo.createDocument({ 
      title: cleanTitle, 
      content: cleanContent, 
      category: detectedCategory, 
      source 
    });
    const chunks = await this.buildAndSaveChunks(doc.id, cleanContent);

    this.logger.log(`[library] ingestado "${cleanTitle}" — categoría: ${detectedCategory} — ${chunks} chunks`);
    return { documentId: doc.id, title: cleanTitle, chunks, category: detectedCategory };
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
      
      // Limpiar caracteres nulos y otros caracteres problemáticos para PostgreSQL
      text = this.sanitizeText(text);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[pdf:parse] ERROR en "${title}": ${msg}`);
      throw new BadRequestException(`No pude extraer texto del PDF: ${msg}`);
    }

    // Limpiar el título también
    const cleanTitle = this.sanitizeText(title);
    const detectedCategory = category ?? await this.detectCategory(cleanTitle, text);
    
    const doc = await this.documentRepo.createDocument({
      title: cleanTitle,
      content:  text,
      category: detectedCategory,
      source,
    });

    const chunks = await this.buildAndSaveChunks(doc.id, text);
    this.logger.log(`[library] PDF "${cleanTitle}" ingestado — categoría: ${detectedCategory} — ${chunks} chunks`);

    // Enriquecimiento en background — no bloquea la respuesta al usuario
    this.enrichmentService.enrich(doc.id, cleanTitle, text).catch((err) => {
      this.logger.warn(`[enrichment] error background en "${cleanTitle}": ${err?.message ?? err}`);
    });

    // Generar respuesta con el contenido del PDF
    const answer = await this.answerFromText(text, cleanTitle, question);

    return { documentId: doc.id, title: cleanTitle, chunks, category: detectedCategory, answer };
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

    // Sanitizar antes de guardar
    const cleanTitle = this.sanitizeText(title);
    const cleanText = this.sanitizeText(text);
    
    const detectedCategory = category ?? await this.detectCategory(cleanTitle, cleanText);
    return this.ingestText(cleanTitle, cleanText, detectedCategory, url);
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

  // ── Detección automática de categoría ────────────────────────────────────────

  /**
   * Detecta la categoría de un documento automáticamente:
   * 1. Primero intenta con el título usando keywords
   * 2. Si no hay match, analiza el contenido (primeros 2000 chars) con keywords
   * 3. Si sigue sin match, usa el LLM para clasificar (fallback inteligente)
   */
  private async detectCategory(title: string, content: string): Promise<string> {
    // 1. Intentar detectar desde el título
    const categoryFromTitle = this.detectCategoryFromKeywords(title);
    if (categoryFromTitle) {
      this.logger.log(`[category] detectada desde título: "${categoryFromTitle}"`);
      return categoryFromTitle;
    }

    // 2. Intentar detectar desde el contenido (primeros 2000 chars para velocidad)
    const excerpt = content.slice(0, 2000).toLowerCase();
    const categoryFromContent = this.detectCategoryFromKeywords(excerpt);
    if (categoryFromContent) {
      this.logger.log(`[category] detectada desde contenido: "${categoryFromContent}"`);
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
    const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // ── MEDICINA & SALUD ──
    if (/(medicina|medic|salud|enfermedad|tratamiento|farma|terapia|clinica|hospital|diagnostico|sintoma|paciente|doctor|enfermero|cirugia|antibiotico|vacuna|inmun|patologia|anatomia|fisiologia|epidemiologia)/i.test(normalized)) {
      return 'medicina';
    }

    // ── PLANTAS MEDICINALES (más específico que medicina general) ──
    if (/(planta medicinal|hierba medicinal|fitoterapia|herbal|botanica medicinal|remedios naturales|medicina natural|medicina herbaria|herbolaria)/i.test(normalized)) {
      return 'plantas_medicinales';
    }

    // ── AGRICULTURA & AGRONOMÍA ──
    if (/(agricultura|agronomia|cultivo|cosecha|semilla|fertilizante|riego|suelo|siembra|agropecuario|horticultura|agroecologia)/i.test(normalized)) {
      return 'agricultura';
    }

    // ── DESARROLLO & PROGRAMACIÓN ──
    if (/(nestjs|nodejs|typescript|javascript|react|vue|angular|python|rust|golang|framework|api rest|graphql|backend|frontend|desarrollo|programacion|codigo|software)/i.test(normalized)) {
      return 'desarrollo';
    }

    // ── INTELIGENCIA ARTIFICIAL ──
    if (/(\bia\b|inteligencia artificial|machine learning|deep learning|llm|openai|chatgpt|modelo de lenguaje|red neuronal|transformer)/i.test(normalized)) {
      return 'ia';
    }

    // ── ASTRONOMÍA & ASTROLOGÍA ──
    if (/(astronomia|astro|planeta|estrella|galaxia|cosmos|universo|telescopio|nasa|espacio|satelite|orbital)/i.test(normalized)) {
      return 'astronomia';
    }
    if (/(astrologia|signo zodiacal|horoscopo|carta natal|ascendente|casa astrologica)/i.test(normalized)) {
      return 'astrologia';
    }

    // ── CIENCIAS ──
    if (/(fisica|cuantic|relatividad|energia|particula|cern)/i.test(normalized)) {
      return 'fisica';
    }
    if (/(quimica|molecula|atomo|reaccion|elemento|compuesto|laboratorio)/i.test(normalized)) {
      return 'quimica';
    }
    if (/(biologia|celula|adn|genetica|evolucion|organismo|ecosistema)/i.test(normalized)) {
      return 'biologia';
    }
    if (/(matematica|ecuacion|teorema|calculo|algebra|geometria)/i.test(normalized)) {
      return 'matematicas';
    }

    // ── NEGOCIOS & ECONOMÍA ──
    if (/(economia|finanzas|mercado|inversion|banco|capital|comercio|empresa|negocio|contabilidad|impuesto)/i.test(normalized)) {
      return 'economia';
    }

    // ── DERECHO & LEGAL ──
    if (/(derecho|legal|ley|jurisprudencia|constitucion|codigo|abogado|juez|tribunal|sentencia|demanda)/i.test(normalized)) {
      return 'derecho';
    }

    // ── HISTORIA ──
    if (/(historia|historic|siglo|epoca|revolucion|guerra|antiguo|medieval|civilizacion)/i.test(normalized)) {
      return 'historia';
    }

    // ── ARTE & CULTURA ──
    if (/(arte|pintura|escultura|museo|galeria|artista|renacimiento|barroco|impresionismo)/i.test(normalized)) {
      return 'arte';
    }
    if (/(literatura|novela|poesia|autor|escritor|libro|cuento|narrativa)/i.test(normalized)) {
      return 'literatura';
    }
    if (/(musica|cancion|album|compositor|instrumento|sinfonia|opera)/i.test(normalized)) {
      return 'musica';
    }

    // ── TECNOLOGÍA ──
    if (/(tecnologia|software|hardware|gadget|computadora|procesador|internet|cloud|ciberseguridad)/i.test(normalized)) {
      return 'tecnologia';
    }

    // ── EDUCACIÓN ──
    if (/(educacion|pedagogia|didactica|escuela|universidad|alumno|profesor|enseñanza|aprendizaje)/i.test(normalized)) {
      return 'educacion';
    }

    // ── DEPORTES ──
    if (/(deporte|futbol|basket|tenis|atletismo|olimpico|campeonato|entrenamiento|jugador)/i.test(normalized)) {
      return 'deportes';
    }

    // ── COCINA & GASTRONOMÍA ──
    if (/(cocina|receta|gastronomia|ingrediente|chef|plato|comida|restaurante)/i.test(normalized)) {
      return 'gastronomia';
    }

    return null;
  }

  /**
   * Usa el LLM para clasificar el documento cuando no hay match de keywords.
   * Devuelve una categoría corta y específica.
   */
  private async detectCategoryWithLLM(title: string, contentExcerpt: string): Promise<string> {
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
          { role: 'user',   content: userPrompt },
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
      .filter(w => w.length > 4); // palabras significativas

    if (words.length > 0) {
      // Usar la primera palabra significativa como categoría
      return words[0];
    }

    return 'general';
  }

  /**
   * Limpia el texto removiendo caracteres nulos y otros problemáticos para PostgreSQL.
   * Los caracteres nulos (0x00) causan errores en PostgreSQL con encoding UTF-8.
   */
  private sanitizeText(text: string): string {
    if (!text) return '';
    
    return text
      // Remover caracteres nulos (0x00) - causa error en PostgreSQL
      .replace(/\x00/g, '')
      // Remover otros caracteres de control problemáticos excepto saltos de línea y tabs
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      // Normalizar múltiples espacios en blanco
      .replace(/\s+/g, ' ')
      .trim();
  }
}
