import { Injectable, Logger } from '@nestjs/common';
import { HypothesisCandidate } from './hypothesis-engine.service';
import { ConceptActivation } from '../memory/cognitive-field.service';
import { EvidenceReport } from '../knowledge/evidence.service';
import { UncertaintyReport } from './uncertainty-engine.service';

export interface EvaluatedHypothesis extends HypothesisCandidate {
  score: number;
  evidenceOverlap: number;
  cognitiveMatch: number;
  status: 'AMPLIFIED' | 'CANCELLED' | 'MERGED';
}

export interface CognitiveCollapseResult {
  survivingHypotheses: EvaluatedHypothesis[];
  collapsedPromptDirectives: string;
  interferenceSummaryMarkdown: string;
  uncertaintyReport?: UncertaintyReport;
}

@Injectable()
export class InterferenceEngineService {
  private readonly logger = new Logger(InterferenceEngineService.name);

  /**
   * Aplica interferencia cognitiva (constructiva y destructiva) sobre la superposición de hipótesis
   * y colapsa el estado en directivas óptimas para el LLM.
   */
  processInterference(
    hypotheses: HypothesisCandidate[],
    retrievedChunks: any[],
    activeConcepts: ConceptActivation[],
    evidenceReport?: EvidenceReport,
    uncertaintyReport?: UncertaintyReport,
  ): CognitiveCollapseResult {
    const start = Date.now();
    this.logger.log(`[QICA:Interferencia] Procesando interferencia cognitiva para ${hypotheses.length} hipótesis...`);

    const evaluated: EvaluatedHypothesis[] = hypotheses.map((h) => {
      const evidenceOverlap = this.calculateEvidenceOverlap(h, retrievedChunks);
      const cognitiveMatch = this.calculateCognitiveMatch(h, activeConcepts);

      let score = 0.5 + evidenceOverlap * 0.3 + cognitiveMatch * 0.2;

      // QICA 2.0: Bonus de Tunelamiento Cuántico si la certidumbre es alta
      if (h.isQuantumTunneling) {
        score += 0.1;
      }

      if (evidenceReport && evidenceReport.confidenceScore > 75) {
        score += 0.1;
      }

      let status: 'AMPLIFIED' | 'CANCELLED' | 'MERGED' = 'MERGED';
      if (score >= 0.65) {
        status = 'AMPLIFIED';
      } else if (score < 0.42) {
        status = 'CANCELLED';
      }

      return {
        ...h,
        score,
        evidenceOverlap,
        cognitiveMatch,
        status,
      };
    });

    const surviving = evaluated
      .filter((e) => e.status !== 'CANCELLED')
      .sort((a, b) => b.score - a.score);

    const finalSurviving = surviving.length > 0 ? surviving.slice(0, 2) : [evaluated[0]];

    const directives = finalSurviving
      .map(
        (h) =>
          `[ÁNGULO COGNITIVO REFORZADO (${h.name})]: ${h.seedPrompt} (Relevancia: ${(h.score * 100).toFixed(0)}%)`,
      )
      .join('\n');

    const summaryMd = this.generateInterferenceMarkdown(
      evaluated,
      finalSurviving,
      uncertaintyReport,
      Date.now() - start,
    );

    return {
      survivingHypotheses: finalSurviving,
      collapsedPromptDirectives: directives,
      interferenceSummaryMarkdown: summaryMd,
      uncertaintyReport,
    };
  }

  // ── Auxiliares de Cálculo ───────────────────────────────────────────────────

  private calculateEvidenceOverlap(hypothesis: HypothesisCandidate, chunks: any[]): number {
    if (!chunks || chunks.length === 0) return 0.5;

    const hypText = (hypothesis.name + ' ' + hypothesis.perspectiveDescription).toLowerCase();
    let matches = 0;

    for (const chunk of chunks) {
      const content = (chunk.content || '').toLowerCase();
      if (hypText.split(/\s+/).some((term) => term.length > 4 && content.includes(term))) {
        matches++;
      }
    }

    return Math.min(1.0, matches / Math.max(1, chunks.length));
  }

  private calculateCognitiveMatch(
    hypothesis: HypothesisCandidate,
    activeConcepts: ConceptActivation[],
  ): number {
    if (!activeConcepts || activeConcepts.length === 0) return 0.5;

    const hypText = (hypothesis.name + ' ' + hypothesis.perspectiveDescription).toLowerCase();
    let score = 0;

    for (const c of activeConcepts) {
      if (hypText.includes(c.concept.toLowerCase())) {
        score += c.activation;
      }
    }

    return Math.min(1.0, score / activeConcepts.length);
  }

  private generateInterferenceMarkdown(
    all: EvaluatedHypothesis[],
    surviving: EvaluatedHypothesis[],
    uncertaintyReport?: UncertaintyReport,
    durationMs?: number,
  ): string {
    const rows = all
      .map((h) => {
        const icon =
          h.status === 'AMPLIFIED'
            ? '⚛️ Amplificada'
            : h.status === 'CANCELLED'
            ? '🚫 Cancelada'
            : '🔄 Fusionada';
        const tunnelingBadge = h.isQuantumTunneling ? ' 🌀 (Tunelamiento)' : '';
        return `| ${h.name}${tunnelingBadge} | ${(h.score * 100).toFixed(0)}% | ${icon} |`;
      })
      .join('\n');

    let uncertaintyInfo = '';
    if (uncertaintyReport) {
      const unknownsList =
        uncertaintyReport.unknowns.length > 0
          ? `\n> **Variables No Verificadas (` +
            uncertaintyReport.unknowns.length +
            `):** ${uncertaintyReport.unknowns.join('; ')}`
          : '';
      uncertaintyInfo = `\n> **Nivel de Certidumbre:** ${uncertaintyReport.confidenceScore}% (Incertidumbre: ${uncertaintyReport.uncertaintyScore}%)${unknownsList}`;
    }

    return `
<details>
<summary>⚛️ <b>Estado Cognitivo Cuántico-Inspirado (QICA 2.0)</b></summary>

> **Filtro de Interferencia:** Procesado en ${durationMs}ms  
> **Ángulos Cognitivos Colapsados:** ${surviving.map((s) => s.name).join(' + ')}${uncertaintyInfo}

| Perspectiva Explorada | Coherencia | Resultado Interferencia |
|:----------------------|:----------:|:-----------------------|
${rows}

</details>
`;
  }
}
