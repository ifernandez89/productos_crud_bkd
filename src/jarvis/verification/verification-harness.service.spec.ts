import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
} from '../llm/llm-provider.interface';
import { ExecutionEngine, ExecutionPlan } from '../planner/execution-engine.service';
import { ActionExecutionGateService } from '../security/action-execution-gate.service';
import { AuditService } from '../security/audit.service';
import {
  CheckpointManagerService,
  CorruptedCheckpointException,
} from './checkpoint-manager.service';
import { IsolatedTestRunnerService } from './isolated-test-runner.service';
import { RepairControllerService } from './repair-controller.service';
import { StaticPreValidatorService } from './static-pre-validator.service';
import { VerificationHarnessService } from './verification-harness.service';

describe('VerificationHarnessService + Best-Checkpoint Rollback (12 Mandatory Tests)', () => {
  let staticValidator: StaticPreValidatorService;
  let testRunner: IsolatedTestRunnerService;
  let checkpointManager: CheckpointManagerService;
  let repairController: RepairControllerService;
  let harness: VerificationHarnessService;

  const createdMissionIds: string[] = [];
  const createdTempDirs: string[] = [];

  const registerMission = (id: string): string => {
    createdMissionIds.push(id);
    return id;
  };

  const createTempWorkspace = (prefix: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `jarbees-ws-${prefix}-`));
    createdTempDirs.push(dir);
    return dir;
  };

  const createSequenceMockLlm = (responses: string[]): ILLMProvider & {
    calls: LLMGenerateOptions[];
  } => {
    let idx = 0;
    const calls: LLMGenerateOptions[] = [];
    return {
      calls,
      getProviderName: () => 'mock-gateway',
      getDefaultModel: () => 'qwen2.5-coder:14b',
      embed: async () => ({
        embedding: [0.1, 0.2],
        model: 'bge-m3',
        provider: 'mock',
      }),
      generate: async (
        options: LLMGenerateOptions,
      ): Promise<LLMGenerateResponse> => {
        calls.push(options);
        const content =
          responses[Math.min(idx, responses.length - 1)] ??
          '```typescript\nexport function calc(a: number, b: number) { return a + b; }\n```';
        idx++;
        return {
          content,
          model: options.model || 'qwen2.5-coder:14b',
          provider: 'mock-gateway',
          latencyMs: 12,
        };
      },
    };
  };

  const mathPublicTests = `
async function runTests(mod) {
  const results = [];
  try {
    assert.strictEqual(mod.calculateScore(10, 5, false), 15);
    results.push({ id: 'P1_add_base', passed: true });
  } catch (e) {
    results.push({ id: 'P1_add_base', passed: false, error: e.message });
  }
  try {
    assert.strictEqual(mod.calculateScore(10, 5, true), 30);
    results.push({ id: 'P2_bonus_multiplier', passed: true });
  } catch (e) {
    results.push({ id: 'P2_bonus_multiplier', passed: false, error: e.message });
  }
  try {
    assert.strictEqual(mod.calculateScore(-10, 5, false), 0);
    results.push({ id: 'P3_clamp_negative_to_zero', passed: true });
  } catch (e) {
    results.push({ id: 'P3_clamp_negative_to_zero', passed: false, error: e.message });
  }
  return results;
}
`;

  const mathHiddenTests = `
async function runTests(mod) {
  const results = [];
  try {
    assert.strictEqual(mod.calculateScore(0, 0, true), 0);
    results.push({ id: 'H1_zero_boundary', passed: true });
  } catch (e) {
    results.push({ id: 'H1_zero_boundary', passed: false, error: e.message });
  }
  try {
    assert.strictEqual(mod.calculateScore(-50, 10, true), 0);
    results.push({ id: 'H2_negative_with_bonus_clamped', passed: true });
  } catch (e) {
    results.push({ id: 'H2_negative_with_bonus_clamped', passed: false, error: e.message });
  }
  return results;
}
`;

  beforeEach(() => {
    staticValidator = new StaticPreValidatorService();
    testRunner = new IsolatedTestRunnerService();
    checkpointManager = new CheckpointManagerService();
    repairController = new RepairControllerService();
    harness = new VerificationHarnessService(
      staticValidator,
      testRunner,
      checkpointManager,
      repairController,
    );
  });

  afterEach(() => {
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
  });

  // ── 1. Reparación exitosa ──────────────────────────────────────────────────
  it('1. Reparación exitosa: diagnostica el fallo en el intento 0, repara en el intento 1 y supera pruebas públicas y ocultas', async () => {
    const missionId = registerMission('test_01_successful_repair');

    // Intento 0 aprueba P1 y P2 pero olvida el clamp de negativos (falla P3)
    const initialCode = `
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = base + extra;
  return doubleBonus ? raw * 2 : raw;
}
`;
    // Intento 1 (reparación LLM) corrige P3 manteniendo P1 y P2
    const repairedCode = `\`\`\`typescript
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = Math.max(0, base + extra);
  return doubleBonus ? raw * 2 : raw;
}
\`\`\``;

    const mockLlm = createSequenceMockLlm([repairedCode]);

    const report = await harness.runMission({
      missionId,
      objective: 'Implementar calculateScore con multiplicador y piso en 0',
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': initialCode },
      publicTestsSource: mathPublicTests,
      hiddenTestsSource: mathHiddenTests,
      maxRepairs: 2,
      llmProviderOverride: mockLlm,
    });

    expect(report.success).toBe(true);
    expect(report.finalPhase).toBe('COMPLETED');
    expect(report.totalAttempts).toBe(2);
    expect(report.repairsAttempted).toBe(1);
    expect(report.rollbacksCount).toBe(0);
    expect(report.bestAttemptIndex).toBe(1);
    expect(report.publicTestsSummary.passed).toBe(3);
    expect(report.publicTestsSummary.sha256Verified).toBe(true);
    expect(report.hiddenTestsSummary?.passed).toBe(2);
    expect(report.hiddenTestsSummary?.sha256Verified).toBe(true);
    expect(report.attemptsHistory[1].decision).toBe('ACCEPT_NEW_BEST');
    expect(report.attemptsHistory[1].diffFromBest).toContain('Math.max');
  });

  // ── 2. Reparación que introduce regresiones ────────────────────────────────
  it('2. Reparación que introduce regresiones: detecta cuando un parche rompe pruebas previamente aprobadas (caso T10)', async () => {
    const missionId = registerMission('test_02_regression_detection');

    // Intento 0: aprueba P1 y P2 (2/3), falla P3
    const initialCode = `
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = base + extra;
  return doubleBonus ? raw * 2 : raw;
}
`;
    // Intento 1: arregla P3 (devuelve 0) pero rompe P1 y P2 devolviendo siempre 0 (1/3)
    const regressedCode = `\`\`\`typescript
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  return 0;
}
\`\`\``;

    const mockLlm = createSequenceMockLlm([regressedCode]);

    const report = await harness.runMission({
      missionId,
      objective: 'Evitar regresiones en calculateScore',
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': initialCode },
      publicTestsSource: mathPublicTests,
      maxRepairs: 1,
      llmProviderOverride: mockLlm,
    });

    expect(report.rollbacksCount).toBe(1);
    expect(report.bestAttemptIndex).toBe(0);
    expect(report.attemptsHistory[1].decision).toBe(
      'ROLLBACK_SCORE_REGRESSION',
    );
    expect(report.attemptsHistory[1].regressions).toEqual([
      'P1_add_base',
      'P2_bonus_multiplier',
    ]);
    expect(report.finalFiles['score.ts']).toContain('doubleBonus ? raw * 2 : raw');
  });

  // ── 3. Rollback correcto en disco y confinamiento de archivos ──────────────
  it('3. Rollback correcto: restaura físicamente el archivo en disco al Best Checkpoint sin tocar archivos externos a la misión', async () => {
    const missionId = registerMission('test_03_real_disk_rollback');
    const workspaceDir = createTempWorkspace('rollback');

    const externalFilePath = path.join(workspaceDir, 'external-production.json');
    const externalOriginalContent = JSON.stringify({ env: 'production', safe: true });
    fs.writeFileSync(externalFilePath, externalOriginalContent, 'utf8');

    const initialGoodCode = `export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = base + extra;
  return doubleBonus ? raw * 2 : raw;
}`;
    const brokenPatch1 = `\`\`\`typescript
export function calculateScore(): number {
  throw new Error('Broken patch 1');
}
\`\`\``;
    const brokenPatch2 = `\`\`\`typescript
export function calculateScore(): number {
  return -999;
}
\`\`\``;

    const mockLlm = createSequenceMockLlm([brokenPatch1, brokenPatch2]);

    const report = await harness.runMission({
      missionId,
      objective: 'Verificar restauración física en disco',
      workspaceDir,
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': initialGoodCode },
      publicTestsSource: mathPublicTests,
      maxRepairs: 2,
      llmProviderOverride: mockLlm,
    });

    const diskCodeAfterRun = fs.readFileSync(
      path.join(workspaceDir, 'score.ts'),
      'utf8',
    );
    const diskExternalAfterRun = fs.readFileSync(externalFilePath, 'utf8');

    expect(report.rollbacksCount).toBe(2);
    expect(report.bestAttemptIndex).toBe(0);
    expect(diskCodeAfterRun).toBe(initialGoodCode);
    expect(
      checkpointManager.computeWorkingTreeHash({ 'score.ts': diskCodeAfterRun }),
    ).toBe(report.finalWorkingTreeHash);
    // El archivo ajeno a la misión permanece 100 % intacto
    expect(diskExternalAfterRun).toBe(externalOriginalContent);
  });

  // ── 4. Error de compilación TypeScript y alcance de bloque ─────────────────
  it('4. Error de compilación y alcance estático: detecta error sintáctico/block-scope antes de correr tests y lo repara', async () => {
    const missionId = registerMission('test_04_compile_and_scope_error');

    // Intento 0 tiene error de sintaxis TS y redeclaración
    const brokenSyntaxCode = `
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = base + extra;
  const raw = 99;
  return doubleBonus ? raw * 2 : ;
}
`;
    const validFixedCode = `\`\`\`typescript
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = Math.max(0, base + extra);
  return doubleBonus ? raw * 2 : raw;
}
\`\`\``;

    const mockLlm = createSequenceMockLlm([validFixedCode]);

    const report = await harness.runMission({
      missionId,
      objective: 'Reparar error de compilación TypeScript',
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': brokenSyntaxCode },
      publicTestsSource: mathPublicTests,
      maxRepairs: 1,
      llmProviderOverride: mockLlm,
    });

    expect(report.attemptsHistory[0].staticPassed).toBe(false);
    expect(
      report.attemptsHistory[0].diagnostics.some(
        (d) => d.category === 'SYNTAX_OR_COMPILE_ERROR',
      ),
    ).toBe(true);
    expect(report.success).toBe(true);
    expect(report.bestAttemptIndex).toBe(1);
    expect(report.publicTestsSummary.passed).toBe(3);
  });

  // ── 5. Error asíncrono no capturado ────────────────────────────────────────
  it('5. Error asíncrono no capturado: atrapa unhandledRejection en subproceso aislado sin contaminar Jest y permite repararlo', async () => {
    const missionId = registerMission('test_05_unhandled_async_error');

    // Intento 0 dispara una promesa rechazada huérfana sin catch
    const leakyAsyncCode = `
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  Promise.reject(new Error('Fatal async background leak'));
  const raw = Math.max(0, base + extra);
  return doubleBonus ? raw * 2 : raw;
}
`;
    const cleanCode = `\`\`\`typescript
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = Math.max(0, base + extra);
  return doubleBonus ? raw * 2 : raw;
}
\`\`\``;

    const mockLlm = createSequenceMockLlm([cleanCode]);

    const report = await harness.runMission({
      missionId,
      objective: 'Capturar y reparar unhandledRejection asíncrono',
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': leakyAsyncCode },
      publicTestsSource: mathPublicTests,
      maxRepairs: 1,
      llmProviderOverride: mockLlm,
    });

    expect(
      report.attemptsHistory[0].diagnostics.some(
        (d) => d.category === 'ASYNC_UNHANDLED_ERROR',
      ),
    ).toBe(true);
    expect(report.success).toBe(true);
    expect(report.bestAttemptIndex).toBe(1);
  });

  // ── 6. Timeout de ejecución ────────────────────────────────────────────────
  it('6. Timeout: mata limpiamente el subproceso cuando un parche entra en bucle infinito y hace rollback al Best Checkpoint', async () => {
    const missionId = registerMission('test_06_execution_timeout');

    const initialCode = `
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = base + extra;
  return doubleBonus ? raw * 2 : raw;
}
`;
    const infiniteLoopPatch = `\`\`\`typescript
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  while (true) {}
  return base + extra;
}
\`\`\``;

    const mockLlm = createSequenceMockLlm([infiniteLoopPatch]);

    const report = await harness.runMission({
      missionId,
      objective: 'Cortar bucle infinito por timeout y revertir',
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': initialCode },
      publicTestsSource: mathPublicTests,
      testTimeoutMs: 250,
      maxRepairs: 1,
      llmProviderOverride: mockLlm,
    });

    expect(
      report.attemptsHistory[1].diagnostics.some(
        (d) => d.category === 'EXECUTION_TIMEOUT',
      ),
    ).toBe(true);
    expect(report.attemptsHistory[1].decision).toBe(
      'ROLLBACK_BROKEN_BUILD_OR_RUNTIME',
    );
    expect(report.bestAttemptIndex).toBe(0);
    expect(report.rollbacksCount).toBe(1);
  });

  // ── 7. Fallo del runner ────────────────────────────────────────────────────
  it('7. Fallo del runner: sobrevive a un fallo abrupto del subproceso evaluador y preserva el Best Checkpoint', async () => {
    const missionId = registerMission('test_07_runner_crash');

    const initialCode = `
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = base + extra;
  return doubleBonus ? raw * 2 : raw;
}
`;
    const patchAttempt1 = `\`\`\`typescript
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = Math.max(0, base + extra);
  return doubleBonus ? raw * 2 : raw;
}
\`\`\``;

    const mockLlm = createSequenceMockLlm([patchAttempt1, patchAttempt1]);

    const report = await harness.runMission({
      missionId,
      objective: 'Tolerar caída del runner en intento 1 y recuperar en intento 2',
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': initialCode },
      publicTestsSource: mathPublicTests,
      maxRepairs: 2,
      simulateRunnerCrashOnAttempt: 1,
      llmProviderOverride: mockLlm,
    });

    expect(
      report.attemptsHistory[1].diagnostics.some(
        (d) => d.category === 'RUNNER_CRASH',
      ),
    ).toBe(true);
    expect(report.attemptsHistory[1].decision).toBe(
      'ROLLBACK_BROKEN_BUILD_OR_RUNTIME',
    );
    // En el intento 2 el runner funciona normalmente y acepta el Best Checkpoint
    expect(report.success).toBe(true);
    expect(report.bestAttemptIndex).toBe(2);
  });

  // ── 8. Violación de un invariante crítico (Jerarquía Nivel 1 > Nivel 3) ───
  it('8. Violación de invariante crítico: rechaza un parche con 3/3 tests aprobados si introduce eval() o lee process.env, conservando el estado seguro 2/3', async () => {
    const missionId = registerMission('test_08_security_invariant_hierarchy');

    // Estado A: 2/3 pruebas públicas aprobadas, 100% seguro
    const safePartialCode = `
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = base + extra;
  return doubleBonus ? raw * 2 : raw;
}
`;
    // Estado B: aprobaría 3/3 pruebas públicas pero introduce process.env y eval()
    const insecureFullPassCode = `\`\`\`typescript
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const secretLeak = process.env.DATABASE_URL;
  const raw = eval('Math.max(0, ' + base + ' + ' + extra + ')');
  return doubleBonus ? raw * 2 : raw;
}
\`\`\``;

    const mockLlm = createSequenceMockLlm([insecureFullPassCode]);

    const report = await harness.runMission({
      missionId,
      objective: 'Priorizar seguridad sobre cantidad de pruebas aprobadas',
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': safePartialCode },
      publicTestsSource: mathPublicTests,
      maxRepairs: 1,
      llmProviderOverride: mockLlm,
    });

    expect(report.attemptsHistory[1].decision).toBe(
      'ROLLBACK_SECURITY_VIOLATION',
    );
    expect(
      report.attemptsHistory[1].diagnostics.some(
        (d) => d.category === 'SECURITY_INVARIANT_VIOLATION',
      ),
    ).toBe(true);
    expect(report.bestAttemptIndex).toBe(0);
    expect(report.finalFiles['score.ts']).toBe(safePartialCode);
    expect(report.finalFiles['score.ts']).not.toContain('process.env');
    expect(report.finalFiles['score.ts']).not.toContain('eval(');
  });

  // ── 9. Checkpoint corrupto ─────────────────────────────────────────────────
  it('9. Checkpoint corrupto: detecta manipulación de SHA-256 en disco y recupera automáticamente el último snapshot íntegro', async () => {
    const missionId = registerMission('test_09_corrupted_checkpoint');

    const staticRes = staticValidator.validateFiles({
      'score.ts': 'export const x = 1;',
    });
    const runRes = await testRunner.runSuite({
      missionId,
      attemptIndex: 0,
      files: { 'score.ts': 'export const x = 1;' },
      entryFile: 'score.ts',
      testSuiteSource:
        'async function runTests() { return [{ id: "T1", passed: true }]; }',
    });
    const vec = repairController.computeScoreVector(staticRes, runRes, null);

    // Guardar Checkpoint #0 íntegro
    const ckpt0 = checkpointManager.createAndSaveCheckpoint({
      missionId,
      attemptIndex: 0,
      files: { 'score.ts': 'export const x = 1;' },
      allowedFiles: ['score.ts'],
      staticResult: staticRes,
      publicTestResult: runRes,
      scoreVector: vec.scoreVector,
    });
    checkpointManager.saveBestCheckpointPointer(ckpt0);

    // Corromper deliberadamente best_checkpoint.json en disco sin actualizar su hash
    const bestPath = path.join(
      checkpointManager.getMissionStorageDir(missionId),
      'best_checkpoint.json',
    );
    const tampered = JSON.parse(fs.readFileSync(bestPath, 'utf8'));
    tampered.files['score.ts'] = 'export const x = 999999; // TAMPERED';
    fs.writeFileSync(bestPath, JSON.stringify(tampered, null, 2), 'utf8');

    // Verificar que verifyCheckpointIntegrity lanza CorruptedCheckpointException
    expect(() =>
      checkpointManager.verifyCheckpointIntegrity(tampered),
    ).toThrow(CorruptedCheckpointException);

    // Verificar que loadBestOrFallbackCheckpoint detecta la corrupción y rescata checkpoint_0.json
    const recovered =
      checkpointManager.loadBestOrFallbackCheckpoint(missionId);
    expect(recovered.corruptedDetected).toBe(true);
    expect(recovered.checkpoint).not.toBeNull();
    expect(recovered.checkpoint?.checkpointId).toBe(ckpt0.checkpointId);
    expect(recovered.checkpoint?.files['score.ts']).toBe('export const x = 1;');
  });

  // ── 10. Interrupción y recuperación de una misión ──────────────────────────
  it('10. Interrupción y recuperación: reanuda idempotentemente una misión interrumpida desde el Best Checkpoint en disco', async () => {
    const missionId = registerMission('test_10_mission_interruption_recovery');

    const initialCode = `
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = base + extra;
  return doubleBonus ? raw * 2 : raw;
}
`;
    const repairedCode = `\`\`\`typescript
export function calculateScore(base: number, extra: number, doubleBonus: boolean): number {
  const raw = Math.max(0, base + extra);
  return doubleBonus ? raw * 2 : raw;
}
\`\`\``;

    const mockLlmPhase1 = createSequenceMockLlm([repairedCode]);

    // Ejecutar misión simulando una interrupción tras el intento 0
    const interruptedReport = await harness.runMission({
      missionId,
      objective: 'Misión con interrupción y reanudación',
      allowedFiles: ['score.ts'],
      entryFile: 'score.ts',
      initialFiles: { 'score.ts': initialCode },
      publicTestsSource: mathPublicTests,
      hiddenTestsSource: mathHiddenTests,
      maxRepairs: 2,
      simulateInterruptAfterAttempt: 0,
      llmProviderOverride: mockLlmPhase1,
    });

    expect(interruptedReport.finalPhase).toBe('INTERRUPTED_WAITING_RECOVERY');
    expect(interruptedReport.success).toBe(false);
    expect(interruptedReport.totalAttempts).toBe(1);
    expect(mockLlmPhase1.calls.length).toBe(0);

    // Reanudar la misión desde disco: debe continuar en el intento 1 sin repetir el intento 0
    const mockLlmResume = createSequenceMockLlm([repairedCode]);
    const resumedReport = await harness.resumeMission(missionId, mockLlmResume);

    expect(resumedReport.resumedFromDisk).toBe(true);
    expect(resumedReport.success).toBe(true);
    expect(resumedReport.finalPhase).toBe('COMPLETED');
    expect(resumedReport.totalAttempts).toBe(2);
    expect(resumedReport.bestAttemptIndex).toBe(1);
    expect(resumedReport.publicTestsSummary.passed).toBe(3);
    expect(resumedReport.hiddenTestsSummary?.passed).toBe(2);
  });

  // ── 11. Dos misiones concurrentes sin contaminación ────────────────────────
  it('11. Concurrencia: ejecuta dos misiones simultáneas en paralelo sin contaminación de archivos, checkpoints ni resultados', async () => {
    const missionA = registerMission('test_11_concurrent_A');
    const missionB = registerMission('test_11_concurrent_B');
    const wsA = createTempWorkspace('concurrentA');
    const wsB = createTempWorkspace('concurrentB');

    const llmA = createSequenceMockLlm([
      `\`\`\`typescript\nexport function opA(n: number): number { return n * 10; }\n\`\`\``,
    ]);
    const llmB = createSequenceMockLlm([
      `\`\`\`typescript\nexport function opB(s: string): string { return s.trim().toUpperCase(); }\n\`\`\``,
    ]);

    const [reportA, reportB] = await Promise.all([
      harness.runMission({
        missionId: missionA,
        objective: 'Multiplicar por 10 en misión A',
        workspaceDir: wsA,
        allowedFiles: ['moduleA.ts'],
        entryFile: 'moduleA.ts',
        initialFiles: {
          'moduleA.ts': 'export function opA(n: number): number { return n * 2; }',
        },
        publicTestsSource: `
          async function runTests(mod) {
            return [{ id: 'PA1', passed: mod.opA(3) === 30 }];
          }
        `,
        maxRepairs: 1,
        llmProviderOverride: llmA,
      }),
      harness.runMission({
        missionId: missionB,
        objective: 'Normalizar texto en misión B',
        workspaceDir: wsB,
        allowedFiles: ['moduleB.ts'],
        entryFile: 'moduleB.ts',
        initialFiles: {
          'moduleB.ts': 'export function opB(s: string): string { return s; }',
        },
        publicTestsSource: `
          async function runTests(mod) {
            return [{ id: 'PB1', passed: mod.opB('  hola ') === 'HOLA' }];
          }
        `,
        maxRepairs: 1,
        llmProviderOverride: llmB,
      }),
    ]);

    expect(reportA.success).toBe(true);
    expect(reportB.success).toBe(true);
    expect(reportA.finalWorkingTreeHash).not.toBe(reportB.finalWorkingTreeHash);
    expect(fs.existsSync(path.join(wsA, 'moduleA.ts'))).toBe(true);
    expect(fs.existsSync(path.join(wsA, 'moduleB.ts'))).toBe(false);
    expect(fs.existsSync(path.join(wsB, 'moduleB.ts'))).toBe(true);
    expect(fs.existsSync(path.join(wsB, 'moduleA.ts'))).toBe(false);
  });

  // ── 12. Integración con el proveedor de inferencia y ExecutionEngine ───────
  it('12. Integración con ExecutionEngine y ActionExecutionGateService mediante el paso verify_code y contrato ILLMProvider', async () => {
    const missionId = registerMission('test_12_execution_engine_integration');

    const mockTaskRepo = {
      updateTaskStatus: jest.fn().mockResolvedValue(undefined),
      updateStepStatus: jest.fn().mockResolvedValue(undefined),
    };
    const mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    const actionGate = new ActionExecutionGateService(mockAudit);
    const mockLlm = createSequenceMockLlm([
      `\`\`\`typescript\nexport function calculateScore(base: number, extra: number, doubleBonus: boolean): number {\n  const raw = Math.max(0, base + extra);\n  return doubleBonus ? raw * 2 : raw;\n}\n\`\`\``,
    ]);

    const engine = new ExecutionEngine(
      mockTaskRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockLlm,
      {} as any,
      actionGate,
      undefined,
      harness,
    );

    const plan: ExecutionPlan = {
      taskId: 777,
      objective: 'Reparar y verificar calculateScore desde ExecutionEngine',
      steps: [
        {
          id: 1,
          stepNumber: 1,
          description: 'Ejecutar ciclo de verificación y Best-Checkpoint Rollback',
          type: 'verify_code',
          status: 'pending',
          input: {
            verificationMission: {
              missionId,
              objective: 'Implementar calculateScore verificado',
              allowedFiles: ['score.ts'],
              entryFile: 'score.ts',
              initialFiles: {
                'score.ts':
                  'export function calculateScore(base: number, extra: number, doubleBonus: boolean): number { return base + extra; }',
              },
              publicTestsSource: mathPublicTests,
              hiddenTestsSource: mathHiddenTests,
              maxRepairs: 1,
            },
          },
        },
      ],
    };

    const execResult = await engine.execute(plan);
    expect(execResult.stepsCompleted).toBe(1);
    expect(execResult.stepsFailed).toBe(0);

    const embeddedReport = JSON.parse(plan.steps[0].output!.content);
    expect(embeddedReport.success).toBe(true);
    expect(embeddedReport.publicTestsSummary.passed).toBe(3);
    expect(embeddedReport.hiddenTestsSummary.passed).toBe(2);
  });
});

