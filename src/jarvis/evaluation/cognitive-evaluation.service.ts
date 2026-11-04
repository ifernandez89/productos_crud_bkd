import { Injectable, Logger } from '@nestjs/common';
import {
  CognitiveEvaluationInput,
  CognitiveEvaluationMetrics,
  CognitiveAlert,
} from './cognitive-evaluation.types';

@Injectable()
export class CognitiveEvaluationService {
  private readonly logger = new Logger(CognitiveEvaluationService.name);

  // Stop words comunes en español para filtrado léxico
  private readonly stopWords = new Set([
    'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para',
    'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o',
    'este', 'sí', 'porque', 'esta', 'son', 'entre', 'está', 'cuando', 'muy', 'sin', 'sobre',
    'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante',
  ]);

  /**
   * Evalúa formalmente las 5 métricas cognitivas JCA para una interacción
   */
  evaluateInteraction(input: CognitiveEvaluationInput): CognitiveEvaluationMetrics {
    const intentionFidelity = this.calculateIntentionFidelity(
      input.userObjective,
      input.responseContent,
    );

    const contextNoiseRatio = this.calculateContextNoiseRatio(
      input.promptInjectedContext,
      input.responseContent,
    );

    const toolPrecision = this.calculateToolPrecision(input.toolInvocations);
    const evidenceVerificationRate = this.calculateEvidenceVerificationRate(input.missionEvidence);
    const cognitiveDriftIndex = this.calculateCognitiveDriftIndex(
      input.objectiveEmbedding,
      input.stateEmbedding,
    );

    const alerts: CognitiveAlert[] = [];

    // Regla JCA: Alerta si hay ruido contextual excesivo
    if (contextNoiseRatio > 0.85) {
      alerts.push({
        level: 'WARNING',
        code: 'HIGH_CONTEXT_NOISE',
        message: `Ruido contextual elevado (${(contextNoiseRatio * 100).toFixed(1)}%). Contexto inyectado desaprovechado.`,
      });
    }

    // Regla JCA: Alerta crítica si la fidelidad a la intención es deficiente (posible secuestro léxico)
    if (intentionFidelity < 0.4) {
      alerts.push({
        level: 'CRITICAL',
        code: 'LOW_INTENTION_FIDELITY',
        message: `Fidelidad a la intención crítica (${(intentionFidelity * 100).toFixed(1)}% < 40%). Riesgo de secuestro de intención.`,
      });
    }

    // Regla JCA: Alertas de deriva cognitiva según umbrales de distancia coseno
    if (cognitiveDriftIndex > 0.5) {
      alerts.push({
        level: 'CRITICAL',
        code: 'COGNITIVE_DRIFT_DETECTED',
        message: `Deriva cognitiva crítica (${cognitiveDriftIndex.toFixed(3)} > 0.50). Reorientación de estado obligatoria.`,
      });
    } else if (cognitiveDriftIndex > 0.35) {
      alerts.push({
        level: 'WARNING',
        code: 'COGNITIVE_DRIFT_DETECTED',
        message: `Deriva cognitiva moderada (${cognitiveDriftIndex.toFixed(3)} > 0.35). Monitorear coherencia.`,
      });
    }

    // Regla JCA: Alerta si existen afirmaciones fácticas de misión sin respaldo verificable
    if (evidenceVerificationRate < 1.0 && (input.missionEvidence?.length || 0) > 0) {
      alerts.push({
        level: 'CRITICAL',
        code: 'UNVERIFIED_EVIDENCE',
        message: `Se detectaron conclusiones de misión sin evidencia formal verificada (${((1 - evidenceVerificationRate) * 100).toFixed(1)}% sin validar).`,
      });
    }

    const hasCritical = alerts.some((a) => a.level === 'CRITICAL');

    return {
      intentionFidelity: Number(intentionFidelity.toFixed(4)),
      contextNoiseRatio: Number(contextNoiseRatio.toFixed(4)),
      toolPrecision: Number(toolPrecision.toFixed(4)),
      evidenceVerificationRate: Number(evidenceVerificationRate.toFixed(4)),
      cognitiveDriftIndex: Number(cognitiveDriftIndex.toFixed(4)),
      alerts,
      passedQualityGate: !hasCritical,
    };
  }

  /**
   * Métrica 1: Intention Fidelity Score (I_FID in [0, 1])
   */
  private calculateIntentionFidelity(objective: string, response: string): number {
    if (!objective.trim()) return 1.0;
    if (!response.trim()) return 0.0;

    const objectiveTokens = this.extractSignificativeTokens(objective);
    if (objectiveTokens.length === 0) return 1.0;

    const responseLower = response.toLowerCase();
    let matches = 0;
    for (const token of objectiveTokens) {
      if (responseLower.includes(token)) {
        matches++;
      }
    }

    return Math.min(1.0, matches / objectiveTokens.length);
  }

  /**
   * Métrica 2: Context Noise Ratio (R_NOISE in [0, 1])
   */
  private calculateContextNoiseRatio(context: string, response: string): number {
    if (!context.trim()) return 0.0;
    const contextTokens = this.extractSignificativeTokens(context);
    if (contextTokens.length === 0) return 0.0;

    const responseLower = response.toLowerCase();
    let usedCount = 0;
    for (const token of contextTokens) {
      if (responseLower.includes(token)) {
        usedCount++;
      }
    }

    const usageRate = usedCount / contextTokens.length;
    return Math.max(0.0, 1.0 - usageRate);
  }

  /**
   * Métrica 3: Tool Invocation Precision (P_TOOL in [0, 1])
   */
  private calculateToolPrecision(
    tools?: Array<{ toolName: string; outputUsedInResponse: boolean }>,
  ): number {
    if (!tools || tools.length === 0) return 1.0;
    const used = tools.filter((t) => t.outputUsedInResponse).length;
    return used / tools.length;
  }

  /**
   * Métrica 4: Evidence Verification Rate (T_VERIF in [0, 1])
   */
  private calculateEvidenceVerificationRate(
    evidence?: Array<{ claim: string; verified: boolean; evidenceHash?: string }>,
  ): number {
    if (!evidence || evidence.length === 0) return 1.0;
    const verifiedCount = evidence.filter((e) => e.verified).length;
    return verifiedCount / evidence.length;
  }

  /**
   * Métrica 5: Cognitive Drift Index (D_COG in [0, 2])
   * Distancia coseno: 1 - cos(vecA, vecB)
   */
  private calculateCognitiveDriftIndex(vecA?: number[], vecB?: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
      return 0.0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0.0;

    const cosineSimilarity = dotProduct / denom;
    // Distancia coseno = 1 - cosineSimilarity (clamped [0, 2])
    return Math.max(0, Math.min(2, 1.0 - cosineSimilarity));
  }

  private extractSignificativeTokens(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\sáéíóúüñ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !this.stopWords.has(w));
  }
}
