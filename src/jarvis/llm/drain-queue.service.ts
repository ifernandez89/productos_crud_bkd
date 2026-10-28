import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

export interface DrainResult {
  drained: boolean;
  remainingRequests: number;
  elapsedMs: number;
}

export interface RequestLease {
  model: string;
  release: () => void;
}

/**
 * Servicio DrainQueue (Fase 1 - RTX 5070 Specialist Swapping)
 * 
 * Gestiona el drenaje seguro de peticiones activas (streams SSE e inferencias en curso)
 * para evitar cortes abruptos cuando se conmutan modelos en llama-server / GPU VRAM.
 * Marca el modelo en estado DRAINING y espera hasta que el contador en vuelo llegue a 0
 * con salvaguarda por timeout configurable (default 15s).
 */
@Injectable()
export class DrainQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger(DrainQueueService.name);

  // Contador de peticiones activas por modelo
  private readonly activeRequests = new Map<string, number>();
  // Modelos actualmente en proceso de drenaje
  private readonly drainingModels = new Set<string>();
  // Resolutores de promesas pendientes de drenaje
  private readonly drainWaiters: Array<() => void> = [];
  // Timers activos para teardown seguro
  private readonly activeTimers = new Set<NodeJS.Timeout>();

  private globalDraining = false;

  onApplicationShutdown(): void {
    this.logger.log('[DrainQueue] Apagando servicio de drenaje y liberando timers...');
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
    this.drainWaiters.length = 0;
    this.reset();
  }

  /**
   * Adquiere un permiso (lease) para procesar una petición en el modelo indicado.
   * Si el modelo está en drenaje, rechaza la adquisición para no sumar carga nueva.
   */
  acquireLease(model: string = 'default'): RequestLease {
    const normalizedModel = this.normalizeModelName(model);

    if (this.isDraining(normalizedModel)) {
      throw new Error(
        `[DrainQueue] El modelo '${normalizedModel}' está en estado DRAINING. No se aceptan nuevas peticiones.`,
      );
    }

    const currentCount = this.activeRequests.get(normalizedModel) || 0;
    this.activeRequests.set(normalizedModel, currentCount + 1);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;

      const remaining = Math.max(0, (this.activeRequests.get(normalizedModel) || 1) - 1);
      if (remaining === 0) {
        this.activeRequests.delete(normalizedModel);
      } else {
        this.activeRequests.set(normalizedModel, remaining);
      }

      // Notificar a los procesos que estén esperando drenaje
      this.notifyWaiters();
    };

    return {
      model: normalizedModel,
      release,
    };
  }

  /**
   * Envoltorio funcional para ejecutar una tarea asíncrona dentro del ciclo de vida del lease.
   */
  async trackRequest<T>(model: string, task: () => Promise<T>): Promise<T> {
    const lease = this.acquireLease(model);
    try {
      return await task();
    } finally {
      lease.release();
    }
  }

  /**
   * Marca el modelo o el sistema en estado DRAINING.
   */
  startDraining(model?: string): void {
    if (!model) {
      this.globalDraining = true;
      this.logger.warn('[DrainQueue] Drenaje global activado. Todas las nuevas peticiones serán pausadas.');
      return;
    }
    const normalized = this.normalizeModelName(model);
    this.drainingModels.add(normalized);
    this.logger.log(`[DrainQueue] Modelo '${normalized}' marcado como DRAINING.`);
  }

  /**
   * Restablece el estado normal de atención para el modelo o sistema.
   */
  stopDraining(model?: string): void {
    if (!model) {
      this.globalDraining = false;
      this.drainingModels.clear();
      this.logger.log('[DrainQueue] Drenaje global desactivado.');
      return;
    }
    const normalized = this.normalizeModelName(model);
    this.drainingModels.delete(normalized);
    this.logger.log(`[DrainQueue] Modelo '${normalized}' restablecido a estado operativo normal.`);
  }

  /**
   * Drena las peticiones en vuelo del modelo especificado (o global si se omite).
   * Espera hasta que el contador llegue a 0 o se alcance el timeout (default 15s).
   */
  async drain(model?: string, timeoutMs: number = 15000): Promise<DrainResult> {
    const startTime = Date.now();
    this.startDraining(model);

    const initialPending = this.getActiveCount(model);
    if (initialPending === 0) {
      return {
        drained: true,
        remainingRequests: 0,
        elapsedMs: Date.now() - startTime,
      };
    }

    this.logger.log(
      `[DrainQueue] Iniciando drenaje para ${model ? `'${model}'` : 'todos los modelos'} (${initialPending} peticiones en vuelo, timeout: ${timeoutMs}ms)...`,
    );

    return new Promise<DrainResult>((resolve) => {
      let timer: NodeJS.Timeout | undefined;

      const checkCondition = () => {
        const remaining = this.getActiveCount(model);
        if (remaining === 0) {
          if (timer) {
            clearTimeout(timer);
            this.activeTimers.delete(timer);
          }
          this.removeWaiter(checkCondition);
          resolve({
            drained: true,
            remainingRequests: 0,
            elapsedMs: Date.now() - startTime,
          });
        }
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.activeTimers.delete(timer!);
          this.removeWaiter(checkCondition);
          const remaining = this.getActiveCount(model);
          this.logger.warn(
            `⚠️ [DrainQueue] Timeout de drenaje alcanzado (${timeoutMs}ms). Quedaron ${remaining} peticiones en vuelo. Salvaguarda activada.`,
          );
          resolve({
            drained: remaining === 0,
            remainingRequests: remaining,
            elapsedMs: Date.now() - startTime,
          });
        }, timeoutMs);

        if (typeof timer.unref === 'function') {
          timer.unref();
        }
        this.activeTimers.add(timer);
      }

      this.drainWaiters.push(checkCondition);
      // Chequeo inmediato
      checkCondition();
    });
  }

  /**
   * Retorna la cantidad de peticiones en vuelo para el modelo o en total.
   */
  getActiveCount(model?: string): number {
    if (!model) {
      let total = 0;
      for (const count of this.activeRequests.values()) {
        total += count;
      }
      return total;
    }
    return this.activeRequests.get(this.normalizeModelName(model)) || 0;
  }

  /**
   * Indica si el modelo o el sistema está en drenaje.
   */
  isDraining(model?: string): boolean {
    if (this.globalDraining) return true;
    if (!model) return false;
    return this.drainingModels.has(this.normalizeModelName(model));
  }

  /**
   * Resetea contadores y estados de drenaje.
   */
  reset(): void {
    this.activeRequests.clear();
    this.drainingModels.clear();
    this.globalDraining = false;
  }

  private normalizeModelName(model: string): string {
    return model.trim().toLowerCase();
  }

  private notifyWaiters(): void {
    for (const waiter of [...this.drainWaiters]) {
      waiter();
    }
  }

  private removeWaiter(fn: () => void): void {
    const idx = this.drainWaiters.indexOf(fn);
    if (idx !== -1) {
      this.drainWaiters.splice(idx, 1);
    }
  }
}
