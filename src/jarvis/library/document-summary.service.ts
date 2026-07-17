import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { OllamaProvider } from '../llm/ollama.provider';
import { CorpusSelectorService } from '../knowledge/corpus-selector.service';
import { DocumentIngestService } from './document-ingest.service';

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
    private readonly corpusSelector: CorpusSelectorService,
    private readonly ingestService: DocumentIngestService,
  ) {}

  /**
   * Genera un resumen detallado de un documento específico.
   * Busca el documento por título (fuzzy match) o por ID.
   */
  async generateDocumentSummary(
    titleOrId: string | number,
    maxKeyPoints = 10,
  ): Promise<DocumentSummaryResult> {
    this.logger.log(
      `[document-summary] generando resumen para: "${titleOrId}"`,
    );

    // 1. Buscar el documento
    const document =
      typeof titleOrId === 'number'
        ? await this.documentRepo.getDocumentWithChunks(titleOrId)
        : await this.findDocumentByTitle(titleOrId as string);

    if (!document) {
      // Buscar candidatos cercanos para sugerir al usuario
      const suggestions = await this.documentRepo.searchDocuments(
        typeof titleOrId === 'string' ? titleOrId : String(titleOrId),
        15,
      );

      const uniqueTitles = Array.from(
        new Set(suggestions.map((d) => d.title)),
      ).slice(0, 3);
      let message = `❌ No encontré ningún documento con el título "${titleOrId}".`;

      if (uniqueTitles.length > 0) {
        message += `\n\n¿Quizás quisiste decir?\n${uniqueTitles.map((t) => `  • *${t}*`).join('\n')}`;
        message += `\n\nUsá el título exacto o escribí \`mis documentos\` para ver todos.`;
      } else {
        message += `\n\nEscribí \`mis documentos\` para ver los títulos disponibles.`;
      }

      throw new NotFoundException(message);
    }

    this.logger.log(
      `[document-summary] documento encontrado: id=${document.id}, title="${document.title}", chunks=${document.chunks?.length ?? 0}`,
    );

    // Si ya existe una Ficha de Conocimiento (Knowledge Card) en DB, servirla directamente
    if (document.summary && document.summary.trim().length > 100) {
      this.logger.log(
        `[document-summary] sirviendo Ficha de Conocimiento ya almacenada en base de datos`,
      );

      const lines = document.summary.split('\n');
      const keyPoints: string[] = [];
      let inKeyPointsSection = false;
      for (const line of lines) {
        if (
          /Preguntas que puede responder|Conceptos Clave|Conceptos Detectados/i.test(
            line,
          )
        ) {
          inKeyPointsSection = true;
          continue;
        }
        if (inKeyPointsSection) {
          if (line.startsWith('###') || line.startsWith('---')) {
            inKeyPointsSection = false;
          } else {
            const trimmed = line.trim();
            if (
              trimmed.startsWith('-') ||
              trimmed.startsWith('*') ||
              trimmed.startsWith('✔') ||
              trimmed.startsWith('✓')
            ) {
              keyPoints.push(trimmed.replace(/^[-*✔✓\s]+/, '').trim());
            }
          }
        }
      }

      const wordCount = (document.content || '').split(/\s+/).length;
      return {
        documentId: document.id,
        title: document.title,
        category: document.category,
        summary: document.summary,
        keyPoints:
          keyPoints.length > 0
            ? keyPoints.slice(0, maxKeyPoints)
            : ['Ficha de conocimiento estructurada de la obra.'],
        wordCount,
        chunkCount: document.chunks?.length ?? 0,
      };
    }

    // 2. Combinar contenido de chunks
    const fullContent =
      document.chunks?.map((chunk) => chunk.content).join('\n\n') ||
      document.content ||
      '';

    if (!fullContent || fullContent.length < 50) {
      return {
        documentId: document.id,
        title: document.title,
        category: document.category,
        summary:
          'El documento está vacío o no tiene contenido suficiente para generar un resumen.',
        keyPoints: [],
        wordCount: 0,
        chunkCount: document.chunks?.length ?? 0,
      };
    }

    // 3. Calcular stats
    const wordCount = fullContent.split(/\s+/).length;

    // 4. Generar resumen y puntos clave con LLM (solo si no existía pre-generado)
    const { summary, keyPoints } = await this.generateSummaryWithLLM(
      document.title,
      fullContent,
      document.category,
      maxKeyPoints,
    );

    // Guardar en la DB para futuras consultas
    try {
      await this.documentRepo.updateDocumentProgress(document.id, {
        summary: summary,
      });
      this.logger.log(
        `[document-summary] Ficha de Conocimiento guardada en DB para docId=${document.id}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `No se pudo guardar la Ficha de Conocimiento en DB: ${err.message}`,
      );
    }

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
    // 0. Consultar el índice de la biblioteca (Corpus Selector) para buscar el documento y lazy-loadearlo si es necesario
    const indexMatches = this.corpusSelector.findRelevantDocuments(title, 1);
    if (indexMatches.length > 0) {
      const match = indexMatches[0];
      if (match.score >= 1.5) {
        const doc = match.document;
        this.logger.log(
          `[document-summary:search] Encontrado en índice: "${doc.titulo}" (score=${match.score}). Verificando en DB...`,
        );
        try {
          let dbDocId: number;
          if (doc.embeddings !== 'ready') {
            dbDocId = await this.corpusSelector.lazyLoadDocument(
              doc,
              this.ingestService,
              this.documentRepo,
            );
          } else {
            const existing = await this.documentRepo.findDocumentByExactTitle(
              doc.titulo,
            );
            if (existing) {
              dbDocId = existing.id;
            } else {
              this.logger.warn(
                `[document-summary:search] "${doc.titulo}" marcado como ready pero no hallado en BD. Recargando...`,
              );
              dbDocId = await this.corpusSelector.lazyLoadDocument(
                doc,
                this.ingestService,
                this.documentRepo,
              );
            }
          }
          return this.documentRepo.getDocumentWithChunks(dbDocId);
        } catch (err: any) {
          this.logger.error(
            `[document-summary:search] Error en lazy loading de "${doc.titulo}": ${err.message}`,
          );
        }
      }
    }

    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // quitar tildes
        .replace(
          /\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|odt|rtf|html?|epub|mobi)$/i,
          '',
        ) // quitar extensión
        .toLowerCase()
        .trim();

    const normalizedSearch = normalize(title);
    const searchWords = normalizedSearch
      .split(/\s+/)
      .filter((w) => w.length > 2 || /^\d+$/.test(w));

    this.logger.log(
      `[document-summary:search] buscando en DB: "${normalizedSearch}" (${searchWords.length} palabras)`,
    );

    // 1. Buscar candidatos — primero solo por título (más preciso), luego full-text
    let candidates =
      await this.documentRepo.searchDocumentsByTitle(normalizedSearch);

    // Si no hay candidatos por título, buscar también en contenido
    if (candidates.length === 0) {
      candidates = await this.documentRepo.searchDocuments(normalizedSearch);
    }

    // Búsqueda adicional por palabras largas si todavía no hay resultados
    if (candidates.length === 0 && searchWords.length > 0) {
      const longWords = searchWords.filter((w) => w.length >= 5);
      if (longWords.length > 0) {
        candidates = await this.documentRepo.searchDocumentsByTitle(
          longWords.join(' '),
        );
      }
    }

    if (candidates.length === 0) {
      this.logger.warn(
        `[document-summary:search] sin candidatos para: "${normalizedSearch}"`,
      );
      return null;
    }

    this.logger.log(
      `[document-summary:search] ${candidates.length} candidato(s): ${candidates.map((d) => `"${d.title}"`).join(', ')}`,
    );

    // 2. Match exacto (normalizado, sin extensión)
    const exactMatch = candidates.find(
      (doc) => normalize(doc.title) === normalizedSearch,
    );
    if (exactMatch) {
      this.logger.log(
        `[document-summary:search] match exacto → "${exactMatch.title}"`,
      );
      return this.documentRepo.getDocumentWithChunks(exactMatch.id);
    }

    // 3. El título del doc CONTIENE toda la query buscada
    const containsAll = candidates.find((doc) => {
      const docNorm = normalize(doc.title);
      return searchWords.every((w) => docNorm.includes(w));
    });
    if (containsAll) {
      this.logger.log(
        `[document-summary:search] contains-all match → "${containsAll.title}"`,
      );
      return this.documentRepo.getDocumentWithChunks(containsAll.id);
    }

    // 4. Overlap score
    const scored = candidates
      .map((doc) => {
        const docWords = normalize(doc.title)
          .split(/[\s\-_]+/)
          .filter((w) => w.length > 2 || /^\d+$/.test(w));
        const hits = searchWords.filter((w) =>
          docWords.some((dw) => dw.includes(w) || w.includes(dw)),
        );
        const score =
          searchWords.length > 0 ? hits.length / searchWords.length : 0;
        return { doc, score, hits: hits.length };
      })
      .sort((a, b) => b.score - a.score || b.hits - a.hits);

    const best = scored[0];
    if (best && best.score >= 0.4) {
      this.logger.log(
        `[document-summary:search] overlap match (${Math.round(best.score * 100)}%) → "${best.doc.title}"`,
      );
      return this.documentRepo.getDocumentWithChunks(best.doc.id);
    }

    this.logger.warn(
      `[document-summary:search] mejor score ${Math.round((best?.score ?? 0) * 100)}% — umbral no alcanzado para: "${normalizedSearch}"`,
    );
    return null;
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

    const systemPrompt = `Sos un epistemólogo y bibliotecario experto. Tu tarea es generar una **Ficha de Conocimiento (Knowledge Card)** estructurada y profesional sobre la obra para integrarla en una base de conocimientos.
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
[Identificá los 6 a 10 conceptos o términos teóricos más importantes y estimá/mencioná su frecuencia/relevancia en el texto en formato:
- **[Conteo estimado/menciones]** [Concepto]]

---

### ❓ Preguntas que puede responder este libro
Este libro es especialmente útil para responder consultas como:
[Generá una lista de 4 o 5 preguntas teóricas profundas que el lector puede responder al consultar este libro. Usá viñetas con el check "✔ ¿Qué...?", "✔ ¿Cómo...?", "✔ ¿Por qué...?", etc.]

---

### 🔗 Relaciones y Contexto
- **Autores Relacionados:** [Autores del mismo dominio u opiniones opuestas]
- **Obras Relacionadas:** [Títulos de libros o corpus relacionados]
- **Ideal para responder:** [Lista de temas o conceptos ideales para responder, separados por comas]
- **Límites (No profundiza en):** [Qué áreas o disciplinas NO están cubiertas o explicadas en la obra]

---

### 🌲 Grafo de Relaciones (Estructura ASCII)
[Dibujá un diagrama ASCII de árbol limpio que relacione el autor, conceptos centrales y ramificaciones principales]

---

### 💡 ¿Por qué consultar este documento? (Aporte a la biblioteca)
[Un párrafo profundo y analítico explicando qué aporta esta obra a la biblioteca personal, cómo complementa otras obras y por qué el sistema JarBees debería elegir este corpus ante consultas de RAG]`;

    const userPrompt = `Documento: "${title}"${category ? `\nCategoría: ${category}` : ''}
Palabras: ~${content.split(/\s+/).length}

CONTENIDO PARA ANÁLISIS:
${contentToAnalyze}

---
Generá la Ficha de Conocimiento siguiendo la estructura exacta especificada.`;

    try {
      const response = await this.ollamaProvider.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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
   * Parsea la respuesta del LLM para extraer resumen y puntos clave de la Ficha de Conocimiento.
   */
  private parseLLMResponse(
    llmResponse: string,
    maxKeyPoints: number,
  ): { summary: string; keyPoints: string[] } {
    const lines = llmResponse.split('\n');
    const keyPoints: string[] = [];
    let inKeyPointsSection = false;

    for (const line of lines) {
      if (
        /Preguntas que puede responder|Conceptos Clave|Conceptos Detectados/i.test(
          line,
        )
      ) {
        inKeyPointsSection = true;
        continue;
      }
      if (inKeyPointsSection) {
        if (line.startsWith('###') || line.startsWith('---')) {
          inKeyPointsSection = false;
        } else {
          const trimmed = line.trim();
          if (
            trimmed.startsWith('-') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('✔') ||
            trimmed.startsWith('✓')
          ) {
            keyPoints.push(trimmed.replace(/^[-*✔✓\s]+/, '').trim());
          }
        }
      }
    }

    return {
      summary: llmResponse.trim(),
      keyPoints:
        keyPoints.length > 0
          ? keyPoints.slice(0, maxKeyPoints)
          : ['Ficha de conocimiento estructurada de la obra.'],
    };
  }

  /**
   * Genera una Ficha de Conocimiento básica cuando el LLM no está disponible.
   */
  private generateFallbackSummary(
    title: string,
    content: string,
    maxKeyPoints: number,
  ): { summary: string; keyPoints: string[] } {
    const wordCount = content.split(/\s+/).length;
    const excerpt = content.slice(0, 1000);

    // Intentar extraer primeras oraciones como preguntas o conceptos clave
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.length < 150)
      .slice(0, maxKeyPoints);

    const keyPoints =
      sentences.length > 0
        ? sentences
        : [
            'El documento está disponible pero no se pudo generar un análisis automático por falta de conexión al modelo de IA.',
          ];

    const summary = `# 📖 ${title}

- **Autor:** Desconocido
- **Categoría/Dominio:** General
- **Tamaño:** ~${wordCount} palabras

---

### 🧠 Mapa del Conocimiento
Este documento contiene texto plano. A continuación se presenta un extracto inicial:
> ${excerpt}...

---

### ❓ Preguntas que puede responder este libro
${keyPoints.map((p) => `✔ ¿${p.endsWith('?') ? p.slice(0, -1) : p}?`).join('\n')}

---

⚠️ El modelo de IA no estaba disponible para generar la Ficha de Conocimiento completa.`;

    return {
      summary,
      keyPoints,
    };
  }
}
