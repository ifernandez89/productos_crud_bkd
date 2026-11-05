import { Injectable, Logger } from '@nestjs/common';
import {
  ModelDescriptor,
  ModelSelectionRequest,
  ModelSelectionDecision,
  HardwareVramState,
} from './model-orchestration.types';

@Injectable()
export class ModelSelectionEngineService {
  private readonly logger = new Logger(ModelSelectionEngineService.name);

  // Perfil de Hardware: NVIDIA GeForce RTX 5070 12GB (12,227 MB VRAM)
  private readonly hardwareState: HardwareVramState = {
    totalVramMb: 12227,
    reservedSystemBufferMb: 400,
    loadedModelIds: ['llama-3.2-3b'], // 3B residente por defecto
    activeKvTokens: 0,
  };

  // Catálogo formal de modelos calibrados para RTX 5070
  private readonly catalog = new Map<string, ModelDescriptor>([
    [
      'llama-3.2-3b',
      {
        id: 'llama-3.2-3b',
        name: 'Llama 3.2 3B Instruct (Q4_K_M)',
        tier: 'TIER_0_FAST',
        vramWeightMb: 2048,
        kvCachePer1kTokensMb: 56,
        maxContextTokens: 32768,
        defaultQuantization: 'Q4_K_M',
        targetLatencyMs: 350,
        isResidentByDefault: true,
      },
    ],
    [
      'qwen2.5-7b',
      {
        id: 'qwen2.5-7b',
        name: 'Qwen 2.5 7B Instruct (Q4_K_M)',
        tier: 'TIER_1_BALANCED',
        vramWeightMb: 4800,
        kvCachePer1kTokensMb: 100,
        maxContextTokens: 32768,
        defaultQuantization: 'Q4_K_M',
        targetLatencyMs: 1500,
        isResidentByDefault: false,
      },
    ],
    [
      'qwen2.5-coder-14b',
      {
        id: 'qwen2.5-coder-14b',
        name: 'Qwen 2.5 Coder 14B Instruct (Q4_K_M)',
        tier: 'TIER_2_DEEP',
        vramWeightMb: 9200,
        kvCachePer1kTokensMb: 160,
        maxContextTokens: 32768,
        defaultQuantization: 'Q4_K_M',
        targetLatencyMs: 4000,
        isResidentByDefault: false,
      },
    ],
    [
      'bge-m3',
      {
        id: 'bge-m3',
        name: 'BGE-M3 Dense Retrieval Specialist',
        tier: 'EMBEDDING',
        vramWeightMb: 600,
        kvCachePer1kTokensMb: 0,
        maxContextTokens: 8192,
        defaultQuantization: 'FP16',
        targetLatencyMs: 50,
        isResidentByDefault: false,
      },
    ],
    [
      'cloud-fallback-heavy',
      {
        id: 'cloud-fallback-heavy',
        name: 'Cloud Fallback Gateway (OpenRouter/Groq 32B+)',
        tier: 'TIER_3_HEAVY',
        vramWeightMb: 0,
        kvCachePer1kTokensMb: 0,
        maxContextTokens: 128000,
        defaultQuantization: 'Cloud API',
        targetLatencyMs: 2500,
        isResidentByDefault: false,
      },
    ],
  ]);

  /**
   * Evalúa la intención, complejidad, contexto y presupuesto VRAM de la RTX 5070
   * para seleccionar el modelo óptimo sin provocar OOM.
   */
  selectModel(request: ModelSelectionRequest): ModelSelectionDecision {
    const usableVramMb = this.hardwareState.totalVramMb - this.hardwareState.reservedSystemBufferMb;

    // 1. Determinar el modelo objetivo según complejidad semántica y requerimientos
    let targetModelId = 'llama-3.2-3b';
    let reason = 'Diálogo interactivo rápido / latencia reactiva (Tier 0)';

    const isCode =
      request.requiresCodeExpertise ||
      request.taskIntent === 'CODE_EXECUTION' ||
      /\b(código|function|class|typescript|jest|refactor|error|bug|stacktrace|sql|prisma)\b/i.test(
        request.userMessage,
      );

    const isComplexReasoning =
      request.taskIntent === 'RESEARCH' ||
      request.taskIntent === 'EXPLANATION' ||
      request.turnType === 'OPERATIONAL_DIRECTIVE' ||
      request.estimatedTokens > 4000;

    if (isCode) {
      targetModelId = 'qwen2.5-coder-14b';
      reason = 'Programación profunda, depuración y análisis sintáctico (Tier 2)';
    } else if (isComplexReasoning) {
      targetModelId = 'qwen2.5-7b';
      reason = 'Razonamiento estructurado, síntesis y coordinación de herramientas (Tier 1)';
    } else if (request.turnType === 'REFLECTIVE_CHAT' || request.turnType === 'CLARIFICATION') {
      targetModelId = 'llama-3.2-3b';
      reason = 'Charla reflexiva o clarificación conversacional de baja latencia (Tier 0)';
    }

    const candidate = this.catalog.get(targetModelId)!;

    // 2. Calcular presupuesto de memoria para el modelo candidato + KV Cache
    const tokenK = Math.max(1, Math.ceil(request.estimatedTokens / 1000));
    const candidateKvCacheMb = tokenK * candidate.kvCachePer1kTokensMb;
    const requiredVramForCandidate = candidate.vramWeightMb + candidateKvCacheMb;

    // 3. Evaluar colisiones de VRAM y calcular modelos a descargar (Offloading)
    const modelsToOffload: string[] = [];
    let currentOccupiedVram = this.getCurrentlyLoadedVramMb();

    // Si el modelo ya está cargado, solo se suma el delta de KV cache
    const isAlreadyLoaded = this.hardwareState.loadedModelIds.includes(candidate.id);
    let projectedVram = isAlreadyLoaded
      ? currentOccupiedVram + candidateKvCacheMb
      : currentOccupiedVram + requiredVramForCandidate;

    if (projectedVram > usableVramMb) {
      // Necesita offload: priorizar descargar modelos no residentes primero
      for (const loadedId of [...this.hardwareState.loadedModelIds]) {
        if (loadedId === candidate.id) continue;
        const loadedDesc = this.catalog.get(loadedId);
        if (loadedDesc && !loadedDesc.isResidentByDefault) {
          modelsToOffload.push(loadedId);
          projectedVram -= loadedDesc.vramWeightMb;
          if (projectedVram <= usableVramMb) break;
        }
      }

      // Si aún no cabe y es un modelo masivo (14B con contexto extremo), se debe descargar temporalmente incluso el 3B residente
      if (projectedVram > usableVramMb) {
        for (const loadedId of [...this.hardwareState.loadedModelIds]) {
          if (loadedId === candidate.id || modelsToOffload.includes(loadedId)) continue;
          const loadedDesc = this.catalog.get(loadedId);
          if (loadedDesc) {
            modelsToOffload.push(loadedId);
            projectedVram -= loadedDesc.vramWeightMb;
            if (projectedVram <= usableVramMb) break;
          }
        }
      }
    }

    // 4. Si incluso tras todos los offloads excede la VRAM de la GPU (e.g. contexto de 32k en 14B que supera 12GB)
    const fitsInGpu = projectedVram <= usableVramMb;
    if (!fitsInGpu) {
      this.logger.warn(
        `[ModelSelectionEngine] El modelo ${candidate.id} con ${request.estimatedTokens} tokens proyecta ${projectedVram} MB VRAM, superando el límite de ${usableVramMb} MB de la RTX 5070. Activando fallback a Tier 3 Cloud.`,
      );
      const fallback = this.catalog.get('cloud-fallback-heavy')!;
      return {
        selectedModel: fallback,
        tier: fallback.tier,
        reason: `Exceso de presupuesto VRAM (${projectedVram} MB > ${usableVramMb} MB). Redirigido a Cloud Gateway sin riesgo de OOM.`,
        modelsToOffload: [],
        estimatedVramUsageMb: 0,
        estimatedLatencyMs: fallback.targetLatencyMs,
        fitsInGpu: true,
      };
    }

    return {
      selectedModel: candidate,
      tier: candidate.tier,
      reason,
      modelsToOffload,
      estimatedVramUsageMb: projectedVram,
      estimatedLatencyMs: candidate.targetLatencyMs,
      fitsInGpu: true,
    };
  }

  /**
   * Actualiza el estado de los modelos cargados en la GPU
   */
  setLoadedModels(modelIds: string[]): void {
    this.hardwareState.loadedModelIds = [...modelIds];
  }

  getHardwareState(): Readonly<HardwareVramState> {
    return { ...this.hardwareState };
  }

  getModelDescriptor(id: string): ModelDescriptor | undefined {
    return this.catalog.get(id);
  }

  private getCurrentlyLoadedVramMb(): number {
    let total = 0;
    for (const id of this.hardwareState.loadedModelIds) {
      const desc = this.catalog.get(id);
      if (desc) {
        total += desc.vramWeightMb;
      }
    }
    return total;
  }
}

