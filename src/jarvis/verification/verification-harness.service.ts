import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { InferenceGatewayService } from '../llm/inference-gateway.service';
import { ILLMProvider, LLM_GATEWAY } from '../llm/llm-provider.interface';
import { CheckpointManagerService } from './checkpoint-manager.service';
import { IsolatedTestRunnerService } from './isolated-test-runner.service';
import { RepairControllerService } from './repair-controller.service';
import { StaticPreValidatorService } from './static-pre-validator.service';
import {
  AttemptAuditEntry,
  ImmutableCheckpoint,
  IsolatedRunResult,
  LlmCallAuditEntry,
  StructuredDiagnostic,
  VerificationMissionRequest,
  VerificationPhase,
  VerificationReport,
} from './verification-harness.types';

interface PersistedMissionState {
  missionId: string;
  objective: string;
  workspaceDir?: string;
  allowedFiles: string[];
  entryFile: string;
  publicTestsSource: string;
  publicTestsSha256: string;
  hiddenTestsSource?: string;
  hiddenTestsSha256?: string;
  maxRepairs: number;
  testTimeoutMs: number;
  maxMemoryMb: number;
  model?: string;
  phase: VerificationPhase;
  lastCompletedAttempt: number;
  repairsAttempted: number;
  rollbacksCount: number;
  bestCheckpointId: string;
  attemptsHistory: AttemptAuditEntry[];
  llmCallsHistory?: LlmCallAuditEntry[];
  lastDiagnostics: StructuredDiagnostic[];
  lastWasRolledBack: boolean;
  lastRollbackReason?: string;
  lastRegressions: string[];
  updatedAt: string;
}

@Injectable()
export class VerificationHarnessService {
  private readonly logger = new Logger(VerificationHarnessService.name);

  constructor(
    private readonly staticValidator: StaticPreValidatorService,
    private readonly testRunner: IsolatedTestRunnerService,
    private readonly checkpointManager: CheckpointManagerService,
    private readonly repairController: RepairControllerService,
    @Optional()
    @Inject(LLM_GATEWAY)
    private readonly llmGateway?: ILLMProvider,
    @Optional()
    private readonly inferenceGateway?: InferenceGatewayService,
  ) {}

  /**
   * Ejecuta una misión completa de verificación, reparación y Best-Checkpoint Rollback.
   */
  async runMission(
    request: VerificationMissionRequest,
  ): Promise<VerificationReport> {
    return this.executeCycle(request, null);
  }

  /**
   * Reanuda de forma idempotente una misión interrumpida desde el mejor checkpoint íntegro en disco.
   */
  async resumeMission(
    missionId: string,
    llmProviderOverride?: ILLMProvider,
  ): Promise<VerificationReport> {
    const persisted = this.loadMissionState(missionId);
    if (!persisted) {
      throw new Error(
        `No existe estado persistido para reanudar la misión "${missionId}".`,
      );
    }

    const reconstructedRequest: VerificationMissionRequest = {
      missionId: persisted.missionId,
      objective: persisted.objective,
      workspaceDir: persisted.workspaceDir,
      allowedFiles: persisted.allowedFiles,
      entryFile: persisted.entryFile,
      publicTestsSource: persisted.publicTestsSource,
      hiddenTestsSource: persisted.hiddenTestsSource,
      maxRepairs: persisted.maxRepairs,
      testTimeoutMs: persisted.testTimeoutMs,
      maxMemoryMb: persisted.maxMemoryMb,
      model: persisted.model,
      llmProviderOverride,
    };

    return this.executeCycle(reconstructedRequest, persisted);
  }

  private async executeCycle(
    request: VerificationMissionRequest,
    resumedState: PersistedMissionState | null,
  ): Promise<VerificationReport> {
    const startTime = Date.now();
    const maxRepairs = request.maxRepairs ?? 2;
    const testTimeoutMs = request.testTimeoutMs ?? 2000;
    const maxMemoryMb = request.maxMemoryMb ?? 256;
    const entryFile = this.normalizeRelPath(request.entryFile);
    const allowedFiles = request.allowedFiles.map((f) =>
      this.normalizeRelPath(f),
    );

    const publicTestsSha256 =
      resumedState?.publicTestsSha256 ??
      this.testRunner.computeSha256(request.publicTestsSource);
    const hiddenTestsSha256 = request.hiddenTestsSource
      ? (resumedState?.hiddenTestsSha256 ??
        this.testRunner.computeSha256(request.hiddenTestsSource))
      : undefined;

    let bestCheckpoint: ImmutableCheckpoint | null = null;
    let attemptsHistory: AttemptAuditEntry[] = [];
    let llmCallsHistory: LlmCallAuditEntry[] = [];
    let repairsAttempted = 0;
    let rollbacksCount = 0;
    let startAttempt = 0;
    let lastDiagnostics: StructuredDiagnostic[] = [];
    let lastWasRolledBack = false;
    let lastRollbackReason: string | undefined;
    let lastRegressions: string[] = [];
    const resumedFromDisk = resumedState !== null;

    if (resumedState) {
      const recovered = this.checkpointManager.loadBestOrFallbackCheckpoint(
        request.missionId,
      );
      if (!recovered.checkpoint) {
        throw new Error(
          `Imposible recuperar misión "${request.missionId}": no se encontró ningún checkpoint íntegro en disco.`,
        );
      }
      bestCheckpoint = recovered.checkpoint;
      attemptsHistory = [...resumedState.attemptsHistory];
      llmCallsHistory = [...(resumedState.llmCallsHistory ?? [])];
      repairsAttempted = resumedState.repairsAttempted;
      rollbacksCount = resumedState.rollbacksCount;
      startAttempt = resumedState.lastCompletedAttempt + 1;
      lastDiagnostics = [...resumedState.lastDiagnostics];
      lastWasRolledBack = resumedState.lastWasRolledBack;
      lastRollbackReason = resumedState.lastRollbackReason;
      lastRegressions = [...resumedState.lastRegressions];

      if (recovered.corruptedDetected) {
        lastDiagnostics.push({
          category: 'SECURITY_INVARIANT_VIOLATION',
          severity: 'warning',
          message: `Se detectó corrupción en un archivo de checkpoint y se recuperó automáticamente el último snapshot íntegro (${bestCheckpoint.checkpointId}). Detalle: ${recovered.corruptionReason}`,
        });
      }

      if (request.workspaceDir) {
        this.checkpointManager.restoreCheckpointToWorkspace(
          bestCheckpoint,
          request.workspaceDir,
          allowedFiles,
        );
      }
    }

    let currentFiles: Record<string, string> = {};
    if (!resumedState) {
      if (request.initialFiles && Object.keys(request.initialFiles).length > 0) {
        currentFiles = { ...request.initialFiles };
      } else if (request.workspaceDir) {
        for (const rel of allowedFiles) {
          const diskPath = path.join(request.workspaceDir, rel);
          if (fs.existsSync(diskPath)) {
            currentFiles[rel] = fs.readFileSync(diskPath, 'utf8');
          }
        }
      }
      if (Object.keys(currentFiles).length === 0) {
        const generated = await this.generateInitialCandidate(
          request,
          entryFile,
          llmCallsHistory,
        );
        currentFiles = { [entryFile]: generated };
      }
    }

    for (
      let attemptIndex = startAttempt;
      attemptIndex <= maxRepairs;
      attemptIndex++
    ) {
      const attemptStart = Date.now();

      // Si estamos en un intento de reparación (attemptIndex > 0), verificar en disco la integridad
      // del Best Checkpoint vigente y solicitar el parche al proveedor LLM.
      if (attemptIndex > 0) {
        const verifiedOnDisk =
          this.checkpointManager.loadBestOrFallbackCheckpoint(
            request.missionId,
          );
        if (verifiedOnDisk.checkpoint) {
          bestCheckpoint = verifiedOnDisk.checkpoint;
        }
        if (verifiedOnDisk.corruptedDetected && bestCheckpoint) {
          lastDiagnostics.push({
            category: 'SECURITY_INVARIANT_VIOLATION',
            severity: 'warning',
            message: `Corrupción detectada en checkpoint en disco; restaurado fallback verificado ${bestCheckpoint.checkpointId}.`,
          });
          if (request.workspaceDir) {
            this.checkpointManager.restoreCheckpointToWorkspace(
              bestCheckpoint,
              request.workspaceDir,
              allowedFiles,
            );
          }
        }

        if (!bestCheckpoint) {
          break;
        }

        repairsAttempted++;
        const repairPrompt = this.repairController.buildRepairPrompt({
          objective: request.objective,
          entryFile,
          bestCheckpoint,
          lastAttemptDiagnostics: lastDiagnostics,
          wasRolledBack: lastWasRolledBack,
          rollbackReason: lastRollbackReason,
          regressions: lastRegressions,
        });

        const patchedCode = await this.invokeLlmForCode(
          request,
          repairPrompt,
          attemptIndex,
          'REPAIR',
          llmCallsHistory,
        );
        currentFiles = {
          ...bestCheckpoint.files,
          [entryFile]: patchedCode,
        };
      }

      // ── FASE 1: Pre-Validación Estática (TS, AST, Scope, Seguridad) ──────────
      const staticResult = this.staticValidator.validateFiles(currentFiles, {
        ...request.staticOptions,
        allowedFiles,
      });

      // ── FASE 2: Pruebas Públicas en Subproceso Aislado ──────────────────────
      let publicTestResult: IsolatedRunResult;
      if (
        staticResult.compileErrors.length > 0 ||
        staticResult.securityViolations.length > 0
      ) {
        // Si no compila o viola un invariante crítico de seguridad, no ejecutamos código inseguro/roto
        publicTestResult = {
          runnerStatus:
            staticResult.securityViolations.length > 0
              ? 'INTEGRITY_VIOLATION'
              : 'SYNTAX_ERROR',
          passedCount: 0,
          totalCount: 0,
          tests: [],
          unhandledAsyncErrors: [],
          stderr: '',
          durationMs: 0,
          sha256Verified:
            this.testRunner.computeSha256(request.publicTestsSource) ===
            publicTestsSha256,
          testSuiteHash: publicTestsSha256,
        };
      } else {
        publicTestResult = await this.testRunner.runSuite({
          missionId: request.missionId,
          attemptIndex,
          files: currentFiles,
          entryFile,
          testSuiteSource: request.publicTestsSource,
          expectedTestSha256: publicTestsSha256,
          timeoutMs: testTimeoutMs,
          maxMemoryMb,
          simulateRunnerCrash:
            request.simulateRunnerCrashOnAttempt === attemptIndex,
        });
      }

      // ── FASE 3: Evaluación Jerárquica contra Best Checkpoint ────────────────
      const comparison = this.repairController.evaluateCandidateAgainstBest(
        staticResult,
        publicTestResult,
        bestCheckpoint,
      );

      const attemptDiagnostics = this.repairController.collectDiagnostics(
        staticResult,
        publicTestResult,
        comparison.regressions,
      );

      const diffFromBest = bestCheckpoint
        ? this.repairController.computeUnifiedDiff(
            bestCheckpoint.files,
            currentFiles,
          )
        : this.repairController.computeUnifiedDiff({}, currentFiles);

      // Persistir siempre el snapshot inmutable de este intento para trazabilidad forense
      const candidateCheckpoint =
        this.checkpointManager.createAndSaveCheckpoint({
          missionId: request.missionId,
          attemptIndex,
          files: currentFiles,
          allowedFiles,
          staticResult,
          publicTestResult,
          scoreVector: comparison.scoreVector,
        });

      let phaseReached: VerificationPhase = 'EVALUATE_CHECKPOINT';
      let rolledBackToCheckpointId: string | undefined;

      if (comparison.isBetter) {
        phaseReached = 'SAVE_BEST_CHECKPOINT';
        bestCheckpoint = candidateCheckpoint;
        this.checkpointManager.saveBestCheckpointPointer(bestCheckpoint);
        lastWasRolledBack = false;
        lastRollbackReason = undefined;
        lastRegressions = [];

        if (request.workspaceDir) {
          this.checkpointManager.restoreCheckpointToWorkspace(
            bestCheckpoint,
            request.workspaceDir,
            allowedFiles,
          );
        }
      } else {
        phaseReached = 'ROLLBACK_TO_BEST';
        rollbacksCount++;
        rolledBackToCheckpointId = bestCheckpoint?.checkpointId;
        lastWasRolledBack = true;
        lastRollbackReason = comparison.reason;
        lastRegressions = comparison.regressions;

        // Restaurar físicamente el Best Checkpoint en memoria y en el workspaceDir
        if (bestCheckpoint) {
          currentFiles = { ...bestCheckpoint.files };
          if (request.workspaceDir) {
            this.checkpointManager.restoreCheckpointToWorkspace(
              bestCheckpoint,
              request.workspaceDir,
              allowedFiles,
            );
          }
        }
      }

      lastDiagnostics = attemptDiagnostics;

      attemptsHistory.push({
        attemptIndex,
        phaseReached,
        workingTreeHash: candidateCheckpoint.workingTreeHash,
        checkpointId: candidateCheckpoint.checkpointId,
        decision: comparison.decision,
        decisionReason: comparison.reason,
        rolledBackToCheckpointId,
        diffFromBest,
        staticPassed: staticResult.passed,
        publicPassedCount: publicTestResult.passedCount,
        publicTotalCount: publicTestResult.totalCount,
        regressions: comparison.regressions,
        diagnostics: attemptDiagnostics,
        durationMs: Date.now() - attemptStart,
      });

      // Persistir estado de la misión en disco (para recuperación ante interrupciones)
      const allPublicPassed =
        bestCheckpoint !== null &&
        bestCheckpoint.scoreVector.level1SecurityAndIntegrityOk &&
        bestCheckpoint.scoreVector.level2CompilesAndRunsOk &&
        bestCheckpoint.publicTestResult.totalCount > 0 &&
        bestCheckpoint.publicTestResult.passedCount ===
          bestCheckpoint.publicTestResult.totalCount;

      const shouldInterrupt =
        request.simulateInterruptAfterAttempt !== undefined &&
        request.simulateInterruptAfterAttempt === attemptIndex;

      this.saveMissionState({
        missionId: request.missionId,
        objective: request.objective,
        workspaceDir: request.workspaceDir,
        allowedFiles,
        entryFile,
        publicTestsSource: request.publicTestsSource,
        publicTestsSha256,
        hiddenTestsSource: request.hiddenTestsSource,
        hiddenTestsSha256,
        maxRepairs,
        testTimeoutMs,
        maxMemoryMb,
        model: request.model,
        phase: shouldInterrupt
          ? 'INTERRUPTED_WAITING_RECOVERY'
          : allPublicPassed
            ? 'HIDDEN_TESTS_FINAL'
            : 'DIAGNOSIS_AND_REPAIR',
        lastCompletedAttempt: attemptIndex,
        repairsAttempted,
        rollbacksCount,
        bestCheckpointId: bestCheckpoint?.checkpointId ?? '',
        attemptsHistory,
        llmCallsHistory,
        lastDiagnostics,
        lastWasRolledBack,
        lastRollbackReason,
        lastRegressions,
        updatedAt: new Date().toISOString(),
      });

      if (shouldInterrupt && bestCheckpoint) {
        return {
          missionId: request.missionId,
          objective: request.objective,
          finalPhase: 'INTERRUPTED_WAITING_RECOVERY',
          success: false,
          totalAttempts: attemptsHistory.length,
          repairsAttempted,
          rollbacksCount,
          resumedFromDisk,
          bestCheckpointId: bestCheckpoint.checkpointId,
          bestAttemptIndex: bestCheckpoint.attemptIndex,
          finalWorkingTreeHash: bestCheckpoint.workingTreeHash,
          finalFiles: bestCheckpoint.files,
          publicTestsSummary: {
            passed: bestCheckpoint.publicTestResult.passedCount,
            total: bestCheckpoint.publicTestResult.totalCount,
            sha256Verified: bestCheckpoint.publicTestResult.sha256Verified,
            suiteHash: bestCheckpoint.publicTestResult.testSuiteHash,
          },
          attemptsHistory,
          llmCallsHistory,
          finalDiagnostics: lastDiagnostics,
          totalDurationMs: Date.now() - startTime,
        };
      }

      if (allPublicPassed) {
        break;
      }
    }

    // ── Verificación final de integridad del Best Checkpoint antes de entregar ──
    const finalCheck = this.checkpointManager.loadBestOrFallbackCheckpoint(
      request.missionId,
    );
    if (finalCheck.checkpoint) {
      bestCheckpoint = finalCheck.checkpoint;
      if (finalCheck.corruptedDetected) {
        lastDiagnostics.push({
          category: 'SECURITY_INVARIANT_VIOLATION',
          severity: 'warning',
          message: `Checkpoint corrupto detectado antes de finalizar; se recuperó automáticamente el fallback verificado ${bestCheckpoint.checkpointId}.`,
        });
      }
    }

    if (!bestCheckpoint) {
      throw new Error(
        `Misión "${request.missionId}" finalizó sin ningún checkpoint disponible.`,
      );
    }

    if (request.workspaceDir) {
      this.checkpointManager.restoreCheckpointToWorkspace(
        bestCheckpoint,
        request.workspaceDir,
        allowedFiles,
      );
    }

    // ── FASE FINAL: Pruebas Ocultas sobre el Best Checkpoint ──────────────────
    let hiddenTestsSummary: VerificationReport['hiddenTestsSummary'];
    let hiddenAllPassed = true;

    if (request.hiddenTestsSource && hiddenTestsSha256) {
      const hiddenRun = await this.testRunner.runSuite({
        missionId: request.missionId,
        attemptIndex: 999,
        files: { ...bestCheckpoint.files },
        entryFile,
        testSuiteSource: request.hiddenTestsSource,
        expectedTestSha256: hiddenTestsSha256,
        timeoutMs: testTimeoutMs,
        maxMemoryMb,
      });

      hiddenTestsSummary = {
        passed: hiddenRun.passedCount,
        total: hiddenRun.totalCount,
        sha256Verified: hiddenRun.sha256Verified,
        suiteHash: hiddenRun.testSuiteHash,
        tests: hiddenRun.tests,
      };

      hiddenAllPassed =
        hiddenRun.runnerStatus === 'OK' &&
        hiddenRun.sha256Verified &&
        hiddenRun.passedCount === hiddenRun.totalCount;
    }

    const publicAllPassed =
      bestCheckpoint.scoreVector.level1SecurityAndIntegrityOk &&
      bestCheckpoint.scoreVector.level2CompilesAndRunsOk &&
      bestCheckpoint.publicTestResult.totalCount > 0 &&
      bestCheckpoint.publicTestResult.passedCount ===
        bestCheckpoint.publicTestResult.totalCount;

    const success = publicAllPassed && hiddenAllPassed;
    const finalPhase: VerificationPhase = success ? 'COMPLETED' : 'FAILED';

    return {
      missionId: request.missionId,
      objective: request.objective,
      finalPhase,
      success,
      totalAttempts: attemptsHistory.length,
      repairsAttempted,
      rollbacksCount,
      resumedFromDisk,
      bestCheckpointId: bestCheckpoint.checkpointId,
      bestAttemptIndex: bestCheckpoint.attemptIndex,
      finalWorkingTreeHash: bestCheckpoint.workingTreeHash,
      finalFiles: bestCheckpoint.files,
      publicTestsSummary: {
        passed: bestCheckpoint.publicTestResult.passedCount,
        total: bestCheckpoint.publicTestResult.totalCount,
        sha256Verified: bestCheckpoint.publicTestResult.sha256Verified,
        suiteHash: bestCheckpoint.publicTestResult.testSuiteHash,
      },
      hiddenTestsSummary,
      attemptsHistory,
      llmCallsHistory,
      finalDiagnostics: lastDiagnostics,
      totalDurationMs: Date.now() - startTime,
    };
  }

  private async generateInitialCandidate(
    request: VerificationMissionRequest,
    entryFile: string,
    llmCallsHistory: LlmCallAuditEntry[],
  ): Promise<string> {
    const prompt = [
      `MISIÓN DE INGENIERÍA JARBEES (${request.missionId})`,
      `ARCHIVO OBJETIVO: ${entryFile}`,
      `OBJETIVO: ${request.objective}`,
      `Devuelve únicamente el código TypeScript completo dentro de un bloque \`\`\`typescript ... \`\`\`.`,
    ].join('\n');

    return this.invokeLlmForCode(
      request,
      prompt,
      0,
      'INITIAL_GENERATION',
      llmCallsHistory,
    );
  }

  private async invokeLlmForCode(
    request: VerificationMissionRequest,
    userPrompt: string,
    attemptIndex: number,
    purpose: 'INITIAL_GENERATION' | 'REPAIR',
    llmCallsHistory: LlmCallAuditEntry[],
  ): Promise<string> {
    const provider =
      request.llmProviderOverride || this.llmGateway || this.inferenceGateway;

    if (!provider) {
      throw new Error(
        'VerificationHarnessService: No hay proveedor ILLMProvider configurado ni inyectado.',
      );
    }

    const callStart = Date.now();
    const response = await provider.generate({
      model: request.model || provider.getDefaultModel(),
      temperature: 0.1,
      reservedOutputTokens: 1024,
      messages: [
        {
          role: 'system',
          content:
            'Eres el especialista principal de ingeniería de software de JarBees. Devuelve exclusivamente código TypeScript limpio, seguro y determinista dentro de un bloque markdown.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    llmCallsHistory.push({
      attemptIndex,
      purpose,
      requestId:
        response.requestId ||
        `req_${request.missionId}_attempt_${attemptIndex}_${Date.now()}`,
      provider: response.provider,
      model: response.model,
      httpStatus: response.httpStatus,
      endpointUrl: response.endpointUrl,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      tokensUsed: response.tokensUsed,
      tokensPerSecond: response.tokensPerSecond,
      durationMs: response.latencyMs ?? Math.max(1, Date.now() - callStart),
    });

    return this.extractCodeBlock(response.content);
  }

  extractCodeBlock(text: string): string {
    const match = (text ?? '').match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return (text ?? '').trim();
  }

  private saveMissionState(state: PersistedMissionState): void {
    const dir = this.checkpointManager.getMissionStorageDir(state.missionId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'mission_state.json');
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  private loadMissionState(missionId: string): PersistedMissionState | null {
    const dir = this.checkpointManager.getMissionStorageDir(missionId);
    const filePath = path.join(dir, 'mission_state.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(
      fs.readFileSync(filePath, 'utf8'),
    ) as PersistedMissionState;
  }

  private normalizeRelPath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  }
}

