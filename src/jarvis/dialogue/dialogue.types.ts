/**
 * JarBees Cognitive Architecture (JCA) — Dialogue Engine Types
 * Tipos formales para el seguimiento del hilo conversacional, deixis y resolución de anáforas.
 */

export type ConversationTurnState =
  | 'NEW_TOPIC'            // Nueva consulta o tema independiente
  | 'CLARIFICATION'        // Petición de aclaración o profundización del turno anterior
  | 'CORRECTION'           // Corrección de una premisa errónea anterior
  | 'OPERATIONAL_DIRECTIVE'// Mandato operativo para herramientas o misiones (JCA TaskEnvelope)
  | 'REFLECTIVE_CHAT';     // Diálogo conceptual, reflexivo o filosófico (sin herramientas)

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
