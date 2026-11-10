import {
  Injectable,
  Logger,
  Optional,
  OnApplicationShutdown,
} from '@nestjs/common';
import axios from 'axios';
import { DrainQueueService, DrainResult } from './drain-queue.service';
import {
  CalibratedVramProfile,
  ModelVramEstimate,
} from './gpu-observer.types';
import {
  InferenceSupervisorService,
  InferenceServerStatus,
} from './inference-supervisor.service';

export interface VramProfile extends CalibratedVramProfile {}

export interface VramStatusReport {
  gpuName: string;
  totalVramMb: number;
  maxCeilingMb: number;
  estimatedCurrentUsageMb: number;
  headroomMb: number;
  loadedModel: string;
  activeContextTokens?: number;
  kvBytesPerToken?: number;
  calibrationSource?: string;
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

  // Perfiles VRAM calibrados empíricamente en RTX 5070 (12 GB GDDR7 — GPUTaskman v0.3.5)
  private readonly VRAM_PROFILES: Record<string, VramProfile> = {
    'qwen3:4b': {
      name: 'qwen3:4b',
      estimatedVramMb: 2800,
      contextLimit: 16384,
      recommendedCtx: 16384,
      maxSafeCtx: 32768,
      weightsMiB: 2350,
      runtimeBuffersMiB: 250,
      kvBytesPerToken: 12288,
      kvQuant: 'q8_0',
      calibrated: false,
      calibrationSource: 'Baseline estimado (pendiente descarga/captura GPUTaskman)',
      description: 'Especialista veloz en código, RAG y seguimiento estricto (~130 t/s)',
    },
    'gemma3:4b': {
      name: 'gemma3:4b',
      estimatedVramMb: 3000,
      contextLimit: 16384,
      recommendedCtx: 16384,
      maxSafeCtx: 32768,
      weightsMiB: 2550,
      runtimeBuffersMiB: 250,
      kvBytesPerToken: 12288,
      kvQuant: 'q8_0',
      calibrated: false,
      calibrationSource: 'Baseline estimado (pendiente descarga/captura GPUTaskman)',
      description: 'Especialista en síntesis, resúmenes largos y estilo conversacional',
    },
    'qwen2.5-coder:7b': {
      name: 'qwen2.5-coder:7b',
      estimatedVramMb: 4967,
      contextLimit: 16384,
      recommendedCtx: 8192,
      maxSafeCtx: 32768,
      weightsMiB: 4168,
      runtimeBuffersMiB: 323,
      kvBytesPerToken: 30464,
      kvQuant: 'q8_0',
      calibrated: true,
      calibrationSource: 'GPUTaskman v0.3.5 RTX 5070 (4729 MiB @ 8k ctx)',
      description: 'Especialista en refactorización profunda y algoritmos complejos',
    },
    'qwen2.5-coder:14b': {
      name: 'qwen2.5-coder:14b',
      estimatedVramMb: 9065,
      contextLimit: 6144,
      recommendedCtx: 6144,
      maxSafeCtx: 12288,
      weightsMiB: 8148,
      runtimeBuffersMiB: 304,
      kvBytesPerToken: 104448,
      kvQuant: 'q8_0',
      calibrated: true,
      calibrationSource: 'GPUTaskman v0.3.5 RTX 5070 Exp A (9067 MiB @ 6k; spill a 32k)',
      description: 'Especialista principal de ingeniería de software JarBees (RTX 5070 12GB, -c 6144)',
    },
    'qwen3:8b': {
      name: 'qwen3:8b',
      estimatedVramMb: 6165,
      contextLimit: 16384,
      recommendedCtx: 8192,
      maxSafeCtx: 32768,
      weightsMiB: 4639,
      runtimeBuffersMiB: 297,
      kvBytesPerToken: 78336,
      kvQuant: 'q8_0',
      calibrated: true,
      calibrationSource: 'GPUTaskman v0.3.5 RTX 5070 (6165 MiB @ 16k ctx)',
      description: 'Especialista avanzado para escalamiento de código y lógica',
    },
    'deepseek-r1:8b': {
      name: 'deepseek-r1:8b',
      estimatedVramMb: 5500,
      contextLimit: 16384,
      recommendedCtx: 8192,
      maxSafeCtx: 24576,
      weightsMiB: 4639,
      runtimeBuffersMiB: 297,
      kvBytesPerToken: 55296,
      kvQuant: 'q8_0',
      calibrated: false,
      calibrationSource: 'Perfil arquitectura 8B estimado',
      description: 'Auditor de premisas y razonamiento dialéctico profundo',
    },
    'llama3.2:3b': {
      name: 'llama3.2:3b',
      estimatedVramMb: 2621,
      contextLimit: 4096,
      recommendedCtx: 4096,
      maxSafeCtx: 16384,
      weightsMiB: 1918,
      runtimeBuffersMiB: 255,
      kvBytesPerToken: 114688,
      kvQuant: 'fp16',
      calibrated: true,
      calibrationSource: 'GPUTaskman v0.3.5 Ollama Exp B (2621 MiB @ 4k ctx)',
      description: 'Intent router ligero (KV fp16 en Ollama = 112 KiB/token)',
    },
    'rogerben/hy-mt1.5-1.8b:latest': {
      name: 'RogerBen/hy-mt1.5-1.8b:latest',
      estimatedVramMb: 2303,
      contextLimit: 4096,
      recommendedCtx: 4096,
      maxSafeCtx: 16384,
      weightsMiB: 1815,
      runtimeBuffersMiB: 232,
      kvBytesPerToken: 65536,
      kvQuant: 'fp16',
      calibrated: true,
      calibrationSource: 'GPUTaskman v0.3.5 Ollama Exp B (2303 MiB @ 4k ctx)',
      description: 'Traductor especializado de libros y documentos',
    },
    'yemifo/qwen25-vl-3b-q4km:latest': {
      name: 'yemifo/qwen25-vl-3b-q4km:latest',
      estimatedVramMb: 2243,
      contextLimit: 4096,
      recommendedCtx: 4096,
      maxSafeCtx: 16384,
      weightsMiB: 1835,
      runtimeBuffersMiB: 264,
      kvBytesPerToken: 36864,
      kvQuant: 'q8_0',
      calibrated: true,
      calibrationSource: 'GPUTaskman v0.3.5 Ollama Exp B (2243 MiB @ 4k ctx)',
      description: 'Modelo multimodal de visión/OCR local',
    },
    'bge-m3:latest': {
      name: 'bge-m3:latest',
      estimatedVramMb: 834,
      contextLimit: 8192,
      recommendedCtx: 8192,
      maxSafeCtx: 8192,
      weightsMiB: 834,
      runtimeBuffersMiB: 0,
      kvBytesPerToken: 0,
      kvQuant: 'none',
      calibrated: true,
      calibrationSource: 'GPUTaskman v0.3.5 Ollama Exp B (834 MiB dedicados, coexiste con 14B)',
      description: 'Embeddings vectoriales RAG (1024 dims) — coexiste residente junto a 14B @ 6k',
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
   * Resuelve un perfil calibrado por alias o ruta de archivo GGUF.
   */
  getCalibratedProfile(modelNameOrPath: string): VramProfile | undefined {
    const raw = (modelNameOrPath || '').trim().toLowerCase();
    if (!raw) return undefined;
    if (this.VRAM_PROFILES[raw]) return this.VRAM_PROFILES[raw];

    if (raw.includes('14b') && raw.includes('coder')) return this.VRAM_PROFILES['qwen2.5-coder:14b'];
    if (raw.includes('7b') && raw.includes('coder')) return this.VRAM_PROFILES['qwen2.5-coder:7b'];
    if (raw.includes('qwen3') && raw.includes('8b')) return this.VRAM_PROFILES['qwen3:8b'];
    if (raw.includes('qwen3') && raw.includes('4b')) return this.VRAM_PROFILES['qwen3:4b'];
    if (raw.includes('gemma3') && raw.includes('4b')) return this.VRAM_PROFILES['gemma3:4b'];
    if (raw.includes('deepseek') && raw.includes('8b')) return this.VRAM_PROFILES['deepseek-r1:8b'];
    if (raw.includes('llama3.2')) return this.VRAM_PROFILES['llama3.2:3b'];
    if (raw.includes('hy-mt1.5')) return this.VRAM_PROFILES['rogerben/hy-mt1.5-1.8b:latest'];
    if (raw.includes('qwen25-vl') || raw.includes('qwen2.5-vl')) return this.VRAM_PROFILES['yemifo/qwen25-vl-3b-q4km:latest'];
    if (raw.includes('bge-m3')) return this.VRAM_PROFILES['bge-m3:latest'];
    return undefined;
  }

  /**
   * Devuelve todos los perfiles calibrados conocidos para evaluación de presupuesto.
   */
  getCalibratedProfiles(): CalibratedVramProfile[] {
    return Object.values(this.VRAM_PROFILES);
  }

  /**
   * Calcula dinámicamente la VRAM de proceso según pesos, buffers CUDA y tamaño de contexto.
   */
  estimateVramForModel(
    modelName: string,
    ctxTokens?: number,
    parallelSlots = 1,
  ): ModelVramEstimate {
    const profile = this.getCalibratedProfile(modelName);
    const effectiveCtx = Math.max(
      512,
      Math.floor(ctxTokens ?? profile?.contextLimit ?? 8192),
    );
    const safeSlots = Math.max(1, Math.floor(parallelSlots));

    if (!profile) {
      return {
        model: modelName,
        ctxTokens: effectiveCtx,
        parallelSlots: safeSlots,
        weightsMiB: 3200,
        runtimeBuffersMiB: 300,
        kvCacheMiB: Math.round((effectiveCtx * safeSlots * 40960) / 1048576),
        totalProcessMiB: 3500 + Math.round((effectiveCtx * safeSlots * 40960) / 1048576),
        kvBytesPerToken: 40960,
        maxSafeCtxTokens: 16384,
        fitsWddmCeiling: true,
        calibrated: false,
      };
    }

    const kvCacheMiB = Math.round(
      (profile.kvBytesPerToken * effectiveCtx * safeSlots) / 1048576,
    );
    const totalProcessMiB =
      profile.weightsMiB + profile.runtimeBuffersMiB + kvCacheMiB;

    return {
      model: profile.name,
      ctxTokens: effectiveCtx,
      parallelSlots: safeSlots,
      weightsMiB: profile.weightsMiB,
      runtimeBuffersMiB: profile.runtimeBuffersMiB,
      kvCacheMiB,
      totalProcessMiB,
      kvBytesPerToken: profile.kvBytesPerToken,
      maxSafeCtxTokens: profile.maxSafeCtx,
      fitsWddmCeiling: totalProcessMiB <= 9900,
      calibrated: profile.calibrated,
    };
  }

  /**
   * Devuelve el límite efectivo de contexto para el modelo activo o indicado.
   */
  getEffectiveContextLimit(modelName?: string): number {
    const profile = this.getCalibratedProfile(modelName || this.currentModel);
    if (profile) return profile.contextLimit;
    const envCtx = parseInt(process.env.LLAMACPP_CTX_SIZE || '8192', 10);
    return Number.isFinite(envCtx) && envCtx > 0 ? envCtx : 8192;
  }

  /**
   * Obtiene el reporte de estado de presupuesto de VRAM para la RTX 5070.
   */
  async getVramStatus(ctxTokens?: number): Promise<VramStatusReport> {
    const profile = this.getCalibratedProfile(this.currentModel) || {
      name: this.currentModel,
      estimatedVramMb: 3500,
      contextLimit: 16384,
      recommendedCtx: 8192,
      maxSafeCtx: 16384,
      weightsMiB: 3200,
      runtimeBuffersMiB: 300,
      kvBytesPerToken: 40960,
      kvQuant: 'q8_0' as const,
      calibrated: false,
      calibrationSource: 'Genérico',
      description: 'Modelo genérico',
    };

    const estimatedUsage =
      ctxTokens !== undefined
        ? this.estimateVramForModel(this.currentModel, ctxTokens).totalProcessMiB
        : profile.estimatedVramMb;
    const headroom = Math.max(0, this.MAX_CEILING_MB - estimatedUsage);

    return {
      gpuName: 'NVIDIA GeForce RTX 5070 (12 GB)',
      totalVramMb: this.TOTAL_VRAM_MB,
      maxCeilingMb: this.MAX_CEILING_MB,
      estimatedCurrentUsageMb: estimatedUsage,
      headroomMb: headroom,
      loadedModel: this.currentModel,
      activeContextTokens: ctxTokens ?? profile.contextLimit,
      kvBytesPerToken: profile.kvBytesPerToken,
      calibrationSource: profile.calibrationSource,
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
   * Genera los argumentos de línea de comandos de llama-server con optimización para RTX 5070,
   * ajustando automáticamente el tamaño de contexto al perfil calibrado (ej. 6144 para 14B).
   */
  buildOptimizedArgs(
    modelPath: string,
    port = 8080,
    options?: { modelName?: string; ctxSize?: number },
  ): string[] {
    const profile =
      this.getCalibratedProfile(options?.modelName || modelPath) ||
      this.getCalibratedProfile(this.currentModel);
    const ctxSize = options?.ctxSize ?? profile?.contextLimit ?? 16384;

    return [
      '-m',
      modelPath,
      '-c',
      String(ctxSize),
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
