import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  CheckpointScoreVector,
  ImmutableCheckpoint,
  IsolatedRunResult,
  StaticValidationResult,
} from './verification-harness.types';

export class CorruptedCheckpointException extends Error {
  constructor(
    public readonly missionId: string,
    public readonly checkpointId: string,
    message: string,
  ) {
    super(message);
    this.name = 'CorruptedCheckpointException';
  }
}

@Injectable()
export class CheckpointManagerService {
  private readonly logger = new Logger(CheckpointManagerService.name);
  private readonly baseStorageDir: string;

  constructor() {
    this.baseStorageDir = path.resolve(
      process.cwd(),
      'storage',
      'checkpoints',
      'verification',
    );
  }

  getMissionStorageDir(missionId: string): string {
    const safeId = missionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseStorageDir, safeId);
  }

  /**
   * Calcula el hash SHA-256 determinista y canónico del árbol de archivos de la misión.
   */
  computeWorkingTreeHash(files: Record<string, string>): string {
    const canonicalEntries = Object.keys(files)
      .sort()
      .map((k) => [this.normalizeRelPath(k), files[k] ?? '']);
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonicalEntries), 'utf8')
      .digest('hex');
  }

  /**
   * Calcula el hash SHA-256 de integridad de todos los campos estructurales del checkpoint.
   */
  computeCheckpointIntegrityHash(
    payload: Omit<ImmutableCheckpoint, 'checkpointIntegrityHash'>,
  ): string {
    const canonicalPayload = {
      checkpointId: payload.checkpointId,
      missionId: payload.missionId,
      attemptIndex: payload.attemptIndex,
      createdAt: payload.createdAt,
      workingTreeHash: payload.workingTreeHash,
      files: Object.keys(payload.files)
        .sort()
        .reduce<Record<string, string>>((acc, key) => {
          acc[this.normalizeRelPath(key)] = payload.files[key];
          return acc;
        }, {}),
      scoreVector: payload.scoreVector,
      passedTestIds: [...payload.passedTestIds].sort(),
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonicalPayload), 'utf8')
      .digest('hex');
  }

  /**
   * Crea un snapshot inmutable congelado en memoria y lo persiste atómicamente en disco.
   */
  createAndSaveCheckpoint(params: {
    missionId: string;
    attemptIndex: number;
    files: Record<string, string>;
    allowedFiles: string[];
    staticResult: StaticValidationResult;
    publicTestResult: IsolatedRunResult;
    scoreVector: CheckpointScoreVector;
  }): ImmutableCheckpoint {
    const scopedFiles = this.filterAllowedFiles(
      params.files,
      params.allowedFiles,
    );
    const workingTreeHash = this.computeWorkingTreeHash(scopedFiles);
    const passedTestIds = (params.publicTestResult.tests ?? [])
      .filter((t) => t.passed)
      .map((t) => t.id);

    const checkpointId = `ckpt_${params.missionId}_attempt_${params.attemptIndex}_${workingTreeHash.slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    const unsignedCheckpoint: Omit<
      ImmutableCheckpoint,
      'checkpointIntegrityHash'
    > = {
      checkpointId,
      missionId: params.missionId,
      attemptIndex: params.attemptIndex,
      createdAt,
      files: { ...scopedFiles },
      workingTreeHash,
      staticResult: params.staticResult,
      publicTestResult: params.publicTestResult,
      scoreVector: { ...params.scoreVector },
      passedTestIds: [...passedTestIds],
    };

    const checkpointIntegrityHash =
      this.computeCheckpointIntegrityHash(unsignedCheckpoint);

    const fullCheckpoint: ImmutableCheckpoint = this.deepFreeze({
      ...unsignedCheckpoint,
      checkpointIntegrityHash,
    });

    this.persistCheckpointAtomically(fullCheckpoint);
    return fullCheckpoint;
  }

  /**
   * Marca y persiste atómicamente un checkpoint como el Best Checkpoint vigente de la misión.
   */
  saveBestCheckpointPointer(checkpoint: ImmutableCheckpoint): void {
    this.verifyCheckpointIntegrity(checkpoint);
    const dir = this.getMissionStorageDir(checkpoint.missionId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'best_checkpoint.json');
    this.writeJsonAtomically(filePath, checkpoint);
  }

  /**
   * Verifica criptográficamente que un checkpoint no haya sido corrompido ni manipulado.
   */
  verifyCheckpointIntegrity(checkpoint: ImmutableCheckpoint): boolean {
    if (
      !checkpoint ||
      typeof checkpoint !== 'object' ||
      !checkpoint.checkpointId ||
      !checkpoint.files ||
      typeof checkpoint.workingTreeHash !== 'string' ||
      typeof checkpoint.checkpointIntegrityHash !== 'string'
    ) {
      throw new CorruptedCheckpointException(
        checkpoint?.missionId ?? 'unknown',
        checkpoint?.checkpointId ?? 'unknown',
        'Estructura de checkpoint inválida o incompleta.',
      );
    }

    const actualTreeHash = this.computeWorkingTreeHash(checkpoint.files);
    if (actualTreeHash !== checkpoint.workingTreeHash) {
      throw new CorruptedCheckpointException(
        checkpoint.missionId,
        checkpoint.checkpointId,
        `Corrupción detectada en workingTreeHash del checkpoint "${checkpoint.checkpointId}" (esperado=${checkpoint.workingTreeHash}, calculado=${actualTreeHash}).`,
      );
    }

    const expectedIntegrityHash =
      this.computeCheckpointIntegrityHash(checkpoint);
    if (expectedIntegrityHash !== checkpoint.checkpointIntegrityHash) {
      throw new CorruptedCheckpointException(
        checkpoint.missionId,
        checkpoint.checkpointId,
        `Corrupción detectada en checkpointIntegrityHash del checkpoint "${checkpoint.checkpointId}" (esperado=${checkpoint.checkpointIntegrityHash}, calculado=${expectedIntegrityHash}).`,
      );
    }

    return true;
  }

  /**
   * Carga un checkpoint específico por intento y valida su integridad SHA-256.
   */
  loadCheckpointByAttempt(
    missionId: string,
    attemptIndex: number,
  ): ImmutableCheckpoint | null {
    const dir = this.getMissionStorageDir(missionId);
    const filePath = path.join(dir, `checkpoint_${attemptIndex}.json`);
    if (!fs.existsSync(filePath)) return null;

    let parsed: ImmutableCheckpoint;
    try {
      parsed = JSON.parse(
        fs.readFileSync(filePath, 'utf8'),
      ) as ImmutableCheckpoint;
    } catch (err: any) {
      throw new CorruptedCheckpointException(
        missionId,
        `attempt_${attemptIndex}`,
        `JSON corrupto en checkpoint_${attemptIndex}.json: ${err.message}`,
      );
    }

    this.verifyCheckpointIntegrity(parsed);
    return this.deepFreeze(parsed);
  }

  /**
   * Carga el Best Checkpoint vigente; si best_checkpoint.json fue corrompido en disco,
   * escanea el historial de checkpoints de la misión y recupera el último íntegro verificado.
   */
  loadBestOrFallbackCheckpoint(missionId: string): {
    checkpoint: ImmutableCheckpoint | null;
    corruptedDetected: boolean;
    corruptionReason?: string;
  } {
    const dir = this.getMissionStorageDir(missionId);
    if (!fs.existsSync(dir)) {
      return { checkpoint: null, corruptedDetected: false };
    }

    let corruptedDetected = false;
    let corruptionReason: string | undefined;

    const bestPath = path.join(dir, 'best_checkpoint.json');
    if (fs.existsSync(bestPath)) {
      try {
        const raw = fs.readFileSync(bestPath, 'utf8');
        const parsed = JSON.parse(raw) as ImmutableCheckpoint;
        this.verifyCheckpointIntegrity(parsed);
        return {
          checkpoint: this.deepFreeze(parsed),
          corruptedDetected: false,
        };
      } catch (err: any) {
        corruptedDetected = true;
        corruptionReason = err.message;
        this.logger.warn(
          `[CheckpointManager] Detectado best_checkpoint.json corrupto en misión "${missionId}": ${err.message}. Buscando fallback íntegro...`,
        );
      }
    }

    // Buscar entre los checkpoints numerados en orden descendente de intento
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^checkpoint_\d+\.json$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.replace(/\D+/g, ''), 10);
        const nb = parseInt(b.replace(/\D+/g, ''), 10);
        return nb - na;
      });

    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const parsed = JSON.parse(
          fs.readFileSync(fullPath, 'utf8'),
        ) as ImmutableCheckpoint;
        this.verifyCheckpointIntegrity(parsed);
        return {
          checkpoint: this.deepFreeze(parsed),
          corruptedDetected,
          corruptionReason,
        };
      } catch (err: any) {
        corruptedDetected = true;
        corruptionReason = corruptionReason || err.message;
      }
    }

    return { checkpoint: null, corruptedDetected, corruptionReason };
  }

  /**
   * Restaura en disco ÚNICAMENTE los archivos permitidos de la misión a partir de un checkpoint verificado,
   * garantizando que ningún archivo externo a la misión sea tocado.
   */
  restoreCheckpointToWorkspace(
    checkpoint: ImmutableCheckpoint,
    workspaceDir: string,
    allowedFiles: string[],
  ): void {
    this.verifyCheckpointIntegrity(checkpoint);
    const allowedSet = new Set(
      allowedFiles.map((f) => this.normalizeRelPath(f)),
    );
    const resolvedWorkspace = path.resolve(workspaceDir);

    for (const [relPath, content] of Object.entries(checkpoint.files)) {
      const normalized = this.normalizeRelPath(relPath);
      if (!allowedSet.has(normalized)) {
        throw new Error(
          `Seguridad de Rollback: el archivo "${relPath}" no pertenece a allowedFiles de la misión.`,
        );
      }

      const targetAbs = path.resolve(resolvedWorkspace, normalized);
      if (
        !targetAbs.startsWith(resolvedWorkspace + path.sep) &&
        targetAbs !== resolvedWorkspace
      ) {
        throw new Error(
          `Seguridad de Rollback: intento de escribir fuera del workspace (${targetAbs}).`,
        );
      }

      fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
      this.writeTextAtomically(targetAbs, content);
    }
  }

  /**
   * Limpia los checkpoints de una misión en disco (útil para teardown de tests).
   */
  clearMissionCheckpoints(missionId: string): void {
    const dir = this.getMissionStorageDir(missionId);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignorar
      }
    }
  }

  private persistCheckpointAtomically(checkpoint: ImmutableCheckpoint): void {
    const dir = this.getMissionStorageDir(checkpoint.missionId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(
      dir,
      `checkpoint_${checkpoint.attemptIndex}.json`,
    );
    this.writeJsonAtomically(filePath, checkpoint);
  }

  private writeJsonAtomically(filePath: string, data: unknown): void {
    this.writeTextAtomically(filePath, JSON.stringify(data, null, 2));
  }

  private writeTextAtomically(filePath: string, content: string): void {
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}`;
    try {
      fs.writeFileSync(tmpPath, content, 'utf8');
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // ignorar
        }
      }
      throw err;
    }
  }

  private filterAllowedFiles(
    files: Record<string, string>,
    allowedFiles: string[],
  ): Record<string, string> {
    const allowedSet = new Set(
      allowedFiles.map((f) => this.normalizeRelPath(f)),
    );
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(files)) {
      const norm = this.normalizeRelPath(k);
      if (allowedSet.has(norm)) {
        result[norm] = v;
      }
    }
    return result;
  }

  private normalizeRelPath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  }

  private deepFreeze<T>(obj: T): T {
    if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
      Object.freeze(obj);
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        this.deepFreeze((obj as Record<string, unknown>)[key]);
      }
    }
    return obj;
  }
}

