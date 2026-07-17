import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PgvectorService } from './pgvector.service';
import { EmbeddingsService } from '../library/embeddings.service';
import { Document, Chunk, Chapter, Section } from '@prisma/client';

export interface CreateDocumentData {
  title: string;
  content: string;
  category?: string;
  source?: string;
  sourceId?: number;
  status?: 'not_indexed' | 'indexing' | 'ready' | 'quarantined';
}

export interface CreateChunkData {
  documentId: number;
  sectionId?: number;
  content: string;
  embeddingId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class DocumentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pgvector: PgvectorService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async createDocument(data: CreateDocumentData): Promise<Document> {
    return this.prisma.document.create({
      data: {
        title:    data.title,
        content:  data.content,
        category: data.category,
        source:   data.source,
        sourceId: data.sourceId,
        status:   data.status ?? 'not_indexed',
      },
    });
  }

  async updateDocumentStatus(id: number, status: 'not_indexed' | 'indexing' | 'ready' | 'quarantined'): Promise<void> {
    await this.prisma.document.update({ where: { id }, data: { status } });
  }

  async createChunk(data: CreateChunkData): Promise<Chunk> {
    return this.prisma.chunk.create({
      data: {
        documentId:  data.documentId,
        sectionId:   data.sectionId ?? null,
        content:     data.content,
        embeddingId: data.embeddingId,
        metadata:    data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
  }

  async saveChunkEmbedding(chunkId: number, vector: number[]): Promise<void> {
    return this.pgvector.saveChunkEmbedding(chunkId, vector);
  }

  async findDocuments(category?: string): Promise<Document[]> {
    return this.prisma.document.findMany({
      where:   category ? { category } : undefined,
      orderBy: { updatedAt: 'desc' },
      include: { chunks: { select: { id: true } } },
    });
  }

  async searchDocuments(query: string, limit = 5): Promise<Document[]> {
    // Normalizar la query: convertir guiones/underscores a espacios para mejor matching
    const normalizedQuery = query.toLowerCase().replace(/[-_]+/g, ' ').trim();
    const terms = normalizedQuery.split(/\s+/).filter((t) => t.length >= 3 || /^\d+$/.test(t));
    if (terms.length === 0) return [];

    const termsWithHyphens = terms.map(t => t.replace(/\s/g, '-'));

    return this.prisma.document.findMany({
      where: {
        OR: [
          ...terms.flatMap((term) => [
            { title:   { contains: term } },
            { content: { contains: term } },
          ]),
          ...termsWithHyphens.map((term) => ({
            title: { contains: term },
          })),
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Busca un documento por coincidencia exacta de título (case-insensitive).
   * Útil para comprobar existencia precisa al cargar/buscar documentos del índice.
   */
  async findDocumentByExactTitle(title: string): Promise<Document | null> {
    const normalized = title.trim();
    return this.prisma.document.findFirst({
      where: {
        title: {
          equals: normalized,
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Busca SOLO por título, ignorando el contenido.
   * Más confiable para encontrar un documento por nombre cuando hay muchos docs.
   */
  async searchDocumentsByTitle(query: string, limit = 20): Promise<Document[]> {
    const normalizedQuery = query.toLowerCase().replace(/[-_]+/g, ' ').trim();
    const terms = normalizedQuery.split(/\s+/).filter((t) => t.length >= 3 || /^\d+$/.test(t));
    if (terms.length === 0) return [];

    const termsWithHyphens = terms.map(t => t.replace(/\s/g, '-'));

    return this.prisma.document.findMany({
      where: {
        OR: [
          // términos con espacios
          ...terms.map((term) => ({
            title: { contains: term },
          })),
          // variantes con guión
          ...termsWithHyphens.map((term) => ({
            title: { contains: term },
          })),
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  async searchChunks(query: string, limit = 10): Promise<(Chunk & { document: Document })[]> {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
    if (terms.length === 0) return [];

    const chunks = await this.prisma.chunk.findMany({
      where: {
        document: { status: 'ready' },   // solo documentos completamente indexados
        OR: terms.map((term) => ({
          content: { contains: term },
        })),
      },
      include: { document: true },
      take: limit,
    }) as (Chunk & { document: Document })[];

    const docIds = [...new Set(chunks.map((c) => c.documentId))];
    if (docIds.length > 0) {
      await this.prisma.document.updateMany({
        where: { id: { in: docIds } },
        data:  { timesUsed: { increment: 1 }, lastUsed: new Date() },
      });
    }

    return chunks;
  }

  async searchChunksSemantic(embedding: number[], limit = 10): Promise<(Chunk & { document: Document })[]> {
    // 1. Capa Macro: Buscar capítulos coincidentes
    const matchedChapters = (await this.pgvector.searchChaptersSemantic(embedding, 3)) as any[];
    const chapterIds = matchedChapters.map((ch) => ch.id);

    if (chapterIds.length > 0) {
      // 2. Capa Micro: Traer chunks del capítulo
      const candidates = await this.prisma.chunk.findMany({
        where: {
          section: {
            chapterId: { in: chapterIds },
          },
        },
        take: 15,
      });

      // Calcular embeddings en caliente (Lazy / On-demand)
      for (const chunk of candidates) {
        if (!(chunk as any).embedding) {
          try {
            const vector = await this.embeddingsService.generateEmbedding(chunk.content);
            await this.pgvector.saveChunkEmbedding(chunk.id, vector);
          } catch (err: any) {
            // Ignorar y continuar
          }
        }
      }

      // Re-ranking semántico final sobre los capítulos seleccionados
      const rows = (await this.pgvector.searchChunksSemanticInChapters(embedding, chapterIds, limit)) as any[];
      if (rows.length > 0) {
        return this.mapRowsToChunks(rows);
      }
    }

    // Fallback: búsqueda global tradicional
    const rows = (await this.pgvector.searchChunksSemantic(embedding, limit)) as any[];
    return this.mapRowsToChunks(rows);
  }

  /**
   * Busca chunks semánticamente acotado a un conjunto de documentos específicos.
   */
  async searchChunksSemanticInDocuments(
    embedding: number[], 
    documentIds: number[], 
    limit = 10
  ): Promise<(Chunk & { document: Document })[]> {
    if (documentIds.length === 0) return [];

    // 1. Capa Macro: Buscar capítulos en documentos específicos
    const matchedChapters = (await this.pgvector.searchChaptersSemanticInDocuments(embedding, documentIds, 3)) as any[];
    const chapterIds = matchedChapters.map((ch) => ch.id);

    if (chapterIds.length > 0) {
      // 2. Capa Micro: Traer chunks del capítulo
      const candidates = await this.prisma.chunk.findMany({
        where: {
          section: {
            chapterId: { in: chapterIds },
          },
        },
        take: 15,
      });

      // Calcular embeddings en caliente (Lazy)
      for (const chunk of candidates) {
        if (!(chunk as any).embedding) {
          try {
            const vector = await this.embeddingsService.generateEmbedding(chunk.content);
            await this.pgvector.saveChunkEmbedding(chunk.id, vector);
          } catch (err: any) {
            // Ignorar y continuar
          }
        }
      }

      const rows = (await this.pgvector.searchChunksSemanticInChapters(embedding, chapterIds, limit)) as any[];
      if (rows.length > 0) {
        return this.mapRowsToChunks(rows);
      }
    }

    const rows = (await this.pgvector.searchChunksSemanticInDocuments(embedding, documentIds, limit)) as any[];
    return this.mapRowsToChunks(rows);
  }

  private mapRowsToChunks(rows: any[]): (Chunk & { document: Document })[] {
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      content: row.content,
      metadata: row.metadata,
      embeddingId: row.embeddingId,
      document: {
        id: row.documentId,
        sourceId: row.sourceId,
        title: row.title,
        content: row.contentDoc,
        category: row.category,
        source: row.source,
        status: row.status,
        timesUsed: row.timesUsed,
        lastUsed: row.lastUsed,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    })) as any;
  }

  /**
   * Busca chunks de forma textual filtrando por un conjunto de documentos específicos.
   */
  async searchChunksInDocuments(
    query: string, 
    documentIds: number[], 
    limit = 10
  ): Promise<(Chunk & { document: Document })[]> {
    if (documentIds.length === 0) return [];
    
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
    if (terms.length === 0) return [];

    const chunks = await this.prisma.chunk.findMany({
      where: {
        AND: [
          {
            OR: terms.map((term) => ({
              content: { contains: term },
            })),
          },
          {
            documentId: { in: documentIds },
          },
          {
            document: { status: 'ready' },
          },
        ],
      },
      include: { document: true },
      take: limit,
    }) as (Chunk & { document: Document })[];

    return chunks;
  }

  /**
   * Busca chunks por categoría, útil para generar resúmenes temáticos.
   * Ejemplo: "resumen sobre plantas medicinales" → recupera todos los chunks 
   * de documentos con category='plantas_medicinales'
   */
  async searchChunksByCategory(category: string, limit = 20): Promise<(Chunk & { document: Document })[]> {
    const chunks = await this.prisma.chunk.findMany({
      where: {
        document: {
          category: { equals: category },
          status:   'ready',
        },
      },
      include: { document: true },
      orderBy: { document: { lastUsed: 'desc' } },
      take: limit,
    }) as (Chunk & { document: Document })[];

    // Actualizar tracking de uso
    const docIds = [...new Set(chunks.map((c) => c.documentId))];
    if (docIds.length > 0) {
      await this.prisma.document.updateMany({
        where: { id: { in: docIds } },
        data:  { timesUsed: { increment: 1 }, lastUsed: new Date() },
      });
    }

    return chunks;
  }

  /**
   * Busca chunks combinando query de texto + filtro por categoría.
   * Más específico que searchChunks general.
   */
  async searchChunksByQueryAndCategory(
    query: string, 
    category: string, 
    limit = 10
  ): Promise<(Chunk & { document: Document })[]> {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
    if (terms.length === 0) {
      // Si no hay términos, devolver chunks de la categoría
      return this.searchChunksByCategory(category, limit);
    }

    const chunks = await this.prisma.chunk.findMany({
      where: {
        AND: [
          {
            OR: terms.map((term) => ({
              content: { contains: term },
            })),
          },
          {
            document: {
              category: { equals: category },
              status:   'ready',
            },
          },
        ],
      },
      include: { document: true },
      take: limit,
    }) as (Chunk & { document: Document })[];

    // Actualizar tracking de uso
    const docIds = [...new Set(chunks.map((c) => c.documentId))];
    if (docIds.length > 0) {
      await this.prisma.document.updateMany({
        where: { id: { in: docIds } },
        data:  { timesUsed: { increment: 1 }, lastUsed: new Date() },
      });
    }

    return chunks;
  }

  async getDocumentWithChunks(id: number) {
    return this.prisma.document.findUnique({
      where: { id },
      include: { chunks: true },
    });
  }

  async updateDocument(id: number, data: Partial<Pick<CreateDocumentData, 'title' | 'category' | 'source'>>): Promise<Document> {
    return this.prisma.document.update({ where: { id }, data });
  }

  async deleteDocument(id: number): Promise<void> {
    await this.prisma.document.delete({ where: { id } });
  }

  // ── Estadísticas de la biblioteca ──────────────────────────────────────────

  async getLibraryStats() {
    const [totalDocs, totalChunks, topDocs, byCategory] = await Promise.all([
      this.prisma.document.count(),
      this.prisma.chunk.count(),
      this.prisma.document.findMany({
        orderBy: { timesUsed: 'desc' },
        take: 5,
        select: { id: true, title: true, category: true, timesUsed: true, lastUsed: true },
      }),
      this.prisma.document.groupBy({
        by: ['category'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    return { totalDocs, totalChunks, topDocs, byCategory };
  }

  async getMostRecentDocuments(limit = 10) {
    return this.prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, title: true, category: true,
        timesUsed: true, lastUsed: true, createdAt: true,
        _count: { select: { chunks: true } },
      },
    });
  }

  /**
   * Encuentra documentos con títulos duplicados.
   * Para cada grupo de duplicados, devuelve el más reciente (keeper) y los anteriores (duplicates).
   */
  async findDuplicates(): Promise<Array<{ title: string; keeper: number; duplicates: number[] }>> {
    // Obtener todos los docs agrupados por título normalizado
    const all = await this.prisma.document.findMany({
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const groups = new Map<string, typeof all>();
    for (const doc of all) {
      const key = doc.title.trim().toLowerCase().replace(/[\s_\-]+/g, ' ');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(doc);
    }

    const result: Array<{ title: string; keeper: number; duplicates: number[] }> = [];
    for (const [, docs] of groups) {
      if (docs.length < 2) continue;
      // El primero ya está ordenado desc (más reciente primero)
      const [keeper, ...dupes] = docs;
      result.push({
        title:      keeper.title,
        keeper:     keeper.id,
        duplicates: dupes.map(d => d.id),
      });
    }
    return result;
  }

  async deleteManyDocuments(ids: number[]): Promise<number> {
    const { count } = await this.prisma.document.deleteMany({
      where: { id: { in: ids } },
    });
    return count;
  }

  async createChapter(data: { documentId: number; title: string; order: number; summary?: string }): Promise<Chapter> {
    return this.prisma.chapter.create({
      data: {
        documentId: data.documentId,
        title:      data.title,
        order:      data.order,
        summary:    data.summary,
      },
    });
  }

  async createSection(data: { chapterId: number; title: string; summary?: string }): Promise<Section> {
    return this.prisma.section.create({
      data: {
        chapterId: data.chapterId,
        title:     data.title,
        summary:   data.summary,
      },
    });
  }

  async saveChapterEmbedding(chapterId: number, vector: number[]): Promise<void> {
    return this.pgvector.saveChapterEmbedding(chapterId, vector);
  }

  async saveSectionEmbedding(sectionId: number, vector: number[]): Promise<void> {
    return this.pgvector.saveSectionEmbedding(sectionId, vector);
  }

  async updateDocumentProgress(
    id: number,
    progress: { progressIndex?: number; progressEmbed?: number; progressSummary?: number; summary?: string },
  ): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data:  progress,
    });
  }

  async searchChaptersSemantic(embedding: number[], limit = 5): Promise<(Chapter & { document: Document })[]> {
    const rows = (await this.pgvector.searchChaptersSemantic(embedding, limit)) as any[];
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      title: row.title,
      order: row.order,
      summary: row.summary,
      document: {
        id: row.documentId,
      } as any, // Mínima compatibilidad de tipo
    }));
  }

  async searchChaptersSemanticInDocuments(
    embedding: number[],
    documentIds: number[],
    limit = 5,
  ): Promise<(Chapter & { document: Document })[]> {
    const rows = (await this.pgvector.searchChaptersSemanticInDocuments(embedding, documentIds, limit)) as any[];
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      title: row.title,
      order: row.order,
      summary: row.summary,
      document: {
        id: row.documentId,
      } as any,
    }));
  }

  async getChaptersByDocument(documentId: number): Promise<Chapter[]> {
    return this.prisma.chapter.findMany({
      where:   { documentId },
      orderBy: { order: 'asc' },
    });
  }
}
