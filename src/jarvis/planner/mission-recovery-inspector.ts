import * as crypto from 'crypto';
import {
  MissionCheckpoint,
  MissionCheckpointStep,
} from './mission-checkpoint.service';
import {
  CheckpointReconciliationReport,
  ReconciledStepState,
  TaskStepRecord,
} from './mission-recovery.contracts';

export function computeCheckpointStepsHash(
  steps: MissionCheckpointStep[],
): string {
  const normalized = [...(steps || [])]
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((s) => `${s.stepNumber}:${s.type}:${(s.output || '').trim()}`)
    .join('|');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function reconcileTaskWithCheckpoint(
  taskId: number,
  dbSteps: TaskStepRecord[],
  checkpoint: MissionCheckpoint | null,
): CheckpointReconciliationReport {
  const diskMap = new Map<number, MissionCheckpointStep>();
  for (const s of checkpoint?.completedSteps || []) {
    if (s && typeof s.stepNumber === 'number' && (s.output || '').trim()) {
      diskMap.set(s.stepNumber, s);
    }
  }

  let completedCount = 0;
  let recoveredFromDiskCount = 0;
  const steps: ReconciledStepState[] = [];

  for (const dbStep of dbSteps || []) {
    const diskStep = diskMap.get(dbStep.stepNumber);
    if (dbStep.status === 'completed') {
      completedCount++;
      steps.push({
        stepNumber: dbStep.stepNumber,
        effectiveStatus: 'completed',
        output: dbStep.result || diskStep?.output,
        recoveredFromDisk: false,
      });
    } else if (diskStep) {
      completedCount++;
      recoveredFromDiskCount++;
      steps.push({
        stepNumber: dbStep.stepNumber,
        effectiveStatus: 'completed',
        output: diskStep.output,
        recoveredFromDisk: true,
      });
    } else {
      steps.push({
        stepNumber: dbStep.stepNumber,
        effectiveStatus: 'pending',
        recoveredFromDisk: false,
      });
    }
  }

  const totalSteps = steps.length;
  const pendingCount = totalSteps - completedCount;
  const progressRatio =
    totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) / 100 : 0;

  return {
    taskId,
    totalSteps,
    completedCount,
    pendingCount,
    recoveredFromDiskCount,
    hasDesync: recoveredFromDiskCount > 0,
    progressRatio,
    checkpointStepsHash: computeCheckpointStepsHash(
      checkpoint?.completedSteps || [],
    ),
    steps,
  };
}
