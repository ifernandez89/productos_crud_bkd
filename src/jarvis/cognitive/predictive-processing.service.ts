import { Injectable, Logger } from '@nestjs/common';
import { ConceptActivation } from '../memory/cognitive-field.service';

export interface PredictionResult {
  predictedIntent: string;
  expectedConcepts: string[];
  predictionError: number; // 0.0 (error nulo) a 1.0 (error alto)
  predictiveCorrectionDirectives: string;
}

@Injectable()
export class PredictiveProcessingService {
  private readonly logger = new Logger(PredictiveProcessingService.name);

  /**
   * JarBees 3.0: Construye una predicción de intención previa a RAG y calcula el Error de Predicción.
   */
  generatePredictionAndCalculateError(
    query: string,
    activeConcepts: ConceptActivation[] = [],
    retrievedChunks: any[] = [],
  ): PredictionResult {
    // 1. Predicción inicial de la intención del usuario
    const expectedConcepts = activeConcepts.map((c) => c.concept);
    const predictedIntent = this.inferIntent(query, expectedConcepts);

    // 2. Cálculo del Error de Predicción (Delta entre Expectativa y Evidencia RAG recuperada)
    let predictionError = 0.2; // Error base por defecto

    if (retrievedChunks.length > 0) {
      let matches = 0;
      for (const chunk of retrievedChunks) {
        const text = (chunk.content || '').toLowerCase();
        if (expectedConcepts.some((c) => text.includes(c.toLowerCase()))) {
          matches++;
        }
      }

      const matchRatio = matches / retrievedChunks.length;
      predictionError = Math.max(0.0, Math.min(1.0, 1.0 - matchRatio));
    }

    let predictiveCorrectionDirectives = '';
    if (predictionError > 0.6) {
      predictiveCorrectionDirectives = `\n[CORRECCIÓN PREDICTIVA (Error de Predicción: ${(predictionError * 100).toFixed(0)}%)]: Se detectó una divergencia entre la expectativa inicial y los documentos RAG recuperados. Ajusta la respuesta priorizando estrictamente la evidencia recuperada sobre las asunciones previas.\n`;
    }

    this.logger.log(
      `[JarBees 3.0:PredictiveProcessing] Intención predicha: "${predictedIntent}" | Error de Predicción: ${(predictionError * 100).toFixed(0)}%`,
    );

    return {
      predictedIntent,
      expectedConcepts,
      predictionError,
      predictiveCorrectionDirectives,
    };
  }

  private inferIntent(query: string, concepts: string[]): string {
    const qLower = query.toLowerCase();
    if (qLower.includes('arquitectura') || qLower.includes('diseño')) return 'Diseño de Arquitectura';
    if (qLower.includes('explicá') || qLower.includes('qué es')) return 'Explicación Conceptual';
    if (qLower.includes('solución') || qLower.includes('error')) return 'Resolución de Problemas';
    if (concepts.length > 0) return `Consulta sobre ${concepts[0]}`;
    return 'Consulta General';
  }
}
