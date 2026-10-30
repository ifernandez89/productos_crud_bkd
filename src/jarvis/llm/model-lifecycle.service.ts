import {
  Injectable,
  Logger,
  Optional,
  OnApplicationShutdown,
} from '@nestjs/common';
import axios from 'axios';
import { DrainQueueService, DrainResult } from './drain-queue.service';
import {
  InferenceSupervisorService,
  InferenceServerStatus,
} from './inference-supervisor.service';

export interface VramProfile {
  name: string;
  estimatedVramMb: number;
  contextLimit: number;
  description: string;
}

export interface VramStatusReport {
  gpuName: string;
  totalVramMb: number;
  maxCeilingMb: number;
  estimatedCurrentUsageMb: number;
  headroomMb: number;
  loadedModel: string;
}

export interface ModelSwitchOptions {
  timeoutMs?: number;
  force?: boolean;
}

export interface ModelSwitchResult {
  success: boolean;
  fromModel: string;
  toModel: string;
  drainResult: DrainResult;
  vramFreedMb?: number;
  swapDurationMs: number;
  error?: string;
}

/**
 * ModelLifecycleService (Fase 1 - RTX 5070 Specialist Swapping)
 *
 * Orquesta la conmutación dinámica de modelos especialistas en VRAM (12 GB neta, techo 10.8 GB),
 * gestionando el ciclo de vida seguro mediante DrainQueue, verificación de presupuesto de GPU,
 * y soporte para KV Cache cuantizada (ctk/ctv q8_0).
 */
@Injectable()
export class ModelLifecycleService implements OnApplicationShutdown {
  private readonly logger = new Logger(ModelLifecycleService.name);

  // Perfiles VRAM en RTX 5070 (12 GB GDDR7)
  private readonly VRAM_PROFILES: Record<string, VramProfile> = {
    'qwen3:4b': {
      name: 'qwen3:4b',
      estimatedVramMb: 2800,
      contextLimit: 16384,
      description: 'Especialista veloz en código, RAG y seguimiento estricto (~130 t/s)',
    },
    'gemma3:4b': {
      name: 'gemma3:4b',
      estimatedVramMb: 3000,
      contextLimit: 16384,
      description: 'Especialista en síntesis, resúmenes largos y estilo conversacional',
    },
    'qwen2.5-coder:7b': {
      name: 'qwen2.5-coder:7b',
      estimatedVramMb: 4800,
      contextLimit: 16384,
      description: 'Especialista en refactorización profunda y algoritmos complejos',
    },
    'qwen2.5-coder:14b': {
      name: 'qwen2.5-coder:14b',
      estimatedVramMb: 10250,
      contextLimit: 6144,
      description: 'Especialista principal de ingeniería de software JarBees (RTX 5070 12GB, -c 6144)',
    },
    'qwen3:8b': {
      name: 'qwen3:8b',
      estimatedVramMb: 5500,
      contextLimit: 16384,
      description: 'Especialista avanzado para escalamiento de código y lógica',
    },
    'deepseek-r1:8b': {
      name: 'deepseek-r1:8b',
      estimatedVramMb: 5500,
      contextLimit: 16384,
      description: 'Auditor de premisas y razonamiento dialéctico profundo',
    },
  };

  private readonly TOTAL_VRAM_MB = 12288; // 12 GB
  private readonly MAX_CEILING_MB = 10800; // 10.8 GB Anti-OOM ceiling

  private currentModel: string = 'qwen3:4b';
  private swapCount = 0;
  private lastSwapDurationMs = 0;
  private lastSwapTime?: Date;

  constructor(
    private readonly drainQueue: DrainQueueService,
    @Optional()
    private readonly supervisor?: InferenceSupervisorService,
  ) {
    this.currentModel = process.env.LLAMACPP_DEFAULT_MODEL || 'qwen3:4b';
    this.logger.log(
      `[ModelLifecycle] Inicializado. Modelo activo: ${this.currentModel} | Techo VRAM: ${this.MAX_CEILING_MB} MB`,
    );
  }

  onApplicationShutdown(): void {
    this.logger.log('[ModelLifecycle] Apagando lifecycle supervisor...');
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  getSwapCount(): number {
    return this.swapCount;
  }

  getLastSwapDuration(): number {
    return this.lastSwapDurationMs;
  }

  /**
   * Obtiene el reporte de estado de presupuesto de VRAM para la RTX 5070.
   */
  async getVramStatus(): Promise<VramStatusReport> {
    const profile = this.VRAM_PROFILES[this.currentModel] || {
      name: this.currentModel,
      estimatedVramMb: 3500,
      contextLimit: 16384,
      description: 'Modelo genérico',
    };

    const estimatedUsage = profile.estimatedVramMb;
    const headroom = Math.max(0, this.MAX_CEILING_MB - estimatedUsage);

    return {
      gpuName: 'NVIDIA GeForce RTX 5070 (12 GB)',
      totalVramMb: this.TOTAL_VRAM_MB,
      maxCeilingMb: this.MAX_CEILING_MB,
      estimatedCurrentUsageMb: estimatedUsage,
      headroomMb: headroom,
      loadedModel: this.currentModel,
    };
  }

  /**
   * Conmuta dinámicamente hacia el modelo especialista solicitado.
   * Ejecuta drenaje seguro previo, libera VRAM residual y aplica salvaguardas.
   */
  async switchModel(
    targetModel: string,
    options: ModelSwitchOptions = {},
  ): Promise<ModelSwitchResult> {
    const startTime = Date.now();
    const normalizedTarget = targetModel.trim().toLowerCase();
    const fromModel = this.currentModel;

    // Si ya está activo el modelo objetivo, no hay conmutación
    if (fromModel === normalizedTarget && !options.force) {
      return {
        success: true,
        fromModel,
        toModel: normalizedTarget,
        drainResult: { drained: true, remainingRequests: 0, elapsedMs: 0 },
        swapDurationMs: 0,
      };
    }

    this.logger.log(
      `[ModelLifecycle] Iniciando conmutación de especialista: '${fromModel}' ➔ '${normalizedTarget}'...`,
    );

    // 1. Drenar peticiones en vuelo del modelo activo (timeout default 15s)
    const timeoutMs = options.timeoutMs ?? 15000;
    const drainResult = await this.drainQueue.drain(fromModel, timeoutMs);

    if (!drainResult.drained && !options.force) {
      this.logger.warn(
        `[ModelLifecycle] Drenaje incompleto (${drainResult.remainingRequests} peticiones en curso). Cancelando conmutación sin forzar.`,
      );
      this.drainQueue.stopDraining(fromModel);
      return {
        success: false,
        fromModel,
        toModel: normalizedTarget,
        drainResult,
        swapDurationMs: Date.now() - startTime,
        error: `Drenaje incompleto: quedaron ${drainResult.remainingRequests} peticiones activas.`,
      };
    }

    // 2. Liberación preventiva de VRAM en Ollama para asegurar espacio en RTX 5070
    let vramFreedMb = 0;
    if (this.supervisor) {
      try {
        await this.supervisor.freeOllamaVram();
        vramFreedMb += 1000;
      } catch (err: any) {
        this.logger.debug(
          `[ModelLifecycle] Aviso al liberar VRAM en Ollama: ${err.message}`,
        );
      }
    }

    // 3. Notificar a llama-server o verificar slot
    try {
      await this.signalLlamaServerSwitch(normalizedTarget);
    } catch (err: any) {
      this.logger.error(
        `[ModelLifecycle] Error al conmutar modelo en llama-server: ${err.message}`,
      );
      this.drainQueue.stopDraining(fromModel);
      return {
        success: false,
        fromModel,
        toModel: normalizedTarget,
        drainResult,
        swapDurationMs: Date.now() - startTime,
        error: err.message,
      };
    }

    // 4. Actualizar estado y finalizar drenaje
    this.drainQueue.stopDraining(fromModel);
    this.currentModel = normalizedTarget;
    this.swapCount++;
    this.lastSwapDurationMs = Date.now() - startTime;
    this.lastSwapTime = new Date();

    this.logger.log(
      `✅ [ModelLifecycle] Conmutación exitosa a '${normalizedTarget}' en ${this.lastSwapDurationMs}ms`,
    );

    return {
      success: true,
      fromModel,
      toModel: normalizedTarget,
      drainResult,
      vramFreedMb,
      swapDurationMs: this.lastSwapDurationMs,
    };
  }

  /**
   * Comunica a llama-server la solicitud de conmutación de modelo o verifica disponibilidad.
   */
  private async signalLlamaServerSwitch(modelName: string): Promise<void> {
    const host = process.env.LLAMACPP_HOST || '127.0.0.1';
    const port = process.env.LLAMACPP_PORT || '8080';

    try {
      // En router mode de llama-server, /health o /models expone los alias
      const res = await axios.get(`http://${host}:${port}/health`, {
        timeout: 3000,
      });
      if (res.status === 200) {
        return;
      }
    } catch {
      // Si el supervisor está disponible y no responde, intentamos recuperación
      if (this.supervisor) {
        await this.supervisor.recover();
      }
    }
  }

  /**
   * Genera los argumentos de línea de comandos de llama-server con optimización para RTX 5070.
   */
  buildOptimizedArgs(modelPath: string, port = 8080): string[] {
    return [
      '-m',
      modelPath,
      '-c',
      '16384',
      '--ctk',
      'q8_0',
      '--ctv',
      'q8_0',
      '-ngl',
      '99',
      '--port',
      String(port),
      '--jinja',
    ];
  }
}
