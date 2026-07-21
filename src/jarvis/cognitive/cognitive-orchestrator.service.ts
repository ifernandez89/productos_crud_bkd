import { Injectable, Logger } from '@nestjs/common';
import { CognitiveFieldService } from '../memory/cognitive-field.service';
import { HypothesisEngineService } from './hypothesis-engine.service';
import { InterferenceEngineService, CognitiveCollapseResult } from './interference-engine.service';
import { UncertaintyEngineService } from './uncertainty-engine.service';
import { EpigeneticRegulatorService, EpigeneticExpression } from './epigenetic-regulator.service';
import { PredictiveProcessingService, PredictionResult } from './predictive-processing.service';
import { MetacognitionEngineService, MetacognitiveEvaluation } from './metacognition-engine.service';
import { EvidenceReport } from '../knowledge/evidence.service';

export interface QICAProcessingResult {
  activated: boolean;
  cognitiveFieldContext: string;
  expression?: EpigeneticExpression;
  prediction?: PredictionResult;
  metacognition?: MetacognitiveEvaluation;
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
    private readonly epigeneticRegulator: EpigeneticRegulatorService,
    private readonly predictiveProcessing: PredictiveProcessingService,
    private readonly metacognitionEngine: MetacognitionEngineService,
  ) {}

  /**
   * JarBees 3.0: Pipeline Cognitivo Multidisciplinario Completo
   * (Epigenética -> Predicción -> Campo Entrelazado -> Superposición -> Interferencia -> Metacognición)
   */
  async processCognitiveQuery(
    sessionId: string,
    userMessage: string,
    retrievedChunks: any[] = [],
    evidenceReport?: EvidenceReport,
  ): Promise<QICAProcessingResult> {
    const start = Date.now();

    // 1. Regulación Epigenética (expresión de capacidades y emociones funcionales)
    const expression = this.epigeneticRegulator.computeExpression(userMessage);

    // 2. Activar conceptos y procesar Grafo de Memoria Entrelazada (co-activación no-local)
    const activeConcepts = await this.cognitiveField.activateConcepts(sessionId, userMessage);

    // 3. Procesamiento Predictivo (anticipación e inferencia de intención)
    const prediction = this.predictiveProcessing.generatePredictionAndCalculateError(
      userMessage,
      activeConcepts,
      retrievedChunks,
    );

    // 4. Evaluar Incertidumbre y Desconocidos (Uncertainty Engine)
    const uncertaintyReport = this.uncertaintyEngine.evaluateUncertainty(
      userMessage,
      retrievedChunks,
      evidenceReport,
    );

    // 5. Evaluación Metacognitiva Pre/Post
    const metacognition = await this.metacognitionEngine.evaluateAndRecord(
      sessionId,
      expression,
      prediction,
    );

    // 6. Determinar si se activa la superposición e interferencia profunda
    const isComplex = this.shouldActivateDeepCognition(userMessage);

    if (!isComplex) {
      const fieldCtx = await this.cognitiveField.formatFieldForContext(sessionId);
      return {
        activated: false,
        cognitiveFieldContext:
          fieldCtx +
          prediction.predictiveCorrectionDirectives +
          uncertaintyReport.uncertaintyWarningDirectives,
        expression,
        prediction,
        metacognition,
        processingTimeMs: Date.now() - start,
      };
    }

    this.logger.log(`[JarBees 3.0:Orquestador] Modo cognitivo biomimético activado en sesión ${sessionId}`);

    // 7. Superposición: Generación de hipótesis (con tasa de Tunelamiento Cuántico epigenético)
    const hypotheses = this.hypothesisEngine.generateHypothesisSuperposition(
      userMessage,
      expression.quantumTunnelingRate,
    );

    // 8. Interferencia y Colapso de Estado
    const collapseResult = this.interferenceEngine.processInterference(
      hypotheses,
      retrievedChunks,
      activeConcepts,
      evidenceReport,
      uncertaintyReport,
    );

    // Adjuntar la nota de metacognición al informe final
    if (collapseResult.interferenceSummaryMarkdown) {
      collapseResult.interferenceSummaryMarkdown += metacognition.metacognitiveMarkdown;
    }

    const cognitiveFieldContext =
      (await this.cognitiveField.formatFieldForContext(sessionId)) +
      prediction.predictiveCorrectionDirectives +
      uncertaintyReport.uncertaintyWarningDirectives;

    return {
      activated: true,
      cognitiveFieldContext,
      expression,
      prediction,
      metacognition,
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
      'metacognición', 'metacognicion', 'epigenética', 'epigenetica', 'predictivo',
    ];

    return deepKeywords.some((kw) => lower.includes(kw));
  }
}
