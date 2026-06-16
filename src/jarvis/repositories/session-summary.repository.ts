import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionSummary } from '@prisma/client';

@Injectable()
export class SessionSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(sessionId: string, summary: string): Promise<SessionSummary> {
    return this.prisma.sessionSummary.upsert({
      where: { sessionId },
      update: {
        summary,
        updatedAt: new Date(),
      },
      create: {
        sessionId,
        summary,
      },
    });
  }

  async get(sessionId: string): Promise<SessionSummary | null> {
    return this.prisma.sessionSummary.findUnique({
      where: { sessionId },
    });
  }

  async delete(sessionId: string): Promise<void> {
    await this.prisma.sessionSummary.delete({
      where: { sessionId },
    });
  }
}
