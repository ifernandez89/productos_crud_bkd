import { GpuTelemetryReport } from './inference-supervisor.service';

export type TelemetrySourceKind =
  | 'gputaskman_json'
  | 'nvidia_smi_fallback'
  | 'static_estimate';

export type GpuPressureLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type LlmEvidenceLevel =
  | 'confirmed_api_mapped_cmdline'
  | 'inferred_process'
  | 'none';

export type ResourceBudgetAction =
  | 'PROCEED_NORMAL'
  | 'REDUCE_CONTEXT_WINDOW'
  | 'DOWNSHIFT_TO_8B_OR_7B'
  | 'DEFER_HEAVY_TASK_COMPETING_3D';

export interface CompetingGpuProcessInfo {
  pid: number;
  name: string;
  kind: 'browser' | 'game' | 'compute' | 'app' | 'compositor' | 'system' | 'other';
  dedicatedVramMiB: number;
  sharedSystemMiB: number;
  pagedOutMiB: number;
  gpuPercent: number;
  activeEngines: string[];
}

export interface LlmRuntimeAllocationBreakdown {
  pid: number;
  processName: string;
  modelName?: string;
  modelPath?: string;
  quantization?: string;
  layers?: number;
  configuredCtx?: number;
  kvCacheTypeK?: string;
  kvCacheTypeV?: string;
  kvBytesPerToken?: number;
  slotsTotal?: number;
  slotsBusy?: number;
  totalProcessVramMiB: number;
  sharedMiB: number;
  pagedOutMiB: number;
  segmentsExact: boolean;
  weightsMiB?: number;
  kvCacheMiB?: number;
  computeRuntimeMiB?: number;
  evidence: LlmEvidenceLevel;
  isOllamaRunner: boolean;
  spillStatus: 'NORMAL' | 'ELEVATED' | 'DESTRUCTIVE_SPILL_RISK';
}

export interface GpuObserverSnapshot {
  schemaVersion: '1.0.0';
  capturedAt: string;
  source: TelemetrySourceKind;
  staleMs: number;
  adapter: {
    name: string;
    driverVersion?: string;
    cudaVersion?: string;
    driverModel: 'WDDM' | 'TCC' | 'UNKNOWN';
    computeCap?: string;
  };
  boardMemory: {
    physicalTotalMiB: number;
    wddmUsableMiB: number;
    usedMiB: number;
    freeMiB: number;
    sharedUsedMiB: number;
    reservedDriverMiB?: number;
    sharedIsSpillHeuristic: boolean;
  };
  thermalAndClocks?: {
    tempC: number;
    powerWatts?: number;
    powerLimitWatts?: number;
    pState?: number;
    gpuUtilPercent: number;
  };
  llmAllocations: LlmRuntimeAllocationBreakdown[];
  competingProcesses: CompetingGpuProcessInfo[];
  pressureLevel: GpuPressureLevel;
  warnings: string[];
  rawNvmlTelemetry?: GpuTelemetryReport;
}

export interface CalibratedVramProfile {
  name: string;
  estimatedVramMb: number;
  contextLimit: number;
  recommendedCtx: number;
  maxSafeCtx: number;
  description: string;
  weightsMiB: number;
  runtimeBuffersMiB: number;
  kvBytesPerToken: number;
  kvQuant: 'q8_0' | 'fp16' | 'none';
  calibrated: boolean;
  calibrationSource: string;
}

export interface ModelVramEstimate {
  model: string;
  ctxTokens: number;
  parallelSlots: number;
  weightsMiB: number;
  runtimeBuffersMiB: number;
  kvCacheMiB: number;
  totalProcessMiB: number;
  kvBytesPerToken: number;
  maxSafeCtxTokens: number;
  fitsWddmCeiling: boolean;
  calibrated: boolean;
}

export interface AllowedModelBudgetEntry {
  model: string;
  recommendedCtxTokens: number;
  maxSafeCtxTokens: number;
  estimatedProcessMiB: number;
  fitStatus: 'OPTIMAL' | 'TIGHT' | 'DENIED_BY_VRAM_BUDGET';
}

export interface ResourceBudgetReport {
  timestamp: string;
  gpuSnapshotSource: TelemetrySourceKind;
  pressureLevel: GpuPressureLevel;
  usableVramMiB: number;
  usedVramMiB: number;
  freeVramMiB: number;
  effectiveHeadroomForSwapMiB: number;
  osHeadroomFloorMiB: number;
  activeLlmModel?: string;
  activeLlmCtx?: number;
  allowedModels: AllowedModelBudgetEntry[];
  competingGpuProcesses: CompetingGpuProcessInfo[];
  recommendedAction: ResourceBudgetAction;
  reasons: string[];
}

export interface MissionResourcePreflight {
  checkedAt: string;
  mode: 'OBSERVE_ONLY';
  source: TelemetrySourceKind;
  requestedModel: string;
  requestedCtxTokens: number;
  estimatedRequiredMiB: number;
  availableHeadroomMiB: number;
  pressureLevel: GpuPressureLevel;
  recommendedAction: ResourceBudgetAction;
  recommendedModel: string;
  recommendedCtxTokens: number;
  canProceedNormally: boolean;
  competingGpuProcesses: CompetingGpuProcessInfo[];
  warnings: string[];
}

