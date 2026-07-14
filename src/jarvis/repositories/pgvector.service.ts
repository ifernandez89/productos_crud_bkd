import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PgvectorService {
  private readonly logger = new Logger(PgvectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  validateEmbedding(embedding: number[]) {
    const expected = parseInt(process.env.EMBEDDING_DIM || '1024', 10);
    if (!Array.isArray(embedding)) throw new Error('Embedding debe ser un array de números');
    if (expected && embedding.length !== expected) {
      throw new Error(`Embedding inválido: se esperaba dimensión ${expected}, pero se recibieron ${embedding.length}`);
    }
    for (const v of embedding) {
      if (typeof v !== 'number' || !isFinite(v)) {
        throw new Error('Embedding contiene valores no numéricos o no finitos');
      }
    }
  }

  private vectorToString(embedding: number[]) {
    return `[${embedding.map((value) => Number(value).toPrecision(15)).join(',')}]`;
  }

  async saveChunkEmbedding(chunkId: number, vector: number[]): Promise<void> {
    this.validateEmbedding(vector);
    const vectorString = this.vectorToString(vector);
    await this.prisma.$executeRaw`
      UPDATE "Chunk"
      SET "embedding" = ${vectorString}::vector
      WHERE "id" = ${chunkId}
    `;
  }

  async searchChunksSemantic(embedding: number[], limit = 10) {
    this.validateEmbedding(embedding);
    const vectorString = this.vectorToString(embedding);
    const rows = await this.prisma.$queryRaw`
      SELECT
        c.id,
        c."documentId",
        c.content,
        c.metadata,
        c."embeddingId",
        d."sourceId",
        d.title,
        d.content AS "contentDoc",
        d.category,
        d.source,
        d."timesUsed",
        d."lastUsed",
        d."createdAt",
        d."updatedAt",
        1 - (c.embedding <=> ${vectorString}::vector) AS similarity
      FROM "Chunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vectorString}::vector
      LIMIT ${limit};
    `;
    return rows;
  }

  async searchChunksSemanticInDocuments(embedding: number[], documentIds: number[], limit = 10) {
    if (documentIds.length === 0) return [];
    this.validateEmbedding(embedding);
    const vectorString = this.vectorToString(embedding);
    const rows = await this.prisma.$queryRaw`
      SELECT
        c.id,
        c."documentId",
        c.content,
        c.metadata,
        c."embeddingId",
        d."sourceId",
        d.title,
        d.content AS "contentDoc",
        d.category,
        d.source,
        d."timesUsed",
        d."lastUsed",
        d."createdAt",
        d."updatedAt",
        1 - (c.embedding <=> ${vectorString}::vector) AS similarity
      FROM "Chunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE c.embedding IS NOT NULL AND c."documentId" = ANY(${documentIds})
      ORDER BY c.embedding <=> ${vectorString}::vector
      LIMIT ${limit};
    `;
    return rows;
  }
}
