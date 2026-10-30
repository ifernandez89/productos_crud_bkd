export interface DiagnosticInput {
  healthy: boolean;
  modelReady: boolean;
  loading: boolean;
  circuitBreakerOpen: boolean;
  isRegisteredPreset: boolean;
  healthLatencyMs: number;
  maxHealthLatencyMs: number;
  vramFreeMiB?: number;
  minFreeVramMiB?: number;
  probeFn?: () => Promise<{ latencyMs: number }>;
}

export interface DiagnosticOutput {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  failureCode:
    | 'NONE'
    | 'UNREGISTERED_MODEL_ALIAS'
    | 'CIRCUIT_BREAKER_OPEN'
    | 'MODEL_LOADING'
    | 'CONNECTION_REFUSED'
    | 'CONNECT_TIMEOUT'
    | 'VRAM_PRESSURE'
    | 'DEGRADED_LATENCY';
  probeLatencyMs?: number;
}

export async function evaluateInferenceHealth(
  input: DiagnosticInput,
): Promise<DiagnosticOutput> {
  let probeLatencyMs: number | undefined;

  if (!input.isRegisteredPreset) {
    return { overallStatus: 'DEGRADED', failureCode: 'UNREGISTERED_MODEL_ALIAS' };
  }

  if (input.circuitBreakerOpen === true) {
    return { overallStatus: 'UNAVAILABLE', failureCode: 'CIRCUIT_BREAKER_OPEN' };
  }

  if (input.loading === true) {
    return { overallStatus: 'DEGRADED', failureCode: 'MODEL_LOADING' };
  }

  if (!input.healthy) {
    return { overallStatus: 'UNAVAILABLE', failureCode: 'CONNECTION_REFUSED' };
  }

  if (input.probeFn) {
    try {
      const probeRes = await input.probeFn();
      probeLatencyMs = probeRes.latencyMs;
    } catch (err: any) {
      return {
        overallStatus: 'DEGRADED',
        failureCode: 'CONNECT_TIMEOUT',
        probeLatencyMs,
      };
    }
  }

  if (
    input.vramFreeMiB !== undefined &&
    input.minFreeVramMiB !== undefined &&
    input.vramFreeMiB < input.minFreeVramMiB
  ) {
    return { overallStatus: 'DEGRADED', failureCode: 'VRAM_PRESSURE', probeLatencyMs };
  }

  if (input.healthLatencyMs > input.maxHealthLatencyMs) {
    return { overallStatus: 'DEGRADED', failureCode: 'DEGRADED_LATENCY', probeLatencyMs };
  }

  return { overallStatus: 'HEALTHY', failureCode: 'NONE', probeLatencyMs };
}