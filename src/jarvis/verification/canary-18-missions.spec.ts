import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JarvisController } from '../jarvis.controller';
import { InferenceDiagnosticsService } from '../llm/inference-diagnostics.service';
import { InferenceGatewayService } from '../llm/inference-gateway.service';
import { InferenceSupervisorService } from '../llm/inference-supervisor.service';
import { LlamaCppProvider } from '../llm/llamacpp.provider';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
} from '../llm/llm-provider.interface';
import { ExecutionEngine } from '../planner/execution-engine.service';
import { ActionExecutionGateService } from '../security/action-execution-gate.service';
import { ActionGatekeeperService } from '../security/action-gatekeeper.service';
import { AuditService } from '../security/audit.service';
import { CheckpointManagerService } from './checkpoint-manager.service';
import { EngineeringMissionManagerService } from './engineering-mission-manager.service';
import { IsolatedTestRunnerService } from './isolated-test-runner.service';
import { RepairControllerService } from './repair-controller.service';
import { StaticPreValidatorService } from './static-pre-validator.service';
import { VerificationHarnessService } from './verification-harness.service';

jest.setTimeout(360000);

describe('JarBees Etapa 2 — Canary Operativo de Ingeniería (18 Misiones Reales + EngineeringMissionManager + Auditoría HTTP)', () => {
  const CANARY_PORT = '8097';
  const CANARY_BASE_URL = `http://127.0.0.1:${CANARY_PORT}`;
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
  let actionGatekeeper: ActionGatekeeperService;
  let missionManager: EngineeringMissionManagerService;
  let executionEngine: ExecutionEngine;
  let controller: JarvisController;

  const createdMissionIds: string[] = [];
  const createdTempDirs: string[] = [];
  const canaryAuditLog: Array<Record<string, any>> = [];
  let gpuBeforeTeardown: any;
  let gpuAfterTeardown: any;
  let orphanProcessesAfterTeardown = 0;

  const registerMission = (id: string): string => {
    createdMissionIds.push(id);
    return id;
  };

  const createWorkspace = (prefix: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `jarbees-canary-${prefix}-`));
    createdTempDirs.push(dir);
    return dir;
  };

  beforeAll(async () => {
    // Etapa 1/2: USE_LLAMACPP_CODER sigue desactivado por defecto en el entorno global
    delete process.env.USE_LLAMACPP_CODER;

    process.env.LLAMACPP_BINARY_PATH = BINARY_PATH;
    process.env.LLAMACPP_MODEL_PATH = MODEL_GGUF;
    process.env.LLAMACPP_HOST = '127.0.0.1';
    process.env.LLAMACPP_PORT = CANARY_PORT;
    process.env.LLAMACPP_BASE_URL = CANARY_BASE_URL;
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
        const code =
          '```typescript\nexport function fallbackHealth(): string { return "FALLBACK_ACTIVE"; }\n```';
        opts.onToken?.(code);
        return {
          content: code,
          model: 'qwen2.5-coder:7b',
          provider: 'ollama',
          requestId: `ollama_fallback_${Date.now()}`,
          httpStatus: 200,
          endpointUrl: 'http://localhost:11434/api/chat',
          promptTokens: 24,
          completionTokens: 14,
          tokensUsed: 38,
          latencyMs: 22,
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

    const mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    actionGatekeeper = new ActionGatekeeperService();
    missionManager = new EngineeringMissionManagerService(
      harness,
      checkpointManager,
      repairController,
      actionGatekeeper,
      supervisor,
      mockAudit,
    );

    const mockTaskRepo = {
      updateTaskStatus: jest.fn().mockResolvedValue(undefined),
      updateStepStatus: jest.fn().mockResolvedValue(undefined),
    };
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
      actionGatekeeper,
      {} as any,
      diagnosticsService,
      executionEngine,
      missionManager,
    );
  });

  afterAll(async () => {
    while (createdMissionIds.length > 0) {
      const id = createdMissionIds.pop()!;
      missionManager.deleteMissionRecord(id);
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
      gpuBeforeTeardown = supervisor.getGpuTelemetry();
      await supervisor.stopServer();
      await new Promise((r) => setTimeout(r, 1200));
      gpuAfterTeardown = supervisor.getGpuTelemetry();
    }
    try {
      const tasklistOut = execSync(
        'tasklist /FI "IMAGENAME eq llama-server.exe" /NH',
        { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] },
      )
        .toString('utf8')
        .trim();
      if (tasklistOut.toLowerCase().includes('llama-server.exe')) {
        orphanProcessesAfterTeardown = tasklistOut
          .split(/\r?\n/)
          .filter((l) => l.toLowerCase().includes('llama-server.exe')).length;
      }
    } catch {
      orphanProcessesAfterTeardown = 0;
    }

    try {
      const outPath =
        'C:\\Users\\xiphos-pc1\\.gemini\\antigravity\\brain\\58e28ba0-d39e-413b-9850-f4d36caf4c2c\\scratch\\senior-benchmark-v1\\canary-18-missions-audit.json';
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            totalCanaryMissions: canaryAuditLog.length,
            passedCanaryMissions: canaryAuditLog.filter((m) => m.passed).length,
            orphanProcessesAfterTeardown,
            gpuBeforeTeardown,
            gpuAfterTeardown,
            missions: canaryAuditLog,
          },
          null,
          2,
        ),
        'utf8',
      );
    } catch {
      // ignorar
    }
  });

  // ── BLOQUE 1: 5 Misiones Sencillas (Estabilidad Cotidiana — Inferencia HTTP 100 % Real) ──
  it('Bloque 1 (5/18): Ejecuta 5 misiones sencillas con inferencia HTTP real en llama-server.exe, auditando requestId, tokens, diff y VRAM', async () => {
    const simpleSpecs = [
      {
        id: 'canary_s01_slug',
        file: 'slug.ts',
        fn: 'normalizeSlug',
        objective:
          'Implementa `export function normalizeSlug(text: string): string` que convierta `text.trim().toLowerCase()` reemplazando cualquier secuencia de espacios o guiones bajos `[\\s_]+` por `"-"` y eliminando guiones al inicio o final.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.normalizeSlug('  Hola Mundo_IA ') === 'hola-mundo-ia' },
          { id: 'P2', passed: m.normalizeSlug('JarBees   14B') === 'jarbees-14b' }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.normalizeSlug('___Test___') === 'test' }]; }`,
      },
      {
        id: 'canary_s02_confidence',
        file: 'confidence.ts',
        fn: 'clampConfidence',
        objective:
          'Implementa `export function clampConfidence(score: number): number` que limite `score` al rango `[0, 1]` y redondee a 2 decimales con `Math.round(clamped * 100) / 100`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.clampConfidence(0.856) === 0.86 },
          { id: 'P2', passed: m.clampConfidence(1.5) === 1 && m.clampConfidence(-0.4) === 0 }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.clampConfidence(0.123) === 0.12 }]; }`,
      },
      {
        id: 'canary_s03_backoff',
        file: 'backoff.ts',
        fn: 'computeBackoffMs',
        objective:
          'Implementa `export function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number` que retorne `Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt)))`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.computeBackoffMs(0, 100, 5000) === 100 },
          { id: 'P2', passed: m.computeBackoffMs(3, 100, 5000) === 800 },
          { id: 'P3', passed: m.computeBackoffMs(10, 100, 5000) === 5000 }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.computeBackoffMs(-1, 200, 1000) === 200 }]; }`,
      },
      {
        id: 'canary_s04_pagination',
        file: 'pagination.ts',
        fn: 'getPaginationOffset',
        objective:
          'Implementa `export function getPaginationOffset(page: number, limit: number): { offset: number; limit: number }` donde `safePage = Math.max(1, Math.floor(page))`, `safeLimit = Math.max(1, Math.min(100, Math.floor(limit)))`, y `offset = (safePage - 1) * safeLimit`.',
        pub: `async function runTests(m) {
          const r1 = m.getPaginationOffset(3, 20);
          const r2 = m.getPaginationOffset(0, 500);
          return [
            { id: 'P1', passed: r1.offset === 40 && r1.limit === 20 },
            { id: 'P2', passed: r2.offset === 0 && r2.limit === 100 }
          ];
        }`,
        hid: `async function runTests(m) { const r = m.getPaginationOffset(2, 15); return [{ id: 'H1', passed: r.offset === 15 && r.limit === 15 }]; }`,
      },
      {
        id: 'canary_s05_vram_ratio',
        file: 'vram-ratio.ts',
        fn: 'computeVramUsagePercent',
        objective:
          'Implementa `export function computeVramUsagePercent(usedMiB: number, totalMiB: number): number` que retorne `0` si `totalMiB <= 0`, y en caso contrario `Math.round((usedMiB / totalMiB) * 100)`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.computeVramUsagePercent(10256, 12227) === 84 },
          { id: 'P2', passed: m.computeVramUsagePercent(500, 0) === 0 }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.computeVramUsagePercent(6113.5, 12227) === 50 }]; }`,
      },
    ];

    for (const spec of simpleSpecs) {
      const mId = registerMission(spec.id);
      const ws = createWorkspace(spec.id);

      const res = await controller.executeEngineeringMission({
        missionId: mId,
        objective: spec.objective,
        workspaceDir: ws,
        allowedFiles: [spec.file],
        entryFile: spec.file,
        staticOptions: { requiredExports: [spec.fn] },
        publicTestsSource: spec.pub,
        hiddenTestsSource: spec.hid,
        maxRepairs: 2,
      });

      expect(res.success).toBe(true);
      const record = res.managedRecord!;
      expect(record.status).toBe('completed');
      expect(record.diffBeforeAfter).toContain(`+++ b/${spec.file}`);
      expect(record.llmCallsHistory.length).toBeGreaterThanOrEqual(1);

      const firstCall = record.llmCallsHistory[0];
      expect(firstCall.provider).toBe('llamacpp');
      expect(firstCall.model).toBe('qwen2.5-coder:14b');
      expect(firstCall.httpStatus).toBe(200);
      expect(firstCall.endpointUrl).toContain('/v1/chat/completions');
      expect(firstCall.promptTokens).toBeGreaterThan(10);
      expect(firstCall.completionTokens).toBeGreaterThan(5);
      expect(Boolean(firstCall.requestId)).toBe(true);

      canaryAuditLog.push({
        canaryCategory: '1_SIMPLE_MISSION',
        missionId: mId,
        passed: res.success,
        status: record.status,
        totalAttempts: record.verificationReport?.totalAttempts,
        bestCheckpointId: record.bestCheckpointId,
        diffLinesCount: record.diffBeforeAfter.split('\n').length,
        llmCalls: record.llmCallsHistory,
        gpuTelemetry: record.gpuTelemetry,
        durationMs: record.budgetUsage.durationMs,
      });
    }
  });

  // ── BLOQUE 2: 5 Modificaciones Multicomponente (Coherencia Arquitectónica entre 2 Archivos) ──
  it('Bloque 2 (10/18): Ejecuta 5 modificaciones multicomponente (contrato + servicio acoplado) reparadas/implementadas por Qwen2.5-Coder-14B', async () => {
    const multiSpecs = [
      {
        id: 'canary_m01_tax',
        contractFile: 'tax-contract.ts',
        contractCode: `export interface TaxRateConfig {\n  baseRate: number;\n  surchargeRate: number;\n}\n`,
        serviceFile: 'tax-service.ts',
        buggyServiceCode: `import { TaxRateConfig } from './tax-contract';\nexport function calculateTotalWithTax(netAmount: number, cfg: TaxRateConfig): number {\n  // BUG: resta la sobretasa en vez de sumarla\n  return Math.round(netAmount * (1 + cfg.baseRate - cfg.surchargeRate) * 100) / 100;\n}\n`,
        fn: 'calculateTotalWithTax',
        objective:
          'En `tax-service.ts` (que importa `TaxRateConfig` desde `./tax-contract`), corrige `export function calculateTotalWithTax(netAmount: number, cfg: TaxRateConfig): number` para que sume ambas tasas: `Math.round(netAmount * (1 + cfg.baseRate + cfg.surchargeRate) * 100) / 100`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.calculateTotalWithTax(100, { baseRate: 0.21, surchargeRate: 0.04 }) === 125 },
          { id: 'P2', passed: m.calculateTotalWithTax(200, { baseRate: 0.1, surchargeRate: 0.05 }) === 230 }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.calculateTotalWithTax(50, { baseRate: 0, surchargeRate: 0.1 }) === 55 }]; }`,
      },
      {
        id: 'canary_m02_quota',
        contractFile: 'quota-contract.ts',
        contractCode: `export interface QuotaPolicy {\n  maxTokens: number;\n  reservedTokens: number;\n}\n`,
        serviceFile: 'quota-guard.ts',
        buggyServiceCode: `import { QuotaPolicy } from './quota-contract';\nexport function canAllocatePrompt(promptTokens: number, policy: QuotaPolicy): boolean {\n  // BUG: olvida descontar reservedTokens de maxTokens\n  return promptTokens <= policy.maxTokens;\n}\n`,
        fn: 'canAllocatePrompt',
        objective:
          'En `quota-guard.ts` (que importa `QuotaPolicy` desde `./quota-contract`), corrige `export function canAllocatePrompt(promptTokens: number, policy: QuotaPolicy): boolean` para que retorne `promptTokens >= 0 && promptTokens <= (policy.maxTokens - policy.reservedTokens)`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.canAllocatePrompt(5000, { maxTokens: 6144, reservedTokens: 1024 }) === true },
          { id: 'P2', passed: m.canAllocatePrompt(5500, { maxTokens: 6144, reservedTokens: 1024 }) === false }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.canAllocatePrompt(5120, { maxTokens: 6144, reservedTokens: 1024 }) === true }]; }`,
      },
      {
        id: 'canary_m03_cache',
        contractFile: 'cache-contract.ts',
        contractCode: `export interface CacheDescriptor {\n  namespace: string;\n  version: number;\n}\n`,
        serviceFile: 'cache-key-builder.ts',
        buggyServiceCode: `import { CacheDescriptor } from './cache-contract';\nexport function buildCacheKey(desc: CacheDescriptor, itemKey: string): string {\n  // BUG: omite la versión v{version}\n  return desc.namespace.trim().toLowerCase() + ':' + itemKey.trim();\n}\n`,
        fn: 'buildCacheKey',
        objective:
          'En `cache-key-builder.ts` (que importa `CacheDescriptor` desde `./cache-contract`), corrige `export function buildCacheKey(desc: CacheDescriptor, itemKey: string): string` para que retorne `desc.namespace.trim().toLowerCase() + ":v" + String(desc.version) + ":" + itemKey.trim()`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.buildCacheKey({ namespace: 'RAG', version: 2 }, 'doc_10') === 'rag:v2:doc_10' }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.buildCacheKey({ namespace: '  LLM ', version: 1 }, 'slot_0') === 'llm:v1:slot_0' }]; }`,
      },
      {
        id: 'canary_m04_route',
        contractFile: 'route-contract.ts',
        contractCode: `export interface RouteRule {\n  prefix: string;\n  requiresAuth: boolean;\n}\n`,
        serviceFile: 'route-evaluator.ts',
        buggyServiceCode: `import { RouteRule } from './route-contract';\nexport function isRequestAllowed(pathStr: string, hasToken: boolean, rule: RouteRule): boolean {\n  // BUG: permite acceso aunque requiresAuth sea true y hasToken sea false\n  return pathStr.startsWith(rule.prefix);\n}\n`,
        fn: 'isRequestAllowed',
        objective:
          'En `route-evaluator.ts` (que importa `RouteRule` desde `./route-contract`), corrige `export function isRequestAllowed(pathStr: string, hasToken: boolean, rule: RouteRule): boolean` para que retorne `pathStr.startsWith(rule.prefix) && (!rule.requiresAuth || hasToken)`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.isRequestAllowed('/jarbees/engineering/mission', false, { prefix: '/jarbees/engineering', requiresAuth: true }) === false },
          { id: 'P2', passed: m.isRequestAllowed('/jarbees/engineering/mission', true, { prefix: '/jarbees/engineering', requiresAuth: true }) === true }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.isRequestAllowed('/jarbees/inference/status', false, { prefix: '/jarbees/inference', requiresAuth: false }) === true }]; }`,
      },
      {
        id: 'canary_m05_metrics',
        contractFile: 'metric-contract.ts',
        contractCode: `export interface LatencySample {\n  durationMs: number;\n  weight: number;\n}\n`,
        serviceFile: 'metric-aggregator.ts',
        buggyServiceCode: `import { LatencySample } from './metric-contract';\nexport function computeWeightedLatency(samples: LatencySample[]): number {\n  // BUG: divide por samples.length en lugar de la suma de pesos\n  if (!samples || samples.length === 0) return 0;\n  const sum = samples.reduce((acc, s) => acc + s.durationMs * s.weight, 0);\n  return Math.round(sum / samples.length);\n}\n`,
        fn: 'computeWeightedLatency',
        objective:
          'En `metric-aggregator.ts` (que importa `LatencySample` desde `./metric-contract`), corrige `export function computeWeightedLatency(samples: LatencySample[]): number` para que divida `sum` por `totalWeight = samples.reduce((acc, s) => acc + s.weight, 0)` (retornando `0` si `totalWeight <= 0`), redondeado con `Math.round`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.computeWeightedLatency([{ durationMs: 100, weight: 1 }, { durationMs: 200, weight: 3 }]) === 175 },
          { id: 'P2', passed: m.computeWeightedLatency([]) === 0 }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.computeWeightedLatency([{ durationMs: 50, weight: 2 }, { durationMs: 150, weight: 2 }]) === 100 }]; }`,
      },
    ];

    for (const spec of multiSpecs) {
      const mId = registerMission(spec.id);
      const ws = createWorkspace(spec.id);

      fs.writeFileSync(path.join(ws, spec.contractFile), spec.contractCode, 'utf8');
      fs.writeFileSync(
        path.join(ws, spec.serviceFile),
        spec.buggyServiceCode,
        'utf8',
      );

      const res = await controller.executeEngineeringMission({
        missionId: mId,
        objective: spec.objective,
        workspaceDir: ws,
        allowedFiles: [spec.contractFile, spec.serviceFile],
        entryFile: spec.serviceFile,
        staticOptions: { requiredExports: [spec.fn] },
        publicTestsSource: spec.pub,
        hiddenTestsSource: spec.hid,
        maxRepairs: 2,
      });

      expect(res.success).toBe(true);
      const record = res.managedRecord!;
      expect(record.status).toBe('completed');
      expect(record.budgetUsage.repairsUsed).toBeGreaterThanOrEqual(1);
      expect(record.llmCallsHistory.length).toBeGreaterThanOrEqual(1);

      const repairCall = record.llmCallsHistory[0];
      expect(repairCall.provider).toBe('llamacpp');
      expect(repairCall.httpStatus).toBe(200);
      expect(repairCall.promptTokens).toBeGreaterThan(20);
      expect(repairCall.completionTokens).toBeGreaterThan(10);

      canaryAuditLog.push({
        canaryCategory: '2_MULTICOMPONENT_MODIFICATION',
        missionId: mId,
        passed: res.success,
        status: record.status,
        filesInvolved: [spec.contractFile, spec.serviceFile],
        totalAttempts: record.verificationReport?.totalAttempts,
        repairsUsed: record.budgetUsage.repairsUsed,
        bestCheckpointId: record.bestCheckpointId,
        llmCalls: record.llmCallsHistory,
        gpuTelemetry: record.gpuTelemetry,
        durationMs: record.budgetUsage.durationMs,
      });
    }
  });

  // ── BLOQUE 3: 3 Reparaciones con Regresiones (Rollback Real al Mejor Checkpoint + Reparación Real en llama.cpp) ──
  it('Bloque 3 (13/18): Ejecuta 3 misiones con regresión en el Intento #1, verifica Best-Checkpoint Rollback físico y reparación final con Qwen2.5-Coder-14B', async () => {
    const regressionSpecs = [
      {
        id: 'canary_r01_discount_rollback',
        file: 'discount.ts',
        fn: 'applyTierDiscount',
        initialPartial: `export function applyTierDiscount(price: number, tier: 'BRONZE' | 'SILVER' | 'GOLD'): number {\n  if (tier === 'BRONZE') return price * 0.95;\n  if (tier === 'SILVER') return price * 0.9;\n  // Falta GOLD (0.8)\n  return price;\n}\n`,
        regressivePatch: `export function applyTierDiscount(price: number, tier: 'BRONZE' | 'SILVER' | 'GOLD'): number {\n  return 0;\n}\n`,
        objective:
          'Implementa `export function applyTierDiscount(price: number, tier: "BRONZE" | "SILVER" | "GOLD"): number` que retorne `price * 0.95` para BRONZE, `price * 0.9` para SILVER y `price * 0.8` para GOLD.',
        pub: `async function runTests(m) { return [
          { id: 'P1_bronze', passed: m.applyTierDiscount(100, 'BRONZE') === 95 },
          { id: 'P2_silver', passed: m.applyTierDiscount(100, 'SILVER') === 90 },
          { id: 'P3_gold', passed: m.applyTierDiscount(100, 'GOLD') === 80 }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.applyTierDiscount(200, 'GOLD') === 160 }]; }`,
      },
      {
        id: 'canary_r02_stock_rollback',
        file: 'stock.ts',
        fn: 'normalizeStockDelta',
        initialPartial: `export function normalizeStockDelta(current: number, delta: number): number {\n  const next = current + delta;\n  // Falta impedir que baje de 0\n  return next;\n}\n`,
        regressivePatch: `export function normalizeStockDelta(current: number, delta: number): number {\n  return -999;\n}\n`,
        objective:
          'Implementa `export function normalizeStockDelta(current: number, delta: number): number` que retorne `Math.max(0, current + delta)`.',
        pub: `async function runTests(m) { return [
          { id: 'P1_add', passed: m.normalizeStockDelta(10, 5) === 15 },
          { id: 'P2_sub_valid', passed: m.normalizeStockDelta(10, -3) === 7 },
          { id: 'P3_floor_zero', passed: m.normalizeStockDelta(5, -20) === 0 }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.normalizeStockDelta(0, -1) === 0 }]; }`,
      },
      {
        id: 'canary_r03_port_rollback',
        file: 'port-validator.ts',
        fn: 'isValidServerPort',
        initialPartial: `export function isValidServerPort(port: number): boolean {\n  return Number.isInteger(port) && port >= 1024;\n}\n`,
        regressivePatch: `export function isValidServerPort(port: number): boolean {\n  return false;\n}\n`,
        objective:
          'Implementa `export function isValidServerPort(port: number): boolean` que retorne `Number.isInteger(port) && port >= 1024 && port <= 65535`.',
        pub: `async function runTests(m) { return [
          { id: 'P1_valid_8097', passed: m.isValidServerPort(8097) === true },
          { id: 'P2_reject_privileged', passed: m.isValidServerPort(80) === false },
          { id: 'P3_reject_above_65535', passed: m.isValidServerPort(70000) === false }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.isValidServerPort(65535) === true && m.isValidServerPort(1024) === true }]; }`,
      },
    ];

    for (const spec of regressionSpecs) {
      const mId = registerMission(spec.id);
      const ws = createWorkspace(spec.id);
      fs.writeFileSync(path.join(ws, spec.file), spec.initialPartial, 'utf8');

      // En el intento #1 inyectamos una regresión para forzar el Best-Checkpoint Rollback,
      // y en el intento #2 delegamos la reparación al servidor real llama-server.exe (Qwen2.5-Coder-14B).
      let callIdx = 0;
      const hybridRegressionProvider: ILLMProvider = {
        getProviderName: () => 'llamacpp',
        getDefaultModel: () => 'qwen2.5-coder:14b',
        embed: (t) => llamaCppProvider.embed(t),
        generate: async (opts) => {
          callIdx++;
          if (callIdx === 1) {
            return {
              content: `\`\`\`typescript\n${spec.regressivePatch}\n\`\`\``,
              model: 'qwen2.5-coder:14b',
              provider: 'llamacpp-regression-injector',
              requestId: `reg_inject_${spec.id}`,
              httpStatus: 200,
              endpointUrl: 'internal://regression-injector',
              promptTokens: 50,
              completionTokens: 20,
              tokensUsed: 70,
              latencyMs: 5,
            };
          }
          return gateway.generate(opts);
        },
      };

      const res = await controller.executeEngineeringMission({
        missionId: mId,
        objective: spec.objective,
        workspaceDir: ws,
        allowedFiles: [spec.file],
        entryFile: spec.file,
        staticOptions: { requiredExports: [spec.fn] },
        publicTestsSource: spec.pub,
        hiddenTestsSource: spec.hid,
        maxRepairs: 2,
        llmProviderOverride: hybridRegressionProvider,
      });

      expect(res.success).toBe(true);
      const record = res.managedRecord!;
      expect(record.rollbacksCount).toBe(1);
      expect(record.bestAttemptIndex).toBe(2);
      expect([
        'ROLLBACK_SCORE_REGRESSION',
        'ROLLBACK_LATERAL_REGRESSION',
      ]).toContain(record.attemptsHistory[1].decision);
      expect(record.attemptsHistory[2].decision).toBe('ACCEPT_NEW_BEST');

      // Verificar que el Intento #2 fue ejecutado mediante inferencia HTTP real en llama-server.exe
      const realRepairCall = record.llmCallsHistory[1];
      expect(realRepairCall.provider).toBe('llamacpp');
      expect(realRepairCall.httpStatus).toBe(200);
      expect(realRepairCall.endpointUrl).toContain('/v1/chat/completions');
      expect(realRepairCall.promptTokens).toBeGreaterThan(50);

      canaryAuditLog.push({
        canaryCategory: '3_REGRESSION_AND_ROLLBACK',
        missionId: mId,
        passed: res.success,
        rollbacksCount: record.rollbacksCount,
        attempt1Decision: record.attemptsHistory[1].decision,
        attempt2Decision: record.attemptsHistory[2].decision,
        bestCheckpointId: record.bestCheckpointId,
        llmCalls: record.llmCallsHistory,
        gpuTelemetry: record.gpuTelemetry,
        durationMs: record.budgetUsage.durationMs,
      });
    }
  });

  // ── BLOQUE 4: 3 Interrupciones de Inferencia (Failover Pre-Token, Bloqueo Mid-Stream y Reinicio de Proceso) ──
  it('Bloque 4 (16/18): Ejecuta 3 escenarios de interrupción de inferencia (failover pre-token, bloqueo mid-stream y reinicio real de llama-server.exe)', async () => {
    // 14/18: Interrupción 1 — Fallo pre-token conmuta a fallback sin duplicar
    const prevFailover = (await gateway.getHealthStatus()).failoverCount;
    const origGen = llamaCppProvider.generate.bind(llamaCppProvider);
    jest
      .spyOn(llamaCppProvider, 'generate')
      .mockRejectedValueOnce(new Error('ECONNREFUSED pre-token drop'));

    const preTokenTokens: string[] = [];
    const fallbackRes = await gateway.generate({
      model: 'qwen2.5-coder:14b',
      stream: true,
      onToken: (t) => preTokenTokens.push(t),
      messages: [{ role: 'user', content: ' Test failover ' }],
    });
    (llamaCppProvider.generate as jest.Mock).mockRestore?.();
    llamaCppProvider.generate = origGen;

    const afterFailover = (await gateway.getHealthStatus()).failoverCount;
    expect(fallbackRes.provider).toBe('ollama');
    expect(afterFailover).toBe(prevFailover + 1);

    canaryAuditLog.push({
      canaryCategory: '4_INFERENCE_INTERRUPTION',
      missionId: 'canary_i01_pretoken_failover',
      passed: true,
      providerUsed: fallbackRes.provider,
      failoverIncremented: afterFailover - prevFailover === 1,
      duplicatedTokens: false,
    });

    // 15/18: Interrupción 2 — Caída mid-stream bloquea el failover para impedir duplicación
    const fallbackCallsBeforeMid = fallbackProvider.calls;
    jest
      .spyOn(llamaCppProvider, 'generate')
      .mockImplementationOnce(async (opts) => {
        opts.onToken?.('export const PARTIAL = ');
        throw new Error('socket hang up mid-stream');
      });

    await expect(
      gateway.generate({
        model: 'qwen2.5-coder:14b',
        stream: true,
        onToken: () => {},
        messages: [{ role: 'user', content: 'Test mid-stream' }],
      }),
    ).rejects.toThrow(/MID_STREAM_FAILURE|mid-stream/i);

    (llamaCppProvider.generate as jest.Mock).mockRestore?.();
    llamaCppProvider.generate = origGen;
    expect(fallbackProvider.calls).toBe(fallbackCallsBeforeMid);

    canaryAuditLog.push({
      canaryCategory: '4_INFERENCE_INTERRUPTION',
      missionId: 'canary_i02_midstream_duplication_block',
      passed: true,
      fallbackInvokedOnMidStream: false,
      duplicatedTokens: false,
    });

    // 16/18: Interrupción 3 — Reinicio real de llama-server.exe y recuperación completa para misión real
    await supervisor.stopServer();
    expect(await llamaCppProvider.isAvailable()).toBe(false);

    await supervisor.startServer();
    const readyDeadline = Date.now() + 45000;
    while (Date.now() < readyDeadline) {
      const h = await llamaCppProvider.getDetailedHealth();
      if (h.modelReady) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    const postRestartRes = await gateway.generate({
      model: 'qwen2.5-coder:14b',
      maxTokens: 64,
      messages: [
        { role: 'system', content: 'Responde solo con código TypeScript.' },
        { role: 'user', content: 'export const RECOVERED = true;' },
      ],
    });
    expect(postRestartRes.provider).toBe('llamacpp');
    expect(postRestartRes.httpStatus).toBe(200);
    expect(postRestartRes.content).toContain('RECOVERED');

    canaryAuditLog.push({
      canaryCategory: '4_INFERENCE_INTERRUPTION',
      missionId: 'canary_i03_real_process_restart_and_recovery',
      passed: true,
      requestId: postRestartRes.requestId,
      httpStatus: postRestartRes.httpStatus,
      promptTokens: postRestartRes.promptTokens,
      completionTokens: postRestartRes.completionTokens,
      tokensPerSecond: postRestartRes.tokensPerSecond,
    });
  });

  // ── BLOQUE 5: 2 Misiones Interrumpidas (Persistencia en Disco y Reanudación Idempotente) ──
  it('Bloque 5 (18/18): Ejecuta 2 misiones interrumpidas tras el Checkpoint #0 y las reanuda desde disco con Qwen2.5-Coder-14B', async () => {
    const resumeSpecs = [
      {
        id: 'canary_p01_resume_checksum',
        file: 'checksum.ts',
        fn: 'computeAsciiSum',
        buggy: `export function computeAsciiSum(s: string): number {\n  return 0;\n}\n`,
        objective:
          'Repara `export function computeAsciiSum(s: string): number` para que retorne la suma de `s.charCodeAt(i)` de todos los caracteres de `s`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.computeAsciiSum('AB') === 131 },
          { id: 'P2', passed: m.computeAsciiSum('') === 0 }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.computeAsciiSum('A') === 65 }]; }`,
      },
      {
        id: 'canary_p02_resume_temp',
        file: 'temperature-alert.ts',
        fn: 'classifyGpuTemp',
        buggy: `export function classifyGpuTemp(tempC: number): 'COOL' | 'WARM' | 'HOT' {\n  return 'COOL';\n}\n`,
        objective:
          'Repara `export function classifyGpuTemp(tempC: number): "COOL" | "WARM" | "HOT"` para que retorne `"HOT"` si `tempC >= 80`, `"WARM"` si `tempC >= 65` y `"COOL"` si `tempC < 65`.',
        pub: `async function runTests(m) { return [
          { id: 'P1', passed: m.classifyGpuTemp(55) === 'COOL' },
          { id: 'P2', passed: m.classifyGpuTemp(70) === 'WARM' },
          { id: 'P3', passed: m.classifyGpuTemp(85) === 'HOT' }
        ]; }`,
        hid: `async function runTests(m) { return [{ id: 'H1', passed: m.classifyGpuTemp(80) === 'HOT' && m.classifyGpuTemp(65) === 'WARM' }]; }`,
      },
    ];

    for (const spec of resumeSpecs) {
      const mId = registerMission(spec.id);
      const ws = createWorkspace(spec.id);
      fs.writeFileSync(path.join(ws, spec.file), spec.buggy, 'utf8');

      // Fase 1: Se interrumpe tras persistir el Checkpoint #0
      const interrupted = await missionManager.executeManagedMission({
        missionId: mId,
        objective: spec.objective,
        workspaceDir: ws,
        allowedFiles: [spec.file],
        entryFile: spec.file,
        staticOptions: { requiredExports: [spec.fn] },
        publicTestsSource: spec.pub,
        hiddenTestsSource: spec.hid,
        maxRepairs: 2,
        simulateInterruptAfterAttempt: 0,
      });

      expect(interrupted.status).toBe('verifying');
      expect(interrupted.verificationReport?.finalPhase).toBe(
        'INTERRUPTED_WAITING_RECOVERY',
      );

      // Fase 2: Reanudación desde disco con inferencia HTTP real en llama-server.exe
      const resumed = await missionManager.resumeManagedMission(mId);
      expect(resumed.status).toBe('completed');
      expect(resumed.verificationReport?.resumedFromDisk).toBe(true);
      expect(resumed.verificationReport?.success).toBe(true);
      expect(resumed.llmCallsHistory.length).toBeGreaterThanOrEqual(1);
      expect(resumed.llmCallsHistory[0].httpStatus).toBe(200);

      canaryAuditLog.push({
        canaryCategory: '5_PERSISTENCE_AND_RESUME',
        missionId: mId,
        passed: resumed.status === 'completed',
        resumedFromDisk: resumed.verificationReport?.resumedFromDisk,
        bestCheckpointId: resumed.bestCheckpointId,
        llmCalls: resumed.llmCallsHistory,
        gpuTelemetry: resumed.gpuTelemetry,
      });
    }
  });

  // ── BLOQUE 6: Controles de Seguridad, Autoprotección del VerificationHarness, Aprobación Humana y Restauración Manual ──
  it('Bloque 6: Verifica autoprotección del VerificationHarness, flujo de aprobación humana (HITL) y restauración manual de checkpoints', async () => {
    // 1. Intentar modificar el propio VerificationHarness sin token HITL debe ser bloqueado
    await expect(
      controller.executeEngineeringMission({
        missionId: 'blocked_self_modify_harness',
        objective: 'Modificar VerificationHarnessService sin permiso',
        workspaceDir: path.resolve(process.cwd(), 'src/jarvis/verification'),
        allowedFiles: ['verification-harness.service.ts'],
        entryFile: 'verification-harness.service.ts',
        publicTestsSource: 'async function runTests() { return []; }',
      }),
    ).rejects.toThrow(/autoprotección/);

    // 2. Flujo con requireHumanApprovalBeforeIntegrate: retiene cambios hasta aprobación HITL y permite restaurar manualmente el Checkpoint #0
    const approvalMissionId = registerMission('canary_hitl_approval_flow');
    const ws = createWorkspace('hitl');
    const initialCode = `export function getSystemMode(): string {\n  return 'STAGE_1_OPT_IN';\n}\n`;
    fs.writeFileSync(path.join(ws, 'mode.ts'), initialCode, 'utf8');

    const pendingRecord = await missionManager.executeManagedMission({
      missionId: approvalMissionId,
      objective:
        'Actualiza `export function getSystemMode(): string` para que retorne `"STAGE_2_CANARY"`.',
      workspaceDir: ws,
      allowedFiles: ['mode.ts'],
      entryFile: 'mode.ts',
      requireHumanApprovalBeforeIntegrate: true,
      publicTestsSource: `async function runTests(m) { return [{ id: 'P1', passed: m.getSystemMode() === 'STAGE_2_CANARY' }]; }`,
    });

    expect(pendingRecord.status).toBe('awaiting_human_approval');
    expect(pendingRecord.integratedToWorkspace).toBe(false);
    // El archivo en workspaceDir todavía conserva STAGE_1_OPT_IN porque espera aprobación humana
    expect(fs.readFileSync(path.join(ws, 'mode.ts'), 'utf8')).toContain(
      'STAGE_1_OPT_IN',
    );

    // Emitimos token HITL criptográfico y aprobamos la integración
    const challenge = actionGatekeeper.createChallenge(
      'ENGINEERING_APPROVE_MISSION',
      approvalMissionId,
    );
    const approved = controller.approveEngineeringMission(
      approvalMissionId,
      challenge.token,
    );
    expect(approved.mission.status).toBe('completed');
    expect(approved.mission.integratedToWorkspace).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'mode.ts'), 'utf8')).toContain(
      'STAGE_2_CANARY',
    );

    // Y verificamos la restauración manual al Checkpoint #0
    const manualRestore = controller.restoreEngineeringMissionCheckpoint(
      approvalMissionId,
      { attemptIndex: 0 },
    );
    expect(manualRestore.success).toBe(true);
    expect(fs.readFileSync(path.join(ws, 'mode.ts'), 'utf8')).toContain(
      'STAGE_1_OPT_IN',
    );
  });
});
