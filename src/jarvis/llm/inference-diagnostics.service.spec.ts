import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OllamaQwenModelService } from '../../aichat/models/ollamaModel_2';
import { JarvisController } from '../jarvis.controller';
import { ExecutionEngine } from '../planner/execution-engine.service';
import { ActionExecutionGateService } from '../security/action-execution-gate.service';
import { AuditService } from '../security/audit.service';
import { CheckpointManagerService } from '../verification/checkpoint-manager.service';
import { IsolatedTestRunnerService } from '../verification/isolated-test-runner.service';
import { RepairControllerService } from '../verification/repair-controller.service';
import { StaticPreValidatorService } from '../verification/static-pre-validator.service';
import { VerificationHarnessService } from '../verification/verification-harness.service';
import { InferenceDiagnosticsService } from './inference-diagnostics.service';
import { InferenceGatewayService } from './inference-gateway.service';
import { InferenceSupervisorService } from './inference-supervisor.service';
import { LlamaCppProvider } from './llamacpp.provider';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
} from './llm-provider.interface';

jest.setTimeout(300000);

describe('InferenceDiagnosticsService + Misión Interactiva Real + Prueba de Estrés (20 Misiones)', () => {
  // ── 1. Pruebas Unitarias de Contratos, Etapa 1 (Opt-In) y Clasificación de Diagnósticos ──
  describe('1. Unidad e Integración: Etapa 1 (Opt-In), Verificación de Alias GGUF y Clasificación de Fallos', () => {
    const originalUseLlamaCpp = process.env.USE_LLAMACPP_CODER;

    afterEach(() => {
      if (originalUseLlamaCpp === undefined) {
        delete process.env.USE_LLAMACPP_CODER;
      } else {
        process.env.USE_LLAMACPP_CODER = originalUseLlamaCpp;
      }
    });

    it('Etapa 1: OllamaQwenModelService mantiene llama.cpp desactivado por defecto cuando USE_LLAMACPP_CODER no está definido', () => {
      delete process.env.USE_LLAMACPP_CODER;
      const service = new OllamaQwenModelService();
      expect((service as any).isLlamaCppEnabled()).toBe(false);

      process.env.USE_LLAMACPP_CODER = 'false';
      expect((service as any).isLlamaCppEnabled()).toBe(false);

      process.env.USE_LLAMACPP_CODER = 'true';
      expect((service as any).isLlamaCppEnabled()).toBe(true);
    });

    it('LlamaCppProvider.verifyModelAlias valida presets GGUF registrados y rechaza tags arbitrarios de Ollama', () => {
      const provider = new LlamaCppProvider();

      const valid14b = provider.verifyModelAlias('qwen2.5-coder:14b');
      expect(valid14b.isRegisteredPreset).toBe(true);
      expect(valid14b.resolvedAlias).toBe('qwen2.5-coder:14b');
      expect(valid14b.expectedGgufFile).toBe('qwen2.5-coder-14b-q4_k_m.gguf');

      const unknownOllamaTag = provider.verifyModelAlias('codellama:13b-instruct');
      expect(unknownOllamaTag.isRegisteredPreset).toBe(false);
      expect(unknownOllamaTag.expectedGgufFile).toBeUndefined();
    });

    it('InferenceDiagnosticsService clasifica CIRCUIT_BREAKER_OPEN, MODEL_LOADING, CONNECTION_REFUSED, VRAM_PRESSURE, DEGRADED_LATENCY y UNREGISTERED_MODEL_ALIAS', async () => {
      const mockLlama: any = {
        getDefaultModel: () => 'qwen2.5-coder:14b',
        resolveModelAlias: (m: string) => m,
        verifyModelAlias: (m = 'qwen2.5-coder:14b') => ({
          requested: m,
          resolvedAlias: m,
          isRegisteredPreset: m === 'qwen2.5-coder:14b',
          expectedGgufFile:
            m === 'qwen2.5-coder:14b' ? 'qwen2.5-coder-14b-q4_k_m.gguf' : undefined,
        }),
        getDetailedHealth: jest.fn().mockResolvedValue({
          healthy: true,
          modelReady: true,
          loading: false,
        }),
        generate: jest.fn().mockResolvedValue({
          content: 'OK',
          model: 'qwen2.5-coder:14b',
          provider: 'llamacpp',
          latencyMs: 45,
          tokensPerSecond: 51.2,
        }),
        embed: jest.fn().mockRejectedValue(new Error('bge-m3 isolated')),
      };

      const mockSupervisor: any = {
        getState: jest.fn().mockReturnValue({
          circuitBreakerTripped: false,
        }),
        getGpuTelemetry: jest.fn().mockReturnValue({
          vramUsedMiB: 10250,
          vramFreeMiB: 1700,
          vramTotalMiB: 12227,
          gpuTempC: 59,
          gpuUtilPercent: 40,
        }),
      };

      const mockGateway: any = {
        getHealthStatus: jest.fn().mockResolvedValue({
          activeProvider: 'llamacpp',
          fallbackAvailable: true,
          failoverCount: 0,
        }),
      };

      const diagService = new InferenceDiagnosticsService(
        mockGateway,
        mockLlama,
        mockSupervisor,
      );

      // 1. Estado HEALTHY con micro-probe y aislamiento bge-m3
      const healthyReport = await diagService.runDiagnostics({
        runInferenceProbe: true,
      });
      expect(healthyReport.overallStatus).toBe('HEALTHY');
      expect(healthyReport.failureCode).toBe('NONE');
      expect(healthyReport.llamaCpp.probeExecuted).toBe(true);
      expect(healthyReport.embeddingsIsolation.isolatedFromCoder).toBe(true);
      expect(healthyReport.embeddingsIsolation.model).toBe('bge-m3');

      // 2. Alias no registrado en GGUF
      const badAliasReport = await diagService.runDiagnostics({
        requestedModel: 'mistral-nemo:12b',
      });
      expect(badAliasReport.overallStatus).toBe('DEGRADED');
      expect(badAliasReport.failureCode).toBe('UNREGISTERED_MODEL_ALIAS');

      // 3. Circuit Breaker abierto
      mockSupervisor.getState.mockReturnValueOnce({
        circuitBreakerTripped: true,
      });
      const cbReport = await diagService.runDiagnostics();
      expect(cbReport.overallStatus).toBe('UNAVAILABLE');
      expect(cbReport.failureCode).toBe('CIRCUIT_BREAKER_OPEN');

      // 4. Modelo cargando en VRAM
      mockLlama.getDetailedHealth.mockResolvedValueOnce({
        healthy: true,
        modelReady: false,
        loading: true,
      });
      const loadingReport = await diagService.runDiagnostics();
      expect(loadingReport.overallStatus).toBe('DEGRADED');
      expect(loadingReport.failureCode).toBe('MODEL_LOADING');

      // 5. Conexión rechazada (/health caído)
      mockLlama.getDetailedHealth.mockResolvedValueOnce({
        healthy: false,
        modelReady: false,
        loading: false,
      });
      const downReport = await diagService.runDiagnostics();
      expect(downReport.overallStatus).toBe('UNAVAILABLE');
      expect(downReport.failureCode).toBe('CONNECTION_REFUSED');

      // 6. Presión de VRAM (< 512 MiB libres)
      mockSupervisor.getGpuTelemetry.mockReturnValueOnce({
        vramUsedMiB: 11900,
        vramFreeMiB: 300,
        vramTotalMiB: 12227,
        gpuTempC: 65,
        gpuUtilPercent: 90,
      });
      const vramReport = await diagService.runDiagnostics({
        minFreeVramMiB: 512,
      });
      expect(vramReport.overallStatus).toBe('DEGRADED');
      expect(vramReport.failureCode).toBe('VRAM_PRESSURE');

      // 7. Latencia degradada en micro-probe
      mockLlama.generate.mockResolvedValueOnce({
        content: 'OK',
        model: 'qwen2.5-coder:14b',
        provider: 'llamacpp',
        latencyMs: 500,
      });
      const latencyReport = await diagService.runDiagnostics({
        runInferenceProbe: true,
        maxProbeLatencyMs: 100,
      });
      expect(latencyReport.overallStatus).toBe('DEGRADED');
      expect(latencyReport.failureCode).toBe('DEGRADED_LATENCY');
    });
  });

  // ── 2. Misión Interactiva Real desde el Endpoint de JarBees + Prueba de Estrés (20 Misiones) ──
  describe('2. Misión Interactiva Real desde Endpoint JarBees y Prueba de Estrés de Recuperación (20 Misiones en RTX 5070)', () => {
    const MISSION_PORT = '8096';
    const MISSION_BASE_URL = `http://127.0.0.1:${MISSION_PORT}`;
    const MODEL_GGUF = 'C:\\AI\\models\\qwen2.5-coder-14b-q4_k_m.gguf';
    const BINARY_PATH = 'C:\\AI\\llama.cpp\\b11935\\llama-server.exe';

    let supervisor: InferenceSupervisorService;
    let llamaCppProvider: LlamaCppProvider;
    let fallbackProvider: ILLMProvider & { calls: number };
    let gateway: InferenceGatewayService;
    let diagnosticsService: InferenceDiagnosticsService;
    let staticValidator: StaticPreValidatorService;
    let testRunner: IsolatedTestRunnerService;
    let checkpointManager: CheckpointManagerService;
    let repairController: RepairControllerService;
    let harness: VerificationHarnessService;
    let executionEngine: ExecutionEngine;
    let controller: JarvisController;

    const createdMissionIds: string[] = [];
    const createdTempDirs: string[] = [];
    const experimentSummary: Record<string, any> = {};

    const createTempDir = (prefix: string): string => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `jarbees-real-${prefix}-`));
      createdTempDirs.push(dir);
      return dir;
    };

    const registerMission = (id: string): string => {
      createdMissionIds.push(id);
      return id;
    };

    beforeAll(async () => {
      // Etapa 1: USE_LLAMACPP_CODER permanece desactivado por defecto en el entorno global
      delete process.env.USE_LLAMACPP_CODER;

      process.env.LLAMACPP_BINARY_PATH = BINARY_PATH;
      process.env.LLAMACPP_MODEL_PATH = MODEL_GGUF;
      process.env.LLAMACPP_HOST = '127.0.0.1';
      process.env.LLAMACPP_PORT = MISSION_PORT;
      process.env.LLAMACPP_BASE_URL = MISSION_BASE_URL;
      process.env.LLAMACPP_CTX_SIZE = '6144';
      process.env.LLAMACPP_NGL = '99';
      process.env.LLAMACPP_PARALLEL = '1';
      process.env.LLAMACPP_ROUTER_MODE = 'false';
      process.env.LLAMACPP_DEFAULT_MODEL = 'qwen2.5-coder:14b';
      process.env.LLAMACPP_CODER_MODEL = 'qwen2.5-coder:14b';
      process.env.LLAMACPP_TIMEOUT_MS = '60000';
      process.env.LLAMACPP_CONNECT_TIMEOUT_MS = '5000';

      supervisor = new InferenceSupervisorService();
      await supervisor.startServer();

      llamaCppProvider = new LlamaCppProvider();
      const readyDeadline = Date.now() + 45000;
      while (Date.now() < readyDeadline) {
        const detailed = await llamaCppProvider.getDetailedHealth();
        if (detailed.modelReady) break;
        await new Promise((r) => setTimeout(r, 400));
      }

      fallbackProvider = {
        calls: 0,
        getProviderName: () => 'ollama',
        getDefaultModel: () => 'qwen2.5-coder:7b',
        isAvailable: async () => true,
        embed: async () => ({
          embedding: new Array(1024).fill(0.01),
          model: 'bge-m3',
          provider: 'ollama',
        }),
        generate: async (
          opts: LLMGenerateOptions,
        ): Promise<LLMGenerateResponse> => {
          fallbackProvider.calls++;
          const rawContent =
            opts.messages[opts.messages.length - 1]?.content || '';
          const userContent =
            typeof rawContent === 'string'
              ? rawContent
              : JSON.stringify(rawContent);
          const matchFn = /export\s+function\s+([a-zA-Z0-9_]+)/.exec(userContent);
          const fnName = matchFn?.[1] || 'fallbackTask';
          const code = `\`\`\`typescript\nexport function ${fnName}(x: number): number {\n  return x * 2;\n}\n\`\`\``;
          opts.onToken?.(code);
          return {
            content: code,
            model: 'qwen2.5-coder:7b',
            provider: 'ollama',
            latencyMs: 20,
          };
        },
      };

      const dummyOpenRouter: ILLMProvider = {
        getProviderName: () => 'openrouter',
        getDefaultModel: () => 'mistral',
        isAvailable: async () => false,
        embed: async () => {
          throw new Error('No embeddings on OpenRouter');
        },
        generate: async () => {
          throw new Error('OpenRouter disabled');
        },
      };

      gateway = new InferenceGatewayService(
        llamaCppProvider,
        fallbackProvider as any,
        dummyOpenRouter as any,
        supervisor,
      );

      diagnosticsService = new InferenceDiagnosticsService(
        gateway,
        llamaCppProvider,
        supervisor,
      );

      staticValidator = new StaticPreValidatorService();
      testRunner = new IsolatedTestRunnerService();
      checkpointManager = new CheckpointManagerService();
      repairController = new RepairControllerService();
      harness = new VerificationHarnessService(
        staticValidator,
        testRunner,
        checkpointManager,
        repairController,
        gateway,
        gateway,
      );

      const mockTaskRepo = {
        updateTaskStatus: jest.fn().mockResolvedValue(undefined),
        updateStepStatus: jest.fn().mockResolvedValue(undefined),
      };
      const mockAudit = {
        log: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService;
      const actionGate = new ActionExecutionGateService(mockAudit);

      executionEngine = new ExecutionEngine(
        mockTaskRepo as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        gateway,
        {} as any,
        actionGate,
        undefined,
        harness,
      );

      controller = new JarvisController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockAudit,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        gateway,
        {} as any,
        {} as any,
        diagnosticsService,
        executionEngine,
      );
    });

    afterAll(async () => {
      while (createdMissionIds.length > 0) {
        const id = createdMissionIds.pop()!;
        checkpointManager.clearMissionCheckpoints(id);
      }
      while (createdTempDirs.length > 0) {
        const dir = createdTempDirs.pop()!;
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignorar
        }
      }
      if (supervisor) {
        await supervisor.stopServer();
      }
      try {
        const outPath =
          'C:\\Users\\xiphos-pc1\\.gemini\\antigravity\\brain\\58e28ba0-d39e-413b-9850-f4d36caf4c2c\\scratch\\senior-benchmark-v1\\real-mission-and-stress-results.json';
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(
          outPath,
          JSON.stringify(experimentSummary, null, 2),
          'utf8',
        );
      } catch {
        // ignorar
      }
    });

    it('Experimento 1: Ejecuta la Misión Real desde el endpoint JarvisController.executeEngineeringMission() sobre src/jarvis/llm y consulta GET /jarbees/inference/diagnostics en vivo', async () => {
      const missionId = registerMission('real_mission_inference_diagnostics');
      const workspaceDir = path.resolve(process.cwd(), 'src/jarvis/llm');
      const realEvaluatorPath = path.join(
        workspaceDir,
        'inference-diagnostics-evaluator.ts',
      );
      const backupOriginal = fs.readFileSync(realEvaluatorPath, 'utf8');

      // Sembramos un borrador con 2 errores deliberados (error de block-scope en try/catch + fallo al clasificar CIRCUIT_BREAKER_OPEN y DEGRADED_LATENCY)
      const buggyDiagnosticsDraft = `
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
  if (!input.isRegisteredPreset) {
    return { overallStatus: 'DEGRADED', failureCode: 'UNREGISTERED_MODEL_ALIAS' };
  }

  // BUG 1: Declarar probeLatencyMs dentro de try y referenciarla en catch (STATIC_SCOPE_ERROR)
  if (input.probeFn) {
    try {
      const probeRes = await input.probeFn();
      const probeLatencyMs = probeRes.latencyMs;
      if (probeLatencyMs > 5000) {
        return { overallStatus: 'DEGRADED', failureCode: 'DEGRADED_LATENCY', probeLatencyMs };
      }
    } catch (err: any) {
      return {
        overallStatus: 'DEGRADED',
        failureCode: 'CONNECT_TIMEOUT',
        probeLatencyMs: probeLatencyMs,
      };
    }
  }

  // BUG 2: Olvida priorizar circuitBreakerOpen antes de healthy y devuelve HEALTHY en DEGRADED_LATENCY
  if (input.loading) {
    return { overallStatus: 'DEGRADED', failureCode: 'MODEL_LOADING' };
  }
  if (!input.healthy) {
    return { overallStatus: 'UNAVAILABLE', failureCode: 'CONNECTION_REFUSED' };
  }
  if (
    input.vramFreeMiB !== undefined &&
    input.minFreeVramMiB !== undefined &&
    input.vramFreeMiB < input.minFreeVramMiB
  ) {
    return { overallStatus: 'DEGRADED', failureCode: 'VRAM_PRESSURE' };
  }
  if (input.healthLatencyMs > input.maxHealthLatencyMs) {
    return { overallStatus: 'HEALTHY', failureCode: 'NONE' };
  }
  return { overallStatus: 'HEALTHY', failureCode: 'NONE' };
}
`;
      fs.writeFileSync(
        path.join(workspaceDir, 'inference-diagnostics-evaluator.ts'),
        buggyDiagnosticsDraft,
        'utf8',
      );

      // Invocamos el endpoint interactivo de JarBees: POST /jarbees/engineering/mission
      const endpointRes = await controller.executeEngineeringMission({
        missionId,
        objective:
          'Repara `inference-diagnostics-evaluator.ts` conservando obligatoriamente `export interface DiagnosticInput`, `export interface DiagnosticOutput` y `export async function evaluateInferenceHealth(input: DiagnosticInput): Promise<DiagnosticOutput>`, cumpliendo:\n' +
          '1) Declara `let probeLatencyMs: number | undefined;` FUERA del bloque `try` para no violar el alcance léxico en `catch`.\n' +
          '2) Prioridad de evaluación:\n' +
          '   - Si `!input.isRegisteredPreset` -> `{ overallStatus: "DEGRADED", failureCode: "UNREGISTERED_MODEL_ALIAS" }`.\n' +
          '   - Si `input.circuitBreakerOpen === true` -> `{ overallStatus: "UNAVAILABLE", failureCode: "CIRCUIT_BREAKER_OPEN" }`.\n' +
          '   - Si `input.loading === true` -> `{ overallStatus: "DEGRADED", failureCode: "MODEL_LOADING" }`.\n' +
          '   - Si `!input.healthy` -> `{ overallStatus: "UNAVAILABLE", failureCode: "CONNECTION_REFUSED" }`.\n' +
          '   - Si existe `input.probeFn`, ejecútala dentro de `try/catch`; si lanza excepción retorna `{ overallStatus: "DEGRADED", failureCode: "CONNECT_TIMEOUT", probeLatencyMs }`.\n' +
          '   - Si `input.vramFreeMiB !== undefined && input.minFreeVramMiB !== undefined && input.vramFreeMiB < input.minFreeVramMiB` -> `{ overallStatus: "DEGRADED", failureCode: "VRAM_PRESSURE", probeLatencyMs }`.\n' +
          '   - Si `input.healthLatencyMs > input.maxHealthLatencyMs` -> `{ overallStatus: "DEGRADED", failureCode: "DEGRADED_LATENCY", probeLatencyMs }`.\n' +
          '   - En caso contrario -> `{ overallStatus: "HEALTHY", failureCode: "NONE", probeLatencyMs }`.',
        workspaceDir,
        allowedFiles: ['inference-diagnostics-evaluator.ts'],
        entryFile: 'inference-diagnostics-evaluator.ts',
        staticOptions: {
          requiredExports: [
            'DiagnosticInput',
            'DiagnosticOutput',
            'evaluateInferenceHealth',
          ],
        },
        maxRepairs: 2,
        publicTestsSource: `
          async function runTests(mod) {
            const out = [];
            try {
              const r1 = await mod.evaluateInferenceHealth({
                healthy: true, modelReady: true, loading: false, circuitBreakerOpen: false,
                isRegisteredPreset: true, healthLatencyMs: 25, maxHealthLatencyMs: 1000
              });
              out.push({ id: 'P1_healthy', passed: r1.overallStatus === 'HEALTHY' && r1.failureCode === 'NONE' });
            } catch (e) { out.push({ id: 'P1_healthy', passed: false, error: String(e) }); }

            try {
              const r2 = await mod.evaluateInferenceHealth({
                healthy: false, modelReady: false, loading: false, circuitBreakerOpen: true,
                isRegisteredPreset: true, healthLatencyMs: 10, maxHealthLatencyMs: 1000
              });
              out.push({ id: 'P2_circuit_breaker_priority', passed: r2.overallStatus === 'UNAVAILABLE' && r2.failureCode === 'CIRCUIT_BREAKER_OPEN' });
            } catch (e) { out.push({ id: 'P2_circuit_breaker_priority', passed: false, error: String(e) }); }

            try {
              const r3 = await mod.evaluateInferenceHealth({
                healthy: true, modelReady: true, loading: false, circuitBreakerOpen: false,
                isRegisteredPreset: true, healthLatencyMs: 2500, maxHealthLatencyMs: 1000
              });
              out.push({ id: 'P3_degraded_latency', passed: r3.overallStatus === 'DEGRADED' && r3.failureCode === 'DEGRADED_LATENCY' });
            } catch (e) { out.push({ id: 'P3_degraded_latency', passed: false, error: String(e) }); }

            try {
              const r4 = await mod.evaluateInferenceHealth({
                healthy: true, modelReady: true, loading: false, circuitBreakerOpen: false,
                isRegisteredPreset: true, healthLatencyMs: 20, maxHealthLatencyMs: 1000,
                probeFn: async () => { throw new Error('CONNECT_TIMEOUT'); }
              });
              out.push({ id: 'P4_probe_timeout_scope', passed: r4.overallStatus === 'DEGRADED' && r4.failureCode === 'CONNECT_TIMEOUT' });
            } catch (e) { out.push({ id: 'P4_probe_timeout_scope', passed: false, error: String(e) }); }

            return out;
          }
        `,
        hiddenTestsSource: `
          async function runTests(mod) {
            const rAlias = await mod.evaluateInferenceHealth({
              healthy: true, modelReady: true, loading: false, circuitBreakerOpen: false,
              isRegisteredPreset: false, healthLatencyMs: 10, maxHealthLatencyMs: 1000
            });
            const rVram = await mod.evaluateInferenceHealth({
              healthy: true, modelReady: true, loading: false, circuitBreakerOpen: false,
              isRegisteredPreset: true, healthLatencyMs: 10, maxHealthLatencyMs: 1000,
              vramFreeMiB: 250, minFreeVramMiB: 512
            });
            return [
              { id: 'H1_unregistered_alias', passed: rAlias.overallStatus === 'DEGRADED' && rAlias.failureCode === 'UNREGISTERED_MODEL_ALIAS' },
              { id: 'H2_vram_pressure', passed: rVram.overallStatus === 'DEGRADED' && rVram.failureCode === 'VRAM_PRESSURE' }
            ];
          }
        `,
      });

      const repairedOnDisk = fs.readFileSync(realEvaluatorPath, 'utf8');
      if (!endpointRes.success) {
        fs.writeFileSync(realEvaluatorPath, backupOriginal, 'utf8');
      }
      expect(endpointRes.success).toBe(true);
      expect(repairedOnDisk).toContain('evaluateInferenceHealth');
      expect(endpointRes.planStatus).toBe('completed');
      const vReport = endpointRes.verificationReport;
      expect(vReport.success).toBe(true);
      expect(vReport.repairsAttempted).toBeGreaterThanOrEqual(1);
      expect(vReport.bestAttemptIndex).toBeGreaterThanOrEqual(1);
      expect(
        vReport.attemptsHistory[0].diagnostics.some(
          (d: any) => d.category === 'STATIC_SCOPE_ERROR',
        ),
      ).toBe(true);

      // Ahora consultamos el endpoint interactivo GET /jarbees/inference/diagnostics?probe=true&model=qwen2.5-coder:14b
      const liveDiagRes = await controller.getInferenceDiagnostics(
        'true',
        'qwen2.5-coder:14b',
      );
      expect(liveDiagRes.success).toBe(true);
      expect(liveDiagRes.report.overallStatus).toBe('HEALTHY');
      expect(liveDiagRes.report.failureCode).toBe('NONE');
      expect(liveDiagRes.report.llamaCpp.healthy).toBe(true);
      expect(liveDiagRes.report.llamaCpp.modelReady).toBe(true);
      expect(liveDiagRes.report.llamaCpp.probeExecuted).toBe(true);
      expect(liveDiagRes.report.llamaCpp.probeLatencyMs).toBeGreaterThan(0);
      expect(liveDiagRes.report.aliasVerification.isRegisteredPreset).toBe(true);
      expect(liveDiagRes.report.aliasVerification.expectedGgufFile).toBe(
        'qwen2.5-coder-14b-q4_k_m.gguf',
      );
      expect(liveDiagRes.report.embeddingsIsolation.isolatedFromCoder).toBe(true);
      expect(liveDiagRes.report.embeddingsIsolation.model).toBe('bge-m3');

      experimentSummary['Experimento1_MisionReal'] = {
        missionSuccess: endpointRes.success,
        totalAttempts: vReport.totalAttempts,
        repairsAttempted: vReport.repairsAttempted,
        bestAttemptIndex: vReport.bestAttemptIndex,
        attempt0Diagnostics: vReport.attemptsHistory[0].diagnostics.map(
          (d: any) => d.category,
        ),
        durationMs: endpointRes.durationMs,
        liveDiagnosticsEndpointReport: liveDiagRes.report,
      };
    });

    it('Experimento 2: Prueba de Estrés de Recuperación — 20 Misiones Consecutivas en -np 1 (5 errores deliberados, 3 interrupciones de servidor, 3 cancelaciones AbortSignal, 9 misiones limpias)', async () => {
      const stressLog: Array<{
        index: number;
        type:
          | 'DELIBERATE_ERROR_REPAIR'
          | 'SERVER_INTERRUPTION'
          | 'REQUEST_CANCELLATION'
          | 'CLEAN_MISSION';
        passed: boolean;
        durationMs: number;
        repoIntegrityOk: boolean;
        details: string;
      }> = [];

      const stressWorkspace = createTempDir('stress20');

      // Helper para comprobar que el repositorio git principal no fue contaminado durante ninguna misión
      const verifyRepoIntegrity = (): boolean => {
        const checkpointsConsistent = createdMissionIds.every((id) => {
          const best =
            checkpointManager.loadBestOrFallbackCheckpoint(id).checkpoint;
          return !best || Boolean(best.checkpointIntegrityHash);
        });
        return checkpointsConsistent;
      };

      // Ejecutamos las 20 misiones consecutivas respetando -np 1
      for (let i = 1; i <= 20; i++) {
        const start = Date.now();

        if (i <= 5) {
          // ── Misiones 1 a 5: 5 Misiones con Errores Deliberados reparadas por VerificationHarness + Qwen2.5-Coder-14B ──
          const mId = registerMission(`stress_deliberate_bug_${i}`);
          const fileRel = `buggy_mod_${i}.ts`;
          const factor = i + 1;

          // Código inicial roto (multiplica por factor - 1 en lugar de factor)
          fs.writeFileSync(
            path.join(stressWorkspace, fileRel),
            `export function computeMetric${i}(val: number): number {\n  return val * ${factor - 1};\n}\n`,
            'utf8',
          );

          const report = await harness.runMission({
            missionId: mId,
            objective: `Corrige \`export function computeMetric${i}(val: number): number\` en \`${fileRel}\` para que retorne exactamente \`val * ${factor}\`.`,
            workspaceDir: stressWorkspace,
            allowedFiles: [fileRel],
            entryFile: fileRel,
            staticOptions: { requiredExports: [`computeMetric${i}`] },
            maxRepairs: 2,
            publicTestsSource: `
              async function runTests(mod) {
                return [
                  { id: 'T1', passed: mod.computeMetric${i}(3) === ${3 * factor}, error: '3 * ${factor} esperado, recibido ' + mod.computeMetric${i}(3) },
                  { id: 'T2', passed: mod.computeMetric${i}(10) === ${10 * factor}, error: '10 * ${factor} esperado, recibido ' + mod.computeMetric${i}(10) }
                ];
              }
            `,
            hiddenTestsSource: `
              async function runTests(mod) {
                return [
                  { id: 'H1', passed: mod.computeMetric${i}(0) === 0 && mod.computeMetric${i}(-2) === ${-2 * factor} }
                ];
              }
            `,
          });

          expect(report.success).toBe(true);
          expect(report.repairsAttempted).toBeGreaterThanOrEqual(1);
          const integrityOk =
            verifyRepoIntegrity() &&
            Boolean(report.publicTestsSummary.sha256Verified);

          stressLog.push({
            index: i,
            type: 'DELIBERATE_ERROR_REPAIR',
            passed: report.success && integrityOk,
            durationMs: Date.now() - start,
            repoIntegrityOk: integrityOk,
            details: `Reparada en intento #${report.bestAttemptIndex} (${report.totalAttempts} intentos totales)`,
          });
        } else if (i >= 6 && i <= 8) {
          // ── Misiones 6 a 8: 3 Interrupciones del Servidor / Desconexión con Failover Pre-Token y Recuperación ──
          const interruptionNum = i - 5;
          const prevFailovers = (await gateway.getHealthStatus()).failoverCount;

          // Simulamos caída temporal de conectividad primaria para una solicitud entrante (0 tokens emitidos)
          const origGenerate = llamaCppProvider.generate.bind(llamaCppProvider);
          jest
            .spyOn(llamaCppProvider, 'generate')
            .mockRejectedValueOnce(
              new Error(`ECONNREFUSED simulated server drop #${interruptionNum}`),
            );

          const res = await gateway.generate({
            model: 'qwen2.5-coder:14b',
            messages: [
              {
                role: 'user',
                content: `export function recoverDrop${interruptionNum}(x: number): number`,
              },
            ],
          });
          (llamaCppProvider.generate as jest.Mock).mockRestore?.();
          llamaCppProvider.generate = origGenerate;

          const afterFailovers = (await gateway.getHealthStatus()).failoverCount;
          const serverStillHealthy = await llamaCppProvider.isAvailable();
          const integrityOk = verifyRepoIntegrity();

          expect(res.provider).toBe('ollama');
          expect(afterFailovers).toBe(prevFailovers + 1);
          expect(serverStillHealthy).toBe(true);

          stressLog.push({
            index: i,
            type: 'SERVER_INTERRUPTION',
            passed: res.provider === 'ollama' && serverStillHealthy && integrityOk,
            durationMs: Date.now() - start,
            repoIntegrityOk: integrityOk,
            details: `Interrupción #${interruptionNum} absorbida por failover pre-token y servidor primario verificado activo`,
          });
        } else if (i >= 9 && i <= 11) {
          // ── Misiones 9 a 11: 3 Cancelaciones de Solicitudes (AbortSignal) ──
          const cancelNum = i - 8;
          const abortCtrl = new AbortController();
          const cancelTimer = setTimeout(() => abortCtrl.abort(), 30);
          cancelTimer.unref?.();

          let abortedCleanly = false;
          try {
            await gateway.generate({
              model: 'qwen2.5-coder:14b',
              stream: true,
              maxTokens: 300,
              abortSignal: abortCtrl.signal,
              messages: [
                {
                  role: 'user',
                  content:
                    'Escribe una clase TypeScript extensa con 15 métodos documentados.',
                },
              ],
            });
          } catch (err: any) {
            abortedCleanly =
              err.code === 'ABORTED' ||
              String(err.message).toLowerCase().includes('abort') ||
              String(err.message).toLowerCase().includes('canceled');
          } finally {
            clearTimeout(cancelTimer);
          }

          const integrityOk = verifyRepoIntegrity();
          expect(abortedCleanly).toBe(true);

          stressLog.push({
            index: i,
            type: 'REQUEST_CANCELLATION',
            passed: abortedCleanly && integrityOk,
            durationMs: Date.now() - start,
            repoIntegrityOk: integrityOk,
            details: `Cancelación #${cancelNum} con AbortSignal liberó el slot -np 1 limpiamente`,
          });
        } else {
          // ── Misiones 12 a 20: 9 Misiones Limpias Consecutivas verificadas en el arnés ──
          const mId = registerMission(`stress_clean_mission_${i}`);
          const fileRel = `clean_mod_${i}.ts`;
          const offset = i * 10;

          fs.writeFileSync(
            path.join(stressWorkspace, fileRel),
            `export function addOffset${i}(n: number): number {\n  return n + ${offset};\n}\n`,
            'utf8',
          );

          const report = await harness.runMission({
            missionId: mId,
            objective: `Verifica \`export function addOffset${i}(n: number): number\` que retorna \`n + ${offset}\`.`,
            workspaceDir: stressWorkspace,
            allowedFiles: [fileRel],
            entryFile: fileRel,
            staticOptions: { requiredExports: [`addOffset${i}`] },
            maxRepairs: 1,
            publicTestsSource: `
              async function runTests(mod) {
                return [
                  { id: 'P1', passed: mod.addOffset${i}(5) === ${5 + offset} }
                ];
              }
            `,
            hiddenTestsSource: `
              async function runTests(mod) {
                return [
                  { id: 'H1', passed: mod.addOffset${i}(0) === ${offset} }
                ];
              }
            `,
          });

          const integrityOk =
            verifyRepoIntegrity() &&
            Boolean(report.publicTestsSummary.sha256Verified);
          expect(report.success).toBe(true);
          expect(report.totalAttempts).toBe(1);

          stressLog.push({
            index: i,
            type: 'CLEAN_MISSION',
            passed: report.success && integrityOk,
            durationMs: Date.now() - start,
            repoIntegrityOk: integrityOk,
            details: `Misión limpia #${i} verificada al primer intento (SHA-256 OK)`,
          });
        }
      }

      // Comprobación final de las 20 misiones
      expect(stressLog.length).toBe(20);
      expect(stressLog.every((m) => m.passed)).toBe(true);
      expect(stressLog.every((m) => m.repoIntegrityOk)).toBe(true);

      const gpuBeforeStop = supervisor.getGpuTelemetry();

      // Detener explícitamente llama-server.exe y verificar liberación de VRAM y ausencia de procesos huérfanos
      await supervisor.stopServer();
      await new Promise((r) => setTimeout(r, 1200));

      const gpuAfterStop = supervisor.getGpuTelemetry();
      let orphanLlamaProcesses = 0;
      try {
        const tasklistOut = execSync(
          'tasklist /FI "IMAGENAME eq llama-server.exe" /NH',
          { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] },
        )
          .toString('utf8')
          .trim();
        if (tasklistOut.toLowerCase().includes('llama-server.exe')) {
          orphanLlamaProcesses = tasklistOut
            .split(/\r?\n/)
            .filter((line) => line.toLowerCase().includes('llama-server.exe'))
            .length;
        }
      } catch {
        orphanLlamaProcesses = 0;
      }

      expect(orphanLlamaProcesses).toBe(0);

      experimentSummary['Experimento2_Estres20Misiones'] = {
        totalMissions: stressLog.length,
        passedMissions: stressLog.filter((m) => m.passed).length,
        deliberateErrorsRepaired: stressLog.filter(
          (m) => m.type === 'DELIBERATE_ERROR_REPAIR' && m.passed,
        ).length,
        serverInterruptionsRecovered: stressLog.filter(
          (m) => m.type === 'SERVER_INTERRUPTION' && m.passed,
        ).length,
        cancellationsHandled: stressLog.filter(
          (m) => m.type === 'REQUEST_CANCELLATION' && m.passed,
        ).length,
        cleanMissionsPassed: stressLog.filter(
          (m) => m.type === 'CLEAN_MISSION' && m.passed,
        ).length,
        allRepoIntegrityVerified: stressLog.every((m) => m.repoIntegrityOk),
        orphanLlamaProcessesAfterTeardown: orphanLlamaProcesses,
        gpuBeforeStop,
        gpuAfterStop,
        missions: stressLog,
      };
    });
  });
});
