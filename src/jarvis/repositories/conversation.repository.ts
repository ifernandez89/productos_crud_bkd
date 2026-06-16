import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationMessage } from '@prisma/client';

export interface CreateMessageData {
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateMessageData): Promise<ConversationMessage> {
    return this.prisma.conversationMessage.create({
      data: {
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        metadata: data.metadata || {},
      },
    });
  }

  async getBySession(
    sessionId: string,
    limit = 50,
  ): Promise<ConversationMessage[]> {
    return this.prisma.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRecentMessages(
    sessionId: string,
    limit = 10,
  ): Promise<ConversationMessage[]> {
    const messages = await this.prisma.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return messages.reverse(); // cronológico ascendente para el LLM
  }

  async searchAcrossSessions(query: string, limit = 5): Promise<ConversationMessage[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 4);

    if (terms.length === 0) return [];

    return this.prisma.conversationMessage.findMany({
      where: {
        role: { in: ['user', 'assistant'] },
        OR: terms.map((term) => ({
          content: { contains: term, mode: 'insensitive' },
        })),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.conversationMessage.deleteMany({
      where: { sessionId },
    });
  }
}
