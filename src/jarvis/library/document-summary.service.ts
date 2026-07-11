import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { OllamaProvider } from '../llm/ollama.provider';

export interface DocumentSummaryResult {
  documentId: number;
  title: string;
  category?: string;
  summary: string;
  keyPoints: string[];
  wordCount: number;
  chunkCount: number;
}

/**
 * Servicio especializado en generar resúmenes detallados de documentos individuales.
 * A diferencia de CategorySummaryService (que combina múltiples documentos),
 * este servicio se enfoca en un solo documento y genera:
 * - Resumen ejecutivo
 * - Puntos clave (top 10 items más relevantes)
 * - Información estructurada
 * 
 * Ejemplos de uso:
 * - "resumen de 'Manual de Plantas Medicinales'"
 * - "dame los 10 puntos clave de 'TypeScript Handbook'"
 * - "resumen del documento 'Guía de NestJS'"
 */
@Injectable()
export class DocumentSummaryService {
  private readonly logger = new Logger(DocumentSummaryService.name);

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly ollamaProvider: OllamaProvider,
  ) {}

  /**
   * Genera un resumen detallado de un documento específico.
   * Busca el documento por título (fuzzy match) o por ID.
   */
  async generateDocumentSummary(
    titleOrId: string | number,
    maxKeyPoints = 10,
  ): Promise<DocumentSummaryResult> {
    this.logger.log(`[document-summary] generando resumen para: "${titleOrId}"`);

    // 1. Buscar el documento
    const document = typeof titleOrId === 'number'
      ? await this.documentRepo.getDocumentWithChunks(titleOrId)
      : await this.findDocumentByTitle(titleOrId as string);

    if (!document) {
      throw new NotFoundException(
        `No encontré un documento con el título o ID: "${titleOrId}". ` +
        `Podés ver tus documentos con el comando "mis documentos".`
      );
    }

    this.logger.log(`[document-summary] documento encontrado: id=${document.id}, title="${document.title}", chunks=${document.chunks?.length ?? 0}`);

    // 2. Combinar contenido de chunks
    const fullContent = document.chunks
      ?.map(chunk => chunk.content)
      .join('\n\n') || document.content || '';

    if (!fullContent || fullContent.length < 50) {
      return {
        documentId: document.id,
        title: document.title,
        category: document.category,
        summary: 'El documento está vacío o no tiene contenido suficiente para generar un resumen.',
        keyPoints: [],
        wordCount: 0,
        chunkCount: document.chunks?.length ?? 0,
      };
    }

    // 3. Calcular stats
    const wordCount = fullContent.split(/\s+/).length;

    // 4. Generar resumen y puntos clave con LLM
    const { summary, keyPoints } = await this.generateSummaryWithLLM(
      document.title,
      fullContent,
      document.category,
      maxKeyPoints,
    );

    this.logger.log(
      `[document-summary] OK — resumen de ${summary.length} chars, ${keyPoints.length} puntos clave`,
    );

    return {
      documentId: document.id,
      title: document.title,
      category: document.category,
      summary,
      keyPoints,
      wordCount,
      chunkCount: document.chunks?.length ?? 0,
    };
  }

  /**
   * Busca un documento por título usando fuzzy matching progresivo:
   * 1. Match exacto (normalizado)
   * 2. El documento contiene TODAS las palabras buscadas (>2 chars)
   * 3. Overlap score: mayor % de palabras en común
   * 4. Primer candidato de búsqueda full-text (fallback)
   */
  private async findDocumentByTitle(title: string): Promise<any | null> {
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // quitar tildes
        .replace(/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|odt|rtf|html?|epub|mobi)$/i, '') // quitar extensión
        .toLowerCase()
        .trim();

    const normalizedSearch = normalize(title);
    const searchWords = normalizedSearch
      .split(/\s+/)
      .filter(w => w.length > 2);

    this.logger.log(`[document-summary:search] buscando: "${normalizedSearch}" (${searchWords.length} palabras)`);

    // 1. Buscar candidatos por full-text
    const candidates = await this.documentRepo.searchDocuments(normalizedSearch);

    // 2. Si el título original busca solo una parte → también buscar en todos los docs
    //    para capturar casos donde "Carta astral" está en el título "Resumen Carta astral..."
    let allCandidates = candidates;
    if (candidates.length === 0 || searchWords.length > 0) {
      // Intentar búsqueda adicional solo por palabras largas del título
      const longWords = searchWords.filter(w => w.length >= 5);
      if (longWords.length > 0 && longWords.length < searchWords.length) {
        const extra = await this.documentRepo.searchDocuments(longWords.join(' '));
        const existingIds = new Set(candidates.map(d => d.id));
        allCandidates = [...candidates, ...extra.filter(d => !existingIds.has(d.id))];
      }
    }

    if (allCandidates.length === 0) {
      this.logger.warn(`[document-summary:search] sin candidatos para: "${normalizedSearch}"`);
      return null;
    }

    this.logger.log(`[document-summary:search] ${allCandidates.length} candidato(s): ${allCandidates.map(d => `"${d.title}"`).join(', ')}`);

    // 3. Match exacto (normalizado, sin extensión)
    const exactMatch = allCandidates.find(doc =>
      normalize(doc.title) === normalizedSearch,
    );
    if (exactMatch) {
      this.logger.log(`[document-summary:search] match exacto → "${exactMatch.title}"`);
      return this.documentRepo.getDocumentWithChunks(exactMatch.id);
    }

    // 4. El título del doc CONTIENE toda la query buscada
    const containsAll = allCandidates.find(doc => {
      const docNorm = normalize(doc.title);
      return searchWords.every(w => docNorm.includes(w));
    });
    if (containsAll) {
      this.logger.log(`[document-summary:search] contains-all match → "${containsAll.title}"`);
      return this.documentRepo.getDocumentWithChunks(containsAll.id);
    }

    // 5. Overlap score: # de palabras de búsqueda presentes en el título del doc
    const scored = allCandidates
      .map(doc => {
        const docWords = normalize(doc.title).split(/\s+/).filter(w => w.length > 2);
        const hits = searchWords.filter(w => docWords.some(dw => dw.includes(w) || w.includes(dw)));
        const score = searchWords.length > 0 ? hits.length / searchWords.length : 0;
        return { doc, score, hits: hits.length };
      })
      .sort((a, b) => b.score - a.score || b.hits - a.hits);

    const best = scored[0];
    if (best && best.score >= 0.5) {
      this.logger.log(`[document-summary:search] overlap match (${Math.round(best.score * 100)}%) → "${best.doc.title}"`);
      return this.documentRepo.getDocumentWithChunks(best.doc.id);
    }

    // 6. Fallback: primer candidato
    this.logger.log(`[document-summary:search] fallback → "${allCandidates[0].title}"`);
    return this.documentRepo.getDocumentWithChunks(allCandidates[0].id);
  }


  /**
   * Genera el resumen y puntos clave usando el LLM.
   */
  private async generateSummaryWithLLM(
    title: string,
    content: string,
    category: string | undefined,
    maxKeyPoints: number,
  ): Promise<{ summary: string; keyPoints: string[] }> {
    // Limitar contenido para no saturar el contexto (usar primeros 8000 chars + últimos 2000)
    let contentToAnalyze = content;
    if (content.length > 10000) {
      const start = content.slice(0, 8000);
      const end = content.slice(-2000);
      contentToAnalyze = `${start}\n\n[... contenido medio omitido para análisis ...]\n\n${end}`;
    }

    const systemPrompt = `Sos un experto analista de documentos. Tu tarea es generar un resumen estructurado de alta calidad.

FORMATO DE RESPUESTA (ESTRICTO):
Respondé EXACTAMENTE en este formato, sin agregar texto adicional:

RESUMEN:
[Aquí escribís un resumen ejecutivo de 3-4 párrafos del documento completo]

PUNTOS_CLAVE:
1. [Primer punto clave más importante]
2. [Segundo punto clave]
3. [Tercer punto clave]
...
${maxKeyPoints}. [Punto clave número ${maxKeyPoints}]

REGLAS:
- El resumen debe ser comprehensivo pero conciso (3-4 párrafos)
- Los puntos clave deben ser los ${maxKeyPoints} conceptos/ideas MÁS IMPORTANTES del documento
- Cada punto clave debe ser una oración completa y específica
- Priorizá información accionable y conceptos centrales
- Respondé en español argentino
- NO agregues introducciones ni conclusiones extra
- NO uses markdown (negritas, cursivas, etc.) en los puntos clave`;

    const userPrompt = `Documento: "${title}"${category ? `\nCategoría: ${category}` : ''}
Palabras: ~${content.split(/\s+/).length}

CONTENIDO:
${contentToAnalyze}

---
Generá el resumen y ${maxKeyPoints} puntos clave siguiendo el formato exacto especificado.`;

    try {
      const response = await this.ollamaProvider.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        maxTokens: 1500,
      });

      return this.parseLLMResponse(response.content, maxKeyPoints);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[document-summary:llm] error: ${msg}`);
      
      // Fallback: generar resumen básico sin LLM
      return this.generateFallbackSummary(title, content, maxKeyPoints);
    }
  }

  /**
   * Parsea la respuesta del LLM para extraer resumen y puntos clave.
   */
  private parseLLMResponse(
    llmResponse: string, 
    maxKeyPoints: number
  ): { summary: string; keyPoints: string[] } {
    const lines = llmResponse.split('\n').map(l => l.trim()).filter(l => l);
    
    let summary = '';
    const keyPoints: string[] = [];
    let inSummary = false;
    let inKeyPoints = false;

    for (const line of lines) {
      // Detectar secciones
      if (/^RESUMEN:?$/i.test(line)) {
        inSummary = true;
        inKeyPoints = false;
        continue;
      }
      if (/^PUNTOS[_\s]CLAVE:?$/i.test(line)) {
        inSummary = false;
        inKeyPoints = true;
        continue;
      }

      // Acumular contenido
      if (inSummary && line.length > 10) {
        summary += (summary ? '\n\n' : '') + line;
      }
      if (inKeyPoints && /^\d+\./.test(line)) {
        // Remover el número inicial "1. ", "2. ", etc.
        const point = line.replace(/^\d+\.\s*/, '').trim();
        if (point && keyPoints.length < maxKeyPoints) {
          keyPoints.push(point);
        }
      }
    }

    // Si no se detectó el formato esperado, intentar extraer de otra forma
    if (!summary || keyPoints.length === 0) {
      // Buscar cualquier lista numerada en la respuesta
      const listItems = llmResponse.match(/^\d+\.\s+.+$/gm) || [];
      if (listItems.length > 0) {
        keyPoints.push(...listItems.map(item => 
          item.replace(/^\d+\.\s*/, '').trim()
        ).slice(0, maxKeyPoints));
      }

      // Usar el resto como resumen
      if (!summary) {
        summary = llmResponse
          .replace(/^RESUMEN:?\s*/i, '')
          .replace(/^PUNTOS[_\s]CLAVE:?.*$/im, '')
          .replace(/^\d+\.\s+.+$/gm, '')
          .trim();
      }
    }

    return {
      summary: summary || 'No se pudo generar el resumen.',
      keyPoints: keyPoints.length > 0 ? keyPoints : ['No se pudieron extraer puntos clave.'],
    };
  }

  /**
   * Genera un resumen básico cuando el LLM no está disponible.
   */
  private generateFallbackSummary(
    title: string,
    content: string,
    maxKeyPoints: number,
  ): { summary: string; keyPoints: string[] } {
    // Extracto del inicio
    const excerpt = content.slice(0, 800);
    const wordCount = content.split(/\s+/).length;

    // Intentar extraer primeras oraciones como puntos clave
    const sentences = content
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 200)
      .slice(0, maxKeyPoints);

    return {
      summary: `📄 **${title}**\n\n` +
               `Documento con aproximadamente ${wordCount} palabras.\n\n` +
               `**Extracto:**\n${excerpt}${content.length > 800 ? '...' : ''}` +
               `\n\n⚠️ El modelo de IA no estaba disponible. Este es un resumen básico.`,
      keyPoints: sentences.length > 0 
        ? sentences 
        : ['El documento está disponible pero no se pudo generar un análisis automático.'],
    };
  }
}
