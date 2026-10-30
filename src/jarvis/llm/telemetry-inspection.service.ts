import { Injectable, Optional } from '@nestjs/common';
import {
  ContextBudgetEvaluation,
  ContextWindowTier,
  evaluateContextWindowBudget,
} from './inference-context-budget';
import { InferenceDiagnosticsService } from './inference-diagnostics.service';
import { EngineeringMissionManagerService } from '../verification/engineering-mission-manager.service';

export interface TokenCallSample {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensPerSecond?: number;
  latencyMs: number;
  contextTier: ContextWindowTier;
  missionId?: string;
}

export interface TokenTelemetryReport {
  timestamp: string;
  totals: {
    callsCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    avgTokensPerSecond: number;
    avgLatencyMs: number;
  };
  tierDistribution: Record<ContextWindowTier, number>;
  contextEvaluation: ContextBudgetEvaluation;
  selfRegulation: {
    shouldCompactContext: boolean;
    recommendedMaxOutputTokens: number;
    status: 'OPTIMAL' | 'MODERATE_LOAD' | 'NEAR_LIMIT' | 'OVER_BUDGET';
    guidance: string[];
  };
  recentSamples: TokenCallSample[];
}

export interface MissionBudgetSummaryItem {
  missionId: string;
  status: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  maxTotalTokens: number;
  tokenUtilizationPercent: number;
  repairsUsed: number;
  maxRepairs: number;
  durationMs: number;
  maxDurationMs: number;
  budgetExceeded: boolean;
  exceededReason?: string;
}

export interface BudgetTelemetryReport {
  timestamp: string;
  defaultLimits: {
    maxContextTokens: number;
    reservedOutputTokens: number;
    maxSafeInputTokens: number;
    defaultMissionMaxTokens: number;
    defaultMissionMaxRepairs: number;
    defaultMissionMaxDurationMs: number;
  };
  activeEvaluation: ContextBudgetEvaluation;
  missionsCount: number;
  missionsExceedingBudget: number;
  missions: MissionBudgetSummaryItem[];
}

/**
 * TelemetryInspectionService — Exposición programática de consumo de tokens y presupuesto
 * para auto-inspección de JarBees y agentes de IA (sin panel visual humano innecesario).
 */
@Injectable()
export class TelemetryInspectionService {
  private readonly recordedSamples: TokenCallSample[] = [];
  private readonly maxSamplesHistory = 200;
  private readonly defaultMaxContextTokens = parseInt(
    process.env.LLAMACPP_CTX_SIZE || '6144',
    10,
  );
  private readonly defaultReservedOutputTokens = parseInt(
    process.env.LLAMACPP_RESERVED_OUTPUT_TOKENS || '1024',
    10,
  );

  constructor(
    @Optional()
    private readonly missionManager?: EngineeringMissionManagerService,
    @Optional()
    private readonly diagnosticsService?: InferenceDiagnosticsService,
  ) {}

  /**
   * Registra una muestra de consumo de tokens de cualquier llamada de inferencia.
   */
  recordTokenUsage(sample: {
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    tokensPerSecond?: number;
    latencyMs: number;
    missionId?: string;
  }): TokenCallSample {
    const totalTokens = sample.promptTokens + sample.completionTokens;
    const budgetEval = evaluateContextWindowBudget(
      sample.promptTokens,
      this.defaultMaxContextTokens,
      this.defaultReservedOutputTokens,
    );

    const entry: TokenCallSample = {
      id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      provider: sample.provider,
      model: sample.model,
      promptTokens: sample.promptTokens,
      completionTokens: sample.completionTokens,
      totalTokens,
      tokensPerSecond: sample.tokensPerSecond,
      latencyMs: sample.latencyMs,
      contextTier: budgetEval.tier,
      missionId: sample.missionId,
    };

    this.recordedSamples.unshift(entry);
    if (this.recordedSamples.length > this.maxSamplesHistory) {
      this.recordedSamples.length = this.maxSamplesHistory;
    }

    return entry;
  }

  /**
   * Devuelve el reporte consolidado de telemetría de tokens para consulta de la IA.
   */
  getTokenTelemetryReport(options?: {
    missionId?: string;
    currentPromptTokens?: number;
    maxContextTokens?: number;
    reservedOutputTokens?: number;
  }): TokenTelemetryReport {
    const maxContext = options?.maxContextTokens ?? this.defaultMaxContextTokens;
    const reservedOutput =
      options?.reservedOutputTokens ?? this.defaultReservedOutputTokens;

    const allSamples = this.collectAllSamples(options?.missionId);

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let speedSum = 0;
    let speedCount = 0;
    let latencySum = 0;

    const tierDistribution: Record<ContextWindowTier, number> = {
      BELOW_2K: 0,
      '2K_3K_LOCALIZED': 0,
      '4K_5K_MULTICOMPONENT': 0,
      '5K_6K_NEAR_LIMIT': 0,
      OVERFLOW_RISK: 0,
    };

    for (const s of allSamples) {
      promptTokens += s.promptTokens;
      completionTokens += s.completionTokens;
      totalTokens += s.totalTokens;
      latencySum += s.latencyMs;
      if (s.tokensPerSecond && s.tokensPerSecond > 0) {
        speedSum += s.tokensPerSecond;
        speedCount += 1;
      }
      tierDistribution[s.contextTier] =
        (tierDistribution[s.contextTier] || 0) + 1;
    }

    const callsCount = allSamples.length;
    const avgTokensPerSecond =
      speedCount > 0 ? Number((speedSum / speedCount).toFixed(2)) : 0;
    const avgLatencyMs =
      callsCount > 0 ? Math.round(latencySum / callsCount) : 0;

    const latestPromptTokens =
      options?.currentPromptTokens ??
      (allSamples.length > 0 ? allSamples[0].promptTokens : 0);

    const contextEvaluation = this.diagnosticsService
      ? this.diagnosticsService.evaluateContextBudget(
          latestPromptTokens,
          maxContext,
          reservedOutput,
        )
      : evaluateContextWindowBudget(
          latestPromptTokens,
          maxContext,
          reservedOutput,
        );

    const shouldCompactContext =
      contextEvaluation.tier === '5K_6K_NEAR_LIMIT' ||
      contextEvaluation.tier === 'OVERFLOW_RISK' ||
      !contextEvaluation.canFitRequest;

    let status: 'OPTIMAL' | 'MODERATE_LOAD' | 'NEAR_LIMIT' | 'OVER_BUDGET' =
      'OPTIMAL';
    const guidance: string[] = [];

    if (!contextEvaluation.canFitRequest || contextEvaluation.tier === 'OVERFLOW_RISK') {
      status = 'OVER_BUDGET';
      guidance.push(
        `ALERTA: Prompt (${latestPromptTokens} tokens) supera el máximo seguro (${contextEvaluation.availableForPrompt}). Compactar historial o podar WorkingMemory inmediatamente.`,
      );
    } else if (contextEvaluation.tier === '5K_6K_NEAR_LIMIT') {
      status = 'NEAR_LIMIT';
      guidance.push(
        `PRECAUCIÓN: Escalón 5K_6K_NEAR_LIMIT alcanzado (${(contextEvaluation.utilizationRatio * 100).toFixed(1)}%). Evitar adjuntar archivos completos adicionales; usar extractos o CoreContext.`,
      );
    } else if (contextEvaluation.tier === '4K_5K_MULTICOMPONENT') {
      status = 'MODERATE_LOAD';
      guidance.push(
        'Carga moderada (4K_5K_MULTICOMPONENT). El margen operativo es saludable pero se recomienda limitar la expansión de contexto RAG.',
      );
    } else {
      status = 'OPTIMAL';
      guidance.push(
        `Margen de contexto óptimo (${contextEvaluation.tier}). Capacidad plena para razonamiento y generación.`,
      );
    }

    const recommendedMaxOutputTokens = Math.max(
      256,
      Math.min(
        reservedOutput,
        maxContext - Math.min(latestPromptTokens, maxContext - 256),
      ),
    );

    return {
      timestamp: new Date().toISOString(),
      totals: {
        callsCount,
        promptTokens,
        completionTokens,
        totalTokens,
        avgTokensPerSecond,
        avgLatencyMs,
      },
      tierDistribution,
      contextEvaluation,
      selfRegulation: {
        shouldCompactContext,
        recommendedMaxOutputTokens,
        status,
        guidance,
      },
      recentSamples: allSamples.slice(0, 25),
    };
  }

  /**
   * Devuelve el estado de presupuestos de misiones de ingeniería y márgenes de contexto.
   */
  getBudgetTelemetryReport(options?: {
    missionId?: string;
    currentPromptTokens?: number;
  }): BudgetTelemetryReport {
    const maxSafeInputTokens = Math.max(
      0,
      this.defaultMaxContextTokens - this.defaultReservedOutputTokens,
    );
    const activeEvaluation = evaluateContextWindowBudget(
      options?.currentPromptTokens ?? 0,
      this.defaultMaxContextTokens,
      this.defaultReservedOutputTokens,
    );

    const records = this.missionManager
      ? this.missionManager.listMissionRecords()
      : [];

    const filtered = options?.missionId
      ? records.filter((r) => r.missionId === options.missionId)
      : records;

    const missions: MissionBudgetSummaryItem[] = filtered.map((r) => {
      const maxTotal = r.budget?.maxTotalTokens || 24000;
      const totalUsed = r.budgetUsage?.totalTokens || 0;
      const utilPercent =
        maxTotal > 0 ? Number(((totalUsed / maxTotal) * 100).toFixed(2)) : 0;

      return {
        missionId: r.missionId,
        status: r.status,
        promptTokens: r.budgetUsage?.promptTokens || 0,
        completionTokens: r.budgetUsage?.completionTokens || 0,
        totalTokens: totalUsed,
        maxTotalTokens: maxTotal,
        tokenUtilizationPercent: utilPercent,
        repairsUsed: r.budgetUsage?.repairsUsed || 0,
        maxRepairs: r.budget?.maxRepairs || 2,
        durationMs: r.budgetUsage?.durationMs || 0,
        maxDurationMs: r.budget?.maxDurationMs || 180000,
        budgetExceeded: Boolean(r.budgetUsage?.budgetExceeded),
        exceededReason: r.budgetUsage?.exceededReason,
      };
    });

    const missionsExceedingBudget = missions.filter(
      (m) => m.budgetExceeded,
    ).length;

    return {
      timestamp: new Date().toISOString(),
      defaultLimits: {
        maxContextTokens: this.defaultMaxContextTokens,
        reservedOutputTokens: this.defaultReservedOutputTokens,
        maxSafeInputTokens,
        defaultMissionMaxTokens: 24000,
        defaultMissionMaxRepairs: 2,
        defaultMissionMaxDurationMs: 180000,
      },
      activeEvaluation,
      missionsCount: missions.length,
      missionsExceedingBudget,
      missions,
    };
  }

  private collectAllSamples(filterMissionId?: string): TokenCallSample[] {
    const combined: TokenCallSample[] = [];
    const seenIds = new Set<string>();

    for (const s of this.recordedSamples) {
      if (filterMissionId && s.missionId !== filterMissionId) continue;
      combined.push(s);
      seenIds.add(s.id);
    }

    if (this.missionManager) {
      const records = this.missionManager.listMissionRecords();
      for (const rec of records) {
        if (filterMissionId && rec.missionId !== filterMissionId) continue;
        for (const call of rec.llmCallsHistory || []) {
          const callId = `${rec.missionId}_attempt_${call.attemptIndex}_${call.requestId}`;
          if (seenIds.has(callId)) continue;
          seenIds.add(callId);

          const pTokens = call.promptTokens ?? 0;
          const cTokens = call.completionTokens ?? 0;
          const tTokens = call.tokensUsed ?? pTokens + cTokens;
          const budgetEval = evaluateContextWindowBudget(
            pTokens,
            this.defaultMaxContextTokens,
            this.defaultReservedOutputTokens,
          );

          combined.push({
            id: callId,
            timestamp: rec.updatedAt || rec.createdAt,
            provider: call.provider,
            model: call.model,
            promptTokens: pTokens,
            completionTokens: cTokens,
            totalTokens: tTokens,
            tokensPerSecond: call.tokensPerSecond,
            latencyMs: call.durationMs,
            contextTier: budgetEval.tier,
            missionId: rec.missionId,
          });
        }
      }
    }

    return combined;
  }
}
