import { Injectable, Logger } from '@nestjs/common';
import { ExtractedClaim } from './claim-extractor.service';

export interface EpistemicValidationResult {
  originalAnswer: string;
  annotatedAnswer: string;
  totalClaims: number;
  supportedCount: number;
  partiallySupportedCount: number;
  inferenceCount: number;
  speculativeCount: number;
  unverifiedCount: number;
  contradictedCount: number;
  integrityScore: number; // 0.0 a 1.0
  dialecticContrastsPreserved: boolean;
  warnings: string[];
  reclassifiedClaims: Array<{
    claim: string;
    originalStatus: string;
    newStatus: string;
    reason: string;
  }>;
}

export interface DialecticContrastPair {
  thesis: { author?: string; claim: string; sourceChunkId?: number };
  antithesis: { author?: string; claim: string; sourceChunkId?: number };
}

@Injectable()
export class EvidenceGatekeeperService {
  private readonly logger = new Logger(EvidenceGatekeeperService.name);

  /**
   * Valida la integridad probatoria de las afirmaciones y asegura que ninguna
   * inferencia o especulación sea presentada al usuario como hecho establecido.
   */
  validateAnswerIntegrity(
    answer: string,
    claims: ExtractedClaim[],
    retrievedChunks: Array<{ id: number; content: string; author?: string; title?: string }>,
  ): EpistemicValidationResult {
    this.logger.log(`Auditando integridad probatoria sobre ${claims.length} afirmaciones...`);

    const warnings: string[] = [];
    const reclassifiedClaims: EpistemicValidationResult['reclassifiedClaims'] = [];
    let supportedCount = 0;
    let partiallySupportedCount = 0;
    let inferenceCount = 0;
    let speculativeCount = 0;
    let unverifiedCount = 0;
    let contradictedCount = 0;

    const validatedClaims = claims.map((c) => {
      let status = c.status;
      const hasValidSupportingChunk =
        c.supportingChunkIds &&
        c.supportingChunkIds.length > 0 &&
        c.supportingChunkIds.some((id) => retrievedChunks.some((chunk) => chunk.id === id));

      // Si una afirmación no tiene respaldo directo en los fragmentos pero se presentaba como hecho
      if ((status === 'supported' || status === 'partially_supported') && !hasValidSupportingChunk) {
        const previous = status;
        status = 'inference';
        reclassifiedClaims.push({
          claim: c.claim,
          originalStatus: previous,
          newStatus: 'inference',
          reason: 'Afirmación sin fragmento documental de respaldo directo en la biblioteca',
        });
      }

      // Si no tiene respaldo ni indicio y quedó como unverified, clasificar formalmente como inferencia
      if (status === 'unverified') {
        reclassifiedClaims.push({
          claim: c.claim,
          originalStatus: 'unverified',
          newStatus: 'inference',
          reason: 'Conocimiento paramétrico sin respaldo documental directo',
        });
        status = 'inference';
      }

      switch (status) {
        case 'supported':
          supportedCount++;
          break;
        case 'partially_supported':
          partiallySupportedCount++;
          break;
        case 'inference':
          inferenceCount++;
          break;
        case 'speculative':
          speculativeCount++;
          break;
        case 'contradicted':
          contradictedCount++;
          break;
        default:
          unverifiedCount++;
          break;
      }

      return {
        ...c,
        status,
      };
    });

    const total = claims.length || 1;
    const integrityScore = Math.min(
      1.0,
      Math.max(
        0.0,
        (supportedCount * 1.0 + partiallySupportedCount * 0.7 + inferenceCount * 0.3) / total,
      ),
    );

    if (contradictedCount > 0) {
      warnings.push(`Se detectaron ${contradictedCount} afirmaciones contradichas por la evidencia documental.`);
    }

    if (inferenceCount > 0) {
      warnings.push(
        `${inferenceCount} afirmaciones carecen de respaldo directo en los fragmentos y fueron reclasificadas como inferencias.`,
      );
    }

    // Verificar si se preservan contrastes dialécticos sin colapsar contradicciones
    const dialecticContrastsPreserved = this.verifyDialecticContrasts(answer, retrievedChunks);

    // Anotar el texto de la respuesta con etiquetas de rigor epistémico
    const annotatedAnswer = this.annotateAnswerText(answer, validatedClaims, integrityScore);

    return {
      originalAnswer: answer,
      annotatedAnswer,
      totalClaims: claims.length,
      supportedCount,
      partiallySupportedCount,
      inferenceCount,
      speculativeCount,
      unverifiedCount,
      contradictedCount,
      integrityScore: Math.round(integrityScore * 100) / 100,
      dialecticContrastsPreserved,
      warnings,
      reclassifiedClaims,
    };
  }

  /**
   * Verifica si la respuesta retiene los contrastes entre autores/fuentes
   * en lugar de forzar un consenso o armonización artificial.
   */
  private verifyDialecticContrasts(
    answer: string,
    chunks: Array<{ author?: string; content: string }>,
  ): boolean {
    const authors = Array.from(
      new Set(chunks.map((c) => c.author?.toLowerCase().trim()).filter(Boolean)),
    ) as string[];

    if (authors.length < 2) {
      return true; // No hay múltiples autores para contrastar
    }

    const answerLower = answer.toLowerCase();
    const authorsMentioned = authors.filter((a) => answerLower.includes(a));

    // Si hay 2 o más autores con evidencia pero solo se menciona a uno, hay colapso
    if (authors.length >= 2 && authorsMentioned.length < 2) {
      return false;
    }

    // Buscar marcadores de contrastación dialéctica
    const hasContrastMarkers =
      /(por el contrario|a diferencia de|en contraposici[óo]n|mientras que|en tensi[óo]n con|frente a la postura de)/i.test(
        answer,
      );

    return hasContrastMarkers || authorsMentioned.length >= 2;
  }

  /**
   * Añade marcas epistémicas o un encabezado de auditoría si la integridad es cuestionable.
   */
  private annotateAnswerText(
    answer: string,
    claims: Array<{ claim: string; status: string }>,
    integrityScore: number,
  ): string {
    let output = answer;

    // Etiquetar afirmaciones reclasificadas como inferencias si son muy rotundas
    for (const c of claims) {
      if (c.status === 'inference') {
        const regex = new RegExp(`(${this.escapeRegex(c.claim)})`, 'i');
        if (regex.test(output) && !output.includes(`[Inferencia / Sin respaldo directo]`)) {
          output = output.replace(regex, `$1 *[Inferencia / Sin respaldo directo]*`);
        }
      }
    }

    // Si el score de integridad es bajo (< 0.5), prefijar nota de rigor epistémico
    if (integrityScore < 0.5 && claims.length > 0) {
      const banner = `> ⚠️ **Control Epistemológico JarBees**: Esta respuesta contiene afirmaciones sustentadas primordialmente en conocimiento paramétrico o inferencias con respaldo documental parcial en la biblioteca (Score: ${Math.round(integrityScore * 100)}%).\n\n`;
      output = banner + output;
    }

    return output;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
