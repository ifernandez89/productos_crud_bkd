import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Document, Chunk } from '@prisma/client';

export interface CreateDocumentData {
  title: string;
  content: string;
  category?: string;
  source?: string;
}

export interface CreateChunkData {
  documentId: number;
  content: string;
  embeddingId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDocument(data: CreateDocumentData): Promise<Document> {
    return this.prisma.document.create({
      data: {
        title: data.title,
        content: data.content,
        category: data.category,
        source: data.source,
      },
    });
  }

  async createChunk(data: CreateChunkData): Promise<Chunk> {
    return this.prisma.chunk.create({
      data: {
        documentId: data.documentId,
        content: data.content,
        embeddingId: data.embeddingId,
        metadata: data.metadata || {},
      },
    });
  }

  async findDocuments(category?: string): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: category ? { category } : undefined,
      orderBy: { updatedAt: 'desc' },
      include: { chunks: true },
    });
  }

  async searchDocuments(query: string, limit = 5): Promise<Document[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 4);

    if (terms.length === 0) return [];

    return this.prisma.document.findMany({
      where: {
        OR: terms.flatMap((term) => [
          { title: { contains: term, mode: 'insensitive' } },
          { content: { contains: term, mode: 'insensitive' } },
        ]),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  async searchChunks(query: string, limit = 10): Promise<(Chunk & { document: Document })[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 4);

    if (terms.length === 0) return [];

    return this.prisma.chunk.findMany({
      where: {
        OR: terms.map((term) => ({
          content: { contains: term, mode: 'insensitive' },
        })),
      },
      include: { document: true },
      take: limit,
    }) as any;
  }

  async getDocumentWithChunks(id: number) {
    return this.prisma.document.findUnique({
      where: { id },
      include: { chunks: true },
    });
  }

  async deleteDocument(id: number): Promise<void> {
    await this.prisma.document.delete({ where: { id } });
  }
}
