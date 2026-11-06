import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ILLMProvider } from '../llm/llm-provider.interface';
import { OllamaProvider } from '../llm/ollama.provider';
import { LlamaCppProvider } from '../llm/llamacpp.provider';

export type EpistemicItemType =
  | 'USER_STATEMENT'
  | 'ASSISTANT_STATEMENT'
  | 'OBSERVED_FACT'
  | 'HYPOTHESIS'
  | 'DECISION'
  | 'OPEN_QUESTION';

export const VALID_EPISTEMIC_ITEM_TYPES: readonly EpistemicItemType[] = [
  'USER_STATEMENT',
  'ASSISTANT_STATEMENT',
  'OBSERVED_FACT',
  'HYPOTHESIS',
  'DECISION',
  'OPEN_QUESTION',
];

export interface EpistemicEpisodeItem {
  type: EpistemicItemType;
  content: string;
}

export interface AutobiographicalEpisodeInput {
  eventType?: string;
  topic: string;
  summary: string;
  conclusion: string;
  epistemicItems: EpistemicEpisodeItem[];
  entities: string[];
  tags: string[];
  sessionId?: string;
  agentRunId?: number;
  sourceMessageIds: number[];
  sourceDocId?: number;
  sourceDocIds: number[];
  sourceChunkIds: number[];
  occurredAt?: Date;
}

export interface ProvenanceMetadataInput {
  agentRunId?: number;
  sourceMessageIds?: number[];
  sourceDocIds?: number[];
  sourceChunkIds?: number[];
  retrievedChunks?: Array<{
    id?: number;
    documentId?: number;
    document?: { id?: number; title?: string };
  }>;
}

export interface HydratedEpisodeRecord {
  id: number;
  eventType: string;
  occurredAt: Date;
  occurredAtFormatted: string;
  topic: string;
  summary: string;
  conclusion: string;
  epistemicItems: EpistemicEpisodeItem[];
  entities: string[];
  tags: string[];
  provenance: {
    sessionId: string | null;
    agentRunId: number | null;
    sourceMessageIds: number[];
    sourceDocIds: number[];
    sourceChunkIds: number[];
    documents: Array<{ id: number; title: string }>;
    messagesExcerpt: Array<{ id: number; role: string; snippet: string }>;
  };
}

export interface TemporalRangeResult {
  hasExplicitDate: boolean;
  label?: string;
  start?: Date;
  end?: Date;
}

export interface AutobiographicalRecallResult {
  isAutobiographicalQuery: boolean;
  queryType: 'DATE' | 'TOPIC' | 'DECISION' | 'EVOLUTION' | 'NONE';
  temporalRange: TemporalRangeResult;
  episodes: HydratedEpisodeRecord[];
  fallbackRunsUsed: boolean;
  emptyReason?: 'NO_RECORDS_FOR_DATE' | 'NO_RECORDS_FOR_TOPIC';
  formattedContextBlock: string;
  diagnostics?: {
    sqlQueryMs: number;
    provenanceHydrationMs: number;
    totalRecallMs: number;
    sqlStartIso?: string;
    sqlEndIso?: string;
  };
}

export interface TopicSnapshot {
  topic: string;
  date: Date;
  Summary?: string;
  conclusion: string;
  sessionId?: string;
  tags: string[];
  entities?: string[];
  epistemicItems?: EpistemicEpisodeItem[];
}

export interface EvolutionEntry {
  date: string;
  summary: string;
  tags: string[];
}

export interface EvolutionReport {
  topic: string;
  firstMentioned: string;
  lastMentioned: string;
  totalMentions: number;
  evolution: EvolutionEntry[];
  narrative: string; // narración generada por el LLM
}

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const STOPWORDS_ES = new Set([
  'que',
  'qué',
  'como',
  'cómo',
  'cuando',
  'cuándo',
  'donde',
  'dónde',
  'cual',
  'cuál',
  'cuales',
  'cuáles',
  'quien',
  'quién',
  'para',
  'por',
  'con',
  'sin',
  'sobre',
  'entre',
  'hacia',
  'desde',
  'hasta',
  'respecto',
  'acerca',
  'del',
  'las',
  'los',
  'una',
  'uno',
  'unos',
  'unas',
  'este',
  'esta',
  'estos',
  'estas',
  'ese',
  'esa',
  'esos',
  'esas',
  'aquel',
  'aquella',
  'nuestra',
  'nuestro',
  'nuestras',
  'nuestros',
  'hablamos',
  'conversamos',
  'discutimos',
  'investigamos',
  'estuvimos',
  'investigando',
  'probando',
  'decidimos',
  'acordamos',
  'concluimos',
  'evoluciono',
  'evolucionó',
  'evaluacion',
  'evaluación',
  'fuentes',
  'utilizamos',
  'usamos',
  'tenemos',
  'registros',
  'tema',
  'posible',
  'sesiones',
  'previas',
  'anteriores',
  'conversaciones',
  'jarbees',
  'jarvis',
  'hoy',
  'ayer',
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]);

/**
 * KnowledgeEvolutionService (MEM-001 / MEM-002 / MEM-003)
 *
 * Sistema de Memoria Autobiográfica, Episódica y Evolución del Conocimiento de JarBees:
 * - MEM-001: Registra episodios estructurados con clasificación epistémica de 6 niveles
 *   (USER_STATEMENT, ASSISTANT_STATEMENT, OBSERVED_FACT, HYPOTHESIS, DECISION, OPEN_QUESTION)
 *   y validación de procedencia contra PostgreSQL (agentRunId, sourceMessageIds, sourceDocIds).
 * - MEM-002: Recuperación histórica multi-camino (SQL temporal puro por fecha/intervalo +
 *   búsqueda por entidades/temas/decisiones + fallback directo a AgentRun/ConversationMessage).
 * - MEM-003: Integridad y honestidad autobiográfica (abstención determinista cuando no existen
 *   registros para una fecha o tema, y trazabilidad completa de fuentes).
 */
@Injectable()
export class KnowledgeEvolutionService {
  private readonly logger = new Logger(KnowledgeEvolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OllamaProvider) private readonly ollamaLlm: ILLMProvider,
    @Optional()
    @Inject(LlamaCppProvider)
    private readonly llamaCppLlm?: ILLMProvider,
  ) {}

  private getActiveLlm(): ILLMProvider {
    return this.llamaCppLlm ?? this.ollamaLlm;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MEM-001 & MEM-003: VALIDACIÓN DE ESQUEMA Y VERIFICACIÓN DE PROCEDENCIA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Valida que un episodio cumpla estrictamente el contrato estructural y epistémico.
   */
  validateEpisodeSchema(candidate: unknown): {
    valid: boolean;
    errors: string[];
    value?: AutobiographicalEpisodeInput;
  } {
    const errors: string[] = [];
    if (!candidate || typeof candidate !== 'object') {
      return { valid: false, errors: ['El episodio no es un objeto válido.'] };
    }

    const obj = candidate as Record<string, any>;

    const topic = typeof obj.topic === 'string' ? obj.topic.trim() : '';
    if (topic.length < 3) {
      errors.push('El campo "topic" es obligatorio y debe tener al menos 3 caracteres.');
    }

    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    if (summary.length < 5) {
      errors.push('El campo "summary" es obligatorio.');
    }

    const conclusion =
      typeof obj.conclusion === 'string' ? obj.conclusion.trim() : '';
    if (conclusion.length < 5) {
      errors.push('El campo "conclusion" es obligatorio.');
    }

    if (!Array.isArray(obj.epistemicItems) || obj.epistemicItems.length === 0) {
      errors.push(
        'El episodio debe contener al menos un elemento en "epistemicItems".',
      );
    }

    const validatedItems: EpistemicEpisodeItem[] = [];
    if (Array.isArray(obj.epistemicItems)) {
      for (const item of obj.epistemicItems) {
        if (
          !item ||
          typeof item !== 'object' ||
          !VALID_EPISTEMIC_ITEM_TYPES.includes(item.type) ||
          typeof item.content !== 'string' ||
          item.content.trim().length === 0
        ) {
          errors.push(
            `Elemento epistémico inválido: tipo debe ser uno de [${VALID_EPISTEMIC_ITEM_TYPES.join(', ')}] y tener contenido.`,
          );
        } else {
          validatedItems.push({
            type: item.type as EpistemicItemType,
            content: item.content.trim(),
          });
        }
      }
    }

    const toPositiveIntArray = (arr: unknown, fieldName: string): number[] => {
      if (arr === undefined || arr === null) return [];
      if (!Array.isArray(arr)) {
        errors.push(`El campo "${fieldName}" debe ser un arreglo de enteros.`);
        return [];
      }
      const res: number[] = [];
      for (const v of arr) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
          errors.push(
            `ID inválido en "${fieldName}": ${String(v)} (debe ser entero positivo).`,
          );
        } else {
          res.push(v);
        }
      }
      return Array.from(new Set(res));
    };

    const sourceMessageIds = toPositiveIntArray(
      obj.sourceMessageIds,
      'sourceMessageIds',
    );
    const sourceDocIds = toPositiveIntArray(obj.sourceDocIds, 'sourceDocIds');
    const sourceChunkIds = toPositiveIntArray(
      obj.sourceChunkIds,
      'sourceChunkIds',
    );

    const agentRunId =
      obj.agentRunId !== undefined && obj.agentRunId !== null
        ? Number(obj.agentRunId)
        : undefined;
    if (
      agentRunId !== undefined &&
      (!Number.isInteger(agentRunId) || agentRunId <= 0)
    ) {
      errors.push('El campo "agentRunId" debe ser un entero positivo.');
    }

    const hasProvenanceAnchor =
      agentRunId !== undefined ||
      sourceMessageIds.length > 0 ||
      sourceDocIds.length > 0;
    if (!hasProvenanceAnchor) {
      errors.push(
        'Procedencia inválida: todo episodio debe referenciar al menos un agentRunId, sourceMessageIds o sourceDocIds.',
      );
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const entities = Array.isArray(obj.entities)
      ? obj.entities
          .filter((e: any) => typeof e === 'string' && e.trim().length > 0)
          .map((e: string) => e.trim())
      : [];

    const tags = Array.isArray(obj.tags)
      ? obj.tags
          .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
          .map((t: string) => t.trim().toLowerCase())
      : [];

    return {
      valid: true,
      errors: [],
      value: {
        eventType:
          typeof obj.eventType === 'string' && obj.eventType.trim()
            ? obj.eventType.trim()
            : 'conversation_episode',
        topic,
        summary,
        conclusion,
        epistemicItems: validatedItems,
        entities,
        tags,
        sessionId:
          typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
        agentRunId,
        sourceMessageIds,
        sourceDocId:
          obj.sourceDocId ??
          (sourceDocIds.length > 0 ? sourceDocIds[0] : undefined),
        sourceDocIds,
        sourceChunkIds,
        occurredAt:
          obj.occurredAt instanceof Date ? obj.occurredAt : undefined,
      },
    };
  }

  /**
   * Verifica contra PostgreSQL que los IDs referenciados (agentRunId, sourceMessageIds, sourceDocIds)
   * existan realmente antes de persistir el episodio.
   */
  async verifyProvenanceInDb(
    episode: AutobiographicalEpisodeInput,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (episode.agentRunId !== undefined) {
      const run = await this.prisma.agentRun.findUnique({
        where: { id: episode.agentRunId },
        select: { id: true },
      });
      if (!run) {
        errors.push(
          `El agentRunId #${episode.agentRunId} no existe en la tabla AgentRun.`,
        );
      }
    }

    if (episode.sourceMessageIds.length > 0) {
      const foundMsgs = await this.prisma.conversationMessage.findMany({
        where: { id: { in: episode.sourceMessageIds } },
        select: { id: true },
      });
      const foundIds = new Set(foundMsgs.map((m) => m.id));
      const missing = episode.sourceMessageIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        errors.push(
          `Los siguientes sourceMessageIds no existen en ConversationMessage: [${missing.join(', ')}].`,
        );
      }
    }

    if (episode.sourceDocIds.length > 0) {
      const foundDocs = await this.prisma.document.findMany({
        where: { id: { in: episode.sourceDocIds } },
        select: { id: true },
      });
      const foundIds = new Set(foundDocs.map((d) => d.id));
      const missing = episode.sourceDocIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        errors.push(
          `Los siguientes sourceDocIds no existen en Document: [${missing.join(', ')}].`,
        );
      }
    }

    if (
      episode.sourceChunkIds.length > 0 &&
      typeof (this.prisma as any).chunk?.findMany === 'function'
    ) {
      const foundChunks = await this.prisma.chunk.findMany({
        where: { id: { in: episode.sourceChunkIds } },
        select: { id: true, documentId: true },
      });
      const foundChunkIds = new Set(foundChunks.map((c) => c.id));
      const missingChunks = episode.sourceChunkIds.filter(
        (id) => !foundChunkIds.has(id),
      );
      if (missingChunks.length > 0) {
        errors.push(
          `Los siguientes sourceChunkIds no existen en Chunk: [${missingChunks.join(', ')}].`,
        );
      }

      if (episode.sourceDocIds.length > 0) {
        const declaredDocIds = new Set(episode.sourceDocIds);
        const orphanChunks = foundChunks.filter(
          (c) => !declaredDocIds.has(c.documentId),
        );
        if (orphanChunks.length > 0) {
          errors.push(
            `Inconsistencia de procedencia: los chunks [${orphanChunks.map((c) => `#${c.id}(doc=${c.documentId})`).join(', ')}] no pertenecen a los sourceDocIds declarados [${episode.sourceDocIds.join(', ')}].`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Registra un episodio autobiográfico validando esquema y procedencia real en BD.
   * Nunca sobrescribe destructivamente recuerdos anteriores (append-only o idempotente por agentRunId).
   */
  async recordVerifiedEpisode(rawInput: unknown): Promise<{
    saved: boolean;
    episodeId?: number;
    errors: string[];
  }> {
    const schemaCheck = this.validateEpisodeSchema(rawInput);
    if (!schemaCheck.valid || !schemaCheck.value) {
      this.logger.warn(
        `[MEM-001] Episodio rechazado por validación de esquema: ${schemaCheck.errors.join(' | ')}`,
      );
      return { saved: false, errors: schemaCheck.errors };
    }

    const episode = schemaCheck.value;
    const provCheck = await this.verifyProvenanceInDb(episode);
    if (!provCheck.valid) {
      this.logger.warn(
        `[MEM-003] Episodio rechazado por procedencia inválida: ${provCheck.errors.join(' | ')}`,
      );
      return { saved: false, errors: provCheck.errors };
    }

    // Evitar sobrescritura o duplicación si ya se registró el mismo agentRunId
    if (episode.agentRunId !== undefined) {
      const existing = await this.prisma.topicSnapshot.findFirst({
        where: { agentRunId: episode.agentRunId },
        select: { id: true },
      });
      if (existing) {
        return { saved: true, episodeId: existing.id, errors: [] };
      }
    }

    const created = await this.prisma.topicSnapshot.create({
      data: {
        eventType: episode.eventType || 'conversation_episode',
        topic: episode.topic,
        summary: episode.summary,
        conclusion: episode.conclusion,
        epistemicItems: JSON.stringify(episode.epistemicItems),
        entities: JSON.stringify(episode.entities),
        tags: JSON.stringify(episode.tags),
        sessionId: episode.sessionId,
        agentRunId: episode.agentRunId,
        sourceMessageIds: JSON.stringify(episode.sourceMessageIds),
        sourceDocId: episode.sourceDocId,
        sourceDocIds: JSON.stringify(episode.sourceDocIds),
        sourceChunkIds: JSON.stringify(episode.sourceChunkIds),
        ...(episode.occurredAt ? { createdAt: episode.occurredAt } : {}),
      },
    });

    this.logger.log(
      `[MEM-001] Episodio autobiográfico #${created.id} guardado: "${episode.topic}" (run=${episode.agentRunId ?? 'n/a'}, msgs=[${episode.sourceMessageIds.join(',')}], docs=[${episode.sourceDocIds.join(',')}])`,
    );

    return { saved: true, episodeId: created.id, errors: [] };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXTRACCIÓN POST-TURNO (DETERMINISTA + CONSOLIDACIÓN CON PROCEDENCIA)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Extrae y guarda un episodio a partir de un intercambio persistido.
   * No depende de que el LLM recuerde voluntariamente guardar algo: construye la estructura
   * epistémica con procedencia verificada en base de datos.
   */
  async extractAndSave(
    userMessage: string,
    assistantReply: string,
    sessionId?: string,
    provenance?: ProvenanceMetadataInput,
  ): Promise<void> {
    if (userMessage.trim().split(/\s+/).length < 5) return;
    if (!this.isSignificantExchange(userMessage, assistantReply)) return;
    // No registrar como episodio nuevo una consulta puramente autobiográfica sobre el pasado
    if (this.isAutobiographicalQuery(userMessage)) return;

    try {
      // 1. Resolver IDs de procedencia reales desde PostgreSQL si no vinieron completos
      const resolvedProv = await this.resolveProvenanceIds(
        sessionId,
        provenance,
      );

      // Si no hay ningún ancla de procedencia verificable en DB, usamos el flujo clásico compatible con tests unitarios
      if (
        resolvedProv.agentRunId === undefined &&
        resolvedProv.sourceMessageIds.length === 0 &&
        resolvedProv.sourceDocIds.length === 0
      ) {
        const snapshot = await this.extractTopicSnapshot(
          userMessage,
          assistantReply,
        );
        if (!snapshot) return;

        await this.prisma.topicSnapshot.create({
          data: {
            topic: snapshot.topic,
            summary: snapshot.Summary ?? snapshot.conclusion,
            conclusion: snapshot.conclusion,
            tags: JSON.stringify(snapshot.tags),
            entities: JSON.stringify(snapshot.entities ?? []),
            epistemicItems: JSON.stringify(snapshot.epistemicItems ?? []),
            sessionId,
          },
        });
        return;
      }

      // 2. Construir episodio determinista estructurado con las 6 categorías epistémicas
      const deterministicEpisode = this.buildStructuredEpisodeFromTurn(
        userMessage,
        assistantReply,
        sessionId,
        resolvedProv,
      );

      await this.recordVerifiedEpisode(deterministicEpisode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[evolution] no se pudo guardar episodio: ${msg}`);
    }
  }

  private async resolveProvenanceIds(
    sessionId?: string,
    provenance?: ProvenanceMetadataInput,
  ): Promise<{
    agentRunId?: number;
    sourceMessageIds: number[];
    sourceDocIds: number[];
    sourceChunkIds: number[];
  }> {
    let sourceMessageIds = provenance?.sourceMessageIds
      ? [...provenance.sourceMessageIds]
      : [];
    const sourceDocIds = new Set<number>(provenance?.sourceDocIds ?? []);
    const sourceChunkIds = new Set<number>(provenance?.sourceChunkIds ?? []);

    if (provenance?.retrievedChunks) {
      for (const ch of provenance.retrievedChunks) {
        if (typeof ch?.id === 'number' && ch.id > 0) {
          sourceChunkIds.add(ch.id);
        }
        const docId = ch?.documentId ?? ch?.document?.id;
        if (typeof docId === 'number' && docId > 0) {
          sourceDocIds.add(docId);
        }
      }
    }

    if (
      sourceMessageIds.length === 0 &&
      sessionId &&
      typeof (this.prisma as any).conversationMessage?.findMany === 'function'
    ) {
      try {
        const recent = await this.prisma.conversationMessage.findMany({
          where: { sessionId },
          orderBy: { id: 'desc' },
          take: 2,
          select: { id: true },
        });
        sourceMessageIds = recent.map((m) => m.id).reverse();
      } catch {
        sourceMessageIds = [];
      }
    }

    return {
      agentRunId: provenance?.agentRunId,
      sourceMessageIds,
      sourceDocIds: Array.from(sourceDocIds),
      sourceChunkIds: Array.from(sourceChunkIds),
    };
  }

  /**
   * Construye determinísticamente un episodio autobiográfico separando:
   * USER_STATEMENT, ASSISTANT_STATEMENT, OBSERVED_FACT, HYPOTHESIS, DECISION y OPEN_QUESTION.
   */
  buildStructuredEpisodeFromTurn(
    userMessage: string,
    assistantReply: string,
    sessionId: string | undefined,
    provenance: {
      agentRunId?: number;
      sourceMessageIds: number[];
      sourceDocIds: number[];
      sourceChunkIds: number[];
    },
    occurredAt?: Date,
  ): AutobiographicalEpisodeInput {
    const cleanUser = userMessage.trim();
    const cleanReply = assistantReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    const entities = this.extractSignificantEntities(
      `${cleanUser} ${cleanReply}`,
    );
    const topic = this.deriveTopicTitle(cleanUser, entities);
    const summary = `Consulta sobre ${topic}: "${cleanUser.slice(0, 140)}${cleanUser.length > 140 ? '...' : ''}"`;

    const sentences = cleanReply
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.replace(/^[-*>#\d.\s]+/, '').trim())
      .filter((s) => s.length >= 20);

    const epistemicItems: EpistemicEpisodeItem[] = [
      {
        type: 'USER_STATEMENT',
        content: cleanUser.slice(0, 300),
      },
    ];

    const userExplicitlyAgreedDecision =
      /\b(decidimos|acordamos|adoptamos|queda\s+definido|aprobado|resolvimos|vamos\s+a\s+implementar|confirmado)\b/i.test(
        cleanUser,
      );
    if (userExplicitlyAgreedDecision) {
      epistemicItems.push({
        type: 'DECISION',
        content: `Acordado explícitamente por el usuario: ${cleanUser.slice(0, 260)}`,
      });
    }

    for (const s of sentences) {
      if (epistemicItems.length >= 8) break;
      if (
        /\b(hip[oó]tesis|podr[ií]a\s+clasificar|sugiere\s+que|parece\s+desempe[ñn]ar|posible\s+punto\s+de\s+fallo|interpretaci[oó]n)\b/i.test(
          s,
        )
      ) {
        epistemicItems.push({ type: 'HYPOTHESIS', content: s.slice(0, 280) });
      } else if (
        /\b(decisi[oó]n\s+acordada|decisi[oó]n\s+confirmada|decidimos|acordamos)\b/i.test(
          s,
        )
      ) {
        epistemicItems.push({ type: 'DECISION', content: s.slice(0, 280) });
      } else if (
        /\b(la\s+soluci[oó]n\s+radica|comprobar\s+la\s+hip[oó]tesis|recomendaci[oó]n|registrar\s+de\s+forma\s+correlacionada|propongo)\b/i.test(
          s,
        )
      ) {
        epistemicItems.push({
          type: 'ASSISTANT_STATEMENT',
          content: `Recomendación/Propuesta del asistente: ${s.slice(0, 250)}`,
        });
      } else if (
        /\?$/.test(s) ||
        /\b(a[uú]n\s+no\s+est[aá]\s+claro|[aá]rea\s+en\s+desarrollo|pendiente|no\s+hay\s+evidencia\s+definitiva)\b/i.test(
          s,
        )
      ) {
        epistemicItems.push({
          type: 'OPEN_QUESTION',
          content: s.slice(0, 280),
        });
      } else if (
        provenance.sourceDocIds.length > 0 &&
        /\b(seg[uú]n\s+los\s+documentos|el\s+texto\s+menciona|fuentes?\s+utilizadas?)\b/i.test(
          s,
        )
      ) {
        epistemicItems.push({
          type: 'OBSERVED_FACT',
          content: s.slice(0, 280),
        });
      }
    }

    const firstSubstantial =
      sentences.find((s) => s.length >= 30) ?? cleanReply.slice(0, 220);
    epistemicItems.push({
      type: 'ASSISTANT_STATEMENT',
      content: firstSubstantial.slice(0, 280),
    });

    const conclusion =
      sentences.slice(0, 2).join(' ').slice(0, 320) ||
      cleanReply.slice(0, 250);

    const tags = entities.map((e) => e.toLowerCase()).slice(0, 6);

    return {
      eventType: 'conversation_episode',
      topic,
      summary,
      conclusion,
      epistemicItems,
      entities,
      tags,
      sessionId,
      agentRunId: provenance.agentRunId,
      sourceMessageIds: provenance.sourceMessageIds,
      sourceDocId: provenance.sourceDocIds[0],
      sourceDocIds: provenance.sourceDocIds,
      sourceChunkIds: provenance.sourceChunkIds,
      occurredAt,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MEM-002 & MEM-003: RECUPERACIÓN HISTÓRICA Y AUTOBIOGRÁFICA (3 NIVELES)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Detecta si la consulta del usuario pregunta por el pasado autobiográfico de JarBees:
   * qué hablamos/investigamos en una fecha, cuándo discutimos un tema, qué decidimos,
   * o cómo evolucionó nuestra evaluación.
   */
  isAutobiographicalQuery(query: string): boolean {
    const q = query.trim();
    const temporal = this.parseTemporalRange(q);

    const pastActionPattern =
      /\b(qu[eé]\s+(?:hablamos|conversamos|discutimos|investigamos|probamos|decidimos|acordamos|concluimos|hicimos)|qu[eé]\s+estuvimos\s+(?:investigando|hablando|probando|discutiendo)|cu[aá]ndo\s+(?:hablamos|conversamos|discutimos|investigamos|mencionamos|tratamos)|c[oó]mo\s+evolucion[oó]\s+nuestra\s+(?:evaluaci[oó]n|opini[oó]n|arquitectura|investigaci[oó]n|idea)|en\s+nuestras?\s+(?:conversaciones|sesiones)\s+(?:anteriores|previas|pasadas)|tenemos\s+registros?\s+de\s+haber\s+hablado)\b/i;

    if (pastActionPattern.test(q)) {
      return true;
    }

    if (
      temporal.hasExplicitDate &&
      /\b(investigamos|hablamos|decidimos|discutimos|conversamos|hicimos|pas[oó]|registramos|sesi[oó]n)\b/i.test(
        q,
      )
    ) {
      return true;
    }

    return false;
  }

  /**
   * Extrae determinísticamente una fecha o ventana temporal en español sin depender de embeddings.
   * Ejemplo: "5 de noviembre de 2026" -> [2026-11-05T00:00:00-03:00, 2026-11-06T00:00:00-03:00)
   */
  parseTemporalRange(
    query: string,
    referenceNow = new Date(),
  ): TemporalRangeResult {
    const normalized = query.toLowerCase();

    // 1. Formato español: "5 de noviembre de 2026" / "5 de noviembre del 2025"
    const esDateMatch = normalized.match(
      /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de(?:l)?\s+(\d{4}))?\b/i,
    );
    if (esDateMatch) {
      const day = parseInt(esDateMatch[1], 10);
      const monthName = esDateMatch[2].toLowerCase();
      const month = SPANISH_MONTHS[monthName];
      const year = esDateMatch[3]
        ? parseInt(esDateMatch[3], 10)
        : referenceNow.getFullYear();

      if (month && day >= 1 && day <= 31) {
        const isoStart = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-03:00`;
        const start = new Date(isoStart);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return {
          hasExplicitDate: true,
          label: `${day} de ${monthName} de ${year}`,
          start,
          end,
        };
      }
    }

    // 2. Formato ISO: "2026-11-05"
    const isoMatch = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      const isoStart = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-03:00`;
      const start = new Date(isoStart);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return {
        hasExplicitDate: true,
        label: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        start,
        end,
      };
    }

    // 3. Relativos: "hoy" / "ayer" (solo cuando es consulta autobiográfica)
    if (/\bhoy\b/i.test(normalized)) {
      const arDateStr = referenceNow.toLocaleDateString('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }); // YYYY-MM-DD
      const start = new Date(`${arDateStr}T00:00:00-03:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return {
        hasExplicitDate: true,
        label: `hoy (${arDateStr})`,
        start,
        end,
      };
    }

    if (/\bayer\b/i.test(normalized)) {
      const yesterday = new Date(referenceNow.getTime() - 24 * 60 * 60 * 1000);
      const arDateStr = yesterday.toLocaleDateString('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      });
      const start = new Date(`${arDateStr}T00:00:00-03:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return {
        hasExplicitDate: true,
        label: `ayer (${arDateStr})`,
        start,
        end,
      };
    }

    return { hasExplicitDate: false };
  }

  /**
   * Recuperación Autobiográfica Multi-Camino (MEM-002 + MEM-003):
   * - Nivel 1 (Fecha exacta): SQL temporal puro sobre TopicSnapshot (+ fallback a AgentRun).
   * - Nivel 2 (Tema/Entidad + Fecha): búsqueda combinada e hidratación de fuentes documentales y mensajes.
   * - Nivel 3 (Decisión / Evolución): línea de tiempo cronológica separando hechos, hipótesis, decisiones y pendientes.
   * - Honestidad Autobiográfica (MEM-003): si la fecha o el tema consultado tiene 0 episodios, emite directiva de abstención estricta.
   */
  async recallAutobiographicalMemory(
    query: string,
    referenceNow = new Date(),
  ): Promise<AutobiographicalRecallResult> {
    if (!this.isAutobiographicalQuery(query)) {
      return {
        isAutobiographicalQuery: false,
        queryType: 'NONE',
        temporalRange: { hasExplicitDate: false },
        episodes: [],
        fallbackRunsUsed: false,
        formattedContextBlock: '',
      };
    }

    const recallStartMs = Date.now();
    const temporalRange = this.parseTemporalRange(query, referenceNow);
    const queryType = this.classifyAutobiographicalQueryType(
      query,
      temporalRange,
    );
    const searchTerms = this.extractSearchKeywords(query);

    // 1. Consulta en TopicSnapshot (con filtro temporal SQL estricto si hay fecha explícita)
    const whereClause: Record<string, any> = {
      revocationStatus: 'ACTIVE',
    };

    if (
      temporalRange.hasExplicitDate &&
      temporalRange.start &&
      temporalRange.end
    ) {
      whereClause.createdAt = {
        gte: temporalRange.start,
        lt: temporalRange.end,
      };
    }

    const sqlStartMs = Date.now();
    const candidateSnapshots = await this.prisma.topicSnapshot.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    // Filtrar y puntuar por términos de tema/entidad/decisión cuando la consulta especifica un tema
    let matchedSnapshots = candidateSnapshots;
    const asksUnrecordedTopic =
      /\btema\s+del\s+que\s+no\s+tenemos\s+registros?\b/i.test(query);

    if (asksUnrecordedTopic) {
      matchedSnapshots = [];
    } else if (searchTerms.length > 0) {
      const scored = candidateSnapshots
        .map((snap) => {
          const haystack = this.normalizeSearchText(
            [
              snap.topic,
              snap.summary ?? '',
              snap.conclusion,
              snap.entities ?? '',
              snap.tags ?? '',
              snap.epistemicItems ?? '',
            ].join(' '),
          );

          let hits = 0;
          for (const term of searchTerms) {
            if (haystack.includes(term)) hits += 1;
          }
          return { snap, hits };
        })
        .filter((x) => x.hits > 0)
        .sort(
          (a, b) =>
            b.hits - a.hits ||
            a.snap.createdAt.getTime() - b.snap.createdAt.getTime(),
        );

      if (scored.length > 0) {
        matchedSnapshots = scored.map((s) => s.snap);
      } else if (!temporalRange.hasExplicitDate) {
        matchedSnapshots = [];
      }
    }

    // 2. Fallback Multi-Camino a AgentRun si TopicSnapshot no tenía consolidaciones pero sí hay eventos en AgentRun
    let fallbackRunsUsed = false;
    if (matchedSnapshots.length === 0 && !asksUnrecordedTopic) {
      const fallbackSnapshots = await this.recoverFromRawAgentRuns(
        temporalRange,
        searchTerms,
      );
      if (fallbackSnapshots.length > 0) {
        matchedSnapshots = fallbackSnapshots;
        fallbackRunsUsed = true;
      }
    }
    const sqlQueryMs = Date.now() - sqlStartMs;

    // 3. Si no existen registros para esa fecha o tema -> Honestidad Autobiográfica (MEM-003)
    if (matchedSnapshots.length === 0) {
      const emptyReason = temporalRange.hasExplicitDate
        ? 'NO_RECORDS_FOR_DATE'
        : 'NO_RECORDS_FOR_TOPIC';

      const abstentionBlock = this.buildAutobiographicalAbstentionBlock(
        query,
        temporalRange,
        searchTerms,
      );

      const totalRecallMs = Date.now() - recallStartMs;
      return {
        isAutobiographicalQuery: true,
        queryType,
        temporalRange,
        episodes: [],
        fallbackRunsUsed: false,
        emptyReason,
        formattedContextBlock: abstentionBlock,
        diagnostics: {
          sqlQueryMs,
          provenanceHydrationMs: 0,
          totalRecallMs,
          sqlStartIso: temporalRange.start?.toISOString(),
          sqlEndIso: temporalRange.end?.toISOString(),
        },
      };
    }

    // 4. Hidratar procedencia (Documentos y Mensajes originales) sin duplicar datos
    const hydrationStartMs = Date.now();
    const hydratedEpisodes = await this.hydrateEpisodes(matchedSnapshots);
    const provenanceHydrationMs = Date.now() - hydrationStartMs;
    const formattedContextBlock = this.formatEpisodesForPrompt(
      queryType,
      temporalRange,
      hydratedEpisodes,
    );
    const totalRecallMs = Date.now() - recallStartMs;

    this.logger.log(
      `[MEM-002] Recall (${queryType}): episodes=${hydratedEpisodes.length}, sql=${sqlQueryMs}ms, hydration=${provenanceHydrationMs}ms, total=${totalRecallMs}ms`,
    );

    return {
      isAutobiographicalQuery: true,
      queryType,
      temporalRange,
      episodes: hydratedEpisodes,
      fallbackRunsUsed,
      formattedContextBlock,
      diagnostics: {
        sqlQueryMs,
        provenanceHydrationMs,
        totalRecallMs,
        sqlStartIso: temporalRange.start?.toISOString(),
        sqlEndIso: temporalRange.end?.toISOString(),
      },
    };
  }

  private classifyAutobiographicalQueryType(
    query: string,
    temporalRange: TemporalRangeResult,
  ): 'DATE' | 'TOPIC' | 'DECISION' | 'EVOLUTION' {
    if (/\b(evolucion[oó]|evoluci[oó]n|cambi[oó]\s+nuestra)\b/i.test(query)) {
      return 'EVOLUTION';
    }
    if (/\b(decidimos|decisi[oó]n|acordamos)\b/i.test(query) && !temporalRange.hasExplicitDate) {
      return 'DECISION';
    }
    if (temporalRange.hasExplicitDate) {
      return 'DATE';
    }
    return 'TOPIC';
  }

  private async recoverFromRawAgentRuns(
    temporalRange: TemporalRangeResult,
    searchTerms: string[],
  ): Promise<any[]> {
    const runWhere: Record<string, any> = {};
    if (
      temporalRange.hasExplicitDate &&
      temporalRange.start &&
      temporalRange.end
    ) {
      runWhere.createdAt = {
        gte: temporalRange.start,
        lt: temporalRange.end,
      };
    }

    const runs = await this.prisma.agentRun.findMany({
      where: runWhere,
      orderBy: { createdAt: 'asc' },
      take: 30,
    });

    const filtered = runs.filter((r) => {
      if (this.isAutobiographicalQuery(r.question)) return false;
      if (searchTerms.length === 0) return true;
      const text = this.normalizeSearchText(`${r.question} ${r.answer ?? ''}`);
      return searchTerms.some((t) => text.includes(t));
    });

    return filtered.slice(0, 8).map((r) => {
      const chunkIds = this.parseIntArray(r.chunksRetrievedIds);
      const built = this.buildStructuredEpisodeFromTurn(
        r.question,
        r.answer ?? '',
        r.sessionId ?? undefined,
        {
          agentRunId: r.id,
          sourceMessageIds: [],
          sourceDocIds: [],
          sourceChunkIds: chunkIds,
        },
        r.createdAt,
      );
      return {
        id: -r.id,
        eventType: built.eventType,
        topic: built.topic,
        summary: built.summary,
        conclusion: built.conclusion,
        epistemicItems: JSON.stringify(built.epistemicItems),
        entities: JSON.stringify(built.entities),
        tags: JSON.stringify(built.tags),
        sessionId: r.sessionId,
        agentRunId: r.id,
        sourceMessageIds: '[]',
        sourceDocId: null,
        sourceDocIds: '[]',
        sourceChunkIds: JSON.stringify(chunkIds),
        createdAt: r.createdAt,
      };
    });
  }

  private async hydrateEpisodes(
    snapshots: any[],
  ): Promise<HydratedEpisodeRecord[]> {
    const allDocIds = new Set<number>();
    const allMsgIds = new Set<number>();

    for (const s of snapshots) {
      if (typeof s.sourceDocId === 'number' && s.sourceDocId > 0) {
        allDocIds.add(s.sourceDocId);
      }
      for (const id of this.parseIntArray(s.sourceDocIds)) {
        allDocIds.add(id);
      }
      for (const id of this.parseIntArray(s.sourceMessageIds)) {
        allMsgIds.add(id);
      }
    }

    const [docs, msgs] = await Promise.all([
      allDocIds.size > 0
        ? this.prisma.document.findMany({
            where: { id: { in: Array.from(allDocIds) } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      allMsgIds.size > 0
        ? this.prisma.conversationMessage.findMany({
            where: { id: { in: Array.from(allMsgIds) } },
            select: { id: true, role: true, content: true },
          })
        : Promise.resolve([]),
    ]);

    const docMap = new Map(docs.map((d) => [d.id, d.title]));
    const msgMap = new Map(msgs.map((m) => [m.id, m]));

    return snapshots.map((s) => {
      const docIds = Array.from(
        new Set([
          ...(s.sourceDocId ? [s.sourceDocId] : []),
          ...this.parseIntArray(s.sourceDocIds),
        ]),
      );
      const msgIds = this.parseIntArray(s.sourceMessageIds);
      const chunkIds = this.parseIntArray(s.sourceChunkIds);

      const occurredAtFormatted = new Date(s.createdAt).toLocaleString(
        'es-AR',
        {
          timeZone: 'America/Argentina/Buenos_Aires',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      );

      return {
        id: s.id,
        eventType: s.eventType ?? 'conversation_episode',
        occurredAt: new Date(s.createdAt),
        occurredAtFormatted,
        topic: s.topic,
        summary: s.summary ?? s.conclusion,
        conclusion: s.conclusion,
        epistemicItems: this.parseEpistemicItems(s.epistemicItems),
        entities: this.parseTags(s.entities),
        tags: this.parseTags(s.tags),
        provenance: {
          sessionId: s.sessionId ?? null,
          agentRunId: s.agentRunId ?? null,
          sourceMessageIds: msgIds,
          sourceDocIds: docIds,
          sourceChunkIds: chunkIds,
          documents: docIds.map((id) => ({
            id,
            title: docMap.get(id) ?? `Documento #${id}`,
          })),
          messagesExcerpt: msgIds
            .map((id) => msgMap.get(id))
            .filter(Boolean)
            .map((m: any) => ({
              id: m.id,
              role: m.role,
              snippet: m.content.slice(0, 180),
            })),
        },
      };
    });
  }

  private formatEpisodesForPrompt(
    queryType: 'DATE' | 'TOPIC' | 'DECISION' | 'EVOLUTION',
    temporalRange: TemporalRangeResult,
    episodes: HydratedEpisodeRecord[],
  ): string {
    const header = [
      `### MEMORIA EPISÓDICA Y AUTOBIOGRÁFICA VERIFICADA (POSTGRESQL — ${episodes.length} EPISODIO(S) RECUPERADO(S))`,
      `Modo de recuperación: ${queryType}${temporalRange.hasExplicitDate ? ` | Filtro temporal SQL: ${temporalRange.label}` : ''}`,
      `📌 DIRECTIVA EPISTÉMICA AUTOBIOGRÁFICA ESTRICTA:`,
      `1. Respondé basándote ÚNICAMENTE en los episodios verificados listados a continuación. NO inventes ni extrapoles conversaciones, fechas, decisiones ni fuentes que no figuren aquí.`,
      `2. Mantené estrictamente la distinción entre el estatus epistémico de cada elemento:`,
      `   - [USER_STATEMENT]: Lo que expresó o preguntó el usuario.`,
      `   - [OBSERVED_FACT]: Hechos verificados en documentos, código o telemetría.`,
      `   - [ASSISTANT_STATEMENT]: Conclusiones o explicaciones formuladas por JarBees.`,
      `   - [HYPOTHESIS]: Hipótesis planteadas (NO las presentes como hechos confirmados ni como decisiones).`,
      `   - [DECISION]: Decisiones explícitamente acordadas.`,
      `   - [OPEN_QUESTION]: Preguntas que quedaron abiertas o pendientes.`,
      `3. Citá siempre la procedencia verificada (fecha/hora del episodio, ID de ejecución AgentRun, IDs de mensajes y títulos de documentos/chunks utilizados).`,
      `4. Si hay múltiples episodios, presentá TODOS los episodios recuperados de manera sintética (1 oración concisa por ítem epistémico) para cubrir cada episodio de principio a fin sin omitir ni truncar ninguno.`,
      '',
    ];

    const body = episodes.map((ep, idx) => {
      const docsText =
        ep.provenance.documents.length > 0
          ? ep.provenance.documents
              .map((d) => `"${d.title}" (Doc #${d.id})`)
              .join(', ')
          : 'Ningún documento externo (análisis arquitectónico/conceptual)';

      const chunksText =
        ep.provenance.sourceChunkIds.length > 0
          ? ` | Chunks RAG: [${ep.provenance.sourceChunkIds.join(', ')}]`
          : '';

      const itemsText =
        ep.epistemicItems.length > 0
          ? ep.epistemicItems
              .map((item) => `  * [${item.type}]: ${item.content}`)
              .join('\n')
          : `  * [ASSISTANT_STATEMENT]: ${ep.conclusion}`;

      return [
        `#### Episodio ${idx + 1}: "${ep.topic}"`,
        `- **Fecha y hora exacta:** ${ep.occurredAtFormatted}`,
        `- **Procedencia verificada:** Sesión \`${ep.provenance.sessionId ?? 'N/A'}\` | AgentRun \`#${ep.provenance.agentRunId ?? 'N/A'}\` | Mensajes \`[${ep.provenance.sourceMessageIds.join(', ')}]\``,
        `- **Fuentes documentales utilizadas:** ${docsText}${chunksText}`,
        `- **Resumen del acontecimiento:** ${ep.summary}`,
        `- **Conclusión consolidada:** ${ep.conclusion}`,
        `- **Desglose Epistémico del Episodio:**`,
        itemsText,
      ].join('\n');
    });

    return [...header, ...body].join('\n\n');
  }

  private buildAutobiographicalAbstentionBlock(
    query: string,
    temporalRange: TemporalRangeResult,
    searchTerms: string[],
  ): string {
    const targetDesc = temporalRange.hasExplicitDate
      ? `la fecha solicitada (${temporalRange.label})`
      : `el tema consultado (${searchTerms.join(', ') || query})`;

    return [
      `### MEMORIA EPISÓDICA Y AUTOBIOGRÁFICA VERIFICADA (0 REGISTROS ENCONTRADOS)`,
      `Resultado de consulta en PostgreSQL (TopicSnapshot + AgentRun + ConversationMessage): **0 episodios registrados** para ${targetDesc}.`,
      `📌 DIRECTIVA DE HONESTIDAD AUTOBIOGRÁFICA OBLIGATORIA (MEM-003):`,
      `- NO existen registros en la memoria episódica ni en el historial de conversaciones para ${targetDesc}.`,
      `- Debés declarar explícitamente que revisaste tu memoria episódica y NO tenés registros de conversaciones, investigaciones ni decisiones para ${targetDesc}.`,
      `- Queda TERMINANTEMENTE PROHIBIDO inventar, suponer o reconstruir imaginativamente una conversación o decisión inexistente.`,
    ].join('\n');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MÉTODOS EXISTENTES DE EVOLUCIÓN (RETROCOMPATIBILIDAD 100%)
  // ══════════════════════════════════════════════════════════════════════════

  async getEvolution(
    topic: string,
    limitDays = 365,
  ): Promise<EvolutionReport | null> {
    const since = new Date();
    since.setDate(since.getDate() - limitDays);

    const snapshots = await this.prisma.topicSnapshot.findMany({
      where: {
        OR: [
          { topic: { contains: topic } },
          { tags: { contains: topic.toLowerCase() } },
          { conclusion: { contains: topic } },
        ],
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (snapshots.length === 0) {
      this.logger.log(
        `[evolution] sin snapshots para "${topic}" en los últimos ${limitDays} días`,
      );
      return null;
    }

    const evolution: EvolutionEntry[] = snapshots.map((s) => ({
      date: s.createdAt.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      summary: s.conclusion,
      tags: this.parseTags(s.tags),
    }));

    const narrative = await this.generateNarrative(topic, evolution);

    return {
      topic,
      firstMentioned: evolution[0].date,
      lastMentioned: evolution[evolution.length - 1].date,
      totalMentions: snapshots.length,
      evolution,
      narrative,
    };
  }

  async listTopics(): Promise<
    Array<{ topic: string; mentions: number; lastSeen: string }>
  > {
    const grouped = await this.prisma.topicSnapshot.groupBy({
      by: ['topic'],
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    });

    return grouped.map((g) => ({
      topic: g.topic,
      mentions: g._count.id,
      lastSeen: (g._max.createdAt ?? new Date()).toLocaleDateString('es-AR'),
    }));
  }

  // ── Helpers Internos ─────────────────────────────────────────────────────

  private parseTags(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseIntArray(raw: string | null | undefined): number[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
        : [];
    } catch {
      return [];
    }
  }

  private parseEpistemicItems(
    raw: string | null | undefined,
  ): EpistemicEpisodeItem[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item) =>
          item &&
          VALID_EPISTEMIC_ITEM_TYPES.includes(item.type) &&
          typeof item.content === 'string',
      );
    } catch {
      return [];
    }
  }

  private normalizeSearchText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private extractSearchKeywords(query: string): string[] {
    // Eliminar fechas explícitas antes de extraer keywords temáticas
    const withoutDates = query
      .toLowerCase()
      .replace(
        /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de(?:l)?\s+\d{4})?\b/gi,
        ' ',
      )
      .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ');

    const tokens = withoutDates
      .replace(/[^a-záéíóúñ0-9_-]+/gi, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4 && !STOPWORDS_ES.has(t))
      .map((t) => this.normalizeSearchText(t))
      .filter((t) => t.length >= 4 && !STOPWORDS_ES.has(t));

    return Array.from(new Set(tokens));
  }

  private extractSignificantEntities(text: string): string[] {
    const matches =
      text.match(
        /\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñA-Z0-9_-]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-Z0-9_-]{2,})?|PGVECTOR_RAG|IntentRouter|ContextSelector|CapabilityExecutor|RAG|JCA-001)\b/g,
      ) ?? [];
    const ignore = new Set([
      'Hola',
      'Ignacio',
      'Para',
      'Segun',
      'Según',
      'Como',
      'Cómo',
      'Cuando',
      'Cuándo',
      'Donde',
      'Dónde',
      'Buscá',
      'Analizá',
      'Hasta',
      'Además',
      'Aunque',
      'Fuentes',
      'Interpretaciones',
      'Conclusión',
      'Hipótesis',
    ]);
    const cleaned = matches
      .map((m) => m.trim())
      .filter((m) => !ignore.has(m) && m.length >= 3);
    return Array.from(new Set(cleaned)).slice(0, 8);
  }

  private deriveTopicTitle(userMessage: string, entities: string[]): string {
    if (entities.length >= 2) {
      return entities.slice(0, 3).join(' · ');
    }
    const words = userMessage
      .replace(/[¿?¡!.,;:"]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS_ES.has(w.toLowerCase()));
    return words.slice(0, 4).join(' ') || 'Conversación Técnica';
  }

  private isSignificantExchange(
    userMessage: string,
    assistantReply: string,
  ): boolean {
    if (assistantReply.split(/\s+/).length < 15) return false;
    const trivial =
      /^(hola|gracias|ok|dale|si|no|perfecto|buenas|chau|ciao|de nada)[!?.]*$/i;
    if (trivial.test(userMessage.trim())) return false;
    return true;
  }

  private async extractTopicSnapshot(
    userMessage: string,
    assistantReply: string,
  ): Promise<TopicSnapshot | null> {
    const prompt = `/no_think
Analizá este intercambio y extraé la información en formato JSON.
Devolvé SOLO el JSON, sin markdown ni texto extra.

{
  "topic": "tema principal en 1-3 palabras (ej: 'Qwen', 'NestJS', 'arquitectura backend')",
  "conclusion": "conclusión o aprendizaje clave en 1-2 oraciones",
  "tags": ["tag1", "tag2", "tag3"]
}

Si no hay tema claro o es trivial, devolvé: {"topic": null}

Intercambio:
Usuario: ${userMessage.slice(0, 500)}
JarBees: ${assistantReply.slice(0, 500)}`;

    try {
      const llm = this.getActiveLlm();
      const response = await llm.generate({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 250,
      });

      const cleanJson = response.content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleanJson);
      if (!parsed.topic) return null;

      return {
        topic: parsed.topic,
        date: new Date(),
        conclusion: parsed.conclusion || assistantReply.slice(0, 200),
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.map((t: string) => String(t).toLowerCase())
          : [],
      };
    } catch {
      return null;
    }
  }

  private async generateNarrative(
    topic: string,
    evolution: EvolutionEntry[],
  ): Promise<string> {
    if (evolution.length === 1) {
      return `Solo hay un registro sobre "${topic}" del ${evolution[0].date}: ${evolution[0].summary}`;
    }

    const timeline = evolution
      .map((e) => `[${e.date}] ${e.summary}`)
      .join('\n');

    try {
      const llm = this.getActiveLlm();
      const response = await llm.generate({
        messages: [
          {
            role: 'system',
            content:
              'Sos JarBees. Narrás en primera persona (desde la perspectiva del usuario) ' +
              'cómo evolucionó su pensamiento sobre un tema. ' +
              'Usá un tono natural, como si le contaras a alguien cómo cambió su forma de ver algo. ' +
              'Respondé en español. Máximo 4 oraciones.',
          },
          {
            role: 'user',
            content: `/no_think\nTema: "${topic}"\n\nTimeline de menciones:\n${timeline}\n\nNarrá la evolución.`,
          },
        ],
        temperature: 0.4,
        maxTokens: 350,
      });

      return response.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    } catch {
      return (
        `Desde ${evolution[0].date} hasta ${evolution[evolution.length - 1].date}, ` +
        `"${topic}" fue mencionado ${evolution.length} veces. ` +
        `Último registro: ${evolution[evolution.length - 1].summary}`
      );
    }
  }
}
