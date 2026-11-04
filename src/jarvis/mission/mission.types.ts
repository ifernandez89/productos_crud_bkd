/**
 * JarBees Cognitive Architecture (JCA) — Mission Engine Types
 * Tipos formales para la ejecución agéntica asíncrona, máquina de estados y persistencia incremental.
 */

import { TaskEnvelope } from '../tools/task-envelope/task-envelope.types';

export type MissionLifecycleState =
  | 'PENDING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'OBSERVING'
  | 'VERIFYING'
  | 'CHECKPOINTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'STANDBY';

export interface MissionSubtask {
  readonly id: string;
  readonly description: string;
  readonly tool: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  evidence?: {
    verified: boolean;
    hash?: string;
    exitCode?: number;
    diff?: string;
    summary?: string;
  };
}

export interface MissionCheckpointRecord {
  readonly stepIndex: number;
  readonly state: MissionLifecycleState;
  readonly timestamp: Date;
  readonly evidenceHash: string;
}

export interface MissionDefinition {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly envelope: TaskEnvelope;
  state: MissionLifecycleState;
  readonly subtasks: MissionSubtask[];
  readonly checkpoints: MissionCheckpointRecord[];
  readonly createdAt: Date;
  updatedAt: Date;
  error?: string;
  finalEvidence?: any;
}

export interface MissionEventNotification {
  readonly missionId: string;
  readonly type: 'STARTED' | 'STEP_COMPLETED' | 'STEP_FAILED' | 'CHECKPOINT' | 'FINISHED';
  readonly message: string;
  readonly timestamp: Date;
}

