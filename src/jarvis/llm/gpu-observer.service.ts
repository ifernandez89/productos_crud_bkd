import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AllowedModelBudgetEntry,
  CompetingGpuProcessInfo,
  GpuObserverSnapshot,
  GpuPressureLevel,
  LlmEvidenceLevel,
  LlmRuntimeAllocationBreakdown,
  MissionResourcePreflight,
  ResourceBudgetAction,
  ResourceBudgetReport,
} from './gpu-observer.types';
import { InferenceSupervisorService } from './inference-supervisor.service';
import { ModelLifecycleService } from './model-lifecycle.service';

const DEFAULT_RTX5070_PHYSICAL_MIB = 12227;
const DEFAULT_RTX5070_WDDM_USABLE_MIB = 11942;
const DEFAULT_OS_HEADROOM_FLOOR_MIB = 896;
const BYTES_PER_MIB = 1048576;

/**
 * GpuObserverService (DEV-001-B2.6 — Solo Observación y Presupuesto de Recursos)
 *
 * Normaliza telemetría GPU desde NVML (nvidia-smi vía InferenceSupervisorService) o desde
 * capturas JSON externas de GPUTaskman (--json), calcula presión real de VRAM WDDM,
 * detecta procesos competidores 3D/CUDA y emite recomendaciones consultivas de preflight.
 *
 * REGLA ESTRICTA: Nunca ejecuta procesos, no altera políticas del Broker ni habilita ejecución.
 */
@Injectable()
export class GpuObserverService {
  private readonly logger = new Logger(GpuObserverService.name);
  private lastExternalSnapshot?: GpuObserverSnapshot;
  private lastExternalCapturedMs = 0;

  constructor(
    @Optional()
    private readonly supervisor?: InferenceSupervisorService,
    @Optional()
    private readonly modelLifecycle?: ModelLifecycleService,
  ) {}

  /**
   * Registra una captura estructurada proveniente de `gputaskman.exe --json`
   * (sin invocar binarios externos desde NestJS).
   */
  ingestGputaskmanSnapshot(rawJsonOrObj: string | Record<string, any>): GpuObserverSnapshot {
    const snapshot = this.parseGputaskmanSnapshot(rawJsonOrObj);
    this.lastExternalSnapshot = snapshot;
    this.lastExternalCapturedMs = Date.now();
    return snapshot;
  }

  clearExternalSnapshot(): void {
    this.lastExternalSnapshot = undefined;
    this.lastExternalCapturedMs = 0;
  }

  /**
   * Parsea de forma pura y tolerante (removiendo BOM UTF-8 de PowerShell) un JSON de GPUTaskman v0.3.x.
   */
  parseGputaskmanSnapshot(rawJsonOrObj: string | Record<string, any>): GpuObserverSnapshot {
    const data: Record<string, any> =
      typeof rawJsonOrObj === 'string'
        ? JSON.parse(rawJsonOrObj.replace(/^\uFEFF/, '').trim())
        : rawJsonOrObj;

    if (!data || typeof data !== 'object') {
      throw new Error('Snapshot JSON de GPUTaskman inválido.');
    }

    const toMiB = (bytes: unknown): number =>
      typeof bytes === 'number' && Number.isFinite(bytes)
        ? Math.max(0, Math.round(bytes / BYTES_PER_MIB))
        : 0;

    const physicalTotalMiB =
      toMiB(data.vram_total) ||
      toMiB(data.device?.mem_total) ||
      DEFAULT_RTX5070_PHYSICAL_MIB;
    const wddmUsableMiB =
      toMiB(data.adapter?.dedicated_vram) || DEFAULT_RTX5070_WDDM_USABLE_MIB;
    const usedMiB =
      toMiB(data.vram_used) || toMiB(data.device?.mem_used);
    const freeMiB = Math.max(0, wddmUsableMiB - usedMiB);
    const sharedUsedMiB = toMiB(data.shared_used);
    const reservedDriverMiB = toMiB(data.device?.mem_reserved) || undefined;

    const rawProcesses: any[] = Array.isArray(data.processes) ? data.processes : [];
    const llmAllocations: LlmRuntimeAllocationBreakdown[] = [];
    const competingProcesses: CompetingGpuProcessInfo[] = [];

    for (const proc of rawProcesses) {
      const dedicatedMiB = toMiB(proc.vram_bytes);
      const sharedMiB = toMiB(proc.shared_bytes);
      const pagedMiB = toMiB(proc.paged_out_bytes);
      const isLlmOrEmbedding = Boolean(
        proc.llm ||
          proc.kind === 'LLM' ||
          proc.kind === 'embedding' ||
          /llama-server|ollama/i.test(String(proc.name || '')),
      );

      if (isLlmOrEmbedding) {
        llmAllocations.push(
          this.mapLlmProcessBreakdown(proc, dedicatedMiB, sharedMiB, pagedMiB, freeMiB),
        );
        continue;
      }

      const activeEngines = proc.engines && typeof proc.engines === 'object'
        ? Object.keys(proc.engines).filter((k) => Number(proc.engines[k]) > 0)
        : [];
      const procKind = this.normalizeProcessKind(proc.kind);
      const isSignificantCompetitor =
        procKind === 'game' ||
        dedicatedMiB >= 64 ||
        (activeEngines.includes('compute') && dedicatedMiB >= 16);

      if (isSignificantCompetitor && procKind !== 'compositor' && procKind !== 'system') {
        competingProcesses.push({
          pid: Number(proc.pid) || 0,
          name: String(proc.name || 'unknown'),
          kind: procKind,
          dedicatedVramMiB: dedicatedMiB,
          sharedSystemMiB: sharedMiB,
          pagedOutMiB: pagedMiB,
          gpuPercent: Number(proc.gpu_pct) || 0,
          activeEngines,
        });
      }
    }

    const warnings: string[] = [];
    const hasSpillRisk = llmAllocations.some(
      (l) => l.spillStatus === 'DESTRUCTIVE_SPILL_RISK',
    );
    if (hasSpillRisk) {
      warnings.push(
        'WDDM DESTRUCTIVE_SPILL_RISK: Proceso llama-server con buffers compartidos elevados y margen dedicado crítico.',
      );
    }

    const driverModelRaw = String(data.backend || data.device?.driver_model || 'WDDM').toUpperCase();
    const driverModel: 'WDDM' | 'TCC' | 'UNKNOWN' =
      driverModelRaw === 'WDDM' ? 'WDDM' : driverModelRaw === 'TCC' ? 'TCC' : 'UNKNOWN';

    const capturedAt =
      typeof data.taken === 'number'
        ? new Date(data.taken * 1000).toISOString()
        : new Date().toISOString();

    return {
      schemaVersion: '1.0.0',
      capturedAt,
      source: 'gputaskman_json',
      staleMs: 0,
      adapter: {
        name: String(data.gpu || data.adapter?.name || 'NVIDIA GeForce RTX 5070'),
        driverVersion: data.driver ? String(data.driver) : undefined,
        cudaVersion: data.cuda ? String(data.cuda) : undefined,
        driverModel,
        computeCap: data.device?.compute_cap ? String(data.device.compute_cap) : undefined,
      },
      boardMemory: {
        physicalTotalMiB,
        wddmUsableMiB,
        usedMiB,
        freeMiB,
        sharedUsedMiB,
        reservedDriverMiB,
        sharedIsSpillHeuristic: Boolean(data.shared_is_spill),
      },
      thermalAndClocks: data.device
        ? {
            tempC: Number(data.device.temp) || 0,
            powerWatts: typeof data.device.power_w === 'number' ? data.device.power_w : undefined,
            powerLimitWatts:
              typeof data.device.power_limit_w === 'number'
                ? data.device.power_limit_w
                : undefined,
            pState: typeof data.device.pstate === 'number' ? data.device.pstate : undefined,
            gpuUtilPercent: Number(data.device.util_gpu) || 0,
          }
        : undefined,
      llmAllocations,
      competingProcesses,
      pressureLevel: this.computePressureLevel(freeMiB, competingProcesses, hasSpillRisk),
      warnings,
    };
  }

  /**
   * Obtiene el snapshot normalizado actual (usa captura GPUTaskman fresca si existe,
   * o cae limpiamente a NVML vía InferenceSupervisorService o a perfil estático).
   */
  getSnapshot(maxStaleMs = 15000): GpuObserverSnapshot {
    if (this.lastExternalSnapshot) {
      const ageMs = Math.max(0, Date.now() - this.lastExternalCapturedMs);
      if (ageMs <= maxStaleMs) {
        return {
          ...this.lastExternalSnapshot,
          staleMs: ageMs,
        };
      }
    }

    const nvml = this.supervisor?.getGpuTelemetry();
    if (nvml) {
      const physicalTotalMiB = nvml.vramTotalMiB || DEFAULT_RTX5070_PHYSICAL_MIB;
      const wddmUsableMiB = Math.min(physicalTotalMiB, DEFAULT_RTX5070_WDDM_USABLE_MIB);
      const usedMiB = Math.max(0, nvml.vramUsedMiB);
      const freeMiB = Math.max(0, wddmUsableMiB - usedMiB);
      const activeModel = this.modelLifecycle?.getCurrentModel();
      const warnings: string[] = [];

      if (freeMiB < 600) {
        warnings.push(
          `Margen VRAM WDDM crítico (${freeMiB} MiB libres vía nvidia-smi). Evitar contextos grandes o modelos 14B.`,
        );
      }

      return {
        schemaVersion: '1.0.0',
        capturedAt: new Date().toISOString(),
        source: 'nvidia_smi_fallback',
        staleMs: 0,
        adapter: {
          name: 'NVIDIA GeForce RTX 5070',
          driverModel: 'WDDM',
        },
        boardMemory: {
          physicalTotalMiB,
          wddmUsableMiB,
          usedMiB,
          freeMiB,
          sharedUsedMiB: 0,
          sharedIsSpillHeuristic: false,
        },
        thermalAndClocks: {
          tempC: nvml.gpuTempC,
          gpuUtilPercent: nvml.gpuUtilPercent,
        },
        llmAllocations: activeModel
          ? [this.buildStaticLlmFallback(activeModel)]
          : [],
        competingProcesses: [],
        pressureLevel: this.computePressureLevel(freeMiB, [], false),
        warnings,
        rawNvmlTelemetry: nvml,
      };
    }

    const activeModel = this.modelLifecycle?.getCurrentModel() || 'qwen3:4b';
    const est = this.modelLifecycle?.estimateVramForModel(activeModel);
    const estUsed = (est?.totalProcessMiB ?? 2800) + 668;
    const freeMiB = Math.max(0, DEFAULT_RTX5070_WDDM_USABLE_MIB - estUsed);

    return {
      schemaVersion: '1.0.0',
      capturedAt: new Date().toISOString(),
      source: 'static_estimate',
      staleMs: 0,
      adapter: {
        name: 'NVIDIA GeForce RTX 5070 (Estimated Profile)',
        driverModel: 'WDDM',
      },
      boardMemory: {
        physicalTotalMiB: DEFAULT_RTX5070_PHYSICAL_MIB,
        wddmUsableMiB: DEFAULT_RTX5070_WDDM_USABLE_MIB,
        usedMiB: estUsed,
        freeMiB,
        sharedUsedMiB: 0,
        sharedIsSpillHeuristic: false,
      },
      llmAllocations: [this.buildStaticLlmFallback(activeModel)],
      competingProcesses: [],
      pressureLevel: this.computePressureLevel(freeMiB, [], false),
      warnings: ['Telemetría GPU real no disponible; usando perfiles estáticos calibrados.'],
    };
  }

  /**
   * Calcula el presupuesto de VRAM disponible y qué modelos/contextos caben con seguridad.
   */
  evaluateResourceBudget(requestedCtxTokens?: number): ResourceBudgetReport {
    const snap = this.getSnapshot();
    const competingHeavy = snap.competingProcesses.filter(
      (p) => p.kind === 'game' || p.dedicatedVramMiB >= 250,
    );
    const competingVramMiB = snap.competingProcesses.reduce(
      (acc, p) => acc + p.dedicatedVramMiB,
      0,
    );
    const activeLlm = snap.llmAllocations.find(
      (l) => l.evidence !== 'none' && !l.modelName?.includes('bge-m3'),
    ) || snap.llmAllocations[0];

    // Al conmutar de modelo LLM, se libera su VRAM actual, pero permanecen el piso SO + procesos competidores.
    const theoreticalHeadroomOnSwap = Math.max(
      0,
      snap.boardMemory.wddmUsableMiB - DEFAULT_OS_HEADROOM_FLOOR_MIB - competingVramMiB,
    );
    const liveHeadroomWithLoadedLlm =
      snap.source !== 'static_estimate'
        ? snap.boardMemory.freeMiB + (activeLlm?.totalProcessVramMiB || 0)
        : theoreticalHeadroomOnSwap;

    const effectiveHeadroomForSwapMiB = Math.max(
      0,
      Math.min(theoreticalHeadroomOnSwap, liveHeadroomWithLoadedLlm),
    );

    const profiles = this.modelLifecycle?.getCalibratedProfiles() || [];
    const allowedModels: AllowedModelBudgetEntry[] = profiles
      .filter((p) => !p.name.includes('bge-m3'))
      .map((profile) => {
        const targetCtx = requestedCtxTokens ?? profile.recommendedCtx;
        const est = this.modelLifecycle!.estimateVramForModel(profile.name, targetCtx);
        let fitStatus: AllowedModelBudgetEntry['fitStatus'] = 'DENIED_BY_VRAM_BUDGET';
        if (est.totalProcessMiB <= effectiveHeadroomForSwapMiB - 1200) {
          fitStatus = 'OPTIMAL';
        } else if (est.totalProcessMiB <= effectiveHeadroomForSwapMiB - 350) {
          fitStatus = 'TIGHT';
        }
        return {
          model: profile.name,
          recommendedCtxTokens: targetCtx,
          maxSafeCtxTokens: profile.maxSafeCtx,
          estimatedProcessMiB: est.totalProcessMiB,
          fitStatus,
        };
      });

    const reasons: string[] = [...snap.warnings];
    let recommendedAction: ResourceBudgetAction = 'PROCEED_NORMAL';

    const hasGameOrHeavy3d = competingHeavy.some(
      (p) => p.kind === 'game' || p.dedicatedVramMiB >= 1500,
    );
    if (hasGameOrHeavy3d) {
      recommendedAction = 'DEFER_HEAVY_TASK_COMPETING_3D';
      reasons.push(
        `Contención GPU externa detectada (${competingHeavy.map((c) => `${c.name}:${c.dedicatedVramMiB}MiB`).join(', ')}). Posponer cargas LLM pesadas.`,
      );
    } else if (snap.pressureLevel === 'CRITICAL') {
      recommendedAction = 'DOWNSHIFT_TO_8B_OR_7B';
      reasons.push(
        `Presión CRITICAL en RTX 5070 (${snap.boardMemory.freeMiB} MiB libres). Reducir contexto o descender a 8B/7B.`,
      );
    } else if (snap.pressureLevel === 'HIGH') {
      recommendedAction = 'REDUCE_CONTEXT_WINDOW';
      reasons.push(
        `Presión HIGH en RTX 5070 (${snap.boardMemory.freeMiB} MiB libres). Ajustar ventana de contexto para evitar desborde WDDM.`,
      );
    }

    return {
      timestamp: new Date().toISOString(),
      gpuSnapshotSource: snap.source,
      pressureLevel: snap.pressureLevel,
      usableVramMiB: snap.boardMemory.wddmUsableMiB,
      usedVramMiB: snap.boardMemory.usedMiB,
      freeVramMiB: snap.boardMemory.freeMiB,
      effectiveHeadroomForSwapMiB,
      osHeadroomFloorMiB: DEFAULT_OS_HEADROOM_FLOOR_MIB,
      activeLlmModel: activeLlm?.modelName || this.modelLifecycle?.getCurrentModel(),
      activeLlmCtx: activeLlm?.configuredCtx,
      allowedModels,
      competingGpuProcesses: snap.competingProcesses,
      recommendedAction,
      reasons,
    };
  }

  /**
   * Evaluación pre-vuelo para EngineeringMissionManagerService antes de lanzar una misión.
   * Opera en modo consultivo ('OBSERVE_ONLY') sin alterar permisos de seguridad ni el Broker.
   */
  evaluateMissionPreflight(options?: {
    requestedModel?: string;
    requestedCtxTokens?: number;
  }): MissionResourcePreflight {
    const requestedModel =
      options?.requestedModel ||
      this.modelLifecycle?.getCurrentModel() ||
      'qwen2.5-coder:14b';
    const profile = this.modelLifecycle?.getCalibratedProfile(requestedModel);
    const requestedCtxTokens =
      options?.requestedCtxTokens ?? profile?.recommendedCtx ?? 6144;

    const estimate = this.modelLifecycle?.estimateVramForModel(
      requestedModel,
      requestedCtxTokens,
    );
    const estimatedRequiredMiB = estimate?.totalProcessMiB ?? 9065;
    const budget = this.evaluateResourceBudget(requestedCtxTokens);

    const warnings = [...budget.reasons];
    let recommendedModel = requestedModel;
    let recommendedCtxTokens = requestedCtxTokens;
    let recommendedAction: ResourceBudgetAction = budget.recommendedAction;

    if (
      recommendedAction === 'PROCEED_NORMAL' &&
      estimatedRequiredMiB > budget.effectiveHeadroomForSwapMiB - 350
    ) {
      if (requestedModel.includes('14b') && requestedCtxTokens > 6144) {
        recommendedAction = 'REDUCE_CONTEXT_WINDOW';
        recommendedCtxTokens = 6144;
        warnings.push(
          `El contexto pedido (${requestedCtxTokens}) para ${requestedModel} supera el margen seguro (${budget.effectiveHeadroomForSwapMiB} MiB). Se recomienda 6144 tokens.`,
        );
      } else {
        recommendedAction = 'DOWNSHIFT_TO_8B_OR_7B';
        recommendedModel = 'qwen2.5-coder:7b';
        recommendedCtxTokens = 8192;
        warnings.push(
          `El modelo ${requestedModel} (${estimatedRequiredMiB} MiB) excede el margen disponible (${budget.effectiveHeadroomForSwapMiB} MiB). Se recomienda downshift a qwen2.5-coder:7b.`,
        );
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      mode: 'OBSERVE_ONLY',
      source: budget.gpuSnapshotSource,
      requestedModel,
      requestedCtxTokens,
      estimatedRequiredMiB,
      availableHeadroomMiB: budget.effectiveHeadroomForSwapMiB,
      pressureLevel: budget.pressureLevel,
      recommendedAction,
      recommendedModel,
      recommendedCtxTokens,
      canProceedNormally: recommendedAction === 'PROCEED_NORMAL',
      competingGpuProcesses: budget.competingGpuProcesses,
      warnings,
    };
  }

  private mapLlmProcessBreakdown(
    proc: any,
    dedicatedMiB: number,
    sharedMiB: number,
    pagedMiB: number,
    boardFreeMiB: number,
  ): LlmRuntimeAllocationBreakdown {
    const llm = proc.llm || {};
    const segments: any[] = Array.isArray(llm.segments) ? llm.segments : [];
    const findSegMiB = (kind: string): number | undefined => {
      const seg = segments.find((s) => s.kind === kind);
      return seg && typeof seg.bytes === 'number'
        ? Math.round(seg.bytes / BYTES_PER_MIB)
        : undefined;
    };

    const modelObj = Array.isArray(llm.models) ? llm.models[0] : undefined;
    const sources: string[] = Array.isArray(modelObj?.sources) ? modelObj.sources : [];
    let evidence: LlmEvidenceLevel = 'none';
    if (sources.includes('api') && (sources.includes('mapped') || sources.includes('cmdline'))) {
      evidence = 'confirmed_api_mapped_cmdline';
    } else if (sources.length > 0 || llm.server_source) {
      evidence = 'inferred_process';
    }

    const cmdOrUrl = String(llm.server?.url || '') + ' ' + String(llm.server?.model_path || '');
    const isOllamaRunner =
      cmdOrUrl.includes('11434') ||
      cmdOrUrl.toLowerCase().includes('.ollama') ||
      proc.kind === 'embedding' ||
      /ollama/i.test(String(proc.name || ''));

    // Regla empírica calibrada por Experimentos A & B:
    // - llama-server standalone usa 102–130 MiB shared normal; >220 MiB con <500 MiB libres indica spill real (-25% t/s).
    // - Ollama runner asigna 330–650 MiB en shared desde arranque incluso con >10 GiB libres; sólo es riesgo si freeMiB < 500 MiB.
    let spillStatus: LlmRuntimeAllocationBreakdown['spillStatus'] = 'NORMAL';
    if (!isOllamaRunner && sharedMiB > 220 && boardFreeMiB < 500) {
      spillStatus = 'DESTRUCTIVE_SPILL_RISK';
    } else if (isOllamaRunner && boardFreeMiB < 500) {
      spillStatus = 'DESTRUCTIVE_SPILL_RISK';
    } else if (!isOllamaRunner && sharedMiB > 180) {
      spillStatus = 'ELEVATED';
    }

    return {
      pid: Number(proc.pid) || 0,
      processName: String(proc.name || 'llama-server.exe'),
      modelName: modelObj?.name || modelObj?.label || llm.server?.model_path,
      modelPath: llm.server?.model_path || modelObj?.path,
      quantization: modelObj?.quant,
      layers: typeof modelObj?.layers === 'number' ? modelObj.layers : undefined,
      configuredCtx: typeof llm.n_ctx === 'number' ? llm.n_ctx : llm.flags?.ctx,
      kvCacheTypeK: llm.flags?.ctk,
      kvCacheTypeV: llm.flags?.ctv,
      kvBytesPerToken: typeof llm.kv_bytes_per_token === 'number' ? llm.kv_bytes_per_token : undefined,
      slotsTotal: llm.server?.slots_total,
      slotsBusy: llm.server?.slots_busy,
      totalProcessVramMiB: dedicatedMiB,
      sharedMiB,
      pagedOutMiB: pagedMiB,
      segmentsExact: segments.some((s) => s.exact === true),
      weightsMiB: findSegMiB('weights'),
      kvCacheMiB: findSegMiB('kv'),
      computeRuntimeMiB: findSegMiB('runtime'),
      evidence,
      isOllamaRunner,
      spillStatus,
    };
  }

  private buildStaticLlmFallback(modelName: string): LlmRuntimeAllocationBreakdown {
    const est = this.modelLifecycle?.estimateVramForModel(modelName);
    return {
      pid: 0,
      processName: 'llama-server.exe (estimated)',
      modelName: est?.model || modelName,
      configuredCtx: est?.ctxTokens,
      kvBytesPerToken: est?.kvBytesPerToken,
      totalProcessVramMiB: est?.totalProcessMiB ?? 3500,
      sharedMiB: 0,
      pagedOutMiB: 0,
      segmentsExact: false,
      weightsMiB: est?.weightsMiB,
      kvCacheMiB: est?.kvCacheMiB,
      computeRuntimeMiB: est?.runtimeBuffersMiB,
      evidence: 'inferred_process',
      isOllamaRunner: false,
      spillStatus: 'NORMAL',
    };
  }

  private computePressureLevel(
    freeMiB: number,
    competing: CompetingGpuProcessInfo[],
    hasSpillRisk: boolean,
  ): GpuPressureLevel {
    if (hasSpillRisk || freeMiB < 600) return 'CRITICAL';
    const hasHeavyCompetitor = competing.some(
      (p) => p.kind === 'game' || p.dedicatedVramMiB >= 1500,
    );
    if (hasHeavyCompetitor || freeMiB < 1500) return 'HIGH';
    if (freeMiB < 3500) return 'MODERATE';
    return 'LOW';
  }

  private normalizeProcessKind(
    rawKind: unknown,
  ): CompetingGpuProcessInfo['kind'] {
    const k = String(rawKind || 'other').toLowerCase();
    if (k === 'browser' || k === 'game' || k === 'compute' || k === 'app' || k === 'compositor' || k === 'system') {
      return k;
    }
    return 'other';
  }
}

