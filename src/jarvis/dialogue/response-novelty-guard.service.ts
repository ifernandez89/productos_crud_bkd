import { Injectable, Logger } from '@nestjs/common';
import { NoveltyCheckResult } from './dialogue.types';

@Injectable()
export class ResponseNoveltyGuardService {
  private readonly logger = new Logger(ResponseNoveltyGuardService.name);

  /**
   * Umbral de similitud léxica/semántica por encima del cual se considera repetición.
   * 0.60 significa que si más del 60% de los tokens clave coinciden, se rechaza la respuesta.
   */
  private readonly DEFAULT_SIMILARITY_THRESHOLD = 0.60;

  /**
   * Compara una respuesta candidata con una o varias respuestas previas.
   */
  checkNovelty(
    candidate: string,
    previousOutputs: readonly string[] = [],
    threshold = this.DEFAULT_SIMILARITY_THRESHOLD,
  ): NoveltyCheckResult {
    const trimmedCandidate = candidate.trim();
    if (!trimmedCandidate || previousOutputs.length === 0) {
      return {
        isNovel: true,
        similarityScore: 0.0,
      };
    }

    const normCandidate = this.normalize(trimmedCandidate);

    let maxSimilarity = 0.0;
    let matchedOutput: string | undefined;

    for (const prev of previousOutputs) {
      if (!prev || !prev.trim()) continue;
      const normPrev = this.normalize(prev.trim());

      // 1. Coincidencia exacta o casi exacta
      if (normCandidate === normPrev) {
        return {
          isNovel: false,
          similarityScore: 1.0,
          matchedOutput: prev,
          reason: 'Coincidencia literal exacta con una respuesta anterior.',
        };
      }

      // 2. Similitud de tokens (Jaccard sobre bigramas y unigramas significativos)
      const tokenSim = this.computeTokenOverlap(normCandidate, normPrev);
      // 3. Similitud de Levenshtein normalizada
      const levSim = this.computeNormalizedLevenshtein(normCandidate, normPrev);

      // Score ponderado (60% tokens, 40% Levenshtein)
      const combined = tokenSim * 0.6 + levSim * 0.4;

      if (combined > maxSimilarity) {
        maxSimilarity = combined;
        matchedOutput = prev;
      }
    }

    if (maxSimilarity >= threshold) {
      this.logger.warn(
        `[NoveltyGuard] Repetición detectada (similitud: ${(maxSimilarity * 100).toFixed(1)}% >= ${(threshold * 100).toFixed(1)}%) con: "${matchedOutput?.slice(0, 50)}..."`,
      );
      return {
        isNovel: false,
        similarityScore: maxSimilarity,
        matchedOutput,
        reason: `Similitud léxica excesiva (${(maxSimilarity * 100).toFixed(1)}%) respecto a una respuesta previa.`,
      };
    }

    return {
      isNovel: true,
      similarityScore: maxSimilarity,
      matchedOutput,
    };
  }

  /**
   * Genera el bloque de restricción negativa para inyectar en el prompt del LLM
   */
  generateNegativeConstraintPrompt(
    previousOutputs: readonly string[],
    taskLabel = 'contenido o chiste',
  ): string {
    const validOutputs = previousOutputs.filter((o) => o && o.trim().length > 0);
    if (validOutputs.length === 0) return '';

    const lastThree = validOutputs.slice(-3);
    const examples = lastThree
      .map((out, idx) => `  ${idx + 1}. "${this.cleanSnippet(out, 120)}"`)
      .join('\n');

    return [
      `[RESTRICCIÓN ESTRICTA DE NOVEDAD Y DIVERSIDAD]`,
      `El usuario solicitó un ${taskLabel} NUEVO y diferente.`,
      `Queda TERMINANTEMENTE PROHIBIDO repetir o parafrasear cualquiera de las siguientes respuestas anteriores:`,
      examples,
      `Debes generar un ${taskLabel} 100% original, con personajes, premisas o remates completamente distintos.`,
    ].join('\n');
  }

  /**
   * Normaliza texto para comparación eliminando signos, acentos y mayúsculas
   */
  normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Similitud de solapamiento de tokens (Jaccard)
   */
  private computeTokenOverlap(a: string, b: string): number {
    const tokensA = new Set(
      a.split(' ').filter((w) => w.length > 2 && !this.isStopWord(w)),
    );
    const tokensB = new Set(
      b.split(' ').filter((w) => w.length > 2 && !this.isStopWord(w)),
    );

    if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }

    const union = new Set([...tokensA, ...tokensB]).size;
    return union > 0 ? intersection / union : 0.0;
  }

  /**
   * Levenshtein ratio normalizado
   */
  private computeNormalizedLevenshtein(s1: string, s2: string): number {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    if (Math.abs(s1.length - s2.length) / maxLen > 0.6) {
      // Diferencia de longitud muy grande, no son similares
      return 0.0;
    }

    const dist = this.levenshteinDistance(s1, s2);
    return 1.0 - dist / maxLen;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    // Optimización de memoria en O(min(m, n))
    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);

    for (let j = 0; j <= n; j++) prevRow[j] = j;

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;
      const charA = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,
          currRow[j - 1] + 1,
          prevRow[j - 1] + cost,
        );
      }
      for (let j = 0; j <= n; j++) prevRow[j] = currRow[j];
    }

    return prevRow[n];
  }

  private cleanSnippet(text: string, maxLen = 100): string {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}...` : oneLine;
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
      'de', 'del', 'a', 'al', 'en', 'para', 'por', 'con',
      'que', 'qué', 'y', 'o', 'pero', 'mas', 'más', 'es',
      'son', 'fue', 'era', 'se', 'su', 'sus', 'este', 'esta',
    ]);
    return stopWords.has(word);
  }
}

