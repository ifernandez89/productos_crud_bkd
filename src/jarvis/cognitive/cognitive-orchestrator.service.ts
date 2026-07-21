import { Injectable, Logger } from '@nestjs/common';
import { CognitiveFieldService } from '../memory/cognitive-field.service';
import { HypothesisEngineService } from './hypothesis-engine.service';
import { InterferenceEngineService, CognitiveCollapseResult } from './interference-engine.service';
import { UncertaintyEngineService } from './uncertainty-engine.service';
import { EvidenceReport } from '../knowledge/evidence.service';

export interface QICAProcessingResult {
  activated: boolean;
  cognitiveFieldContext: string;
  collapseResult?: CognitiveCollapseResult;
  processingTimeMs: number;
}

@Injectable()
export class CognitiveOrchestratorService {
  private readonly logger = new Logger(CognitiveOrchestratorService.name);

  constructor(
    private readonly cognitiveField: CognitiveFieldService,
    private readonly hypothesisEngine: HypothesisEngineService,
    private readonly interferenceEngine: InterferenceEngineService,
    private readonly uncertaintyEngine: UncertaintyEngineService,
  ) {}

  /**
   * QICA 2.0: Determina si la consulta requiere activación cognitiva cuántico-inspirada y ejecuta el pipeline.
   */
  async processCognitiveQuery(
    sessionId: string,
    userMessage: string,
    retrievedChunks: any[] = [],
    evidenceReport?: EvidenceReport,
  ): Promise<QICAProcessingResult> {
    const start = Date.now();

    // 1. Activar conceptos y procesar Grafo de Memoria Entrelazada (co-activación no-local)
    const activeConcepts = await this.cognitiveField.activateConcepts(sessionId, userMessage);

    // 2. Evaluar Incertidumbre y Desconocidos (Uncertainty Engine)
    const uncertaintyReport = this.uncertaintyEngine.evaluateUncertainty(
      userMessage,
      retrievedChunks,
      evidenceReport,
    );

    // 3. Determinar si se activa la superposición e interferencia profunda
    const isComplex = this.shouldActivateDeepCognition(userMessage);

    if (!isComplex) {
      const fieldCtx = await this.cognitiveField.formatFieldForContext(sessionId);
      return {
        activated: false,
        cognitiveFieldContext: fieldCtx + uncertaintyReport.uncertaintyWarningDirectives,
        processingTimeMs: Date.now() - start,
      };
    }

    this.logger.log(`[QICA 2.0:Orquestador] Modo cognitivo profundo activado en sesión ${sessionId}`);

    // 4. Superposición: Generación de hipótesis (incluyendo Tunelamiento Cuántico)
    const hypotheses = this.hypothesisEngine.generateHypothesisSuperposition(userMessage);

    // 5. Interferencia y Colapso de Estado
    const collapseResult = this.interferenceEngine.processInterference(
      hypotheses,
      retrievedChunks,
      activeConcepts,
      evidenceReport,
      uncertaintyReport,
    );

    const cognitiveFieldContext =
      (await this.cognitiveField.formatFieldForContext(sessionId)) +
      uncertaintyReport.uncertaintyWarningDirectives;

    return {
      activated: true,
      cognitiveFieldContext,
      collapseResult,
      processingTimeMs: Date.now() - start,
    };
  }

  // ── Auxiliares de Criterio ──────────────────────────────────────────────────

  private shouldActivateDeepCognition(text: string): boolean {
    if (!text) return false;

    if (text.trim().length < 45) return false;

    const lower = text.toLowerCase();
    const deepKeywords = [
      'arquitectura', 'agente', 'agentes', 'autonomo', 'autónomo', 'estratégico',
      'estrategia', 'diseño', 'diseño', 'sistema operativo', 'patrón', 'patron',
      'decisión', 'decision', 'ventajas', 'desventajas', 'comparación', 'comparacion',
      'cuántico', 'cuantico', 'cognitivo', 'filosofía', 'filosofia', 'futuro',
      'innovación', 'innovacion', 'creatividad', 'entrelazamiento', 'incertidumbre',
    ];

    return deepKeywords.some((kw) => lower.includes(kw));
  }
}
