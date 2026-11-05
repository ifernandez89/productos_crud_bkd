/**
 * JCA-001: Capa 3 - Contratos Fundamentales de Capacidades
 * 
 * Define las interfaces, estados y tipos para la gobernanza y ejecución modular
 * de capacidades operativas (Math, Web Search) desacopladas del cerebro central.
 */

import type { ContextPlan } from '../context/context-selector.interface.ts';

/**
 * Nivel de riesgo y política de autorización de la capacidad:
 * - READ_ONLY: Operaciones deterministas locales o lectura externa sin efectos secundarios.
 * - MUTATING: Modificaciones de estado interno del sistema (memoria, recordatorios).
 * - SENSITIVE: Operaciones con impacto externo, financiero o irreversible (requieren HITL).
 */
export type CapabilitySafetyLevel = 'READ_ONLY' | 'MUTATING' | 'SENSITIVE';

/**
 * Estados formales resultantes de una invocación de capacidad:
 * - SUCCESS: La capacidad ejecutó satisfactoriamente y obtuvo datos válidos.
 * - NO_RESULTS: La capacidad se ejecutó correctamente pero no produjo datos.
 * - RECOVERABLE_ERROR: Fallo operacional mitigable (error sintáctico, fuente caída).
 * - TIMEOUT: La capacidad superó el presupuesto temporal impuesto por el ejecutor.
 * - UNAUTHORIZED: La capacidad fue bloqueada por política de contexto o exclusión del usuario.
 */
export type CapabilityExecutionStatus =
  | 'SUCCESS'
  | 'NO_RESULTS'
  | 'RECOVERABLE_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED';

export interface CapabilityErrorDetails {
  code: string;
  message: string;
  recoverable: boolean;
  underlyingError?: unknown;
}

export interface CapabilityResult<T = unknown> {
  readonly capabilityId: string;
  readonly status: CapabilityExecutionStatus;
  readonly safetyLevel: CapabilitySafetyLevel;
  readonly durationMs: number;
  readonly data?: T;
  readonly error?: CapabilityErrorDetails;
  /**
   * Resumen textual normalizado apto para ser inyectado directamente
   * en el contexto del constructor de prompts (JarvisPromptBuilder).
   */
  readonly promptContextSnippet?: string;
  /**
   * Directiva explícita de comportamiento hacia el LLM en caso de fallo, timeout o degradación.
   */
  readonly fallbackDirective?: string;
  /**
   * Indica si la operación subyacente fue cancelada efectivamente tras un timeout.
   */
  readonly underlyingOperationCancelled?: boolean;
}

// ── Tipos Específicos para MathCapability ─────────────────────────────────────

export type MathOperationType =
  | 'ARITHMETIC'
  | 'ALGEBRAIC'
  | 'DATE_MATH_DURATION'
  | 'DATE_MATH_SERIES'
  | 'DATE_MATH_DIFFERENCE'
  | 'POWER_BALANCE';

export interface MathResultData {
  readonly operationType: MathOperationType;
  readonly rawExpression: string;
  readonly sanitizedExpression: string;
  readonly result: string;
  readonly numericValue?: number;
  /**
   * NOTA DE PRECISIÓN SEMÁNTICA:
   * verified: true representa exclusivamente que el cálculo fue computado y validado
   * de forma determinista y matemáticamente correcta por el motor local.
   * NO garantiza certeza sobre la interpretación semántica de la consulta del usuario.
   */
  readonly verified: boolean;
  readonly explanationSnippet?: string;
}

// ── Tipos Específicos para WebSearchCapability ─────────────────────────────────

export interface WebSearchItem {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly sourceDomain: string;
  readonly publishedDate?: string;
}

export interface WebSearchResultData {
  readonly query: string;
  readonly effectiveCategory?: string;
  readonly items: WebSearchItem[];
  readonly totalItemsFound: number;
  readonly sourcesAttempted: string[];
  readonly fromCache: boolean;
}

// ── Contexto de Ejecución e Interfaz ICapability ───────────────────────────────

export interface CapabilityExecutionContext {
  readonly sessionId: string;
  readonly userMessage: string;
  readonly contextPlan: ContextPlan;
  readonly abortSignal: AbortSignal;
}

export interface ICapability<T = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly safetyLevel: CapabilitySafetyLevel;
  readonly defaultTimeoutMs: number;

  /**
   * Evaluación pura y sin efectos secundarios: determina si esta capacidad
   * posee los algoritmos necesarios para resolver la consulta.
   * NO ejecuta cálculos, NO accede a red y NO decide permisos de autorización.
   */
  canHandle(userMessage: string, contextPlan: ContextPlan): boolean;

  /**
   * Ejecuta la capacidad sujeta a la señal de aborto (timeout central)
   * y a los parámetros del contexto de ejecución.
   */
  execute(context: CapabilityExecutionContext): Promise<CapabilityResult<T>>;
}
