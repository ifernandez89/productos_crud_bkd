import { MissionCheckpointStep } from './mission-checkpoint.service';

export type RecoverableStepType =
  | 'search'
  | 'scrape'
  | 'read_memory'
  | 'read_docs'
  | 'summarize'
  | 'save'
  | 'deduplicate'
  | 'verify_code'
  | 'respond';

export type RecoverableStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface TaskStepRecord {
  id: number;
  stepNumber: number;
  description: string;
  status: RecoverableStepStatus | string;
  result?: string | null;
}

export interface ReconciledStepState {
  stepNumber: number;
  effectiveStatus: 'completed' | 'pending';
  output?: string;
  recoveredFromDisk: boolean;
}

export interface CheckpointReconciliationReport {
  taskId: number;
  totalSteps: number;
  completedCount: number;
  pendingCount: number;
  recoveredFromDiskCount: number;
  hasDesync: boolean;
  progressRatio: number;
  checkpointStepsHash: string;
  steps: ReconciledStepState[];
}

export interface RecoverableStepDescriptor {
  id: number;
  stepNumber: number;
  description: string;
  type: RecoverableStepType;
  status: 'completed' | 'pending';
  reusedFromCheckpoint: boolean;
  outputContent?: string;
  query: string;
  url?: string;
}

export interface CheckpointStepHashInput {
  steps: MissionCheckpointStep[];
}
