import { Injectable, Logger } from '@nestjs/common';
import { CognitiveFieldService } from '../memory/cognitive-field.service';
import { HypothesisEngineService } from './hypothesis-engine.service';
import { InterferenceEngineService, CognitiveCollapseResult } from './interference-engine.service';
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
  ) {}

  /**
   * Determina si la consulta requiere activación cognitiva cuántico-inspirada y ejecuta el pipeline.
   */
  async processCognitiveQuery(
    sessionId: string,
    userMessage: string,
    retrievedChunks: any[] = [],
    evidenceReport?: EvidenceReport,
  ): Promise<QICAProcessingResult> {
    const start = Date.now();

    // 1. Activar conceptos y actualizar el Campo Cognitivo asociativo
    const activeConcepts = await this.cognitiveField.activateConcepts(sessionId, userMessage);

    // 2. Determinar si se activa la superposición e interferencia profunda
    const isComplex = this.shouldActivateDeepCognition(userMessage);

    if (!isComplex) {
      const fieldCtx = await this.cognitiveField.formatFieldForContext(sessionId);
      return {
        activated: false,
        cognitiveFieldContext: fieldCtx,
        processingTimeMs: Date.now() - start,
      };
    }

    this.logger.log(`[QICA:Orquestador] Activando modo cognitivo profundo para consulta de alta complejidad en sesión ${sessionId}`);

    // 3. Superposición: Generación de hipótesis
    const hypotheses = this.hypothesisEngine.generateHypothesisSuperposition(userMessage);

    // 4. Interferencia y Colapso de Estado
    const collapseResult = this.interferenceEngine.processInterference(
      hypotheses,
      retrievedChunks,
      activeConcepts,
      evidenceReport,
    );

    const cognitiveFieldContext = await this.cognitiveField.formatFieldForContext(sessionId);

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

    // Desactivar para preguntas cortas o directas
    if (text.trim().length < 45) return false;

    const lower = text.toLowerCase();
    const deepKeywords = [
      'arquitectura', 'agente', 'agentes', 'autonomo', 'autónomo', 'estratégico',
      'estrategia', 'diseño', 'diseño', 'sistema operativo', 'patrón', 'patron',
      'decisión', 'decision', 'ventajas', 'desventajas', 'comparación', 'comparacion',
      'cuántico', 'cuantico', 'cognitivo', 'filosofía', 'filosofia', 'futuro',
    ];

    return deepKeywords.some((kw) => lower.includes(kw));
  }
}
