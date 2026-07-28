import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeEntity, KnowledgeEntityType } from '@prisma/client';
import {
  EntityGraphRepository,
  SubgraphNode,
} from '../repositories/entity-graph.repository';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface GraphContext {
  entities: KnowledgeEntity[];
  subgraph: SubgraphNode[];
  contextText: string; // listo para inyectar en el prompt
}

// ── Servicio ──────────────────────────────────────────────────────────────────

@Injectable()
export class EntityGraphService {
  private readonly logger = new Logger(EntityGraphService.name);

  constructor(private readonly repo: EntityGraphRepository) {}

  /**
   * Detecta entidades mencionadas en texto libre buscando por nombre y aliases.
   * Tokeniza la query y busca contra el índice del grafo.
   */
  async findEntitiesInText(text: string): Promise<KnowledgeEntity[]> {
    if (!text?.trim()) return [];

    const stopwords = new Set([
      'que', 'qué', 'hay', 'una', 'con', 'los', 'las', 'del', 'para',
      'como', 'más', 'por', 'son', 'sus', 'tiene', 'también', 'entre',
      'the', 'and', 'for', 'with', 'are', 'was', 'how', 'what', 'this',
    ]);

    const tokens = text
      .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, ' ')
      .split(/\s+/)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 3 && !stopwords.has(t));

    if (!tokens.length) return [];

    const results = await Promise.all(
      tokens.map((token) => this.repo.searchEntities(token)),
    );

    const merged = new Map<number, KnowledgeEntity>();
    results.flat().forEach((e) => merged.set(e.id, e));

    return Array.from(merged.values())
      .sort((a, b) => b.timesUsed - a.timesUsed)
      .slice(0, 10);
  }

  /**
   * Recupera subgrafo de profundidad 2 para las entidades detectadas.
   * Retorna el contexto serializado listo para el prompt.
   */
  async getSubgraphContext(
    entities: KnowledgeEntity[],
    depth = 2,
  ): Promise<GraphContext | null> {
    if (!entities.length) return null;

    const entityIds = entities.map((e) => e.id);
    const subgraph = await this.repo.getSubgraph(entityIds, depth);

    if (!subgraph.length) return null;

    const contextText = this.formatSubgraphAsText(subgraph);
    return { entities, subgraph, contextText };
  }

  /**
   * Serializa el subgrafo como texto legible para el prompt del LLM.
   * Ejemplo:
   *   Jung → DEVELOPED → Arquetipo [conf: 0.98]
   *   Arquetipo → RELATED_TO → Inconsciente colectivo [conf: 0.95]
   */
  formatSubgraphAsText(nodes: SubgraphNode[]): string {
    if (!nodes.length) return '';

    const lines = new Set<string>();

    for (const node of nodes) {
      for (const { relation, target } of node.outgoing) {
        const conf = relation.confidence.toFixed(2);
        const label = relation.label ?  ("") : '';
        lines.add(
          ${node.entity.name} →  →  [conf: ],
        );
      }
    }

    if (!lines.size) return '';

    return [
      '## GRAFO DE CONOCIMIENTO',
      '(relaciones estructuradas — úsalas para preguntas sobre conexiones entre conceptos)',
      '',
      ...Array.from(lines).slice(0, 20),
    ].join('\n');
  }

  /**
   * Merge seguro: devuelve entidad existente o crea una nueva.
   */
  async mergeEntity(
    name: string,
    type: KnowledgeEntityType,
    description?: string,
    aliases?: string[],
  ): Promise<KnowledgeEntity> {
    return this.repo.upsertEntity(name, type, description, aliases);
  }

  /**
   * Busca entidades por tipo específico.
   */
  async getEntitiesByType(type: KnowledgeEntityType): Promise<KnowledgeEntity[]> {
    return this.repo.searchEntities('', type);
  }
}
