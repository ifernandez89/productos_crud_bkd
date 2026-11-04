/**
 * JarBees Neural Engineer (JNE) — Tipos y Contratos de Observabilidad Pasiva (Shadow Mode)
 * Especificación formal de telemetría, eventos de frontera y evaluación cognitiva.
 */

export type JneEventType =
  | 'INFERENCE_SUCCESS'
  | 'INFERENCE_FAILURE'
  | 'MODEL_SWITCH'
  | 'BOUNDARY_PROMPT'
  | 'HIJACK_SUSPECTED'
  | 'DATA_PRIVACY_BLOCKED';

export interface JneTokenStats {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  tokensPerSecond?: number;
}

export interface JneTelemetryEvent {
  readonly id: string;
  readonly timestamp: Date;
  readonly eventType: JneEventType;
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
  readonly status: 'OK' | 'ERROR' | 'FALLBACK' | 'BLOCKED';
  readonly tokens?: JneTokenStats;
  readonly sensitivity: 'public' | 'private' | 'confidential';
  readonly payloadRedacted: boolean;
  readonly promptExcerpt?: string;
  readonly responseExcerpt?: string;
  readonly error?: string;
  readonly metadata?: Record<string, any>;
}

export interface JneObserverConfig {
  /** Activa o desactiva la captura pasiva sin reiniciar la aplicación */
  enabled: boolean;
  
  /** Límite de eventos retenidos en memoria (Ring Buffer) */
  maxQueueSize: number;
  
  /** Intervalo de volcado periódico si está configurado */
  flushIntervalMs: number;
  
  /** Anonimización obligatoria de credenciales y datos confidenciales */
  redactSensitiveData: boolean;
  
  /** Modo estricto de no bloqueo (garantiza que errores del observer se silencien) */
  silentFailures: boolean;
}

export interface JneCognitiveMetrics {
  readonly totalEventsObserved: number;
  readonly totalInferences: number;
  readonly totalFailures: number;
  readonly totalFallbacks: number;
  readonly totalHijackAlerts: number;
  /** Índice de Fidelidad a la Intención: 1 - (intervenciones espurias / total consultas) */
  readonly intentionFidelityIndex: number;
  readonly averageLatencyMs: number;
  readonly lastObservedTimestamp?: Date;
}
