import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  KnowledgeEntity,
  KnowledgeRelation,
  KnowledgeEntityType,
  KnowledgeRelationType,
  PendingRelation,
} from '@prisma/client';

// ── Tipos auxiliares ──────────────────────────────────────────────────────────

export interface RelationOpts {
  label?: string;
  confidence?: number;
  strength?: number;
  bidirectional?: boolean;
  sourceDocId?: number;
  chunkId?: number;
  quote?: string;
}

export interface PendingRelationData {
  sourceName: string;
  targetName: string;
  relationType: string;
  label?: string;
  confidence?: number;
  sourceDocId?: number;
  chunkId?: number;
  quote?: string;
}

export interface SubgraphNode {
  entity: KnowledgeEntity;
  outgoing: Array<{ relation: KnowledgeRelation; target: KnowledgeEntity }>;
  incoming: Array<{ relation: KnowledgeRelation; source: KnowledgeEntity }>;
}

export interface SubgraphResult {
  roots: KnowledgeEntity[];
  nodes: SubgraphNode[];
}

// ── Repository ────────────────────────────────────────────────────────────────

@Injectable()
export class EntityGraphRepository {
  private readonly logger = new Logger(EntityGraphRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea la entidad si no existe, o incrementa timesUsed si ya está.
   * Usa @@unique([name, type]) como clave de upsert.
   */
  async upsertEntity(
    name: string,
    type: KnowledgeEntityType,
    description?: string,
    aliases?: string[],
    tags?: string[],
  ): Promise<KnowledgeEntity> {
    const existing = await this.prisma.knowledgeEntity.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        type,
      },
    });

    if (existing) {
      return this.prisma.knowledgeEntity.update({
        where: { id: existing.id },
        data: { timesUsed: { increment: 1 } },
      });
    }

    return this.prisma.knowledgeEntity.create({
      data: {
        name,
        type,
        description,
        aliases: aliases ? JSON.stringify(aliases) : '[]',
        tags: tags ? JSON.stringify(tags) : '[]',
      },
    });
  }

  /**
   * Upsert de relación aprobada. Si ya existe, refuerza el strength (cap: 5.0).
   */
  async upsertRelation(
    sourceId: number,
    targetId: number,
    relationType: KnowledgeRelationType,
    opts: RelationOpts = {},
  ): Promise<KnowledgeRelation> {
    const existing = await this.prisma.knowledgeRelation.findUnique({
      where: {
        sourceId_targetId_relationType: { sourceId, targetId, relationType },
      },
    });

    if (existing) {
      return this.prisma.knowledgeRelation.update({
        where: { id: existing.id },
        data: {
          strength: { increment: 0.1 },
          confidence: opts.confidence ?? existing.confidence,
        },
      });
    }

    return this.prisma.knowledgeRelation.create({
      data: {
        sourceId,
        targetId,
        relationType,
        label: opts.label,
        confidence: opts.confidence ?? 1.0,
        strength: opts.strength ?? 1.0,
        bidirectional: opts.bidirectional ?? false,
        sourceDocId: opts.sourceDocId,
        chunkId: opts.chunkId,
        quote: opts.quote,
      },
    });
  }

  /**
   * Busca entidades por lista de nombres exactos (case-insensitive).
   * También busca en aliases (búsqueda textual sobre el JSON serializado).
   */
  async findEntitiesByNames(names: string[]): Promise<KnowledgeEntity[]> {
    if (!names.length) return [];

    const byName = await this.prisma.knowledgeEntity.findMany({
      where: { name: { in: names, mode: 'insensitive' } },
    });

    // Buscar en aliases: el JSON almacenado como string
    const byAliasQueries = names.map((n) =>
      this.prisma.knowledgeEntity.findMany({
        where: { aliases: { contains: n, mode: 'insensitive' } },
      }),
    );
    const byAlias = (await Promise.all(byAliasQueries)).flat();

    const merged = new Map<number, KnowledgeEntity>();
    [...byName, ...byAlias].forEach((e) => merged.set(e.id, e));
    return Array.from(merged.values());
  }

  /**
   * Búsqueda textual por nombre, alias, descripción o tags.
   */
  async searchEntities(
    query: string,
    type?: KnowledgeEntityType,
  ): Promise<KnowledgeEntity[]> {
    return this.prisma.knowledgeEntity.findMany({
      where: {
        AND: [
          type ? { type } : {},
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { aliases: { contains: query, mode: 'insensitive' } },
              { tags: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      orderBy: [{ timesUsed: 'desc' }, { confidence: 'desc' }],
      take: 20,
    });
  }

  /**
   * Retorna el subgrafo BFS de N saltos desde las entidades raíz.
   * depth=1 → relaciones directas, depth=2 → vecinos de vecinos (recomendado).
   * Filtra relaciones con confidence < 0.6 para reducir ruido.
   */
  async getSubgraph(entityIds: number[], depth = 2): Promise<SubgraphNode[]> {
    const visited = new Set<number>(entityIds);
    const nodes: SubgraphNode[] = [];
    let frontier = [...entityIds];

    for (let d = 0; d < depth; d++) {
      if (!frontier.length) break;

      const entities = await this.prisma.knowledgeEntity.findMany({
        where: { id: { in: frontier } },
        include: {
          relationsFrom: {
            include: { target: true },
            where: { confidence: { gte: 0.6 } },
            orderBy: { strength: 'desc' },
            take: 10,
          },
          relationsTo: {
            include: { source: true },
            where: { confidence: { gte: 0.6 } },
            orderBy: { strength: 'desc' },
            take: 10,
          },
        },
      });

      const newFrontier: number[] = [];
      for (const entity of entities) {
        const outgoing = (entity.relationsFrom as any[]).map((r) => ({
          relation: r,
          target: r.target,
        }));
        const incoming = (entity.relationsTo as any[]).map((r) => ({
          relation: r,
          source: r.source,
        }));

        nodes.push({ entity, outgoing, incoming });

        [
          ...outgoing.map((o: any) => o.target.id),
          ...incoming.map((i: any) => i.source.id),
        ]
          .filter((id) => !visited.has(id))
          .forEach((id) => {
            visited.add(id);
            newFrontier.push(id);
          });
      }
      frontier = newFrontier;
    }

    return nodes;
  }

  /**
   * Guarda una relación candidata extraída por LLM en cuarentena.
   * No toca KnowledgeRelation hasta que EvidenceService la valide.
   */
  async savePendingRelation(data: PendingRelationData): Promise<PendingRelation> {
    return this.prisma.pendingRelation.create({
      data: {
        sourceName: data.sourceName,
        targetName: data.targetName,
        relationType: data.relationType,
        label: data.label,
        confidence: data.confidence ?? 0.5,
        sourceDocId: data.sourceDocId,
        chunkId: data.chunkId,
        quote: data.quote,
        status: 'PENDING',
      },
    });
  }

  /**
   * Promueve una PendingRelation a KnowledgeRelation tras aprobación.
   */
  async approvePending(
    pendingId: number,
    sourceId: number,
    targetId: number,
    relationType: KnowledgeRelationType,
  ): Promise<KnowledgeRelation> {
    const pending = await this.prisma.pendingRelation.findUniqueOrThrow({
      where: { id: pendingId },
    });

    const relation = await this.upsertRelation(sourceId, targetId, relationType, {
      label: pending.label ?? undefined,
      confidence: pending.confidence,
      sourceDocId: pending.sourceDocId ?? undefined,
      chunkId: pending.chunkId ?? undefined,
      quote: pending.quote ?? undefined,
    });

    await this.prisma.pendingRelation.update({
      where: { id: pendingId },
      data: {
        status: 'APPROVED',
        resolvedSourceId: sourceId,
        resolvedTargetId: targetId,
        reviewedAt: new Date(),
      },
    });

    this.logger.debug(`PendingRelation #${pendingId} → KnowledgeRelation #${relation.id}`);
    return relation;
  }

  /**
   * Rechaza una PendingRelation (evidencia insuficiente o alucinación).
   */
  async rejectPending(pendingId: number, reason: string): Promise<void> {
    await this.prisma.pendingRelation.update({
      where: { id: pendingId },
      data: { status: 'REJECTED', rejectedReason: reason, reviewedAt: new Date() },
    });
    this.logger.debug(`PendingRelation #${pendingId} rechazada: ${reason}`);
  }

  /**
   * Lista relaciones pendientes filtradas por status.
   */
  async listPending(
    status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING',
  ): Promise<PendingRelation[]> {
    return this.prisma.pendingRelation.findMany({
      where: { status },
      orderBy: [{ confidence: 'desc' }, { extractedAt: 'desc' }],
    });
  }
}
