import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OllamaQwenModelService } from '../../aichat/models/ollamaModel_2';
import { InferenceGatewayService } from '../llm/inference-gateway.service';
import {
  InferenceServerStatus,
  InferenceSupervisorService,
} from '../llm/inference-supervisor.service';
import { LlamaCppProvider } from '../llm/llamacpp.provider';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
} from '../llm/llm-provider.interface';
import { ExecutionEngine, ExecutionPlan } from '../planner/execution-engine.service';
import { ActionExecutionGateService } from '../security/action-execution-gate.service';
import { AuditService } from '../security/audit.service';
import { CheckpointManagerService } from './checkpoint-manager.service';
import { IsolatedTestRunnerService } from './isolated-test-runner.service';
import { RepairControllerService } from './repair-controller.service';
import { StaticPreValidatorService } from './static-pre-validator.service';
import { VerificationHarnessService } from './verification-harness.service';

jest.setTimeout(240000);

describe('JarBees Fase 4 — Suite End-to-End Real con llama-server.exe (Qwen2.5-Coder-14B, RTX 5070, -c 6144, -np 1)', () => {
  const E2E_PORT = '8095';
  const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
  const MODEL_GGUF = 'C:\\AI\\models\\qwen2.5-coder-14b-q4_k_m.gguf';
  const BINARY_PATH = 'C:\\AI\\llama.cpp\\b11935\\llama-server.exe';

  let supervisor: InferenceSupervisorService;
  let llamaCppProvider: LlamaCppProvider;
  let fallbackProvider: ILLMProvider & { calls: number };
  let gateway: InferenceGatewayService;
  let staticValidator: StaticPreValidatorService;
  let testRunner: IsolatedTestRunnerService;
  let checkpointManager: CheckpointManagerService;
  let repairController: RepairControllerService;
  let harness: VerificationHarnessService;
  let executionEngine: ExecutionEngine;
  let aichatCoderModel: OllamaQwenModelService;

  const createdMissionIds: string[] = [];
  const createdTempDirs: string[] = [];
  const e2eMetricsSummary: Record<string, any> = {};

  const registerMission = (id: string): string => {
    createdMissionIds.push(id);
    return id;
  };

  const createTempWorkspace = (prefix: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `jarbees-e2e-${prefix}-`));
    createdTempDirs.push(dir);
    return dir;
  };

  beforeAll(async () => {
    process.env.LLAMACPP_BINARY_PATH = BINARY_PATH;
    process.env.LLAMACPP_MODEL_PATH = MODEL_GGUF;
    process.env.LLAMACPP_HOST = '127.0.0.1';
    process.env.LLAMACPP_PORT = E2E_PORT;
    process.env.LLAMACPP_BASE_URL = E2E_BASE_URL;
    process.env.LLAMACPP_CTX_SIZE = '6144';
    process.env.LLAMACPP_NGL = '99';
    process.env.LLAMACPP_PARALLEL = '1';
    process.env.LLAMACPP_ROUTER_MODE = 'false';
    process.env.LLAMACPP_DEFAULT_MODEL = 'qwen2.5-coder:14b';
    process.env.LLAMACPP_CODER_MODEL = 'qwen2.5-coder:14b';
    process.env.LLAMACPP_TIMEOUT_MS = '60000';
    process.env.LLAMACPP_CONNECT_TIMEOUT_MS = '5000';
    process.env.USE_LLAMACPP_CODER = 'true';

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
        const fallbackCode =
          '```typescript\nexport function fallbackHealthCheck(): string { return "FALLBACK_OK"; }\n```';
        opts.onToken?.(fallbackCode);
        return {
          content: fallbackCode,
          model: 'qwen2.5-coder:7b',
          provider: 'ollama',
          latencyMs: 25,
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
        throw new Error('OpenRouter disabled in local E2E');
      },
    };

    gateway = new InferenceGatewayService(
      llamaCppProvider,
      fallbackProvider as any,
      dummyOpenRouter as any,
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

    aichatCoderModel = new OllamaQwenModelService(llamaCppProvider);
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
        'C:\\Users\\xiphos-pc1\\.gemini\\antigravity\\brain\\58e28ba0-d39e-413b-9850-f4d36caf4c2c\\scratch\\senior-benchmark-v1\\phase4-e2e-results.json';
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(
        outPath,
        JSON.stringify(e2eMetricsSummary, null, 2),
        'utf8',
      );
    } catch {
      // ignorar
    }
  });

  // ── E2E-01: Misión de implementación sencilla (ExecutionEngine -> LlamaCpp -> VerificationHarness) ──
  it('E2E-01: Misión sencilla de extremo a extremo desde ExecutionEngine + Streaming SSE + Telemetría RTX 5070', async () => {
    const missionId = registerMission('e2e_01_simple_mission');
    const workspaceDir = createTempWorkspace('e2e01');

    // Verificar primero que el streaming SSE directo contra llama-server.exe y OllamaQwenModelService funcionan
    const streamedTokens: string[] = [];
    const streamRes = await gateway.generate({
      model: 'qwen2.5-coder:14b',
      stream: true,
      maxTokens: 120,
      onToken: (tok) => streamedTokens.push(tok),
      messages: [
        {
          role: 'system',
          content: 'Responde solo con una línea de código TypeScript.',
        },
        {
          role: 'user',
          content: 'Escribe: export const READY = true;',
        },
      ],
    });
    expect(streamedTokens.length).toBeGreaterThan(1);
    expect(streamRes.content).toContain('READY');

    const aichatRes = await aichatCoderModel.invokeWithMessages({
      system: 'Responde únicamente con código TypeScript.',
      user: 'Escribe una función suma(a: number, b: number): number que retorne a + b.',
    });
    expect(aichatRes.content).toContain('function');

    const health = await gateway.getHealthStatus();
    expect(health.serverHealthy).toBe(true);
    expect(health.modelReady).toBe(true);
    expect(health.supervisor?.status).toBe(InferenceServerStatus.RUNNING);

    // Ahora ejecutar la misión E2E-01 completa a través de ExecutionEngine
    const plan: ExecutionPlan = {
      taskId: 901,
      objective:
        'Implementar en TypeScript la función export function formatSku(category: string, id: number): string que devuelva category.trim().toUpperCase() + "-" + String(id).padStart(4, "0"). Si id < 0 debe lanzar new Error("INVALID_ID").',
      steps: [
        {
          id: 1,
          stepNumber: 1,
          description: 'Generar y verificar formatSku con Qwen2.5-Coder-14B',
          type: 'verify_code',
          status: 'pending',
          input: {
            verificationMission: {
              missionId,
              objective:
                'Implementa y exporta la función `export function formatSku(category: string, id: number): string` que retorne `category.trim().toUpperCase() + "-" + String(id).padStart(4, "0")`. Si `id < 0`, debe lanzar `new Error("INVALID_ID")`.',
              workspaceDir,
              allowedFiles: ['sku.ts'],
              entryFile: 'sku.ts',
              publicTestsSource: `
                async function runTests(mod) {
                  const res = [];
                  try {
                    assert.strictEqual(mod.formatSku('gpu', 7), 'GPU-0007');
                    res.push({ id: 'P1_basic_pad', passed: true });
                  } catch (e) { res.push({ id: 'P1_basic_pad', passed: false, error: e.message }); }
                  try {
                    assert.strictEqual(mod.formatSku('  ram ', 125), 'RAM-0125');
                    res.push({ id: 'P2_trim_upper', passed: true });
                  } catch (e) { res.push({ id: 'P2_trim_upper', passed: false, error: e.message }); }
                  try {
                    let threw = false;
                    try { mod.formatSku('cpu', -1); } catch { threw = true; }
                    assert.strictEqual(threw, true, 'Expected negative id to throw');
                    res.push({ id: 'P3_negative_throws', passed: true });
                  } catch (e) { res.push({ id: 'P3_negative_throws', passed: false, error: e.message }); }
                  return res;
                }
              `,
              hiddenTestsSource: `
                async function runTests(mod) {
                  const res = [];
                  try {
                    assert.strictEqual(mod.formatSku('ssd', 0), 'SSD-0000');
                    res.push({ id: 'H1_zero_id', passed: true });
                  } catch (e) { res.push({ id: 'H1_zero_id', passed: false, error: e.message }); }
                  try {
                    assert.strictEqual(mod.formatSku('nvme', 12345), 'NVME-12345');
                    res.push({ id: 'H2_five_digits', passed: true });
                  } catch (e) { res.push({ id: 'H2_five_digits', passed: false, error: e.message }); }
                  return res;
                }
              `,
              maxRepairs: 2,
            },
          },
        },
      ],
    };

    const execResult = await executionEngine.execute(plan);
    const report = JSON.parse(plan.steps[0].output!.content);

    e2eMetricsSummary['E2E-01'] = {
      success: report.success,
      totalAttempts: report.totalAttempts,
      durationMs: report.totalDurationMs,
      publicPassed: report.publicTestsSummary.passed,
      hiddenPassed: report.hiddenTestsSummary?.passed,
      streamTokensPerSecond: streamRes.tokensPerSecond,
      gpuTelemetry: health.supervisor?.gpu,
    };

    expect(execResult.stepsCompleted).toBe(1);
    expect(report.success).toBe(true);
    expect(report.publicTestsSummary.passed).toBe(3);
    expect(report.hiddenTestsSummary.passed).toBe(2);
    expect(fs.existsSync(path.join(workspaceDir, 'sku.ts'))).toBe(true);
  });

  // ── E2E-02: Detección y reparación de un error con Qwen2.5-Coder-14B ───────
  it('E2E-02: Reparación real: detecta un bug de alcance try/catch + lógica y Qwen2.5-Coder-14B lo repara automáticamente', async () => {
    const missionId = registerMission('e2e_02_real_repair');
    const workspaceDir = createTempWorkspace('e2e02');

    // Código inicial con dos bugs reales:
    // 1. Declara `const result` dentro de try y lo usa en catch (error de alcance estático)
    // 2. Multiplica por 0.5 en lugar de aplicar descuento del 20% (price * 0.8) para VIP
    const buggyCode = `
export function computeNetPrice(price: number, isVip: boolean): number {
  if (price < 0) return 0;
  try {
    const discounted = isVip ? price * 0.5 : price;
    return Math.round(discounted * 100) / 100;
  } catch (err) {
    return discounted;
  }
}
`;

    const report = await harness.runMission({
      missionId,
      objective:
        'Implementar `export function computeNetPrice(price: number, isVip: boolean): number`. Si `price <= 0` retorna `0`. Si `isVip` es `true`, aplica 20% de descuento (`price * 0.8`), de lo contrario retorna `price`. Redondea a 2 decimales (`Math.round(val * 100) / 100`). Corrige cualquier variable fuera de alcance try/catch.',
      workspaceDir,
      allowedFiles: ['pricing.ts'],
      entryFile: 'pricing.ts',
      initialFiles: { 'pricing.ts': buggyCode },
      publicTestsSource: `
        async function runTests(mod) {
          const res = [];
          try {
            assert.strictEqual(mod.computeNetPrice(100, false), 100);
            res.push({ id: 'P1_regular_price', passed: true });
          } catch (e) { res.push({ id: 'P1_regular_price', passed: false, error: e.message }); }
          try {
            assert.strictEqual(mod.computeNetPrice(100, true), 80);
            res.push({ id: 'P2_vip_20_percent_discount', passed: true });
          } catch (e) { res.push({ id: 'P2_vip_20_percent_discount', passed: false, error: e.message }); }
          try {
            assert.strictEqual(mod.computeNetPrice(-25, true), 0);
            res.push({ id: 'P3_negative_returns_zero', passed: true });
          } catch (e) { res.push({ id: 'P3_negative_returns_zero', passed: false, error: e.message }); }
          return res;
        }
      `,
      hiddenTestsSource: `
        async function runTests(mod) {
          const res = [];
          try {
            assert.strictEqual(mod.computeNetPrice(50, true), 40);
            res.push({ id: 'H1_vip_50', passed: true });
          } catch (e) { res.push({ id: 'H1_vip_50', passed: false, error: e.message }); }
          try {
            assert.strictEqual(mod.computeNetPrice(0, true), 0);
            res.push({ id: 'H2_zero_price', passed: true });
          } catch (e) { res.push({ id: 'H2_zero_price', passed: false, error: e.message }); }
          return res;
        }
      `,
      maxRepairs: 2,
    });

    e2eMetricsSummary['E2E-02'] = {
      success: report.success,
      totalAttempts: report.totalAttempts,
      repairsAttempted: report.repairsAttempted,
      bestAttemptIndex: report.bestAttemptIndex,
      attempt0Diagnostics: report.attemptsHistory[0]?.diagnostics.map(
        (d) => d.category,
      ),
      durationMs: report.totalDurationMs,
    };

    expect(report.attemptsHistory[0].staticPassed).toBe(false);
    expect(
      report.attemptsHistory[0].diagnostics.some(
        (d) => d.category === 'STATIC_SCOPE_ERROR',
      ),
    ).toBe(true);
    expect(report.success).toBe(true);
    expect(report.bestAttemptIndex).toBeGreaterThanOrEqual(1);
    expect(report.publicTestsSummary.passed).toBe(3);
    expect(report.hiddenTestsSummary?.passed).toBe(2);
  });

  // ── E2E-03: Regresión y Best-Checkpoint Rollback ───────────────────────────
  it('E2E-03: Regresión y Rollback: revierte un parche que rompe pruebas ya ganadas y restaura el Best Checkpoint en disco', async () => {
    const missionId = registerMission('e2e_03_regression_rollback');
    const workspaceDir = createTempWorkspace('e2e03');

    // Estado inicial (Checkpoint #0): aprueba P1 y P2 (2/3)
    const checkpoint0Code = `export function clampRange(val: number, min: number, max: number): number {
  if (val < min) return min;
  if (val > max) return max;
  return val;
}`;

    // Parche regresivo en intento 1 que rompe P1 y P2; luego en intento 2 el LLM real de 14B repara desde el Best Checkpoint #0 restaurado
    let attemptCall = 0;
    const hybridProvider: ILLMProvider = {
      getProviderName: () => 'hybrid-e2e03',
      getDefaultModel: () => 'qwen2.5-coder:14b',
      embed: (t) => gateway.embed(t),
      generate: async (opts) => {
        attemptCall++;
        if (attemptCall === 1) {
          // Simula que el intento 1 introduce una regresión destructiva
          return {
            content:
              '```typescript\nexport function clampRange(): number { return NaN; }\n```',
            model: 'qwen2.5-coder:14b',
            provider: 'llamacpp',
            latencyMs: 10,
          };
        }
        // En el intento 2, tras el rollback al Checkpoint #0, consulta al Qwen2.5-Coder-14B real en llama-server.exe
        return gateway.generate(opts);
      },
    };

    const report = await harness.runMission({
      missionId,
      objective:
        'Implementar `export function clampRange(val: number, min: number, max: number): number`. Si `min > max`, debe intercambiar los límites (`[min, max] = [max, min]`) antes de recortar `val` al rango `[min, max]`.',
      workspaceDir,
      allowedFiles: ['clamp.ts'],
      entryFile: 'clamp.ts',
      initialFiles: { 'clamp.ts': checkpoint0Code },
      publicTestsSource: `
        async function runTests(mod) {
          const res = [];
          try {
            assert.strictEqual(mod.clampRange(5, 0, 10), 5);
            res.push({ id: 'P1_within_range', passed: true });
          } catch (e) { res.push({ id: 'P1_within_range', passed: false, error: e.message }); }
          try {
            assert.strictEqual(mod.clampRange(-3, 0, 10), 0);
            res.push({ id: 'P2_below_min', passed: true });
          } catch (e) { res.push({ id: 'P2_below_min', passed: false, error: e.message }); }
          try {
            assert.strictEqual(mod.clampRange(5, 10, 0), 5);
            res.push({ id: 'P3_inverted_bounds', passed: true });
          } catch (e) { res.push({ id: 'P3_inverted_bounds', passed: false, error: e.message }); }
          return res;
        }
      `,
      maxRepairs: 2,
      llmProviderOverride: hybridProvider,
    });

    const diskContent = fs.readFileSync(
      path.join(workspaceDir, 'clamp.ts'),
      'utf8',
    );

    e2eMetricsSummary['E2E-03'] = {
      success: report.success,
      rollbacksCount: report.rollbacksCount,
      attempt1Decision: report.attemptsHistory[1]?.decision,
      attempt1Regressions: report.attemptsHistory[1]?.regressions,
      bestAttemptIndex: report.bestAttemptIndex,
      durationMs: report.totalDurationMs,
    };

    expect(report.rollbacksCount).toBeGreaterThanOrEqual(1);
    expect(report.attemptsHistory[1].decision).toBe(
      'ROLLBACK_SCORE_REGRESSION',
    );
    expect(report.attemptsHistory[1].regressions).toContain('P1_within_range');
    // Y como en el intento 2 se restauró el Checkpoint #0 y se invocó a Qwen2.5-Coder-14B con el diagnóstico de regresión, logra recuperar o mantener el estado válido en disco
    expect(
      checkpointManager.computeWorkingTreeHash({ 'clamp.ts': diskContent }),
    ).toBe(report.finalWorkingTreeHash);
  });

  // ── E2E-04: Interrupción y recuperación de misión real contra llama-server.exe ──
  it('E2E-04: Interrupción y recuperación: detiene la misión tras el Checkpoint #0 y la reanuda contra llama-server.exe hasta completarla', async () => {
    const missionId = registerMission('e2e_04_interruption_recovery');
    const workspaceDir = createTempWorkspace('e2e04');

    const partialSlugCode = `export function slugifyTitle(title: string): string {
  return title.toLowerCase().replace(/\\s+/g, '-');
}`;

    const interrupted = await harness.runMission({
      missionId,
      objective:
        'Implementar `export function slugifyTitle(title: string): string` que convierta a minúsculas, recorte espacios extremos (`trim()`), reemplace cualquier secuencia de caracteres no alfanuméricos (`[^a-z0-9]+`) por un único guion `"-"`, y elimine guiones al inicio o al final (`replace(/^-+|-+$/g, "")`).',
      workspaceDir,
      allowedFiles: ['slug.ts'],
      entryFile: 'slug.ts',
      initialFiles: { 'slug.ts': partialSlugCode },
      publicTestsSource: `
        async function runTests(mod) {
          const res = [];
          try {
            assert.strictEqual(mod.slugifyTitle('Hola Mundo'), 'hola-mundo');
            res.push({ id: 'P1_simple', passed: true });
          } catch (e) { res.push({ id: 'P1_simple', passed: false, error: e.message }); }
          try {
            assert.strictEqual(mod.slugifyTitle('  JarBees: Senior Coder!! '), 'jarbees-senior-coder');
            res.push({ id: 'P2_punctuation_and_trim', passed: true });
          } catch (e) { res.push({ id: 'P2_punctuation_and_trim', passed: false, error: e.message }); }
          return res;
        }
      `,
      hiddenTestsSource: `
        async function runTests(mod) {
          return [{ id: 'H1_multiple_dashes', passed: mod.slugifyTitle('---A___B---') === 'a-b' }];
        }
      `,
      maxRepairs: 2,
      simulateInterruptAfterAttempt: 0,
    });

    expect(interrupted.finalPhase).toBe('INTERRUPTED_WAITING_RECOVERY');
    expect(interrupted.totalAttempts).toBe(1);

    // Reanudar la misión usando el motor real de Qwen2.5-Coder-14B en llama-server.exe
    const resumed = await harness.resumeMission(missionId, gateway);

    e2eMetricsSummary['E2E-04'] = {
      interruptedPhase: interrupted.finalPhase,
      resumedFromDisk: resumed.resumedFromDisk,
      finalSuccess: resumed.success,
      totalAttempts: resumed.totalAttempts,
      bestAttemptIndex: resumed.bestAttemptIndex,
      durationMs: resumed.totalDurationMs,
    };

    expect(resumed.resumedFromDisk).toBe(true);
    expect(resumed.success).toBe(true);
    expect(resumed.finalPhase).toBe('COMPLETED');
    expect(resumed.bestAttemptIndex).toBe(1);
    expect(resumed.hiddenTestsSummary?.passed).toBe(1);
  });

  // ── E2E-05: Caída de llama-server.exe, cancelación y failover sin duplicación ──
  it('E2E-05: Fallo de inferencia: detiene llama-server.exe, verifica failover pre-token sin duplicación y bloqueo mid-stream', async () => {
    // 1. Verificar cancelación inmediata con AbortController
    const abortCtrl = new AbortController();
    abortCtrl.abort();
    await expect(
      gateway.generate({
        model: 'qwen2.5-coder:14b',
        abortSignal: abortCtrl.signal,
        messages: [{ role: 'user', content: 'No ejecutar' }],
      }),
    ).rejects.toThrow(/abortada|ABORTED/i);

    // 2. Detener realmente llama-server.exe para provocar caída real del servidor
    await supervisor.stopServer();
    expect(await supervisor.isServerAlive()).toBe(false);

    // 3. Solicitud con llama-server caído (0 tokens emitidos) -> debe hacer failover limpio al fallback sin duplicar tokens
    const tokensReceivedOnFailover: string[] = [];
    const prevFailoverCount = (gateway as any).failoverCount;
    const failoverRes = await gateway.generate({
      model: 'qwen2.5-coder:14b',
      onToken: (tok) => tokensReceivedOnFailover.push(tok),
      timeouts: { connectMs: 1500, generationMs: 5000 },
      messages: [
        { role: 'user', content: 'Genera función de healthcheck de respaldo' },
      ],
    });

    expect(failoverRes.provider).toBe('ollama');
    expect(failoverRes.content).toContain('FALLBACK_OK');
    expect(tokensReceivedOnFailover.length).toBe(1);
    expect((gateway as any).failoverCount).toBe(prevFailoverCount + 1);

    e2eMetricsSummary['E2E-05'] = {
      serverStoppedCleanly: true,
      failoverProviderUsed: failoverRes.provider,
      failoverCountAfterDrop: (gateway as any).failoverCount,
      duplicatedChunks: false,
    };
  });
});

