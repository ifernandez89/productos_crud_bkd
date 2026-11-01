/**
 * Tipos y Contratos para Memory Attention Engine 2.0 (MAE 2.0)
 */

export enum RetrievalDecision {
  NO_RETRIEVAL = 'NO_RETRIEVAL',             // Suficiencia operativa. 0 memoria externa.
  DEFERRED_RETRIEVAL = 'DEFERRED_RETRIEVAL', // Ambigüedad o baja confianza -> búsqueda acotada / clarificación.
  SELECTIVE_RAG = 'SELECTIVE_RAG',           // Recuperación densa factual acotada.
  SELECTIVE_GRAPH = 'SELECTIVE_GRAPH',       // Relaciones ontológicas y linaje bajo demanda.
  SELECTIVE_SNAPSHOT = 'SELECTIVE_SNAPSHOT', // Evolución de hipótesis y consensos históricos.
  DIALECTIC_AUDIT = 'DIALECTIC_AUDIT',       // Conflicto epistémico / desafío a premisas previas.
}

export interface DecisionEvaluationContext {
  userMessage: string;
  sessionId: string;
  conversationHistoryCount?: number;
  explicitProjectEntityMentioned?: boolean;
  isPureAlgorithmicOrMathematical?: boolean;
  hasHistoricalDriftKeywords?: boolean;
  hasAdversarialChallenge?: boolean;
}

export interface RetrievalDecisionRecord {
  decisionId: string;
  sessionId: string;
  userPromptHash: string;
  decision: RetrievalDecision;
  confidenceScore: number; // 0.0 a 1.0
  dimensions: {
    relevance: number;        // 0.0 a 1.0
    necessity: number;        // 0.0 a 1.0
    expectedUtility: number;  // 0.0 a 1.0
    interferenceRisk: number; // 0.0 a 1.0
    contradictionDetected: boolean;
    estimatedTokenCost: number;
  };
  reason: string;
  decisionLatencyMs: number;
  toolsEnabled: string[];
  createdAt: Date;
}

export interface DecisionConfusionMatrix {
  truePositives: number;   // Requería memoria y se recuperó
  trueNegatives: number;   // Autosuficiente y se decidió NO_RETRIEVAL
  falsePositives: number;  // Autosuficiente pero se recuperó innecesariamente (ruido)
  falseNegatives: number;  // Requería memoria pero se omitió (fallo crítico)
  unnecessaryRetrievalRate: number; // FP / (FP + TN)
  omittedMemoryRate: number;        // FN / (FN + TP)
  accuracy: number;
}

export interface CounterfactualUtilityResult {
  deltaUtility: number;
  classification: 'UTILE' | 'NEUTRAL' | 'DETRIMENTAL';
  withMemoryScore: number;
  withoutMemoryScore: number;
  contextCostTokens: number;
}

export interface RetrievalPlan {
  decision: RetrievalDecision;
  allowedTools: string[];
  maxTokensBudget: number;
  shouldExecuteMemoryQuery: boolean;
  instructions: string;
}
