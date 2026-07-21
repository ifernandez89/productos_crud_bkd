import { Injectable, Logger } from '@nestjs/common';
import { EvidenceReport } from '../knowledge/evidence.service';

export interface UncertaintyReport {
  confidenceScore: number;
  uncertaintyScore: number; // 100 - confidenceScore
  unknowns: string[];
  riskFactors: string[];
  uncertaintyWarningDirectives: string;
}

@Injectable()
export class UncertaintyEngineService {
  private readonly logger = new Logger(UncertaintyEngineService.name);

  /**
   * QICA 2.0: Evalúa la incertidumbre y determina la frontera de lo desconocido.
   */
  evaluateUncertainty(
    userQuery: string,
    retrievedChunks: any[] = [],
    evidenceReport?: EvidenceReport,
  ): UncertaintyReport {
    this.logger.log(`[QICA:UncertaintyEngine] Evaluando fronteras de incertidumbre para la consulta...`);

    const unknowns: string[] = [];
    const riskFactors: string[] = [];

    let confidenceScore = evidenceReport ? evidenceReport.confidenceScore : 75;

    if (retrievedChunks.length === 0) {
      confidenceScore = Math.min(confidenceScore, 40);
      unknowns.push('No hay documentos RAG recuperados para fundamentar esta respuesta.');
      riskFactors.push('Posible dependencia exclusiva del conocimiento preentrenado del LLM.');
    } else if (retrievedChunks.length < 3) {
      confidenceScore = Math.min(confidenceScore, 65);
      unknowns.push('Cobertura limitada de contexto (menos de 3 fragmentos recuperados).');
    }

    if (evidenceReport && evidenceReport.authorsHallucinated.length > 0) {
      confidenceScore = Math.max(0, confidenceScore - 15 * evidenceReport.authorsHallucinated.length);
      riskFactors.push(`Inconsistencia en autores detectados: ${evidenceReport.authorsHallucinated.join(', ')}`);
    }

    const queryLower = userQuery.toLowerCase();
    if (queryLower.includes('futuro') || queryLower.includes('predicción') || queryLower.includes('tendencia')) {
      unknowns.push('Evolución tecnológica futura no respaldada por datos presentes.');
    }
    if (queryLower.includes('costo') || queryLower.includes('precio') || queryLower.includes('adopción')) {
      unknowns.push('Variables económicas o cuantitativas no verificadas en el corpus.');
    }

    const uncertaintyScore = Math.max(0, 100 - confidenceScore);

    let uncertaintyWarningDirectives = '';
    if (confidenceScore < 60) {
      uncertaintyWarningDirectives = `\n[ALERTA DE INCERTIDUMBRE (Certidumbre: ${confidenceScore}%)]: Aclara explícitamente en la respuesta que existen incertidumbres o falta de documentos respaldatorios sobre: ${unknowns.join('; ')}.\n`;
    }

    return {
      confidenceScore,
      uncertaintyScore,
      unknowns,
      riskFactors,
      uncertaintyWarningDirectives,
    };
  }
}
