import { Injectable, Logger } from '@nestjs/common';
import {
  CounterfactualUtilityResult,
  DecisionConfusionMatrix,
  RetrievalDecision,
} from './mae2.types';

@Injectable()
export class RetrievalUtilityEvaluatorService {
  private readonly logger = new Logger(RetrievalUtilityEvaluatorService.name);

  /**
   * Evalúa contrafactualmente la utilidad neta de haber inyectado memoria:
   * ΔU = Score_con_memoria - Score_sin_memoria
   */
  evaluateDeltaUtility(
    withMemoryScore: number,
    withoutMemoryScore: number,
    contextCostTokens: number = 0,
  ): CounterfactualUtilityResult {
    const deltaUtility = Number((withMemoryScore - withoutMemoryScore).toFixed(2));

    let classification: 'UTILE' | 'NEUTRAL' | 'DETRIMENTAL';
    if (deltaUtility > 2.0) {
      classification = 'UTILE';
    } else if (deltaUtility < -2.0) {
      classification = 'DETRIMENTAL';
    } else {
      classification = 'NEUTRAL';
    }

    return {
      deltaUtility,
      classification,
      withMemoryScore,
      withoutMemoryScore,
      contextCostTokens,
    };
  }

  /**
   * Calcula la matriz de confusión de decisiones frente a la necesidad real del problema (Ground Truth).
   */
  computeConfusionMatrix(
    evaluations: Array<{
      predictedDecision: RetrievalDecision;
      requiresMemory: boolean;
    }>,
  ): DecisionConfusionMatrix {
    let truePositives = 0;
    let trueNegatives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const item of evaluations) {
      const retrieved = item.predictedDecision !== RetrievalDecision.NO_RETRIEVAL;

      if (item.requiresMemory && retrieved) {
        truePositives++;
      } else if (!item.requiresMemory && !retrieved) {
        trueNegatives++;
      } else if (!item.requiresMemory && retrieved) {
        falsePositives++;
      } else if (item.requiresMemory && !retrieved) {
        falseNegatives++;
      }
    }

    const total = evaluations.length;
    const selfSufficientTotal = falsePositives + trueNegatives;
    const memoryRequiredTotal = falseNegatives + truePositives;

    const unnecessaryRetrievalRate =
      selfSufficientTotal > 0
        ? Number(((falsePositives / selfSufficientTotal) * 100).toFixed(2))
        : 0;

    const omittedMemoryRate =
      memoryRequiredTotal > 0
        ? Number(((falseNegatives / memoryRequiredTotal) * 100).toFixed(2))
        : 0;

    const accuracy =
      total > 0
        ? Number((((truePositives + trueNegatives) / total) * 100).toFixed(2))
        : 100;

    return {
      truePositives,
      trueNegatives,
      falsePositives,
      falseNegatives,
      unnecessaryRetrievalRate,
      omittedMemoryRate,
      accuracy,
    };
  }

  /**
   * Calcula la penalización por interferencia en tareas autosuficientes:
   * I = Score_Base_Vanilla - Score_Con_Memoria
   */
  computeInterferencePenalty(baseScores: number[], memoryScores: number[]): number {
    if (baseScores.length === 0 || baseScores.length !== memoryScores.length) {
      return 0;
    }
    const avgBase = baseScores.reduce((a, b) => a + b, 0) / baseScores.length;
    const avgMemory = memoryScores.reduce((a, b) => a + b, 0) / memoryScores.length;

    // Si la memoria degrada el score, la penalización I es positiva
    return Number((avgBase - avgMemory).toFixed(2));
  }
}

