import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InferenceSupervisorService, GpuTelemetryReport } from '../llm/inference-supervisor.service';
import { ActionGatekeeperService } from '../security/action-gatekeeper.service';
import { AuditService } from '../security/audit.service';
import { CheckpointManagerService } from './checkpoint-manager.service';
import { RepairControllerService } from './repair-controller.service';
import { VerificationHarnessService } from './verification-harness.service';
import {
  AttemptAuditEntry,
  ImmutableCheckpoint,
  LlmCallAuditEntry,
  StructuredDiagnostic,
  VerificationMissionRequest,
  VerificationReport,
} from './verification-harness.types';

export type EngineeringMissionStatus =
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'repairing'
  | 'awaiting_human_approval'
  | 'completed'
  | 'failed';

export interface EngineeringMissionBudget {
  maxTotalTokens: number;
  maxDurationMs: number;
  maxRepairs: number;
}

export interface EngineeringMissionBudgetUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  repairsUsed: number;
  budgetExceeded: boolean;
  exceededReason?: string;
}

export interface ManagedMissionRequest extends VerificationMissionRequest {
  acceptanceCriteria?: string[];
  budget?: Partial<EngineeringMissionBudget>;
  requireHumanApprovalBeforeIntegrate?: boolean;
  humanApprovalToken?: string;
}

export interface ManagedMissionRecord {
  missionId: string;
  objective: string;
  acceptanceCriteria: string[];
  status: EngineeringMissionStatus;
  createdAt: string;
  updatedAt: string;
  workspaceDir?: string;
  allowedFiles: string[];
  entryFile: string;
  requiresSensitiveApproval: boolean;
  humanApproved: boolean;
  integratedToWorkspace: boolean;
  budget: EngineeringMissionBudget;
  budgetUsage: EngineeringMissionBudgetUsage;
  initialFilesSnapshot: Record<string, string>;
  finalFilesSnapshot: Record<string, string>;
  diffBeforeAfter: string;
  bestCheckpointId?: string;
  bestAttemptIndex?: number;
  rollbacksCount: number;
  attemptsHistory: AttemptAuditEntry[];
  llmCallsHistory: LlmCallAuditEntry[];
  finalDiagnostics: StructuredDiagnostic[];
  gpuTelemetry?: GpuTelemetryReport;
  verificationReport?: VerificationReport;
}

@Injectable()
export class EngineeringMissionManagerService {
  private readonly logger = new Logger(EngineeringMissionManagerService.name);
  private readonly storageDir: string;

  /**
   * Patrones de rutas críticas protegidas que jamás pueden ser modificadas por una misión
   * sin un token HITL criptográfico explícito ('ENGINEERING_SENSITIVE_MISSION').
   */
  private readonly protectedPathPatterns: RegExp[] = [
    /(?:^|\/)verification\//i,
    /verification-harness/i,
    /checkpoint-manager/i,
    /repair-controller/i,
    /static-pre-validator/i,
    /isolated-test-runner/i,
    /engineering-mission-manager/i,
    /(?:^|\/)security\//i,
    /action-gatekeeper/i,
    /action-execution-gate/i,
    /(?:^|\/)\.env/i,
    /credentials|secrets|private/i,
  ];

  constructor(
    private readonly harness: VerificationHarnessService,
    private readonly checkpointManager: CheckpointManagerService,
    private readonly repairController: RepairControllerService,
    @Optional()
    private readonly actionGatekeeper?: ActionGatekeeperService,
    @Optional()
    private readonly supervisor?: InferenceSupervisorService,
    @Optional()
    private readonly auditService?: AuditService,
  ) {
    this.storageDir = path.resolve(
      process.cwd(),
      'storage',
      'engineering-missions',
    );
  }

  /**
   * Ejecuta o planifica una misión de ingeniería administrada con control de presupuesto,
   * confinamiento de workspace, protección del propio VerificationHarness, diff antes/después
   * y compuerta de aprobación humana opcional antes de integrar cambios.
   */
  async executeManagedMission(
    req: ManagedMissionRequest,
  ): Promise<ManagedMissionRecord> {
    const startTime = Date.now();
    this.validateWorkspaceConfinement(req.workspaceDir, req.allowedFiles);

    const isSensitive = this.touchesProtectedFiles(
      req.workspaceDir,
      req.allowedFiles,
    );

    if (isSensitive) {
      if (!req.humanApprovalToken) {
        throw new ForbiddenException(
          `Misión bloqueada por política de autoprotección: no se permite modificar el VerificationHarness ni archivos críticos (${req.allowedFiles.join(', ')}) sin un token de aprobación humana firmada (ENGINEERING_SENSITIVE_MISSION).`,
        );
      }
      if (this.actionGatekeeper) {
        this.actionGatekeeper.verifyAndConsumeChallenge(
          req.humanApprovalToken,
          'ENGINEERING_SENSITIVE_MISSION',
          req.missionId,
        );
      }
    }

    const budget: EngineeringMissionBudget = {
      maxTotalTokens: req.budget?.maxTotalTokens ?? 8192,
      maxDurationMs: req.budget?.maxDurationMs ?? 90000,
      maxRepairs: Math.min(req.budget?.maxRepairs ?? req.maxRepairs ?? 2, 4),
    };

    const initialFilesSnapshot = this.captureInitialWorkspaceSnapshot(req);

    const record: ManagedMissionRecord = {
      missionId: req.missionId,
      objective: req.objective,
      acceptanceCriteria: req.acceptanceCriteria ?? [],
      status: 'planning',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspaceDir: req.workspaceDir,
      allowedFiles: req.allowedFiles,
      entryFile: req.entryFile,
      requiresSensitiveApproval:
        isSensitive || Boolean(req.requireHumanApprovalBeforeIntegrate),
      humanApproved: isSensitive && Boolean(req.humanApprovalToken),
      integratedToWorkspace: false,
      budget,
      budgetUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs: 0,
        repairsUsed: 0,
        budgetExceeded: false,
      },
      initialFilesSnapshot,
      finalFilesSnapshot: { ...initialFilesSnapshot },
      diffBeforeAfter: '',
      rollbacksCount: 0,
      attemptsHistory: [],
      llmCallsHistory: [],
      finalDiagnostics: [],
    };

    this.persistMissionRecord(record);

    // Si requiere aprobación humana ANTES de integrar en el workspace real, ejecutamos el arnés
    // sin alterar el workspace hasta que el humano apruebe el checkpoint final.
    const deferWorkspaceIntegration =
      Boolean(req.requireHumanApprovalBeforeIntegrate) &&
      !req.humanApprovalToken;

    record.status = 'executing';
    this.persistMissionRecord(record);

    const harnessRequest: VerificationMissionRequest = {
      ...req,
      maxRepairs: budget.maxRepairs,
      workspaceDir: deferWorkspaceIntegration ? undefined : req.workspaceDir,
      initialFiles:
        Object.keys(initialFilesSnapshot).length > 0
          ? initialFilesSnapshot
          : req.initialFiles,
    };

    const report = await this.harness.runMission(harnessRequest);

    const llmCalls = report.llmCallsHistory ?? [];
    const promptTokens = llmCalls.reduce(
      (acc, c) => acc + (c.promptTokens ?? 0),
      0,
    );
    const completionTokens = llmCalls.reduce(
      (acc, c) => acc + (c.completionTokens ?? 0),
      0,
    );
    const totalTokens = llmCalls.reduce(
      (acc, c) =>
        acc + (c.tokensUsed ?? (c.promptTokens ?? 0) + (c.completionTokens ?? 0)),
      0,
    );
    const durationMs = Date.now() - startTime;

    let budgetExceeded = false;
    let exceededReason: string | undefined;
    if (totalTokens > budget.maxTotalTokens) {
      budgetExceeded = true;
      exceededReason = `Presupuesto de tokens excedido (${totalTokens} > ${budget.maxTotalTokens})`;
    } else if (durationMs > budget.maxDurationMs) {
      budgetExceeded = true;
      exceededReason = `Presupuesto de tiempo excedido (${durationMs}ms > ${budget.maxDurationMs}ms)`;
    }

    const diffBeforeAfter = this.computeMultiFileDiff(
      initialFilesSnapshot,
      report.finalFiles,
      req.allowedFiles,
    );

    record.updatedAt = new Date().toISOString();
    record.budgetUsage = {
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs,
      repairsUsed: report.repairsAttempted,
      budgetExceeded,
      exceededReason,
    };
    record.finalFilesSnapshot = { ...report.finalFiles };
    record.diffBeforeAfter = diffBeforeAfter;
    record.bestCheckpointId = report.bestCheckpointId;
    record.bestAttemptIndex = report.bestAttemptIndex;
    record.rollbacksCount = report.rollbacksCount;
    record.attemptsHistory = report.attemptsHistory;
    record.llmCallsHistory = llmCalls;
    record.finalDiagnostics = report.finalDiagnostics;
    record.gpuTelemetry = this.supervisor?.getGpuTelemetry();
    record.verificationReport = report;

    if (report.finalPhase === 'INTERRUPTED_WAITING_RECOVERY') {
      record.status = 'verifying';
    } else if (!report.success || budgetExceeded) {
      record.status = 'failed';
      // Si falló y tenía un estado inicial en workspaceDir, restaurar el estado previo
      if (req.workspaceDir && Object.keys(initialFilesSnapshot).length > 0) {
        this.writeFilesToWorkspace(
          req.workspaceDir,
          initialFilesSnapshot,
          req.allowedFiles,
        );
      }
    } else if (deferWorkspaceIntegration) {
      record.status = 'awaiting_human_approval';
      record.integratedToWorkspace = false;
    } else {
      record.status = 'completed';
      record.integratedToWorkspace = true;
    }

    this.persistMissionRecord(record);
    await this.auditService?.log('engineeringMission.executed', {
      missionId: record.missionId,
      status: record.status,
      totalTokens,
      durationMs,
      bestCheckpointId: record.bestCheckpointId,
    });

    return record;
  }

  /**
   * Reanuda una misión administrada previamente interrumpida y actualiza su registro.
   */
  async resumeManagedMission(missionId: string): Promise<ManagedMissionRecord> {
    const existing = this.getMissionRecord(missionId);
    if (!existing) {
      throw new BadRequestException(
        `No existe misión administrada con ID "${missionId}".`,
      );
    }

    existing.status = 'repairing';
    this.persistMissionRecord(existing);

    const report = await this.harness.resumeMission(missionId);
    const llmCalls = report.llmCallsHistory ?? [];
    const promptTokens = llmCalls.reduce(
      (acc, c) => acc + (c.promptTokens ?? 0),
      0,
    );
    const completionTokens = llmCalls.reduce(
      (acc, c) => acc + (c.completionTokens ?? 0),
      0,
    );
    const totalTokens = llmCalls.reduce(
      (acc, c) =>
        acc + (c.tokensUsed ?? (c.promptTokens ?? 0) + (c.completionTokens ?? 0)),
      0,
    );

    existing.updatedAt = new Date().toISOString();
    existing.status = report.success ? 'completed' : 'failed';
    existing.integratedToWorkspace = report.success;
    existing.finalFilesSnapshot = { ...report.finalFiles };
    existing.diffBeforeAfter = this.computeMultiFileDiff(
      existing.initialFilesSnapshot,
      report.finalFiles,
      existing.allowedFiles,
    );
    existing.bestCheckpointId = report.bestCheckpointId;
    existing.bestAttemptIndex = report.bestAttemptIndex;
    existing.rollbacksCount = report.rollbacksCount;
    existing.attemptsHistory = report.attemptsHistory;
    existing.llmCallsHistory = llmCalls;
    existing.finalDiagnostics = report.finalDiagnostics;
    existing.budgetUsage.promptTokens = promptTokens;
    existing.budgetUsage.completionTokens = completionTokens;
    existing.budgetUsage.totalTokens = totalTokens;
    existing.budgetUsage.repairsUsed = report.repairsAttempted;
    existing.gpuTelemetry = this.supervisor?.getGpuTelemetry();
    existing.verificationReport = report;

    this.persistMissionRecord(existing);
    return existing;
  }

  /**
   * Aprueba humanamente una misión en estado 'awaiting_human_approval' e integra el Best Checkpoint en workspaceDir.
   */
  approveAndIntegrateMission(
    missionId: string,
    humanApprovalToken?: string,
  ): ManagedMissionRecord {
    const record = this.getMissionRecord(missionId);
    if (!record) {
      throw new BadRequestException(`Misión "${missionId}" no encontrada.`);
    }
    if (record.status !== 'awaiting_human_approval') {
      throw new BadRequestException(
        `La misión "${missionId}" no está esperando aprobación humana (estado actual: ${record.status}).`,
      );
    }

    if (this.actionGatekeeper && humanApprovalToken) {
      this.actionGatekeeper.verifyAndConsumeChallenge(
        humanApprovalToken,
        'ENGINEERING_APPROVE_MISSION',
        missionId,
      );
    }

    const best = this.checkpointManager.loadBestOrFallbackCheckpoint(missionId);
    if (!best.checkpoint) {
      throw new BadRequestException(
        `No se encontró un Best Checkpoint íntegro para la misión "${missionId}".`,
      );
    }

    if (record.workspaceDir) {
      this.checkpointManager.restoreCheckpointToWorkspace(
        best.checkpoint,
        record.workspaceDir,
        record.allowedFiles,
      );
    }

    record.humanApproved = true;
    record.integratedToWorkspace = true;
    record.status = 'completed';
    record.updatedAt = new Date().toISOString();
    this.persistMissionRecord(record);
    return record;
  }

  /**
   * Permite restaurar manualmente cualquier checkpoint previo de una misión sobre su workspaceDir.
   */
  restoreCheckpointManually(
    missionId: string,
    attemptIndex: number,
  ): {
    restoredCheckpoint: ImmutableCheckpoint;
    workspaceDir?: string;
  } {
    const record = this.getMissionRecord(missionId);
    const ckpt = this.checkpointManager.loadCheckpointByAttempt(
      missionId,
      attemptIndex,
    );
    if (!ckpt) {
      throw new BadRequestException(
        `No existe el checkpoint del intento #${attemptIndex} para la misión "${missionId}".`,
      );
    }

    const targetDir = record?.workspaceDir;
    if (targetDir) {
      this.checkpointManager.restoreCheckpointToWorkspace(
        ckpt,
        targetDir,
        record?.allowedFiles ?? Object.keys(ckpt.files),
      );
    }

    if (record) {
      record.bestCheckpointId = ckpt.checkpointId;
      record.bestAttemptIndex = ckpt.attemptIndex;
      record.finalFilesSnapshot = { ...ckpt.files };
      record.updatedAt = new Date().toISOString();
      this.persistMissionRecord(record);
    }

    return {
      restoredCheckpoint: ckpt,
      workspaceDir: targetDir,
    };
  }

  getMissionRecord(missionId: string): ManagedMissionRecord | null {
    const filePath = this.getMissionFilePath(missionId);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(
      fs.readFileSync(filePath, 'utf8'),
    ) as ManagedMissionRecord;
  }

  listMissionRecords(): ManagedMissionRecord[] {
    if (!fs.existsSync(this.storageDir)) return [];
    const files = fs
      .readdirSync(this.storageDir)
      .filter((f) => f.endsWith('.json'));
    return files
      .map((f) => {
        try {
          return JSON.parse(
            fs.readFileSync(path.join(this.storageDir, f), 'utf8'),
          ) as ManagedMissionRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is ManagedMissionRecord => r !== null);
  }

  deleteMissionRecord(missionId: string): void {
    const filePath = this.getMissionFilePath(missionId);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignorar
    }
    this.checkpointManager.clearMissionCheckpoints(missionId);
  }

  // ── Seguridad y Confinamiento ─────────────────────────────────────────────

  private validateWorkspaceConfinement(
    workspaceDir: string | undefined,
    allowedFiles: string[],
  ): void {
    if (!allowedFiles || allowedFiles.length === 0) {
      throw new BadRequestException(
        'La misión debe especificar al menos un archivo en allowedFiles.',
      );
    }

    for (const f of allowedFiles) {
      if (f.includes('..') || path.isAbsolute(f)) {
        throw new ForbiddenException(
          `Ruta de archivo prohibida fuera del confinamiento de misión: "${f}".`,
        );
      }
    }

    if (!workspaceDir) return;

    const resolvedWorkspace = path.resolve(workspaceDir);
    const projectRoot = path.resolve(process.cwd());
    const tmpRoot = path.resolve(os.tmpdir());

    const insideProject = resolvedWorkspace.startsWith(projectRoot);
    const insideTmp = resolvedWorkspace.startsWith(tmpRoot);

    if (!insideProject && !insideTmp) {
      throw new ForbiddenException(
        `El workspaceDir "${resolvedWorkspace}" está fuera de las raíces autorizadas del proyecto o directorio temporal.`,
      );
    }
  }

  private touchesProtectedFiles(
    workspaceDir: string | undefined,
    allowedFiles: string[],
  ): boolean {
    const normWorkspace = (workspaceDir ?? '').replace(/\\/g, '/');
    return allowedFiles.some((f) => {
      const combined = `${normWorkspace}/${f.replace(/\\/g, '/')}`;
      return this.protectedPathPatterns.some((rx) => rx.test(combined));
    });
  }

  private captureInitialWorkspaceSnapshot(
    req: ManagedMissionRequest,
  ): Record<string, string> {
    if (req.initialFiles && Object.keys(req.initialFiles).length > 0) {
      return { ...req.initialFiles };
    }
    const snapshot: Record<string, string> = {};
    if (req.workspaceDir) {
      for (const rel of req.allowedFiles) {
        const cleanRel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
        const fullPath = path.join(req.workspaceDir, cleanRel);
        if (fs.existsSync(fullPath)) {
          snapshot[cleanRel] = fs.readFileSync(fullPath, 'utf8');
        }
      }
    }
    return snapshot;
  }

  private computeMultiFileDiff(
    beforeFiles: Readonly<Record<string, string>>,
    afterFiles: Readonly<Record<string, string>>,
    _allowedFiles: string[],
  ): string {
    return this.repairController.computeUnifiedDiff(beforeFiles, afterFiles);
  }

  private writeFilesToWorkspace(
    workspaceDir: string,
    files: Record<string, string>,
    allowedFiles: string[],
  ): void {
    for (const rel of allowedFiles) {
      const cleanRel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
      if (files[cleanRel] !== undefined) {
        const dest = path.join(workspaceDir, cleanRel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, files[cleanRel], 'utf8');
      }
    }
  }

  private getMissionFilePath(missionId: string): string {
    const safeId = missionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storageDir, `${safeId}.json`);
  }

  private persistMissionRecord(record: ManagedMissionRecord): void {
    fs.mkdirSync(this.storageDir, { recursive: true });
    const filePath = this.getMissionFilePath(record.missionId);
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }
}
