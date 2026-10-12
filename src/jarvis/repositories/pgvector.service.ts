import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PgvectorService {
  private readonly logger = new Logger(PgvectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  validateEmbedding(embedding: number[]) {
    const expected = parseInt(process.env.EMBEDDING_DIM || '1024', 10);
    if (!Array.isArray(embedding))
      throw new Error('Embedding debe ser un array de números');
    if (expected && embedding.length !== expected) {
      throw new Error(
        `Embedding inválido: se esperaba dimensión ${expected}, pero se recibieron ${embedding.length}`,
      );
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

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] ** 2;
      normB += vecB[i] ** 2;
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private hasNativeVectorSupport: boolean | null = null;

  async isNativeVectorAvailable(): Promise<boolean> {
    if (this.hasNativeVectorSupport !== null) {
      return this.hasNativeVectorSupport;
    }
    try {
      const res = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'Chunk' AND column_name = 'embedding' 
        LIMIT 1;
      `);
      this.hasNativeVectorSupport = Array.isArray(res) && res.length > 0;
    } catch {
      this.hasNativeVectorSupport = false;
    }
    if (!this.hasNativeVectorSupport) {
      this.logger.debug(
        '[pgvector] Columna nativa embedding no detectada; utilizando motor de similitud vectorial en memoria.',
      );
    }
    return this.hasNativeVectorSupport;
  }

  async saveChunkEmbedding(chunkId: number, vector: number[]): Promise<void> {
    this.validateEmbedding(vector);
    if (await this.isNativeVectorAvailable()) {
      try {
        const vectorString = this.vectorToString(vector);
        await this.prisma.$executeRaw`
          UPDATE "Chunk"
          SET "embedding" = ${vectorString}::vector
          WHERE "id" = ${chunkId}
        `;
        return;
      } catch (err: any) {
        this.logger.warn(
          `[pgvector] Error guardando embedding nativo: ${err.message}`,
        );
      }
    }

    // Fallback: Guardar vector en metadata JSON
    const chunk = await this.prisma.chunk.findUnique({
      where: { id: chunkId },
      select: { metadata: true },
    });
    let meta: Record<string, any> = {};
    try {
      if (chunk?.metadata) meta = JSON.parse(chunk.metadata);
    } catch {}
    meta.vector = vector;
    await this.prisma.chunk.update({
      where: { id: chunkId },
      data: { metadata: JSON.stringify(meta) },
    });
  }

  async searchChunksSemantic(embedding: number[], limit = 10) {
    this.validateEmbedding(embedding);
    if (await this.isNativeVectorAvailable()) {
      try {
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
            d.status,
            d."timesUsed",
            d."lastUsed",
            d."createdAt",
            d."updatedAt",
            1 - (c.embedding <=> ${vectorString}::vector) AS similarity
          FROM "Chunk" c
          JOIN "Document" d ON d.id = c."documentId"
          WHERE c.embedding IS NOT NULL
            AND d.status = 'ready'
          ORDER BY c.embedding <=> ${vectorString}::vector
          LIMIT ${limit};
        `;
        return rows;
      } catch (err: any) {
        this.logger.debug(
          `[pgvector] pgvector nativo no disponible, usando fallback en memoria: ${err.message}`,
        );
      }
    }

    const chunks = await this.prisma.chunk.findMany({
      where: { document: { status: 'ready' } },
      include: { document: true },
      take: 300,
      orderBy: { id: 'desc' },
    });

    const scored: any[] = [];
    for (const c of chunks) {
      if (!c.metadata) continue;
      try {
        const meta = JSON.parse(c.metadata);
        if (meta.vector && Array.isArray(meta.vector)) {
          const sim = this.cosineSimilarity(embedding, meta.vector);
          scored.push({
            id: c.id,
            documentId: c.documentId,
            content: c.content,
            metadata: c.metadata,
            embeddingId: c.embeddingId,
            sourceId: c.document.sourceId,
            title: c.document.title,
            contentDoc: c.document.content,
            category: c.document.category,
            source: c.document.source,
            status: c.document.status,
            timesUsed: c.document.timesUsed,
            lastUsed: c.document.lastUsed,
            createdAt: c.document.createdAt,
            updatedAt: c.document.updatedAt,
            similarity: sim,
          });
        }
      } catch {}
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  async searchChunksSemanticInDocuments(
    embedding: number[],
    documentIds: number[],
    limit = 10,
  ) {
    if (documentIds.length === 0) return [];
    this.validateEmbedding(embedding);
    if (await this.isNativeVectorAvailable()) {
      try {
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
            d.status,
            d."timesUsed",
            d."lastUsed",
            d."createdAt",
            d."updatedAt",
            1 - (c.embedding <=> ${vectorString}::vector) AS similarity
          FROM "Chunk" c
          JOIN "Document" d ON d.id = c."documentId"
          WHERE c.embedding IS NOT NULL
            AND d.status = 'ready'
            AND c."documentId" = ANY(${documentIds})
          ORDER BY c.embedding <=> ${vectorString}::vector
          LIMIT ${limit};
        `;
        return rows;
      } catch (err: any) {
        // Fallback
      }
    }

    const chunks = await this.prisma.chunk.findMany({
      where: {
        documentId: { in: documentIds },
        document: { status: 'ready' },
      },
      include: { document: true },
    });

    const scored: any[] = [];
    for (const c of chunks) {
      if (!c.metadata) continue;
      try {
        const meta = JSON.parse(c.metadata);
        if (meta.vector && Array.isArray(meta.vector)) {
          const sim = this.cosineSimilarity(embedding, meta.vector);
          scored.push({
            id: c.id,
            documentId: c.documentId,
            content: c.content,
            metadata: c.metadata,
            embeddingId: c.embeddingId,
            sourceId: c.document.sourceId,
            title: c.document.title,
            contentDoc: c.document.content,
            category: c.document.category,
            source: c.document.source,
            status: c.document.status,
            timesUsed: c.document.timesUsed,
            lastUsed: c.document.lastUsed,
            createdAt: c.document.createdAt,
            updatedAt: c.document.updatedAt,
            similarity: sim,
          });
        }
      } catch {}
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  async saveChapterEmbedding(
    chapterId: number,
    vector: number[],
  ): Promise<void> {
    this.validateEmbedding(vector);
    if (!(await this.isNativeVectorAvailable())) return;
    try {
      const vectorString = this.vectorToString(vector);
      await this.prisma.$executeRaw`
        UPDATE "Chapter"
        SET "embedding" = ${vectorString}::vector
        WHERE "id" = ${chapterId}
      `;
    } catch {}
  }

  async saveSectionEmbedding(
    sectionId: number,
    vector: number[],
  ): Promise<void> {
    this.validateEmbedding(vector);
    if (!(await this.isNativeVectorAvailable())) return;
    try {
      const vectorString = this.vectorToString(vector);
      await this.prisma.$executeRaw`
        UPDATE "Section"
        SET "embedding" = ${vectorString}::vector
        WHERE "id" = ${sectionId}
      `;
    } catch {}
  }

  async searchChaptersSemantic(embedding: number[], limit = 5) {
    this.validateEmbedding(embedding);
    if (!(await this.isNativeVectorAvailable())) return [];
    try {
      const vectorString = this.vectorToString(embedding);
      const rows = await this.prisma.$queryRaw`
        SELECT
          ch.id,
          ch."documentId",
          ch.title,
          ch."order",
          ch.summary,
          1 - (ch.embedding <=> ${vectorString}::vector) AS similarity
        FROM "Chapter" ch
        JOIN "Document" d ON d.id = ch."documentId"
        WHERE ch.embedding IS NOT NULL
          AND d.status = 'ready'
        ORDER BY ch.embedding <=> ${vectorString}::vector
        LIMIT ${limit};
      `;
      return rows;
    } catch {
      return [];
    }
  }

  async searchChaptersSemanticInDocuments(
    embedding: number[],
    documentIds: number[],
    limit = 5,
  ) {
    if (documentIds.length === 0) return [];
    this.validateEmbedding(embedding);
    if (!(await this.isNativeVectorAvailable())) return [];
    try {
      const vectorString = this.vectorToString(embedding);
      const rows = await this.prisma.$queryRaw`
        SELECT
          ch.id,
          ch."documentId",
          ch.title,
          ch."order",
          ch.summary,
          1 - (ch.embedding <=> ${vectorString}::vector) AS similarity
        FROM "Chapter" ch
        JOIN "Document" d ON d.id = ch."documentId"
        WHERE ch.embedding IS NOT NULL
          AND d.status = 'ready'
          AND ch."documentId" = ANY(${documentIds})
        ORDER BY ch.embedding <=> ${vectorString}::vector
        LIMIT ${limit};
      `;
      return rows;
    } catch {
      return [];
    }
  }

  async searchChunksSemanticInChapters(
    embedding: number[],
    chapterIds: number[],
    limit = 10,
  ) {
    if (chapterIds.length === 0) return [];
    this.validateEmbedding(embedding);
    if (!(await this.isNativeVectorAvailable())) return [];
    try {
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
          d.status,
          d."timesUsed",
          d."lastUsed",
          d."createdAt",
          d."updatedAt",
          1 - (c.embedding <=> ${vectorString}::vector) AS similarity
        FROM "Chunk" c
        JOIN "Document" d ON d.id = c."documentId"
        JOIN "Section" s ON s.id = c."sectionId"
        WHERE c.embedding IS NOT NULL
          AND d.status = 'ready'
          AND s."chapterId" = ANY(${chapterIds})
        ORDER BY c.embedding <=> ${vectorString}::vector
        LIMIT ${limit};
      `;
      return rows;
    } catch {
      return [];
    }
  }
}
