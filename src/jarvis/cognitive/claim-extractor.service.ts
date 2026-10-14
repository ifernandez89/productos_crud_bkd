import { Injectable, Logger } from '@nestjs/common';
import { OllamaProvider } from '../llm/ollama.provider';
import { resolveOllamaModelName } from '../../shared/ollama-config';

export interface ExtractedClaim {
  claim: string;
  status: 'supported' | 'contradicted' | 'partially_supported' | 'inference' | 'speculative' | 'unverified';
  supportingChunkIds: number[];
  contradictingChunkIds: number[];
  author?: string;
  document?: string;
  limitations: string[];
}

/**
 * Servicio de Extracción de Afirmaciones
 * 
 * Descompone una respuesta en afirmaciones individuales verificables
 * y las vincula con la evidencia que las respalda o contradice.
 */
@Injectable()
export class ClaimExtractorService {
  private readonly logger = new Logger(ClaimExtractorService.name);

  constructor(private readonly ollamaProvider: OllamaProvider) {}

  /**
   * Extrae afirmaciones de una respuesta y las vincula con chunks de evidencia
   * 
   * IMPORTANTE: Este es un análisis post-síntesis. NO reemplaza la auditoría
   * en 2 fases, sino que la complementa con granularidad por afirmación.
   */
  async extractClaims(
    answer: string,
    retrievedChunks: Array<{ id: number; content: string; document?: any }>,
  ): Promise<ExtractedClaim[]> {
    if (!answer || answer.length < 50) {
      return [];
    }

    // Si no hay chunks, todas las afirmaciones son "unverified" (conocimiento paramétrico)
    if (retrievedChunks.length === 0) {
      return this.extractClaimsWithoutEvidence(answer);
    }

    try {
      const systemPrompt = `Sos un extractor de afirmaciones verificables.
Tu tarea es descomponer una respuesta en afirmaciones factuales individuales.

REGLAS:
1. Extraé solo afirmaciones verificables, no opiniones ni preguntas retóricas.
2. Cada afirmación debe ser atómica (una sola idea).
3. NO inventes afirmaciones que no estén en el texto.
4. Formato: JSON array de strings.

EJEMPLO:
Input: "Jung propuso la sincronicidad como principio acausal. Pauli colaboró con él. Esto no está demostrado científicamente."
Output: ["Jung propuso la sincronicidad como principio acausal", "Pauli colaboró con Jung", "La sincronicidad no está demostrada científicamente"]`;

      const response = await this.ollamaProvider.generate({
        model: resolveOllamaModelName('qwen3:8b'),
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Extraé las afirmaciones verificables de este texto:\n\n${answer}\n\nResponder en formato JSON array.` 
          },
        ],
        temperature: 0.1,
        maxTokens: 800,
      });

      let claimsText: string[] = [];
      try {
        // Intentar parsear JSON
        const cleaned = response.content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        claimsText = JSON.parse(cleaned);
      } catch {
        // Fallback: split por puntos
        claimsText = answer
          .split(/\. /)
          .map((s) => s.trim())
          .filter((s) => s.length > 20 && s.length < 300)
          .slice(0, 10);
      }

      // Ahora vincular cada afirmación con evidencia
      const claims: ExtractedClaim[] = [];

      for (const claimText of claimsText) {
        const status = this.assessClaimStatus(claimText, retrievedChunks);
        const supporting = this.findSupportingChunks(claimText, retrievedChunks);
        const contradicting = this.findContradictingChunks(claimText, retrievedChunks);

        claims.push({
          claim: claimText,
          status,
          supportingChunkIds: supporting.map((c) => c.id),
          contradictingChunkIds: contradicting.map((c) => c.id),
          author: supporting[0]?.document?.author,
          document: supporting[0]?.document?.title,
          limitations: this.identifyLimitations(claimText, retrievedChunks),
        });
      }

      return claims;
    } catch (error: any) {
      this.logger.error(`Error extrayendo afirmaciones: ${error.message}`);
      return [];
    }
  }

  /**
   * Extrae afirmaciones cuando no hay evidencia documental
   */
  private extractClaimsWithoutEvidence(answer: string): ExtractedClaim[] {
    const sentences = answer
      .split(/\. /)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.length < 300)
      .slice(0, 10);

    return sentences.map((claim) => ({
      claim,
      status: 'unverified' as const,
      supportingChunkIds: [],
      contradictingChunkIds: [],
      limitations: ['No hay fragmentos documentales recuperados para esta consulta'],
    }));
  }

  /**
   * Evalúa el estado de una afirmación basándose en la evidencia
   */
  private assessClaimStatus(
    claim: string,
    chunks: Array<{ content: string }>,
  ): ExtractedClaim['status'] {
    const claimLower = claim.toLowerCase();
    
    // Indicadores de especulación
    if (
      /podrí[a]|puede (que|ser)|sugiere|hipótesis|especula|probable|posible/i.test(claim)
    ) {
      return 'speculative';
    }

    // Indicadores de inferencia
    if (
      /esto (sugiere|indica|implica)|por (tanto|ende)|se deduce/i.test(claim)
    ) {
      return 'inference';
    }

    // Verificar si aparece textualmente en algún chunk
    const hasTextualSupport = chunks.some((chunk) =>
      chunk.content.toLowerCase().includes(claimLower.substring(0, 50)),
    );

    if (hasTextualSupport) {
      return 'supported';
    }

    // Verificar contradicción (negativos)
    if (/no (está|existe|hay|se ha) (demostrado|probado|verificado)/i.test(claim)) {
      const hasSupportForPositive = chunks.some((chunk) =>
        chunk.content.toLowerCase().includes(claimLower.replace(/no /gi, '').substring(0, 30)),
      );
      if (hasSupportForPositive) {
        return 'contradicted';
      }
    }

    return 'unverified';
  }

  /**
   * Encuentra chunks que respaldan una afirmación
   */
  private findSupportingChunks(
    claim: string,
    chunks: Array<{ id: number; content: string; document?: any }>,
  ): typeof chunks {
    const claimKeywords = this.extractKeywords(claim);
    
    return chunks.filter((chunk) => {
      const chunkLower = chunk.content.toLowerCase();
      const matchCount = claimKeywords.filter((kw) => 
        chunkLower.includes(kw.toLowerCase())
      ).length;
      
      return matchCount >= Math.min(2, claimKeywords.length);
    });
  }

  /**
   * Encuentra chunks que contradicen una afirmación
   */
  private findContradictingChunks(
    claim: string,
    chunks: Array<{ id: number; content: string; document?: any }>,
  ): typeof chunks {
    // Detectar negaciones en la afirmación
    if (!/no (está|existe|hay|se ha)/i.test(claim)) {
      return [];
    }

    const positiveVersion = claim.replace(/no (está|existe|hay|se ha) /gi, '$1 ');
    const keywords = this.extractKeywords(positiveVersion);

    return chunks.filter((chunk) => {
      const chunkLower = chunk.content.toLowerCase();
      const matchCount = keywords.filter((kw) => 
        chunkLower.includes(kw.toLowerCase())
      ).length;
      
      return matchCount >= 2;
    });
  }

  /**
   * Identifica limitaciones de la evidencia para una afirmación
   */
  private identifyLimitations(
    claim: string,
    chunks: Array<{ content: string; document?: any }>,
  ): string[] {
    const limitations: string[] = [];

    // Verificar si la afirmación requiere evidencia cuantitativa
    if (/(\d+%|estadística|estudio|experimento|medición)/i.test(claim)) {
      const hasQuantitativeData = chunks.some((c) => /\d+%|\d+ (sujetos|participantes|casos)/.test(c.content));
      if (!hasQuantitativeData) {
        limitations.push('No se encontraron datos cuantitativos en los fragmentos recuperados');
      }
    }

    // Verificar si hay una sola fuente
    const uniqueDocs = new Set(chunks.map((c) => c.document?.title).filter(Boolean));
    if (uniqueDocs.size === 1) {
      limitations.push('Respaldado por una única fuente documental');
    }

    // Detectar afirmaciones sobre el futuro
    if (/(será|habrá|va a|futuro|predicción|tendencia)/i.test(claim)) {
      limitations.push('Afirmación predictiva sin datos temporales suficientes');
    }

    return limitations;
  }

  /**
   * Extrae keywords relevantes de una afirmación
   */
  private extractKeywords(text: string): string[] {
    // Eliminar palabras comunes
    const stopWords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
      'de', 'del', 'en', 'con', 'por', 'para', 'que', 'se',
      'es', 'fue', 'son', 'como', 'sobre', 'su', 'sus',
    ]);

    return text
      .toLowerCase()
      .replace(/[.,;:¿?¡!()]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w))
      .slice(0, 6);
  }
}
