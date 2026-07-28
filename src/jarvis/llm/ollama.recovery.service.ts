import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import {
  OllamaStatus,
  OllamaState,
  INITIAL_OLLAMA_STATE,
} from './ollama.state';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const HEALTH_ENDPOINT = `${OLLAMA_BASE_URL}/api/tags`;

/** Número máximo de reinicios dentro de la ventana de tiempo */
const MAX_RESTARTS = 3;
/** Ventana de tiempo del circuit breaker en milisegundos (5 minutos) */
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000;
/** Tiempo máximo esperando a que Ollama quede disponible (ms) */
const READY_TIMEOUT_MS = 15_000;
/** Intervalo de poll al verificar disponibilidad (ms) */
const READY_POLL_INTERVAL_MS = 500;

@Injectable()
export class OllamaRecoveryService {
  private readonly logger = new Logger(OllamaRecoveryService.name);

  /** Estado interno conocido por JarBees sobre Ollama */
  private state: OllamaState = { ...INITIAL_OLLAMA_STATE };

  /** Referencia al proceso Ollama levantado por JarBees (si existe) */
  private ollamaProcess?: ChildProcess;

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Devuelve una copia del estado actual de Ollama.
   * Útil para endpoints de diagnóstico o logs.
   */
  getState(): OllamaState {
    return { ...this.state };
  }

  /**
   * Intenta recuperar Ollama después de un ECONNREFUSED.
   * - Verifica circuit breaker antes de actuar.
   * - Reutiliza proceso existente si aún vive.
   * - Espera disponibilidad real antes de retornar.
   * - Lanza error descriptivo si la recuperación falla.
   */
  async recover(): Promise<void> {
    this.assertCircuitClosed();

    // Si ya estamos reiniciando (llamada concurrente), solo esperar
    if (this.state.status === OllamaStatus.RESTARTING) {
      this.logger.log('[recovery] Ya hay un restart en progreso — esperando...');
      await this.waitUntilReady();
      return;
    }

    this.state.status = OllamaStatus.RESTARTING;

    try {
      await this.spawnOllamaIfNeeded();
      await this.waitUntilReady();

      this.state.status = OllamaStatus.RUNNING;
      this.state.lastRestart = new Date();
      this.logger.log('[recovery] ✅ Ollama recuperado exitosamente');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state.lastError = msg;
      this.incrementRestartAttempts();

      // Si se agotaron los intentos, marcar como FAILED
      if (this.state.restartAttempts >= MAX_RESTARTS) {
        this.state.status = OllamaStatus.FAILED;
      } else {
        this.state.status = OllamaStatus.UNKNOWN;
      }

      this.logger.error(`[recovery] ❌ Fallo en recovery: ${msg}`);
      throw this.buildUserFacingError();
    }
  }

  /**
   * Verifica si Ollama responde sin intentar levantarlo.
   * Útil como pre-check antes de una request (Fase 2).
   */
  async isAlive(): Promise<boolean> {
    try {
      const res = await fetch(HEALTH_ENDPOINT, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Verifica si el circuit breaker está abierto (demasiados fallos recientes).
   * Si está abierto, lanza directamente sin intentar recovery.
   */
  private assertCircuitClosed(): void {
    if (this.state.status !== OllamaStatus.FAILED) return;

    // Verificar si la ventana de tiempo ya expiró (auto-reset)
    if (this.state.windowStart) {
      const elapsed = Date.now() - this.state.windowStart.getTime();
      if (elapsed > CIRCUIT_BREAKER_WINDOW_MS) {
        this.logger.log('[recovery] Circuit breaker — ventana expirada, reseteando');
        this.resetCircuitBreaker();
        return;
      }
    }

    throw this.buildUserFacingError();
  }

  /**
   * Lanza el proceso Ollama solo si no hay uno vivo ya administrado por JarBees.
   * Evita duplicar instancias en el puerto 11434.
   */
  private async spawnOllamaIfNeeded(): Promise<void> {
    // Proceso administrado por JarBees sigue vivo — solo esperar
    if (this.ollamaProcess && !this.ollamaProcess.killed) {
      this.logger.log('[recovery] Proceso Ollama ya existe — esperando disponibilidad...');
      return;
    }

    // Puede que Ollama haya sido levantado externamente — verificar primero
    if (await this.isAlive()) {
      this.logger.log('[recovery] Ollama ya disponible (levantado externamente)');
      return;
    }

    this.logger.log('[recovery] Spawning ollama serve...');

    this.ollamaProcess = spawn('ollama', ['serve'], {
      shell: true,
      windowsHide: true,
      stdio: 'ignore',
    });

    this.ollamaProcess.on('error', (err) => {
      this.logger.error(`[recovery] Error en proceso Ollama: ${err.message}`);
      this.state.lastError = err.message;
    });

    this.ollamaProcess.on('exit', (code, signal) => {
      this.logger.warn(
        `[recovery] Proceso Ollama terminó — code: ${code}, signal: ${signal}`,
      );
      // Limpiar referencia al salir para permitir future spawns
      this.ollamaProcess = undefined;
      if (this.state.status === OllamaStatus.RUNNING) {
        this.state.status = OllamaStatus.UNKNOWN;
      }
    });

    this.incrementRestartAttempts();
  }

  /**
   * Hace poll a /api/tags hasta que Ollama responda o expire el timeout.
   */
  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (await this.isAlive()) return;
      await this.sleep(READY_POLL_INTERVAL_MS);
    }

    throw new Error(
      `Ollama no respondió después de ${READY_TIMEOUT_MS / 1000} segundos`,
    );
  }

  /** Incrementa el contador de restarts y registra el inicio de la ventana si corresponde */
  private incrementRestartAttempts(): void {
    const now = new Date();

    // Iniciar ventana en el primer intento
    if (!this.state.windowStart) {
      this.state.windowStart = now;
    }

    // Si la ventana expiró, resetear y empezar nueva
    const elapsed = now.getTime() - this.state.windowStart.getTime();
    if (elapsed > CIRCUIT_BREAKER_WINDOW_MS) {
      this.resetCircuitBreaker();
      this.state.windowStart = now;
    }

    this.state.restartAttempts += 1;
    this.logger.warn(
      `[recovery] Intento ${this.state.restartAttempts}/${MAX_RESTARTS} en ventana actual`,
    );
  }

  private resetCircuitBreaker(): void {
    this.state.restartAttempts = 0;
    this.state.windowStart = null;
    this.state.status = OllamaStatus.UNKNOWN;
    this.state.lastError = null;
  }

  /**
   * Construye el error que verá el usuario según el estado actual.
   */
  private buildUserFacingError(): Error {
    if (this.state.status === OllamaStatus.FAILED) {
      return new Error(
        `⚠️ JarBees detectó que Ollama no pudo recuperarse automáticamente ` +
          `(${MAX_RESTARTS} intentos fallidos en los últimos 5 minutos). ` +
          `Último error: ${this.state.lastError ?? 'desconocido'}. ` +
          `Por favor reiniciá Ollama manualmente ejecutando "ollama serve".`,
      );
    }

    return new Error(
      `⚠️ No se pudo recuperar la conexión con Ollama. ` +
        `Error: ${this.state.lastError ?? 'timeout de conexión'}. ` +
        `Intentando de nuevo en la próxima solicitud.`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
