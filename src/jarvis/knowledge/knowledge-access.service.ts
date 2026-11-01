import { Injectable, Logger } from '@nestjs/common';
import {
  PrismaService,
} from '../../prisma/prisma.service';
import {
  KnowledgeEntity,
  KnowledgeEntityType,
  KnowledgeRelation,
  KnowledgeRelationType,
  RevocationStatus,
} from '@prisma/client';

export interface KnowledgeGraphQuery {
  entity: string;
  relationType?: string;
  maxDepth: number;
  limit?: number;
  includeProvenance?: boolean;
}

export interface KnowledgeGraphQueryResult {
  entities: Array<{
    id: number;
    name: string;
    type: string;
    confidence: number;
    revocationStatus: RevocationStatus;
  }>;
  relations: Array<{
    sourceName: string;
    targetName: string;
    relationType: string;
    confidence: number;
    depth: number;
    provenanceDocIds: number[];
  }>;
  provenance: Array<{
    documentId: number;
    documentTitle: string;
    quote?: string;
    revocationStatus: RevocationStatus;
  }>;
  truncated: boolean;
  activeOnlyEnforced: boolean;
  queryLatencyMs: number;
}

export interface RevocationAuditReport {
  documentId: number;
  revocationReason: string;
  revokedAt: Date;
  revokedChunksCount: number;
  affectedEntities: Array<{
    id: number;
    name: string;
    remainingActiveSources: number;
    newStatus: RevocationStatus;
  }>;
  revokedEntitiesCount: number;
  revokedRelationsCount: number;
  revokedSnapshotsCount: number;
}

export interface ReinstateAuditReport {
  documentId: number;
  reinstatedAt: Date;
  reinstatedChunksCount: number;
  reinstatedEntitiesCount: number;
  reinstatedRelationsCount: number;
  reinstatedSnapshotsCount: number;
}

@Injectable()
export class KnowledgeAccessService {
  private readonly logger = new Logger(KnowledgeAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vincula una entidad a un documento fuente (procedencia M:N).
   */
  async linkEntitySource(
    entityId: number,
    documentId: number,
    chunkId?: number,
    confidence = 1.0,
  ): Promise<void> {
    await this.prisma.knowledgeEntitySource.upsert({
      where: {
        entityId_documentId: { entityId, documentId },
      },
      update: {
        chunkId,
        confidence,
        revocationStatus: RevocationStatus.ACTIVE,
        revokedAt: null,
      },
      create: {
        entityId,
        documentId,
        chunkId,
        confidence,
        revocationStatus: RevocationStatus.ACTIVE,
      },
    });
  }

  /**
   * Búsqueda segura de entidades activas.
   * Filtro inmutable: revocationStatus == ACTIVE.
   */
  async getActiveEntities(
    query?: string,
    type?: KnowledgeEntityType,
    limit = 10,
  ): Promise<KnowledgeEntity[]> {
    const clampedLimit = Math.min(Math.max(1, limit), 50);

    return this.prisma.knowledgeEntity.findMany({
      where: {
        revocationStatus: RevocationStatus.ACTIVE,
        AND: [
          type ? { type } : {},
          query
            ? {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { aliases: { contains: query, mode: 'insensitive' } },
                  { tags: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ timesUsed: 'desc' }, { confidence: 'desc' }],
      take: clampedLimit,
    });
  }

  /**
   * Tool Calling: query_knowledge_graph bajo demanda.
   * Ejecuta navegación por grafo respetando los límites de profundidad y filtrado de revocados.
   */
  async queryKnowledgeGraph(
    params: KnowledgeGraphQuery,
  ): Promise<KnowledgeGraphQueryResult> {
    const t0 = Date.now();
    const maxDepth = Math.min(Math.max(1, params.maxDepth || 1), 3);
    const limit = Math.min(Math.max(1, params.limit || 10), 25);
    const includeProvenance = params.includeProvenance ?? true;

    // 1. Encontrar entidad(es) raíz activa(s)
    const roots = await this.prisma.knowledgeEntity.findMany({
      where: {
        name: { contains: params.entity, mode: 'insensitive' },
        revocationStatus: RevocationStatus.ACTIVE,
      },
      take: 5,
    });

    if (!roots.length) {
      return {
        entities: [],
        relations: [],
        provenance: [],
        truncated: false,
        activeOnlyEnforced: true,
        queryLatencyMs: Date.now() - t0,
      };
    }

    const visitedEntityIds = new Set<number>(roots.map((r) => r.id));
    const entitiesResult: KnowledgeGraphQueryResult['entities'] = roots.map(
      (r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        confidence: r.confidence,
        revocationStatus: r.revocationStatus,
      }),
    );

    const relationsResult: KnowledgeGraphQueryResult['relations'] = [];
    const visitedRelationKeys = new Set<string>();
    const provenanceDocIds = new Set<number>();
    const provenanceQuotes: Array<{ docId: number; quote?: string }> = [];

    let frontier = [...visitedEntityIds];
    let isTruncated = false;

    // 2. BFS acotado con filtro estricto de relaciones activas
    for (let depth = 1; depth <= maxDepth; depth++) {
      if (!frontier.length || relationsResult.length >= limit) break;

      const relations = await this.prisma.knowledgeRelation.findMany({
        where: {
          revocationStatus: RevocationStatus.ACTIVE,
          sourceId: { in: frontier },
          target: { revocationStatus: RevocationStatus.ACTIVE },
          AND: [
            params.relationType
              ? {
                  relationType: params.relationType as KnowledgeRelationType,
                }
              : {},
          ],
        },
        include: {
          source: true,
          target: true,
        },
        take: limit - relationsResult.length + 1,
      });

      if (relations.length > limit - relationsResult.length) {
        isTruncated = true;
      }

      const nextFrontier: number[] = [];

      for (const rel of relations.slice(0, limit - relationsResult.length)) {
        const relKey = `${rel.sourceId}_${rel.targetId}_${rel.relationType}`;
        if (visitedRelationKeys.has(relKey)) continue;
        visitedRelationKeys.add(relKey);

        if (rel.sourceDocId) {
          provenanceDocIds.add(rel.sourceDocId);
          if (rel.quote) {
            provenanceQuotes.push({ docId: rel.sourceDocId, quote: rel.quote });
          }
        }

        relationsResult.push({
          sourceName: rel.source.name,
          targetName: rel.target.name,
          relationType: rel.relationType,
          confidence: rel.confidence,
          depth,
          provenanceDocIds: rel.sourceDocId ? [rel.sourceDocId] : [],
        });

        if (!visitedEntityIds.has(rel.target.id)) {
          visitedEntityIds.add(rel.target.id);
          entitiesResult.push({
            id: rel.target.id,
            name: rel.target.name,
            type: rel.target.type,
            confidence: rel.target.confidence,
            revocationStatus: rel.target.revocationStatus,
          });
          nextFrontier.push(rel.target.id);
        }
      }

      frontier = nextFrontier;
    }

    // 3. Resolver procedencia documental activa si fue solicitada
    const provenanceResult: KnowledgeGraphQueryResult['provenance'] = [];
    if (includeProvenance && provenanceDocIds.size > 0) {
      const docs = await this.prisma.document.findMany({
        where: {
          id: { in: Array.from(provenanceDocIds) },
        },
        select: {
          id: true,
          title: true,
          revocationStatus: true,
        },
      });

      for (const doc of docs) {
        const matchingQuote = provenanceQuotes.find(
          (q) => q.docId === doc.id,
        )?.quote;
        provenanceResult.push({
          documentId: doc.id,
          documentTitle: doc.title,
          quote: matchingQuote,
          revocationStatus: doc.revocationStatus,
        });
      }
    }

    return {
      entities: entitiesResult,
      relations: relationsResult,
      provenance: provenanceResult,
      truncated: isTruncated,
      activeOnlyEnforced: true,
      queryLatencyMs: Date.now() - t0,
    };
  }

  /**
   * Recupera Snapshots históricos activos.
   */
  async getActiveTopicSnapshots(topic: string, limit = 5) {
    return this.prisma.topicSnapshot.findMany({
      where: {
        topic: { contains: topic, mode: 'insensitive' },
        revocationStatus: RevocationStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 20),
    });
  }

  /**
   * ROLLBACK INTEGRAL CON AUDITORÍA INMUTABLE:
   * Propaga la revocación a Chunks, fuentes M:N de entidades, relaciones y snapshots.
   * Una entidad NO se revoca si aún tiene al menos otra fuente documental ACTIVA.
   */
  async revokeDocument(
    documentId: number,
    reason: string,
  ): Promise<RevocationAuditReport> {
    const now = new Date();

    // 1. Marcar documento como revocado
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        revocationStatus: RevocationStatus.REVOKED,
        revokedAt: now,
        revocationReason: reason,
      },
    });

    // 2. Revocar Chunks vectoriales asociados
    const { count: revokedChunksCount } =
      await this.prisma.chunk.updateMany({
        where: { documentId },
        data: {
          revocationStatus: RevocationStatus.REVOKED,
          revokedAt: now,
        },
      });

    // 3. Marcar fuentes de entidades M:N originadas por este documento como revocadas
    await this.prisma.knowledgeEntitySource.updateMany({
      where: { documentId },
      data: {
        revocationStatus: RevocationStatus.REVOKED,
        revokedAt: now,
      },
    });

    // 4. Evaluar entidades afectadas: ¿les quedan otras fuentes activas válidas?
    const entitySourcesForDoc =
      await this.prisma.knowledgeEntitySource.findMany({
        where: { documentId },
        select: { entityId: true },
      });

    const affectedEntitiesReport: RevocationAuditReport['affectedEntities'] = [];
    let revokedEntitiesCount = 0;
    const revokedEntityIds: number[] = [];

    for (const { entityId } of entitySourcesForDoc) {
      // Contar fuentes activas restantes
      const remainingActiveSources =
        await this.prisma.knowledgeEntitySource.count({
          where: {
            entityId,
            revocationStatus: RevocationStatus.ACTIVE,
          },
        });

      const entity = await this.prisma.knowledgeEntity.findUnique({
        where: { id: entityId },
      });

      if (!entity) continue;

      if (remainingActiveSources === 0) {
        // Huérfana de fuentes válidas -> Revocar entidad
        await this.prisma.knowledgeEntity.update({
          where: { id: entityId },
          data: {
            revocationStatus: RevocationStatus.REVOKED,
            revokedAt: now,
            revocationReason: `Todas las fuentes documentales fueron revocadas (última: doc #${documentId}).`,
          },
        });
        revokedEntitiesCount++;
        revokedEntityIds.push(entityId);

        affectedEntitiesReport.push({
          id: entity.id,
          name: entity.name,
          remainingActiveSources: 0,
          newStatus: RevocationStatus.REVOKED,
        });
      } else {
        // Conserva sustento en otras fuentes activas
        affectedEntitiesReport.push({
          id: entity.id,
          name: entity.name,
          remainingActiveSources,
          newStatus: RevocationStatus.ACTIVE,
        });
      }
    }

    // 5. Revocar relaciones que provienen explícitamente de este documento
    // O que conectan con entidades que acaban de ser revocadas
    const { count: revokedRelationsCount } =
      await this.prisma.knowledgeRelation.updateMany({
        where: {
          OR: [
            { sourceDocId: documentId },
            revokedEntityIds.length > 0
              ? { sourceId: { in: revokedEntityIds } }
              : { id: -1 },
            revokedEntityIds.length > 0
              ? { targetId: { in: revokedEntityIds } }
              : { id: -1 },
          ],
        },
        data: {
          revocationStatus: RevocationStatus.REVOKED,
          revokedAt: now,
          revocationReason: `Documento de origen #${documentId} revocado o entidades dependientes revocadas.`,
        },
      });

    // 6. Revocar Snapshots dependientes
    const { count: revokedSnapshotsCount } =
      await this.prisma.topicSnapshot.updateMany({
        where: { sourceDocId: documentId },
        data: {
          revocationStatus: RevocationStatus.REVOKED,
          revokedAt: now,
          revocationReason: `Documento fuente #${documentId} revocado: ${reason}`,
        },
      });

    this.logger.warn(
      `[ROLLBACK INTEGRAL] Documento #${documentId} revocado. Chunks: ${revokedChunksCount}, Entidades revocadas: ${revokedEntitiesCount}, Relaciones revocadas: ${revokedRelationsCount}, Snapshots revocados: ${revokedSnapshotsCount}.`,
    );

    return {
      documentId,
      revocationReason: reason,
      revokedAt: now,
      revokedChunksCount,
      affectedEntities: affectedEntitiesReport,
      revokedEntitiesCount,
      revokedRelationsCount,
      revokedSnapshotsCount,
    };
  }

  /**
   * Restablecimiento (Reinstatement) de conocimiento aprobado por HITL.
   */
  async reinstateDocument(documentId: number): Promise<ReinstateAuditReport> {
    const now = new Date();

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        revocationStatus: RevocationStatus.ACTIVE,
        revokedAt: null,
        revocationReason: null,
      },
    });

    const { count: reinstatedChunksCount } =
      await this.prisma.chunk.updateMany({
        where: { documentId },
        data: {
          revocationStatus: RevocationStatus.ACTIVE,
          revokedAt: null,
        },
      });

    await this.prisma.knowledgeEntitySource.updateMany({
      where: { documentId },
      data: {
        revocationStatus: RevocationStatus.ACTIVE,
        revokedAt: null,
      },
    });

    const entitySources = await this.prisma.knowledgeEntitySource.findMany({
      where: { documentId },
      select: { entityId: true },
    });

    const entityIds = entitySources.map((es) => es.entityId);

    const { count: reinstatedEntitiesCount } =
      await this.prisma.knowledgeEntity.updateMany({
        where: { id: { in: entityIds } },
        data: {
          revocationStatus: RevocationStatus.ACTIVE,
          revokedAt: null,
          revocationReason: null,
        },
      });

    const { count: reinstatedRelationsCount } =
      await this.prisma.knowledgeRelation.updateMany({
        where: { sourceDocId: documentId },
        data: {
          revocationStatus: RevocationStatus.ACTIVE,
          revokedAt: null,
          revocationReason: null,
        },
      });

    const { count: reinstatedSnapshotsCount } =
      await this.prisma.topicSnapshot.updateMany({
        where: { sourceDocId: documentId },
        data: {
          revocationStatus: RevocationStatus.ACTIVE,
          revokedAt: null,
          revocationReason: null,
        },
      });

    return {
      documentId,
      reinstatedAt: now,
      reinstatedChunksCount,
      reinstatedEntitiesCount,
      reinstatedRelationsCount,
      reinstatedSnapshotsCount,
    };
  }
}
