import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Document, Chunk } from '@prisma/client';

export interface CreateDocumentData {
  title: string;
  content: string;
  category?: string;
  source?: string;
  sourceId?: number;
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
        title:    data.title,
        content:  data.content,
        category: data.category,
        source:   data.source,
        sourceId: data.sourceId,
      },
    });
  }

  async createChunk(data: CreateChunkData): Promise<Chunk> {
    return this.prisma.chunk.create({
      data: {
        documentId:  data.documentId,
        content:     data.content,
        embeddingId: data.embeddingId,
        metadata:    data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
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
    const terms = normalizedQuery.split(/\s+/).filter((t) => t.length >= 3);
    if (terms.length === 0) return [];

    const termsWithHyphens = terms.map(t => t.replace(/\s/g, '-'));

    return this.prisma.document.findMany({
      where: {
        OR: [
          ...terms.flatMap((term) => [
            { title:   { contains: term, mode: 'insensitive' as const } },
            { content: { contains: term, mode: 'insensitive' as const } },
          ]),
          ...termsWithHyphens.map((term) => ({
            title: { contains: term, mode: 'insensitive' as const },
          })),
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Busca SOLO por título, ignorando el contenido.
   * Más confiable para encontrar un documento por nombre cuando hay muchos docs.
   */
  async searchDocumentsByTitle(query: string, limit = 20): Promise<Document[]> {
    const normalizedQuery = query.toLowerCase().replace(/[-_]+/g, ' ').trim();
    const terms = normalizedQuery.split(/\s+/).filter((t) => t.length >= 3);
    if (terms.length === 0) return [];

    const termsWithHyphens = terms.map(t => t.replace(/\s/g, '-'));

    return this.prisma.document.findMany({
      where: {
        OR: [
          // términos con espacios
          ...terms.map((term) => ({
            title: { contains: term, mode: 'insensitive' as const },
          })),
          // variantes con guión
          ...termsWithHyphens.map((term) => ({
            title: { contains: term, mode: 'insensitive' as const },
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
        OR: terms.map((term) => ({
          content: { contains: term },
        })),
      },
      include: { document: true },
      take: limit,
    }) as (Chunk & { document: Document })[];

    // Actualizar tracking de uso en documentos recuperados
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
   * Busca chunks por categoría, útil para generar resúmenes temáticos.
   * Ejemplo: "resumen sobre plantas medicinales" → recupera todos los chunks 
   * de documentos con category='plantas_medicinales'
   */
  async searchChunksByCategory(category: string, limit = 20): Promise<(Chunk & { document: Document })[]> {
    const chunks = await this.prisma.chunk.findMany({
      where: {
        document: {
          category: { equals: category },
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
}
