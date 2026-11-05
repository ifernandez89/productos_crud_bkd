/**
 * JarBees Cognitive Architecture (JCA) — Fase 5: Cognitive Evaluation Subsystem
 * Tipos formales para métricas de fidelidad a la intención, ruido contextual, deriva cognitiva y verificación.
 */

export interface CognitiveEvaluationInput {
  readonly conversationId: string;
  readonly userObjective: string;
  readonly promptInjectedContext: string;
  readonly responseContent: string;
  readonly toolInvocations?: Array<{
    toolName: string;
    outputUsedInResponse: boolean;
  }>;
  readonly missionEvidence?: Array<{
    claim: string;
    verified: boolean;
    evidenceHash?: string;
  }>;
  readonly objectiveEmbedding?: number[];
  readonly stateEmbedding?: number[];
}

export interface CognitiveEvaluationMetrics {
  /** Intention Fidelity Score [0, 1] */
  readonly intentionFidelity: number;
  /** Context Noise Ratio [0, 1] */
  readonly contextNoiseRatio: number;
  /** Tool Invocation Precision [0, 1] */
  readonly toolPrecision: number;
  /** Evidence Verification Rate [0, 1] */
  readonly evidenceVerificationRate: number;
  /** Cognitive Drift Index [0, 2] */
  readonly cognitiveDriftIndex: number;
  /** Diagnóstico de alertas de deriva o secuestro léxico */
  readonly alerts: CognitiveAlert[];
  /** Si la respuesta pasa los umbrales de integridad cognitiva */
  readonly passedQualityGate: boolean;
}

export interface CognitiveAlert {
  readonly level: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly code:
    | 'HIGH_CONTEXT_NOISE'
    | 'LOW_INTENTION_FIDELITY'
    | 'COGNITIVE_DRIFT_DETECTED'
    | 'UNVERIFIED_EVIDENCE'
    | 'UNUSED_TOOL_CALL';
  readonly message: string;
}

