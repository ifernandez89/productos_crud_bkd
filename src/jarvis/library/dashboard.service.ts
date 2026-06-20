import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentRepository } from '../repositories/document.repository';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentRepo: DocumentRepository,
  ) {}

  async getStats() {
    const [
      memories,
      conversations,
      sessions,
      collections,
      libraryStats,
      recentRuns,
      modelBreakdown,
    ] = await Promise.all([
      this.prisma.memory.count(),
      this.prisma.conversationMessage.count({ where: { role: 'user' } }),
      this.prisma.sessionSummary.count(),
      this.prisma.collection.count(),
      this.documentRepo.getLibraryStats(),
      this.prisma.agentRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          question: true,
          toolsUsed: true,
          modelUsed: true,
          durationMs: true,
          success: true,
          createdAt: true,
        },
      }),
      this.prisma.agentRun.groupBy({
        by: ['modelUsed'],
        _count: { id: true },
        _avg:   { durationMs: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    return {
      overview: {
        memories,
        conversations,
        sessions,
        collections,
        documents:  libraryStats.totalDocs,
        chunks:     libraryStats.totalChunks,
      },
      library: {
        topDocuments:      libraryStats.topDocs,
        byCategory:        libraryStats.byCategory,
        recentDocuments:   await this.documentRepo.getMostRecentDocuments(5),
      },
      agent: {
        recentRuns,
        modelBreakdown: modelBreakdown.map((m) => ({
          model:       m.modelUsed,
          runs:        m._count.id,
          avgLatencyMs: Math.round(m._avg.durationMs ?? 0),
        })),
      },
    };
  }
}
