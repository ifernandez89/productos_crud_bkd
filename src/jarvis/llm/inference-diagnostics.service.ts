import { Injectable, Optional } from '@nestjs/common';
import {
  ContextBudgetEvaluation,
  evaluateContextWindowBudget,
} from './inference-context-budget';
import { evaluateInferenceHealth } from './inference-diagnostics-evaluator';
import { InferenceGatewayService } from './inference-gateway.service';
import { InferenceSupervisorService } from './inference-supervisor.service';
import { LlamaCppProvider } from './llamacpp.provider';

export type InferenceOverallHealth = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

export type InferenceFailureCode =
  | 'NONE'
  | 'CIRCUIT_BREAKER_OPEN'
  | 'MODEL_LOADING'
  | 'CONNECTION_REFUSED'
  | 'CONNECT_TIMEOUT'
  | 'SLOT_BUSY_NP1'
  | 'UNREGISTERED_MODEL_ALIAS'
  | 'VRAM_PRESSURE'
  | 'DEGRADED_LATENCY';

export interface InferenceDiagnosticsOptions {
  requestedModel?: string;
  runInferenceProbe?: boolean;
  maxHealthLatencyMs?: number;
  maxProbeLatencyMs?: number;
  minFreeVramMiB?: number;
}

export interface InferenceDiagnosticReport {
  timestamp: string;
  overallStatus: InferenceOverallHealth;
  failureCode: InferenceFailureCode;
  llamaCpp: {
    healthy: boolean;
    modelReady: boolean;
    loading: boolean;
    healthLatencyMs: number;
    probeExecuted: boolean;
    probeLatencyMs?: number;
    probeTokensPerSecond?: number;
    probeError?: string;
  };
  aliasVerification: {
    requested: string;
    resolvedAlias: string;
    isRegisteredPreset: boolean;
    expectedGgufFile?: string;
  };
  embeddingsIsolation: {
    provider: 'ollama';
    model: 'bge-m3';
    dimensions: 1024;
    isolatedFromCoder: boolean;
  };
  gpuTelemetry?: {
    vramUsedMiB: number;
    vramFreeMiB: number;
    vramTotalMiB: number;
    gpuTempC: number;
    gpuUtilPercent: number;
  };
  gatewayMetrics: {
    activeProvider: string;
    fallbackAvailable: boolean;
    failoverCount: number;
    circuitBreakerOpen: boolean;
  };
  recommendations: string[];
}

@Injectable()
export class InferenceDiagnosticsService {
  constructor(
    private readonly gateway: InferenceGatewayService,
    private readonly llamaCppProvider: LlamaCppProvider,
    @Optional()
    private readonly supervisor?: InferenceSupervisorService,
  ) {}

  async runDiagnostics(
    options: InferenceDiagnosticsOptions = {},
  ): Promise<InferenceDiagnosticReport> {
    const maxHealthLatencyMs = options.maxHealthLatencyMs ?? 1500;
    const maxProbeLatencyMs = options.maxProbeLatencyMs ?? 10000;
    const minFreeVramMiB = options.minFreeVramMiB ?? 512;
    const requestedModel =
      options.requestedModel ||
      this.llamaCppProvider.getDefaultModel() ||
      'qwen2.5-coder:14b';

    const aliasVerification =
      typeof this.llamaCppProvider.verifyModelAlias === 'function'
        ? this.llamaCppProvider.verifyModelAlias(requestedModel)
        : {
            requested: requestedModel,
            resolvedAlias: this.llamaCppProvider.resolveModelAlias(requestedModel),
            isRegisteredPreset: true,
          };

    const healthStart = Date.now();
    const detailedHealth = await this.llamaCppProvider.getDetailedHealth();
    const healthLatencyMs = Math.max(0, Date.now() - healthStart);

    const gatewayHealth = await this.gateway.getHealthStatus();
    const supervisorState =
      this.supervisor?.getState() ?? gatewayHealth.supervisor;
    const gpuTelemetry =
      this.supervisor?.getGpuTelemetry() ?? gatewayHealth.supervisor?.gpu;
    const circuitBreakerOpen = Boolean(
      supervisorState?.circuitBreakerTripped ??
        (supervisorState as any)?.circuitBreakerOpen,
    );

    let probeExecuted = false;
    let probeLatencyMs: number | undefined;
    let probeTokensPerSecond: number | undefined;
    let probeError: string | undefined;

    const evaluated = await evaluateInferenceHealth({
      healthy: detailedHealth.healthy,
      modelReady: detailedHealth.modelReady,
      loading: detailedHealth.loading,
      circuitBreakerOpen,
      isRegisteredPreset: aliasVerification.isRegisteredPreset,
      healthLatencyMs,
      maxHealthLatencyMs,
      vramFreeMiB: gpuTelemetry?.vramFreeMiB,
      minFreeVramMiB,
      probeFn:
        options.runInferenceProbe === true &&
        detailedHealth.healthy &&
        detailedHealth.modelReady &&
        aliasVerification.isRegisteredPreset
          ? async () => {
              probeExecuted = true;
              const probeStart = Date.now();
              try {
                const probeRes = await this.llamaCppProvider.generate({
                  model: aliasVerification.resolvedAlias,
                  maxTokens: 16,
                  temperature: 0,
                  timeouts: {
                    connectMs: 3000,
                    generationMs: maxProbeLatencyMs,
                  },
                  messages: [
                    {
                      role: 'user',
                      content: 'Responde solo OK',
                    },
                  ],
                });
                probeLatencyMs =
                  probeRes.latencyMs ?? Math.max(1, Date.now() - probeStart);
                probeTokensPerSecond = probeRes.tokensPerSecond;
                return { latencyMs: probeLatencyMs };
              } catch (err: any) {
                probeLatencyMs = Math.max(1, Date.now() - probeStart);
                probeError = err?.code || err?.message || String(err);
                throw err;
              }
            }
          : undefined,
    });

    let overallStatus: InferenceOverallHealth = evaluated.overallStatus;
    let failureCode: InferenceFailureCode = evaluated.failureCode;

    if (
      overallStatus === 'HEALTHY' &&
      probeLatencyMs !== undefined &&
      probeLatencyMs > maxProbeLatencyMs
    ) {
      overallStatus = 'DEGRADED';
      failureCode = 'DEGRADED_LATENCY';
    } else if (
      failureCode === 'CONNECT_TIMEOUT' &&
      probeError &&
      (probeError.includes('503') || probeError.toLowerCase().includes('slot'))
    ) {
      failureCode = 'SLOT_BUSY_NP1';
    }

    let embeddingsIsolated = true;
    try {
      await this.llamaCppProvider.embed('probe');
      embeddingsIsolated = false;
    } catch {
      embeddingsIsolated = true;
    }

    const recommendations: string[] = [];
    if (failureCode === 'UNREGISTERED_MODEL_ALIAS') {
      recommendations.push(
        `El modelo '${requestedModel}' no está registrado en los presets GGUF de llama.cpp; utilice un alias verificado como 'qwen2.5-coder:14b'.`,
      );
    } else if (failureCode === 'CIRCUIT_BREAKER_OPEN') {
      recommendations.push(
        'El Circuit Breaker del supervisor está abierto tras múltiples caídas; revise logs de CUDA/VRAM antes de reiniciar llama-server.exe.',
      );
    } else if (failureCode === 'MODEL_LOADING') {
      recommendations.push(
        'llama-server.exe está cargando los pesos GGUF en la VRAM; espere a que modelReady sea true.',
      );
    } else if (failureCode === 'CONNECTION_REFUSED') {
      recommendations.push(
        'llama-server.exe no responde en /health; verifique que el proceso esté activo o utilice el fallback Ollama.',
      );
    } else if (failureCode === 'CONNECT_TIMEOUT') {
      recommendations.push(
        `El micro-probe de inferencia excedió el tiempo límite (${probeError ?? 'timeout'}); verifique si el único slot (-np 1) está ocupado.`,
      );
    } else if (failureCode === 'SLOT_BUSY_NP1') {
      recommendations.push(
        'El slot único (-np 1) de llama-server está ocupado; enrute todas las llamadas a través de la cola FIFO de InferenceGatewayService.',
      );
    } else if (failureCode === 'VRAM_PRESSURE') {
      recommendations.push(
        `VRAM libre baja (${gpuTelemetry?.vramFreeMiB ?? 0} MiB < ${minFreeVramMiB} MiB); descargue modelos secundarios antes de ejecutar misiones largas.`,
      );
    } else if (failureCode === 'DEGRADED_LATENCY') {
      recommendations.push(
        `Latencia elevada detectada (health=${healthLatencyMs}ms, probe=${probeLatencyMs ?? 0}ms); compruebe carga térmica y uso de GPU.`,
      );
    } else {
      recommendations.push(
        'Servidor llama-server.exe operativo, alias GGUF verificado y aislamiento de embeddings bge-m3 intacto.',
      );
    }

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      failureCode,
      llamaCpp: {
        healthy: detailedHealth.healthy,
        modelReady: detailedHealth.modelReady,
        loading: detailedHealth.loading,
        healthLatencyMs,
        probeExecuted,
        probeLatencyMs,
        probeTokensPerSecond,
        probeError,
      },
      aliasVerification,
      embeddingsIsolation: {
        provider: 'ollama',
        model: 'bge-m3',
        dimensions: 1024,
        isolatedFromCoder: embeddingsIsolated,
      },
      gpuTelemetry,
      gatewayMetrics: {
        activeProvider: gatewayHealth.activeProvider,
        fallbackAvailable: gatewayHealth.fallbackAvailable,
        failoverCount: gatewayHealth.failoverCount,
        circuitBreakerOpen,
      },
      recommendations,
    };
  }

  evaluateContextBudget(
    promptTokens: number,
    maxContextTokens = 6144,
    reservedOutputTokens = 1024,
  ): ContextBudgetEvaluation {
    return evaluateContextWindowBudget(
      promptTokens,
      maxContextTokens,
      reservedOutputTokens,
    );
  }
}
