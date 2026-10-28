import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface MissionCheckpointStep {
  stepNumber: number;
  type: string;
  description: string;
  output: string;
  durationMs?: number;
  completedAt: string;
}

export interface MissionArtifact {
  path: string;
  hash: string;
  sizeBytes?: number;
  description?: string;
  createdAt: string;
}

export interface MissionCheckpoint {
  taskId: number;
  objective: string;
  sessionId?: string;
  status: 'pending' | 'in_progress' | 'waiting_approval' | 'waiting_recovery' | 'completed' | 'failed';
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: MissionCheckpointStep[];
  accumulatedContext: string[];
  artifacts: MissionArtifact[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MissionCheckpointService {
  private readonly logger = new Logger(MissionCheckpointService.name);
  private readonly checkpointsDir: string;

  constructor() {
    this.checkpointsDir = path.resolve(process.cwd(), 'storage', 'checkpoints');
    this.ensureDirExists();
  }

  private ensureDirExists(): void {
    try {
      if (!fs.existsSync(this.checkpointsDir)) {
        fs.mkdirSync(this.checkpointsDir, { recursive: true });
      }
    } catch (err: any) {
      this.logger.error(`Error asegurando directorio de checkpoints: ${err.message}`);
    }
  }

  private getFilePath(taskId: number): string {
    return path.join(this.checkpointsDir, `mission_${taskId}.checkpoint.json`);
  }

  /**
   * Guarda de forma atómica el checkpoint incremental en disco.
   * Utiliza archivo temporal y renombrado atómico para prevenir corrupción en fallos súbitos.
   */
  saveCheckpoint(checkpoint: MissionCheckpoint): void {
    this.ensureDirExists();
    const filePath = this.getFilePath(checkpoint.taskId);
    const tmpPath = `${filePath}.tmp.${Date.now()}`;

    try {
      checkpoint.updatedAt = new Date().toISOString();
      const content = JSON.stringify(checkpoint, null, 2);
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, filePath);
      this.logger.debug(
        `Checkpoint guardado para misión #${checkpoint.taskId} (pasos completados: ${checkpoint.completedSteps.length}/${checkpoint.totalSteps})`,
      );
    } catch (err: any) {
      this.logger.error(`Error al persistir checkpoint #${checkpoint.taskId}: ${err.message}`);
      // Limpiar archivo temporal si quedó huérfano
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // ignorar
        }
      }
    }
  }

  /**
   * Carga el checkpoint de una misión si existe en disco.
   */
  loadCheckpoint(taskId: number): MissionCheckpoint | null {
    const filePath = this.getFilePath(taskId);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as MissionCheckpoint;
    } catch (err: any) {
      this.logger.error(`Error leyendo checkpoint #${taskId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Elimina un checkpoint de disco cuando una misión ha finalizado y archivado.
   */
  deleteCheckpoint(taskId: number): boolean {
    const filePath = this.getFilePath(taskId);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        return true;
      } catch (err: any) {
        this.logger.error(`Error eliminando checkpoint #${taskId}: ${err.message}`);
      }
    }
    return false;
  }

  /**
   * Lista todos los checkpoints activos guardados en disco.
   */
  listCheckpoints(): MissionCheckpoint[] {
    this.ensureDirExists();
    const results: MissionCheckpoint[] = [];

    try {
      const files = fs.readdirSync(this.checkpointsDir);
      for (const file of files) {
        if (file.startsWith('mission_') && file.endsWith('.checkpoint.json')) {
          try {
            const raw = fs.readFileSync(path.join(this.checkpointsDir, file), 'utf-8');
            results.push(JSON.parse(raw));
          } catch {
            // ignorar archivos corruptos
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Error listando checkpoints: ${err.message}`);
    }

    return results;
  }
}
