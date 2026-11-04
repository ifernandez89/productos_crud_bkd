/**
 * JarBees Cognitive Architecture (JCA) — Fase 4: Adaptive Model Orchestration
 * Tipos formales para selección adaptativa de modelos, gestión de VRAM en RTX 5070 y límites KV-cache.
 */

import { TaskIntent } from '../tools/task-envelope/task-envelope.types';
import { DialogueTurnType } from '../dialogue/dialogue.types';

export type ModelTier =
  | 'TIER_0_FAST'
  | 'TIER_1_BALANCED'
  | 'TIER_2_DEEP'
  | 'TIER_3_HEAVY'
  | 'EMBEDDING';

export interface ModelDescriptor {
  readonly id: string;
  readonly name: string;
  readonly tier: ModelTier;
  readonly vramWeightMb: number;
  readonly kvCachePer1kTokensMb: number;
  readonly maxContextTokens: number;
  readonly defaultQuantization: string;
  readonly targetLatencyMs: number;
  readonly isResidentByDefault: boolean;
}

export interface HardwareVramState {
  readonly totalVramMb: number;
  readonly reservedSystemBufferMb: number;
  loadedModelIds: string[];
  activeKvTokens: number;
}

export interface ModelSelectionRequest {
  readonly conversationId: string;
  readonly turnType?: DialogueTurnType;
  readonly taskIntent?: TaskIntent;
  readonly userMessage: string;
  readonly estimatedTokens: number;
  readonly latencyToleranceMs?: number;
  readonly requiresCodeExpertise?: boolean;
}

export interface ModelSelectionDecision {
  readonly selectedModel: ModelDescriptor;
  readonly tier: ModelTier;
  readonly reason: string;
  readonly modelsToOffload: string[];
  readonly estimatedVramUsageMb: number;
  readonly estimatedLatencyMs: number;
  readonly fitsInGpu: boolean;
}
