import { Injectable, Logger } from '@nestjs/common';
import { CorpusSelectorService, SCHOOLS_OF_THOUGHT } from './corpus-selector.service';

export interface EvidenceReport {
  confidenceScore: number;
  chunksCount: number;
  authorsVerified: string[];
  authorsHallucinated: string[];
  conceptsVerified: string[];
  conceptsHallucinated: string[];
  formattedReportMarkdown: string;
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(private readonly corpusSelector: CorpusSelectorService) {}

  /**
   * Verifica la respuesta generada por el LLM contrastándola contra los fragmentos (chunks) recuperados.
   * Identifica entidades válidas e inventadas y computa el puntaje de confianza.
   */
  verifyResponse(
    response: string,
    retrievedChunks: any[],
    query: string,
  ): EvidenceReport {
    const start = Date.now();
    
    if (!response || response.trim().length === 0) {
      return {
        confidenceScore: 0,
        chunksCount: 0,
        authorsVerified: [],
        authorsHallucinated: [],
        conceptsVerified: [],
        conceptsHallucinated: [],
        formattedReportMarkdown: '',
      };
    }

    const responseNormalized = this.normalizeText(response);

    // 1. Identificar documentos y metadatos de los chunks recuperados
    const retrievedTitles = new Set<string>();
    const expectedAuthors = new Set<string>();
    const expectedConcepts = new Set<string>();

    for (const chunk of retrievedChunks) {
      const docTitle = chunk.document?.title;
      if (docTitle) {
        retrievedTitles.add(docTitle);
        const meta = this.corpusSelector.getAuthorAndSchoolByTitle(docTitle);
        if (meta && meta.author && meta.author !== 'Autor Desconocido') {
          expectedAuthors.add(this.normalizeText(meta.author));
          // También agregar variaciones de apellido
          const parts = meta.author.split(/\s+/);
          parts.forEach(part => {
            if (part.length > 3) expectedAuthors.add(this.normalizeText(part));
          });
        }
      }
    }

    // Buscar si los documentos en library-index.json tienen conceptos clave y agregarlos
    const libraryIndex = this.corpusSelector.getIndex();
    for (const title of retrievedTitles) {
      const doc = libraryIndex.documentos.find(
        (d) => d.titulo.toLowerCase() === title.toLowerCase(),
      );
      if (doc) {
        if (doc.autor) {
          expectedAuthors.add(this.normalizeText(doc.autor));
        }
        if (doc.conceptosClave) {
          doc.conceptosClave.forEach((c) => expectedConcepts.add(this.normalizeText(c)));
        }
      }
    }

    // 2. Obtener todos los autores y conceptos posibles en el corpus
    const allAuthors = this.corpusSelector.getAllAuthors();
    const allConcepts = this.corpusSelector.getAllConcepts();

    const authorsVerified: string[] = [];
    const authorsHallucinated: string[] = [];
    const conceptsVerified: string[] = [];
    const conceptsHallucinated: string[] = [];

    // 3. Escanear entidades capitalizadas (para detectar nombres de autores y términos específicos)
    const properNounRegex = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]+)*\b/g;
    const capitalizedMatches = response.match(properNounRegex) || [];

    const ignoredEntities = new Set([
      'el', 'la', 'los', 'las', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
      'esos', 'esas', 'segun', 'como', 'cuando', 'desde', 'hasta', 'para', 'con',
      'sin', 'por', 'del', 'al', 'un', 'una', 'unos', 'unas', 'yo', 'tu', 'el',
      'ella', 'nosotros', 'ustedes', 'ellos', 'ellas', 'hola', 'jarbees', 'jarvis',
      'modelo', 'activo', 'biblioteca', 'personal', 'documento', 'resumen', 'puntos',
      'clave', 'contenido', 'escuela', 'pensamiento', 'autor', 'respuesta',
      'resumen ejecutivo', 'puntos clave', 'puntos clave principales', 'ejes tematicos',
      'capitulos conceptuales', 'mapa del conocimiento', 'ficha de conocimiento',
      'preguntas que puede responder', 'relaciones y contexto', 'analisis de respaldo',
      'intuicion directa', 'teoria de los complejos', 'energetica psiquica',
      'esencia del sueno', 'esencia del sueño', 'psicologia analitica', 'inconsciente colectivo',
      'fuerza psiquica', 'teoria del inconsciente', 'obras completas', 'obra completa'
    ]);

    for (const entity of capitalizedMatches) {
      const normalizedEntity = this.normalizeText(entity);
      if (normalizedEntity.length < 3 || ignoredEntities.has(normalizedEntity)) {
        continue;
      }

      // Verificar si es un autor conocido o probable nombre de persona alucinado
      const matchingAuthor = allAuthors.find(a => {
        const normA = this.normalizeAuthorNameForComparison(a);
        const normE = this.normalizeAuthorNameForComparison(entity);
        return normA.includes(normE) || normE.includes(normA);
      });

      const isKnownAuthor = !!matchingAuthor;
      
      let foundInContext = false;
      for (const chunk of retrievedChunks) {
        if (this.normalizeText(chunk.content).includes(normalizedEntity)) {
          foundInContext = true;
          break;
        }
      }
      if (!foundInContext && isKnownAuthor) {
        foundInContext = Array.from(expectedAuthors).some(ea => ea.includes(normalizedEntity) || normalizedEntity.includes(ea));
      }

      // Si es un autor o probable persona
      if (isKnownAuthor || this.isLikelyPersonName(entity)) {
        const displayName = matchingAuthor || entity;
        if (foundInContext || expectedAuthors.has(this.normalizeText(displayName))) {
          if (!authorsVerified.includes(displayName)) {
            authorsVerified.push(displayName);
          }
        } else {
          if (!authorsHallucinated.includes(displayName) && !authorsVerified.includes(displayName)) {
            authorsHallucinated.push(displayName);
          }
        }
      }
    }

    // 4. Escanear conceptos del corpus de forma de búsqueda de texto completa (case-insensitive)
    for (const concept of allConcepts) {
      const normalizedConcept = this.normalizeText(concept);
      if (normalizedConcept.length < 4) continue;

      if (responseNormalized.includes(normalizedConcept)) {
        let foundInContext = false;
        for (const chunk of retrievedChunks) {
          if (this.normalizeText(chunk.content).includes(normalizedConcept)) {
            foundInContext = true;
            break;
          }
        }
        if (!foundInContext) {
          foundInContext = expectedConcepts.has(normalizedConcept);
        }

        if (foundInContext) {
          if (!conceptsVerified.includes(concept)) {
            conceptsVerified.push(concept);
          }
        } else {
          if (!conceptsHallucinated.includes(concept) && !conceptsVerified.includes(concept)) {
            conceptsHallucinated.push(concept);
          }
        }
      }
    }

    // 5. Análisis de respaldo a nivel de oraciones
    const sentences = response
      .split(/(?<!\d)\.(?!\d)|[!?\n]+/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    let groundedSentencesCount = 0;

    for (const sentence of sentences) {
      const sentenceNorm = this.normalizeText(sentence);
      
      // Si la oración menciona un autor o concepto alucinado, automáticamente no está sustentada
      const containsHallucination =
        authorsHallucinated.some((a) => sentenceNorm.includes(this.normalizeText(a))) ||
        conceptsHallucinated.some((c) => sentenceNorm.includes(this.normalizeText(c)));

      if (containsHallucination) {
        continue;
      }

      // Si es una frase típica de evasión ("no encontré", "no hay suficiente información", etc.),
      // la consideramos grounded de forma nativa para no penalizar la honestidad del modelo
      if (
        /no\s+encontre\s+suficiente/i.test(sentenceNorm) ||
        /no\s+tengo\s+informacion/i.test(sentenceNorm) ||
        /no\s+se\s+encuentra\s+en\s+la\s+biblioteca/i.test(sentenceNorm)
      ) {
        groundedSentencesCount++;
        continue;
      }

      // De lo contrario, calcular coincidencia de palabras clave con los chunks
      const sentenceContentWords = this.getContentWords(sentenceNorm);
      if (sentenceContentWords.length === 0) {
        groundedSentencesCount++; // Oración sin contenido real relevante (ej: "Saludos.")
        continue;
      }

      let matchesChunk = false;
      for (const chunk of retrievedChunks) {
        const chunkNorm = this.normalizeText(chunk.content);
        let matchCount = 0;
        for (const word of sentenceContentWords) {
          if (chunkNorm.includes(word)) {
            matchCount++;
          }
        }
        // Si la oración comparte al menos 2 palabras clave con el fragmento, se considera sustentada
        // o si es muy corta con compartir 1 es suficiente.
        const requiredMatches = sentenceContentWords.length <= 3 ? 1 : 2;
        if (matchCount >= requiredMatches) {
          matchesChunk = true;
          break;
        }
      }

      if (matchesChunk) {
        groundedSentencesCount++;
      }
    }

    const groundingRatio = sentences.length > 0 ? groundedSentencesCount / sentences.length : 1.0;

    // 6. Computar Score de Confianza
    let score = 100;
    
    // Penalizaciones por entidades inventadas
    score -= authorsHallucinated.length * 25;
    score -= conceptsHallucinated.length * 15;
    
    // Multiplicar por el ratio de oraciones grounded
    score = Math.round(score * groundingRatio);
    score = Math.max(0, Math.min(100, score));

    // Si no había chunks recuperados y la respuesta no es evasiva, penalizar fuertemente
    if (retrievedChunks.length === 0) {
      const isHonestEvasion = /no\s+(?:encontre|tengo|hay)\s+suficiente\s+informacion/i.test(responseNormalized);
      if (!isHonestEvasion) {
        score = Math.min(score, 30); // Tope de 30% si inventó respuesta sin contexto
      } else {
        score = 100; // 100% honesto si no hay datos y lo dijo
      }
    }

    // 7. Generar Markdown Report
    const markdown = this.buildMarkdownDetails(
      score,
      retrievedChunks.length,
      authorsVerified,
      authorsHallucinated,
      conceptsVerified,
      conceptsHallucinated,
    );

    const elapsed = Date.now() - start;
    this.logger.debug(`Verificación de evidencia finalizada en ${elapsed} ms. Confianza: ${score}%`);

    return {
      confidenceScore: score,
      chunksCount: retrievedChunks.length,
      authorsVerified,
      authorsHallucinated,
      conceptsVerified,
      conceptsHallucinated,
      formattedReportMarkdown: markdown,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private normalizeText(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private getContentWords(normalizedText: string): string[] {
    const stopwords = new Set([
      'para', 'como', 'sobre', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
      'esos', 'esas', 'tiene', 'tienen', 'puede', 'pueden', 'decir', 'dice',
      'habla', 'hablan', 'todo', 'toda', 'todos', 'todas', 'algo', 'otro', 'otra',
      'otros', 'otras', 'pero', 'entonces', 'donde', 'cuando', 'porque', 'segun',
      'desde', 'hasta', 'entre', 'hacia', 'para', 'conmigo', 'consigo', 'ellos',
      'ellas', 'nosotros', 'ustedes', 'libro', 'autor', 'teoria', 'concepto',
      'capitulo', 'informacion'
    ]);

    return normalizedText
      .split(/[^a-z0-9]+/g)
      .filter((w) => w.length >= 4 && !stopwords.has(w));
  }

  private buildMarkdownDetails(
    score: number,
    chunksUsed: number,
    authorsVerified: string[],
    authorsHallucinated: string[],
    conceptsVerified: string[],
    conceptsHallucinated: string[],
  ): string {
    const lines: string[] = [];
    const emoji = score >= 85 ? '🛡️' : score >= 50 ? '⚠️' : '❌';
    
    lines.push('');
    lines.push(`<details>`);
    lines.push(`<summary>${emoji} Verificación de Respaldo de JarBees (Confianza: ${score}%)</summary>`);
    lines.push(``);
    lines.push(`### 🛡️ **Análisis de Respaldo Determinista**`);
    lines.push(`- **Fragmentos de contexto utilizados:** \`${chunksUsed}\``);
    lines.push(`- **Puntaje de Confianza:** \`${score}%\``);
    lines.push(``);

    if (authorsVerified.length > 0 || authorsHallucinated.length > 0) {
      lines.push(`**Autores Detectados:**`);
      authorsVerified.forEach((a) => lines.push(`- \`${a}\` (Verificado ✅)`));
      authorsHallucinated.forEach((a) => lines.push(`- \`${a}\` (No presente en contexto ❌)`));
      lines.push(``);
    }

    if (conceptsVerified.length > 0 || conceptsHallucinated.length > 0) {
      lines.push(`**Conceptos Clave:**`);
      conceptsVerified.forEach((c) => lines.push(`- \`${c}\` (Verificado ✅)`));
      conceptsHallucinated.forEach((c) => lines.push(`- \`${c}\` (No presente en contexto ❌)`));
      lines.push(``);
    }

    if (
      authorsVerified.length === 0 &&
      authorsHallucinated.length === 0 &&
      conceptsVerified.length === 0 &&
      conceptsHallucinated.length === 0
    ) {
      lines.push(`*No se detectaron autores o conceptos explícitos de la biblioteca en esta respuesta.*`);
      lines.push(``);
    }

    lines.push(`*Este análisis determinista contrasta entidades y solapamiento de oraciones sin demoras de procesamiento.*`);
    lines.push(`</details>`);

    return lines.join('\n');
  }

  private isLikelyPersonName(entity: string): boolean {
    const parts = entity.trim().split(/\s+/);
    if (parts.length < 2 || parts.length > 4) return false;

    const nonPersonWords = new Set([
      'resumen', 'ejecutivo', 'puntos', 'clave', 'principales', 'capitulos',
      'conceptuales', 'ejes', 'tematicos', 'mapa', 'conocimiento', 'ficha',
      'analisis', 'respaldo', 'intuicion', 'directa', 'teoria', 'complejos',
      'energetica', 'psiquica', 'esencia', 'sueño', 'sueno', 'psicologia',
      'analitica', 'inconsciente', 'colectivo', 'fuerza', 'obras', 'completas',
      'obra', 'completa', 'preguntas', 'relaciones', 'contexto', 'libro', 'libros',
      'parte', 'capitulo', 'seccion', 'introduccion', 'conclusion', 'prologo'
    ]);

    for (const part of parts) {
      if (nonPersonWords.has(this.normalizeText(part))) {
        return false;
      }
    }

    return true;
  }

  private normalizeAuthorNameForComparison(name: string): string {
    return this.normalizeText(name)
      .replace(/\b\w\b\.?/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
