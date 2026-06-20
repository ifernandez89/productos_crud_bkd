import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    sessionId?: string;
    question: string;
    answer: string;
    score: number;
    comment?: string;
  }) {
    return this.prisma.feedback.create({
      data,
    });
  }

  async findRecent(limit = 50) {
    return this.prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
