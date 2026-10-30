import { Injectable, Logger, Optional } from '@nestjs/common';
import { KnowledgeEntityType, KnowledgeRelationType } from '@prisma/client';
import { EmbeddingsService } from '../library/embeddings.service';
import {
  EntityGraphRepository,
  SubgraphNode,
} from '../repositories/entity-graph.repository';
import { MemoryRepository } from '../repositories/memory.repository';
import {
  WorkingMemoryItem,
  WorkingMemoryService,
  WorkingMemoryStats,
} from './working-memory.service';

export interface EpisodicHybridMatch {
  id: number;
  content: string;
  category: string;
  importance: number;
  vectorScore: number; // [0.0 - 1.0]
  lexicalScore: number; // [0.0 - 1.0]
  importanceScore: number; // [0.0 - 1.0]
  hybridScore: number; // 0.50 * vector + 0.30 * lexical + 0.20 * importance
  updatedAt?: Date;
}

export interface RecordTripleInput {
  subject: string;
  subjectType?: KnowledgeEntityType;
  predicate: KnowledgeRelationType;
  object: string;
  objectType?: KnowledgeEntityType;
  label?: string;
  confidence?: number;
  sourceDocId?: number;
  chunkId?: number;
  quote?: string;
  isVerifiedFact?: boolean;
}

export interface RecordTripleOutcome {
  status: 'COMMITTED_TO_GRAPH' | 'QUARANTINED_AS_HYPOTHESIS';
  reason: string;
  relationId?: number;
  pendingId?: number;
}

export interface TripartiteRecallResult {
  sessionId: string;
  query: string;
  working: WorkingMemoryItem[];
  episodic: EpisodicHybridMatch[];
  associative: SubgraphNode[];
}

export interface TripartiteMemoryStats {
  working: WorkingMemoryStats;
  episodicTotal: number;
  associativeEntities: number;
  associativePendingHypotheses: number;
}

/**
 * TripartiteMemoryService — Arquitectura de Memoria de 3 Capas inspirada en Mnemosyne (Agente DSH),
 * implementada nativamente sobre PostgreSQL, pgvector y Prisma en JarBees:
 *
 * 1. Working Memory (Corto plazo, TTL y límite de capacidad): "¿Qué estamos haciendo ahora?"
 * 2. Episodic Memory (Largo plazo con Búsqueda Híbrida 50/30/20): "¿Qué ocurrió anteriormente?"
 * 3. Associative TripleStore (Grafo Entidad-Relación con cuarentena epistémica): "¿Qué relación existe entre estas cosas?"
 */
@Injectable()
export class TripartiteMemoryService {
  private readonly logger = new Logger(TripartiteMemoryService.name);
  private readonly embeddingCache = new Map<number, number[]>();

  constructor(
    private readonly workingMemory: WorkingMemoryService,
    @Optional() private readonly memoryRepo?: MemoryRepository,
    @Optional() private readonly entityGraphRepo?: EntityGraphRepository,
    @Optional() private readonly embeddingsService?: EmbeddingsService,
  ) {}

  getWorkingMemory(): WorkingMemoryService {
    return this.workingMemory;
  }

  /**
   * Búsqueda híbrida en Memoria Episódica:
   * Score = 0.50 * SimilitudVectorial + 0.30 * MatchTextual(FTS) + 0.20 * Importancia
   */
  async searchEpisodicHybrid(
    query: string,
    options?: {
      limit?: number;
      category?: string;
      precomputedVectorScores?: Record<number, number>;
    },
  ): Promise<EpisodicHybridMatch[]> {
    if (!this.memoryRepo) return [];

    const limit = options?.limit ?? 5;
    const allMemories = options?.category
      ? await this.memoryRepo.getByCategory(options.category, 100)
      : await this.memoryRepo.findAll();

    if (!allMemories || allMemories.length === 0) return [];

    let queryEmbedding: number[] | null = null;
    if (
      !options?.precomputedVectorScores &&
      this.embeddingsService &&
      typeof (this.embeddingsService as any).embed === 'function'
    ) {
      try {
        queryEmbedding = await (this.embeddingsService as any).embed(query);
      } catch {
        queryEmbedding = null;
      }
    }

    const maxImportance = Math.max(
      10,
      ...allMemories.map((m) => m.importance || 1),
    );

    const scored: EpisodicHybridMatch[] = [];

    for (const mem of allMemories) {
      const lexicalScore = this.computeLexicalFtsScore(query, mem.content);

      let vectorScore = 0;
      if (
        options?.precomputedVectorScores &&
        options.precomputedVectorScores[mem.id] !== undefined
      ) {
        vectorScore = Math.max(
          0,
          Math.min(1, options.precomputedVectorScores[mem.id]),
        );
      } else if (queryEmbedding && this.embeddingCache.has(mem.id)) {
        vectorScore = this.cosineSimilarity(
          queryEmbedding,
          this.embeddingCache.get(mem.id)!,
        );
      } else {
        vectorScore = this.computeCharacterTrigramSimilarity(
          query,
          mem.content,
        );
      }

      const rawImp = Math.max(1, mem.importance || 1);
      const importanceScore = Math.min(1.0, rawImp / maxImportance);

      const hybridScore = Number(
        (
          0.5 * vectorScore +
          0.3 * lexicalScore +
          0.2 * importanceScore
        ).toFixed(4),
      );

      scored.push({
        id: mem.id,
        content: mem.content,
        category: mem.category,
        importance: mem.importance,
        vectorScore: Number(vectorScore.toFixed(4)),
        lexicalScore: Number(lexicalScore.toFixed(4)),
        importanceScore: Number(importanceScore.toFixed(4)),
        hybridScore,
        updatedAt: mem.updatedAt,
      });
    }

    return scored
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, limit);
  }

  /**
   * Registra una tripleta relacional (Sujeto -> Predicado -> Objeto) con salvaguarda epistémica:
   * - Si cuenta con evidencia verificable (sourceDocId o quote con confianza >= 0.85 y isVerifiedFact=true),
   *   se persiste en KnowledgeRelation.
   * - Si es una hipótesis o carece de respaldo documental directo, se envía a PendingRelation (cuarentena).
   */
  async recordAssociativeTriple(
    input: RecordTripleInput,
  ): Promise<RecordTripleOutcome> {
    if (!this.entityGraphRepo) {
      return {
        status: 'QUARANTINED_AS_HYPOTHESIS',
        reason: 'EntityGraphRepository no inicializado',
      };
    }

    const confidence = input.confidence ?? 0.6;
    const hasEvidenceBacking =
      input.sourceDocId !== undefined ||
      (typeof input.quote === 'string' && input.quote.trim().length > 0);
    const canCommitAsFact =
      input.isVerifiedFact === true &&
      hasEvidenceBacking &&
      confidence >= 0.85;

    if (!canCommitAsFact) {
      const pending = await this.entityGraphRepo.savePendingRelation({
        sourceName: input.subject,
        targetName: input.object,
        relationType: input.predicate,
        label: input.label,
        confidence,
        sourceDocId: input.sourceDocId,
        chunkId: input.chunkId,
        quote: input.quote,
      });

      return {
        status: 'QUARANTINED_AS_HYPOTHESIS',
        reason:
          'Salvaguarda epistémica: las hipótesis o afirmaciones sin evidencia verificada (sourceDocId/quote y confidence >= 0.85) permanecen en cuarentena (PendingRelation).',
        pendingId: pending.id,
      };
    }

    const sourceEntity = await this.entityGraphRepo.upsertEntity(
      input.subject,
      input.subjectType ?? KnowledgeEntityType.CONCEPT,
    );
    const targetEntity = await this.entityGraphRepo.upsertEntity(
      input.object,
      input.objectType ?? KnowledgeEntityType.CONCEPT,
    );

    const relation = await this.entityGraphRepo.upsertRelation(
      sourceEntity.id,
      targetEntity.id,
      input.predicate,
      {
        label: input.label,
        confidence,
        sourceDocId: input.sourceDocId,
        chunkId: input.chunkId,
        quote: input.quote,
      },
    );

    return {
      status: 'COMMITTED_TO_GRAPH',
      reason: 'Tripleta verificada con respaldo de evidencia consolidada en KnowledgeRelation.',
      relationId: relation.id,
    };
  }

  /**
   * Consulta el grafo asociativo (TripleStore) buscando entidades mencionadas en el query.
   */
  async queryAssociativeSubgraph(
    query: string,
    depth = 2,
  ): Promise<SubgraphNode[]> {
    if (!this.entityGraphRepo) return [];

    const candidateTerms = query
      .split(/\s+/)
      .map((t) => t.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._-]/g, ''))
      .filter((t) => t.length >= 3);

    if (candidateTerms.length === 0) return [];

    const matchedEntities = await this.entityGraphRepo.searchEntities(
      candidateTerms[0],
    );
    if (!matchedEntities || matchedEntities.length === 0) return [];

    const rootIds = matchedEntities.slice(0, 5).map((e) => e.id);
    return this.entityGraphRepo.getSubgraph(rootIds, depth);
  }

  /**
   * Recuperación unificada de las 3 capas de memoria para alimentar el razonamiento de JarBees.
   */
  async recallTripartiteContext(
    query: string,
    sessionId = 'global',
    options?: { episodicLimit?: number; graphDepth?: number },
  ): Promise<TripartiteRecallResult> {
    const working = this.workingMemory.listActive(sessionId);
    const [episodic, associative] = await Promise.all([
      this.searchEpisodicHybrid(query, { limit: options?.episodicLimit ?? 5 }),
      this.queryAssociativeSubgraph(query, options?.graphDepth ?? 2),
    ]);

    return {
      sessionId,
      query,
      working,
      episodic,
      associative,
    };
  }

  async getStats(): Promise<TripartiteMemoryStats> {
    const working = this.workingMemory.getStats();
    let episodicTotal = 0;
    let associativeEntities = 0;
    let associativePendingHypotheses = 0;

    if (this.memoryRepo) {
      try {
        const all = await this.memoryRepo.findAll();
        episodicTotal = all.length;
      } catch {
        episodicTotal = 0;
      }
    }

    if (this.entityGraphRepo) {
      try {
        const entities = await this.entityGraphRepo.searchEntities('');
        associativeEntities = entities.length;
        const pending = await this.entityGraphRepo.listPending('PENDING');
        associativePendingHypotheses = pending.length;
      } catch {
        associativeEntities = 0;
      }
    }

    return {
      working,
      episodicTotal,
      associativeEntities,
      associativePendingHypotheses,
    };
  }

  /**
   * Calcula coincidencia léxica tipo FTS (términos exactos y prefijos ponderados).
   */
  computeLexicalFtsScore(query: string, text: string): number {
    const qTerms = this.tokenizeNormalized(query);
    if (qTerms.length === 0) return 0;

    const docLower = text.toLowerCase();
    const docTokens = new Set(this.tokenizeNormalized(text));

    let matchedScore = 0;
    for (const term of qTerms) {
      if (docTokens.has(term)) {
        matchedScore += 1.0;
      } else if (docLower.includes(term)) {
        matchedScore += 0.65;
      }
    }

    return Math.min(1.0, matchedScore / qTerms.length);
  }

  /**
   * Similitud por trigramas de caracteres (aproximación semántica local determinista cuando
   * no hay vector precalculado disponible).
   */
  computeCharacterTrigramSimilarity(a: string, b: string): number {
    const cleanA = a.toLowerCase().replace(/\s+/g, ' ').trim();
    const cleanB = b.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!cleanA || !cleanB) return 0;
    if (cleanA === cleanB) return 1.0;

    const trigramsA = this.extractTrigrams(cleanA);
    const trigramsB = this.extractTrigrams(cleanB);
    if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

    let intersection = 0;
    for (const t of trigramsA) {
      if (trigramsB.has(t)) intersection += 1;
    }

    // Coeficiente de Dice sobre trigramas
    return Math.min(
      1.0,
      (2 * intersection) / (trigramsA.size + trigramsB.size),
    );
  }

  private extractTrigrams(text: string): Set<string> {
    const set = new Set<string>();
    const padded = ` ${text} `;
    for (let i = 0; i <= padded.length - 3; i++) {
      set.add(padded.slice(i, i + 3));
    }
    return set;
  }

  private tokenizeNormalized(text: string): string[] {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length >= 2);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return Math.max(0, Math.min(1, dot / denom));
  }
}

