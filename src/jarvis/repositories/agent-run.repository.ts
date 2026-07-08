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
      },
    });
  }

  async getStats() {
    const [total, successful, failed, avgDuration] = await Promise.all([
      this.prisma.agentRun.count(),
      this.prisma.agentRun.count({ where: { success: true } }),
      this.prisma.agentRun.count({ where: { success: false } }),
      this.prisma.agentRun.aggregate({
        _avg: { durationMs: true },
      }),
    ]);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      avgDurationMs: avgDuration._avg.durationMs || 0,
    };
  }

  async getTopTools(limit = 10) {
    // Agregación manual porque Prisma no soporta bien JSON array aggregation
    const runs = await this.prisma.agentRun.findMany({
      where: { success: true },
      select: { toolsUsed: true },
    });

    const toolCounts = new Map<string, number>();
    runs.forEach((run) => {
      const tools: string[] = run.toolsUsed ? JSON.parse(run.toolsUsed as string) : [];
      tools?.forEach((tool) => {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      });
    });

    return Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async getRecentRuns(limit = 50): Promise<AgentRun[]> {
    return this.prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
