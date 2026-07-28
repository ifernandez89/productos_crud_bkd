/**
 * Estado interno de Ollama conocido por JarBees.
 *
 * No persiste en base de datos — vive en memoria durante el ciclo de vida
 * de la aplicación. Sirve como base para diagnóstico, circuit breaker
 * y futuros endpoints de salud.
 */

export enum OllamaStatus {
  /** Estado inicial: JarBees no ha verificado Ollama aún */
  UNKNOWN = 'UNKNOWN',
  /** Ollama responde correctamente en localhost:11434 */
  RUNNING = 'RUNNING',
  /** Se está ejecutando un intento de recuperación */
  RESTARTING = 'RESTARTING',
  /** Circuit breaker activado: demasiados reintentos fallidos */
  FAILED = 'FAILED',
}

export interface OllamaState {
  status: OllamaStatus;
  /** Timestamp del último restart exitoso o fallido */
  lastRestart: Date | null;
  /** Cantidad de restarts en la ventana de tiempo actual */
  restartAttempts: number;
  /** Inicio de la ventana de tiempo del circuit breaker */
  windowStart: Date | null;
  /** Último mensaje de error capturado */
  lastError: string | null;
}

export const INITIAL_OLLAMA_STATE: OllamaState = {
  status: OllamaStatus.UNKNOWN,
  lastRestart: null,
  restartAttempts: 0,
  windowStart: null,
  lastError: null,
};
