/**
 * JarBees Cognitive Architecture (JCA) — Dialogue Engine Types
 * Tipos formales para el seguimiento del hilo conversacional, deixis y resolución de anáforas.
 */

export interface ChatMessageLike {
  role: string;
  content: string;
}

export type ConversationTurnState =
  | 'NEW_TOPIC'            // Nueva consulta o tema independiente
  | 'CLARIFICATION'        // Petición de aclaración o profundización del turno anterior
  | 'CORRECTION'           // Corrección de una premisa errónea anterior
  | 'OPERATIONAL_DIRECTIVE'// Mandato operativo para herramientas o misiones (JCA TaskEnvelope)
  | 'REFLECTIVE_CHAT';     // Diálogo conceptual, reflexivo o filosófico (sin herramientas)

export type DialogueTurnType = ConversationTurnState;

export type TaskType =
  | 'TELL_JOKE'
  | 'TRANSLATE'
  | 'EXPLAIN'
  | 'SOLVE_RIDDLE'
  | 'EXECUTE_TOOL'
  | 'RAG_SEARCH'
  | 'GENERAL_CHAT'
  | 'CODE';

export interface AnaphoraResolution {
  readonly hasAnaphora: boolean;
  readonly originalMessage: string;
  readonly resolvedMessage: string;
  readonly referencedAntecedent: string | null;
  readonly confidence: number;
}

export interface DialogueEvaluation {
  readonly turnState: ConversationTurnState;
  readonly originalMessage: string;
  readonly resolvedMessage: string;
  readonly anaphora: AnaphoraResolution;
  readonly isOperational: boolean;
  readonly shouldBypassTools: boolean;
  readonly confidenceScore: number;
  readonly detectedTopics: string[];
}

/**
 * JCA-002: Estado conversacional dinámico y continuidad de tareas
 */
export interface ConversationTaskState {
  readonly sessionId: string;
  readonly activeTask: TaskType;
  readonly lastOutput?: string;
  readonly previousOutputs: string[];
  readonly language: string;
  readonly targetLanguage?: string;
  readonly constraints: string[];
  readonly requestedChange?: string;
  readonly noveltyRequired: boolean;
  readonly deliberationRequired: boolean;
  readonly updatedAt: number;
}

export interface NoveltyCheckResult {
  readonly isNovel: boolean;
  readonly similarityScore: number; // 0.0 a 1.0
  readonly matchedOutput?: string;
  readonly reason?: string;
}

export interface TaskContractValidationResult {
  readonly isValid: boolean;
  readonly taskType: TaskType;
  readonly violationReason?: string;
  readonly suggestedAction?: 'REGENERATE_WITH_HIGH_TEMP' | 'REGENERATE_WITH_CHAIN_OF_THOUGHT' | 'FORCE_TOOL_EXECUTION' | 'NONE';
  readonly sanitizedResponse?: string;
}

export interface RagEvidenceSource {
  readonly id: number | string;
  readonly title: string;
  readonly author?: string;
  readonly category?: string;
  readonly page?: number;
  readonly similarity?: number;
  readonly snippet?: string;
}


