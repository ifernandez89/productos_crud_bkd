/**
 * JCA-001: Context Selection Policy Interfaces & Contracts
 * 
 * Define las estructuras para el desacople estricto entre:
 * 1. Intención (qué quiere el usuario)
 * 2. Contexto (qué fuentes son necesarias o permitidas)
 * 3. Acción (qué herramienta o modelo ejecuta)
 */

/**
 * Estados posibles para cada fuente de contexto:
 * - REQUESTED: Solicitada explícitamente por el usuario en su mensaje.
 * - SELECTED: Seleccionada automáticamente por necesidad cognitiva intrínseca.
 * - UNNEEDED: Descartada de forma segura por no ser requerida para la consulta.
 * - EXCLUDED: Bloqueada activamente por una directiva de exclusión del usuario.
 */
export type SourceState = 'REQUESTED' | 'SELECTED' | 'UNNEEDED' | 'EXCLUDED';

export type ContextSourceType =
  | 'memory'
  | 'conversationHistory'
  | 'rag'
  | 'web'
  | 'tools';

export type ToolName = 'math' | 'sports' | 'gmail';

export interface ContextSources {
  /** Memoria persistente a largo plazo (preferencias, recuerdos de usuario) */
  memory: SourceState;
  /** Historial conversacional inmediato (turnos de la sesión actual) */
  conversationHistory: SourceState;
  /** Biblioteca documental personal (documentos y fragmentos pgvector) */
  rag: SourceState;
  /** Búsqueda y navegación web externa */
  web: SourceState;
  /** Herramientas operativas deterministas (calculadora, clima, hora, etc.) */
  tools: SourceState;
}

export interface ContextExclusionDirectives {
  /** Bloqueo explícito de búsqueda en biblioteca ("sin documentos", "no uses biblioteca") */
  excludeDocuments: boolean;
  /** Bloqueo explícito de red ("sin internet", "offline", "no busques en la web") */
  excludeWeb: boolean;
  /** Bloqueo de memoria persistente ("sin memoria", "olvida mis datos previos") */
  excludeMemory: boolean;
  /** Lista de directivas textuales detectadas */
  matchedDirectives: string[];
}

export interface ContextAmbiguity {
  /** Indica si la consulta presenta contradicciones o ambigüedad severa */
  isAmbiguous: boolean;
  /** @deprecated Usar contextConfidence. Conservado por retrocompatibilidad con Capa 1 */
  confidence: 'high' | 'medium' | 'low';
  /** Nivel de certidumbre propio de la selección de contexto, desacoplado del enrutador de intenciones */
  contextConfidence: 'high' | 'medium' | 'low';
  /** Lista de contradicciones o conflictos directos detectados entre directivas */
  conflicts: string[];
  /** Detalle explicable de la ambigüedad detectada */
  reason?: string;
}

export interface ContextPlan {
  /** Estados asignados a cada una de las 5 fuentes independientes */
  sources: ContextSources;
  /** Estados granulares individuales para cada herramienta operativa */
  toolStates: Partial<Record<ToolName, SourceState>>;
  /** Nombres de herramientas activas (derivadas estrictamente de toolStates) */
  activeTools: ToolName[];
  /** Directivas de exclusión identificadas y aplicadas */
  exclusions: ContextExclusionDirectives;
  /** Evaluación de ambigüedad y contradicciones */
  ambiguity: ContextAmbiguity;
  /** Razón explicable de la política aplicada para observabilidad */
  policyReason: string;
  /** Acción primaria recomendada hacia el dispatcher */
  suggestedAction: 'LLM' | 'TOOL' | 'WEB_SEARCH' | 'RAG_SEARCH' | 'HYBRID_SEARCH';
}

export interface ContextEvaluationInput {
  /** Mensaje textual emitido por el usuario */
  userMessage: string;
  /** Intención clasificada previamente (IntentRouter), si existe */
  classifiedIntent?: string;
  /** Nivel de confianza del clasificador de intención */
  intentConfidence?: 'high' | 'medium' | 'low';
  /** Indica si la sesión actual posee turnos previos registrados */
  hasActiveSessionHistory?: boolean;
}
