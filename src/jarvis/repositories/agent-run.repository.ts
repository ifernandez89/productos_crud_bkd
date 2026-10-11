import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRun } from '@prisma/client';

export interface CreateAgentRunData {
  sessionId?: string;
  question: string;
  answer?: string;
  toolsUsed?: string[];
  modelUsed: string;
  provider: string;
  durationMs: number;
  tokensUsed?: number;
  success: boolean;
  errorMsg?: string;

  // ── Observabilidad Cognitiva ──────────────────────────────────────────
  intentClassified?: string;
  intentConfidence?: number;
  chunksRetrievedIds?: number[];
  chunksRetrievedCount?: number;
  ragContextUsed?: boolean;
  webSearchUsed?: boolean;
  dialecticUsed?: boolean;
  auditPhaseMs?: number;
  synthesisPhaseMs?: number;
  tensionsDetected?: boolean;
  executionTrace?: any;
}

@Injectable()
export class AgentRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAgentRunData): Promise<AgentRun> {
    return this.prisma.agentRun.create({
      data: {
        sessionId: data.sessionId,
        question: data.question,
        answer: data.answer,
        toolsUsed: JSON.stringify(data.toolsUsed || []),
        modelUsed: data.modelUsed,
        provider: data.provider,
        durationMs: data.durationMs,
        tokensUsed: data.tokensUsed,
        success: data.success,
        errorMsg: data.errorMsg,

        // Observabilidad Cognitiva
        intentClassified: data.intentClassified,
        intentConfidence: data.intentConfidence,
        chunksRetrievedIds: data.chunksRetrievedIds
          ? JSON.stringify(data.chunksRetrievedIds)
          : null,
        chunksRetrievedCount: data.chunksRetrievedCount,
        ragContextUsed: data.ragContextUsed ?? false,
        webSearchUsed: data.webSearchUsed ?? false,
        dialecticUsed: data.dialecticUsed ?? false,
        auditPhaseMs: data.auditPhaseMs,
        synthesisPhaseMs: data.synthesisPhaseMs,
        tensionsDetected: data.tensionsDetected,
        executionTrace: data.executionTrace
          ? JSON.stringify(data.executionTrace)
          : null,
      },
    });
  }

  async findById(id: number) {
    return this.prisma.agentRun.findUnique({
      where: { id },
      include: {
        cognitiveTrace: true,
        claimEvidences: true,
      },
    });
  }

  async getRunWithExplanation(id: number) {
    const run = await this.findById(id);
    if (!run) return null;

    let parsedTools: string[] = [];
    try {
      parsedTools = run.toolsUsed ? JSON.parse(run.toolsUsed) : [];
    } catch {}

    let parsedChunksIds: number[] = [];
    try {
      parsedChunksIds = run.chunksRetrievedIds
        ? JSON.parse(run.chunksRetrievedIds)
        : [];
    } catch {}

    let parsedExecutionTrace: any = null;
    try {
      parsedExecutionTrace = run.executionTrace
        ? JSON.parse(run.executionTrace)
        : null;
    } catch {}

    const trace = run.cognitiveTrace;
    const claims = run.claimEvidences || [];

    return {
      runId: run.id,
      sessionId: run.sessionId,
      timestamp: run.createdAt,
      question: run.question,
      answer: run.answer,
      metrics: {
        totalDurationMs: run.durationMs,
        auditPhaseMs: run.auditPhaseMs,
        synthesisPhaseMs: run.synthesisPhaseMs,
        tokensUsed: run.tokensUsed,
        modelUsed: run.modelUsed,
        provider: run.provider,
        success: run.success,
      },
      routing: {
        intentClassified: run.intentClassified,
        intentConfidence: run.intentConfidence,
        toolsUsed: parsedTools,
        ragContextUsed: run.ragContextUsed,
        webSearchUsed: run.webSearchUsed,
        dialecticUsed: run.dialecticUsed,
      },
      evidenceRetrieval: {
        chunksCount: run.chunksRetrievedCount || parsedChunksIds.length,
        chunkIds: parsedChunksIds,
        coverageScore: trace?.coverageScore,
        distractorsFound: trace?.distractorsFound,
      },
      cognitiveStages: {
        auditReport: trace?.auditReport,
        premisesChecked: trace?.premisesChecked
          ? JSON.parse(trace.premisesChecked)
          : null,
        attributionsValid: trace?.attributionsValid,
        tensionsDetected: run.tensionsDetected,
        hypothesesCount: trace?.hypothesesCount,
        uncertaintyLevel: trace?.uncertaintyLevel,
        executionTrace: parsedExecutionTrace,
      },
      claimsBreakdown: claims.map((c) => ({
        id: c.id,
        claim: c.claim,
        status: c.status,
        author: c.author,
        document: c.document,
        supportingChunkIds: c.supportingChunkIds
          ? JSON.parse(c.supportingChunkIds)
          : [],
        contradictingChunkIds: c.contradictingChunkIds
          ? JSON.parse(c.contradictingChunkIds)
          : [],
        limitations: c.limitations ? JSON.parse(c.limitations) : [],
      })),
    };
  }

  async getStats() {
    const [total, successful, failed, avgDuration, withDialectic, withRAG] =
      await Promise.all([
        this.prisma.agentRun.count(),
        this.prisma.agentRun.count({ where: { success: true } }),
        this.prisma.agentRun.count({ where: { success: false } }),
        this.prisma.agentRun.aggregate({
          _avg: { durationMs: true },
        }),
        this.prisma.agentRun.count({ where: { dialecticUsed: true } }),
        this.prisma.agentRun.count({ where: { ragContextUsed: true } }),
      ]);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      avgDurationMs: avgDuration._avg.durationMs || 0,
      dialecticUsageRate: total > 0 ? (withDialectic / total) * 100 : 0,
      ragUsageRate: total > 0 ? (withRAG / total) * 100 : 0,
    };
  }

  async getTopTools(limit = 10) {
    const runs = await this.prisma.agentRun.findMany({
      where: { success: true },
      select: { toolsUsed: true },
    });

    const toolCounts = new Map<string, number>();
    runs.forEach((run) => {
      let tools: string[] = [];
      try {
        tools = run.toolsUsed ? JSON.parse(run.toolsUsed) : [];
      } catch {}
      tools?.forEach((tool) => {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      });
    });

    return Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(limit);
  }

  async getRecentRuns(limit = 50): Promise<AgentRun[]> {
    return this.prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        cognitiveTrace: {
          select: {
            coverageScore: true,
            attributionsValid: true,
            uncertaintyLevel: true,
          },
        },
        _count: {
          select: { claimEvidences: true },
        },
      },
    });
  }

  async evaluateClaim(
    runId: number,
    claimId: number,
    data: { status: string; limitations?: string[] },
  ) {
    const claim = await this.prisma.claimEvidence.findUnique({
      where: { id: claimId },
    });
    if (!claim) {
      throw new Error(`Claim #${claimId} no encontrado`);
    }
    if (claim.agentRunId !== runId) {
      throw new Error(
        `Violación de integridad: El Claim #${claimId} no pertenece al AgentRun #${runId}`,
      );
    }

    return this.prisma.claimEvidence.update({
      where: { id: claimId },
      data: {
        status: data.status,
        ...(data.limitations
          ? { limitations: JSON.stringify(data.limitations) }
          : {}),
      },
    });
  }
}
