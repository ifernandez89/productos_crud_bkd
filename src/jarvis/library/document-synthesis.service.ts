import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaProvider } from '../llm/ollama.provider';
import { DocumentRepository } from '../repositories/document.repository';

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface DocumentInsightData {
  documentId: number;
  title: string;
  author: string;
  collection?: string;
  executiveSummary: string;
  centralThesis?: string;
  highlightedStories: string[];
  keyCharacters: string[];
  coreConcepts: string[];
  notableQuotes: string[];
  controversialIdeas: string[];
  practicalTechniques: string[];
  contradictions: string[];
}

export interface SynthesisResult {
  documentId: number;
  title: string;
  author: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  insight?: DocumentInsightData;
  error?: string;
}

export interface CollectionSynthesisResult {
  collection: string;
  total: number;
  processed: number;
  errors: number;
  insights: SynthesisResult[];
  crossAuthorComparison?: string;
}

/**
 * DocumentSynthesisService — Pipeline de síntesis estructurada map-reduce.
 *
 * Transforma documentos ya indexados en fichas narrativas pre-computadas
 * (DocumentInsight) con: resumen ejecutivo, historias destacadas, personajes,
 * conceptos, citas y técnicas prácticas.
 *
 * FLUJO MAP-REDUCE:
 *   MAP:    Para cada libro → extraer chunks relevantes → LLM produce ficha parcial
 *   REDUCE: Consolidar fichas parciales → ficha única → guardar en DocumentInsight
 *
 * El resultado: consultas como "dame las 2 mejores historias por autor" consultan
 * la tabla DocumentInsight en lugar de hacer búsqueda vectorial densa en tiempo real.
 */
@Injectable()
export class DocumentSynthesisService {
  private readonly logger = new Logger(DocumentSynthesisService.name);

  // Máximo de chunks a procesar por documento (para modelos pequeños)
  private readonly MAX_CHUNKS_PER_DOC = 20;
  // Tamaño máximo de texto que se envía al LLM en cada pasada
  private readonly SECTION_CHAR_LIMIT = 4000;
  // Versión del pipeline — incrementar cuando cambie la lógica de extracción
  private readonly SYNTHESIS_VERSION = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaProvider,
    private readonly documentRepo: DocumentRepository,
  ) {}

  // ── API principal ──────────────────────────────────────────────────────────

  /**
   * Sintetiza un documento por ID y guarda la ficha en DocumentInsight.
   * Si ya existe y force=false, la devuelve sin re-procesar.
   */
  async synthesizeDocument(
    documentId: number,
    collection?: string,
    force = false,
  ): Promise<SynthesisResult> {
    const existing = await this.prisma.documentInsight.findUnique({
      where: { documentId },
    });

    if (existing && !force) {
      this.logger.log(`[synthesis] Insight ya existe para docId=${documentId}, skipping.`);
      return {
        documentId,
        title: existing.title,
        author: existing.author,
        status: 'skipped',
        insight: this.deserializeInsight(existing),
      };
    }

    // Recuperar documento y sus chunks
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        category: true,
        chunks: {
          select: { id: true, content: true, metadata: true },
          take: this.MAX_CHUNKS_PER_DOC,
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!doc) {
      return { documentId, title: '?', author: '?', status: 'error', error: 'Documento no encontrado en BD.' };
    }

    if (!doc.chunks || doc.chunks.length === 0) {
      return { documentId, title: doc.title, author: '?', status: 'error', error: 'El documento no tiene chunks indexados.' };
    }

    this.logger.log(`[synthesis] Procesando docId=${documentId} "${doc.title}" — ${doc.chunks.length} chunks`);

    try {
      const insight = await this.runSynthesisPipeline(doc, collection);
      await this.upsertInsight(insight);

      this.logger.log(`[synthesis] ✅ Insight generado para "${doc.title}" — ${insight.highlightedStories.length} historias, ${insight.coreConcepts.length} conceptos`);
      return { documentId, title: doc.title, author: insight.author, status: existing ? 'updated' : 'created', insight };
    } catch (err: any) {
      this.logger.error(`[synthesis] ❌ Error en docId=${documentId}: ${err.message}`);
      return { documentId, title: doc.title, author: '?', status: 'error', error: err.message };
    }
  }

  /**
   * Sintetiza todos los documentos de una colección (por categoría o tag).
   * Al final, genera una comparación cross-autor si hay más de 1 libro.
   */
  async synthesizeCollection(
    collection: string,
    force = false,
  ): Promise<CollectionSynthesisResult> {
    // Buscar documentos de la colección por categoría
    const docs = await this.prisma.document.findMany({
      where: {
        status: 'ready',
        OR: [
          { category: { contains: collection } },
          { category: collection },
        ],
      },
      select: { id: true, title: true },
    });

    this.logger.log(`[synthesis] Colección "${collection}": ${docs.length} documentos encontrados`);

    const results: SynthesisResult[] = [];
    let errors = 0;

    for (const doc of docs) {
      const result = await this.synthesizeDocument(doc.id, collection, force);
      results.push(result);
      if (result.status === 'error') errors++;

      // Pequeña pausa entre documentos para no saturar el modelo
      await new Promise(r => setTimeout(r, 2000));
    }

    // Comparación cross-autor si hay al menos 2 insights disponibles
    const validInsights = results.filter(r => r.insight);
    let crossAuthorComparison: string | undefined;

    if (validInsights.length >= 2) {
      crossAuthorComparison = await this.generateCrossAuthorComparison(collection, validInsights);
    }

    return {
      collection,
      total: docs.length,
      processed: results.filter(r => r.status !== 'skipped').length,
      errors,
      insights: results,
      crossAuthorComparison,
    };
  }

  /**
   * Obtiene los insights pre-computados de una colección para respuesta directa.
   * Devuelve las historias/conceptos más relevantes sin búsqueda vectorial.
   */
  async queryInsights(params: {
    collection?: string;
    author?: string;
    field?: 'highlightedStories' | 'keyCharacters' | 'coreConcepts' | 'notableQuotes' | 'practicalTechniques';
    limit?: number;
  }): Promise<{ author: string; title: string; items: string[]; executiveSummary: string }[]> {
    const where: any = {};
    if (params.collection) where.collection = { contains: params.collection };
    if (params.author) where.author = { contains: params.author };

    const insights = await this.prisma.documentInsight.findMany({
      where,
      take: params.limit ?? 10,
      orderBy: { generatedAt: 'desc' },
    });

    const field = params.field ?? 'highlightedStories';

    return insights.map(ins => ({
      author: ins.author,
      title: ins.title,
      items: this.parseJson(ins[field] as string),
      executiveSummary: ins.executiveSummary,
    }));
  }

  // ── Pipeline interno ────────────────────────────────────────────────────────

  private async runSynthesisPipeline(
    doc: { id: number; title: string; category: string | null; chunks: { content: string; metadata: string | null }[] },
    collection?: string,
  ): Promise<DocumentInsightData> {
    // MAP: procesar chunks en secciones de SECTION_CHAR_LIMIT chars
    const fullText = doc.chunks.map(c => c.content).join('\n\n');
    const sections = this.splitSections(fullText);

    this.logger.log(`[synthesis:map] ${doc.title} — ${sections.length} secciones a procesar`);

    const partials: Partial<DocumentInsightData>[] = [];
    for (const [i, section] of sections.entries()) {
      this.logger.log(`[synthesis:map] sección ${i + 1}/${sections.length}`);
      const partial = await this.extractPartial(doc.title, section);
      if (partial) partials.push(partial);
    }

    // REDUCE: consolidar en ficha única
    this.logger.log(`[synthesis:reduce] Consolidando ${partials.length} secciones para "${doc.title}"`);
    return this.consolidate(doc, partials, collection);
  }

  private async extractPartial(
    title: string,
    text: string,
  ): Promise<Partial<DocumentInsightData> | null> {
    const prompt = `Analizá este fragmento del libro "${title}".
⚠️ FRONTERA RÍGIDA DE CONOCIMIENTO: Extraé ÚNICAMENTE información, conceptos y entidades presentes explícitamente en el texto a continuación.
PROHIBIDO agregar o asociar conceptos de otros autores o materias que NO estén en el texto (como arquetipos, inconsciente, psicología junguiana, filosofía china, o autores ajenos).

Devolvé SOLO JSON válido sin markdown ni explicaciones:

{
  "stories": ["historia o episodio destacado 1", "historia 2"],
  "characters": ["entidad, ser o figura mencionada explícitamente"],
  "concepts": ["concepto o término clave presente en el texto"],
  "quotes": ["cita textual exacta si existe"],
  "techniques": ["técnica o método mencionado si existe"],
  "controversialIdeas": ["idea contraintuitiva o particular mencionada si existe"]
}

Si no encontrás alguna categoría en este fragmento específico, dejá el array vacío.
Respondé en español argentino.

Fragmento:
${text.slice(0, this.SECTION_CHAR_LIMIT)}`;

    try {
      const res = await this.ollama.generate({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
      });

      const clean = res.content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json|```/gi, '')
        .trim();

      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      return {
        highlightedStories: parsed.stories ?? [],
        keyCharacters: parsed.characters ?? [],
        coreConcepts: parsed.concepts ?? [],
        notableQuotes: parsed.quotes ?? [],
        practicalTechniques: parsed.techniques ?? [],
        controversialIdeas: parsed.controversialIdeas ?? [],
      };
    } catch (err: any) {
      this.logger.warn(`[synthesis:map] Falló una sección: ${err.message}`);
      return null;
    }
  }

  private async consolidate(
    doc: { id: number; title: string; category: string | null },
    partials: Partial<DocumentInsightData>[],
    collection?: string,
  ): Promise<DocumentInsightData> {
    // Unificar y deduplicar arrays de todas las secciones
    const merged = {
      highlightedStories: this.dedup(partials.flatMap(p => p.highlightedStories ?? [])).slice(0, 5),
      keyCharacters: this.dedup(partials.flatMap(p => p.keyCharacters ?? [])).slice(0, 10),
      coreConcepts: this.dedup(partials.flatMap(p => p.coreConcepts ?? [])).slice(0, 10),
      notableQuotes: this.dedup(partials.flatMap(p => p.notableQuotes ?? [])).slice(0, 5),
      practicalTechniques: this.dedup(partials.flatMap(p => p.practicalTechniques ?? [])).slice(0, 8),
      controversialIdeas: this.dedup(partials.flatMap(p => p.controversialIdeas ?? [])).slice(0, 5),
    };

    // Resolver autor oficial de la obra desde el repositorio / índice
    const author =
      this.documentRepo['corpusSelector']?.getAuthorAndSchoolByTitle(doc.title).author ||
      'Desconocido';

    // Generar resumen ejecutivo y tesis central
    const { summary, thesis } = await this.generateExecutiveSummary(
      doc.title,
      author,
      merged,
    );

    return {
      documentId: doc.id,
      title: doc.title,
      author,
      collection: collection ?? doc.category ?? undefined,
      executiveSummary: summary,
      centralThesis: thesis,
      ...merged,
      contradictions: [],
    };
  }

  private async generateExecutiveSummary(
    title: string,
    author: string,
    merged: Pick<DocumentInsightData, 'coreConcepts' | 'keyCharacters' | 'highlightedStories'>,
  ): Promise<{ summary: string; thesis: string }> {
    const prompt = `Generá una ficha ejecutiva de la obra "${title}" del autor "${author}" basándote EXCLUSIVAMENTE en estos datos extraídos del texto:

Conceptos clave: ${merged.coreConcepts.join(', ') || 'no extraídos'}
Entidades/Figuras: ${merged.keyCharacters.join(', ') || 'no extraídos'}
Historias/Episodios: ${merged.highlightedStories.slice(0, 3).join(' | ') || 'no extraídas'}

⚠️ REGLA DE FIDELIDAD ABSOLUTA: Resume únicamente usando información explícitamente presente en estos datos. PROHIBIDO incluir conceptos ajenos al autor (como arquetipos, inconsciente, psicología junguiana, filosofía china o masonería).

Devolvé SOLO JSON válido:
{
  "summary": "Resumen ejecutivo de 2-3 párrafos del libro completo enfocado en sus conceptos reales.",
  "thesis": "Una oración que capture la tesis o mensaje central del autor en esta obra."
}

Respondé en español argentino.`;

    try {
      const res = await this.ollama.generate({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 600,
      });

      const clean = res.content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json|```/gi, '')
        .trim();

      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          summary: parsed.summary ?? `Libro "${title}" procesado por pipeline de síntesis.`,
          thesis: parsed.thesis ?? '',
        };
      }
    } catch (err: any) {
      this.logger.warn(`[synthesis:reduce] Error generando resumen ejecutivo: ${err.message}`);
    }

    return {
      summary: `Libro "${title}" procesado por pipeline de síntesis estructurada.`,
      thesis: '',
    };
  }

  private async generateCrossAuthorComparison(
    collection: string,
    results: SynthesisResult[],
  ): Promise<string> {
    const summaries = results
      .filter(r => r.insight)
      .map(r => `**${r.insight!.author}** ("${r.title}"): ${r.insight!.centralThesis ?? r.insight!.executiveSummary.slice(0, 200)}`)
      .join('\n\n');

    const prompt = `Tenés las siguientes obras de la colección "${collection}":

${summaries}

Generá una comparación cross-autor de 2 párrafos en español argentino que:
1. Identifique puntos de acuerdo entre los autores.
2. Identifique diferencias o perspectivas contrastantes.

Solo la comparación, sin introducción.`;

    try {
      const res = await this.ollama.generate({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
      });
      return res.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    } catch {
      return '';
    }
  }

  // ── Persistencia ──────────────────────────────────────────────────────────

  private async upsertInsight(data: DocumentInsightData): Promise<void> {
    const payload = {
      title: data.title,
      author: data.author,
      collection: data.collection ?? null,
      executiveSummary: data.executiveSummary,
      centralThesis: data.centralThesis ?? null,
      highlightedStories: JSON.stringify(data.highlightedStories),
      keyCharacters: JSON.stringify(data.keyCharacters),
      coreConcepts: JSON.stringify(data.coreConcepts),
      notableQuotes: JSON.stringify(data.notableQuotes),
      controversialIdeas: JSON.stringify(data.controversialIdeas),
      practicalTechniques: JSON.stringify(data.practicalTechniques),
      contradictions: JSON.stringify(data.contradictions),
      synthesisVersion: this.SYNTHESIS_VERSION,
    };

    await this.prisma.documentInsight.upsert({
      where: { documentId: data.documentId },
      create: { documentId: data.documentId, ...payload },
      update: payload,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private deserializeInsight(raw: any): DocumentInsightData {
    return {
      documentId: raw.documentId,
      title: raw.title,
      author: raw.author,
      collection: raw.collection ?? undefined,
      executiveSummary: raw.executiveSummary,
      centralThesis: raw.centralThesis ?? undefined,
      highlightedStories: this.parseJson(raw.highlightedStories),
      keyCharacters: this.parseJson(raw.keyCharacters),
      coreConcepts: this.parseJson(raw.coreConcepts),
      notableQuotes: this.parseJson(raw.notableQuotes),
      controversialIdeas: this.parseJson(raw.controversialIdeas),
      practicalTechniques: this.parseJson(raw.practicalTechniques),
      contradictions: this.parseJson(raw.contradictions),
    };
  }

  private parseJson(raw: string): string[] {
    try { return JSON.parse(raw) ?? []; } catch { return []; }
  }

  private dedup(arr: string[]): string[] {
    const seen = new Set<string>();
    return arr.filter(s => {
      const k = s.toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  private splitSections(text: string): string[] {
    const sections: string[] = [];
    let start = 0;
    const MAX_SECTIONS = 6; // equilibrio velocidad/calidad para Gemma 3 1B
    while (start < text.length && sections.length < MAX_SECTIONS) {
      sections.push(text.slice(start, start + this.SECTION_CHAR_LIMIT));
      start += this.SECTION_CHAR_LIMIT;
    }
    return sections;
  }
}
