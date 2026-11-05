/**
 * JarBees Cognitive Architecture (JCA) — TaskEnvelope Types
 * Contratos de aislamiento, permisos y límites de contexto para herramientas y especialistas.
 */

export type TaskIntent =
  | 'CONVERSATION'
  | 'EXPLANATION'
  | 'RESEARCH'
  | 'CODE_EXECUTION'
  | 'SYSTEM_ADMIN';

export type ExecutionMode = 'DIALOGUE' | 'MISSION';

export type OutputContract =
  | 'JSON_SCHEMA'
  | 'DIFF_PATCH'
  | 'TEXT_EVIDENCE'
  | 'STATUS_FLAG';

export interface TaskEnvelope {
  /** Identificador de la sesión de diálogo activa */
  readonly conversationId: string;

  /** Identificador único de la tarea específica */
  readonly taskId: string;

  /** Intención clasificada por el Cognitive Orchestrator / Dialogue Engine */
  readonly intent: TaskIntent;

  /** Modo de ejecución */
  readonly mode: ExecutionMode;

  /** Lista blanca estricta de herramientas autorizadas para esta tarea */
  readonly allowedTools: readonly string[];

  /** Ámbito de contexto permitido (evita inyecciones de corpus no relacionados) */
  readonly contextScope: readonly string[];

  /** Esquema o tipo de datos esperado en la salida del especialista */
  readonly outputContract: OutputContract;

  /** Si la ejecución requiere confirmación humana explícita */
  readonly requiresApproval: boolean;
}

