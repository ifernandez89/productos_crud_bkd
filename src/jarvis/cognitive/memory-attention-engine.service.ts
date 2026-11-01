import { Injectable, Logger } from '@nestjs/common';
import {
  KnowledgeAccessService,
  KnowledgeGraphQuery,
  KnowledgeGraphQueryResult,
} from '../knowledge/knowledge-access.service';

export type MemoryFocus =
  | 'FACTUAL'
  | 'RELATIONAL'
  | 'EVOLUTIONARY'
  | 'CAUSAL_INFERENCE'
  | 'HYBRID';

export interface MemoryAttentionPolicy {
  enableRag: boolean;
  enableGraphTool: boolean;
  enableSnapshotTool: boolean;
  activateDialecticGate: boolean;
  suggestedFocus: MemoryFocus;
  reasoning: string;
  allowedTools: string[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

@Injectable()
export class MemoryAttentionEngineService {
  private readonly logger = new Logger(MemoryAttentionEngineService.name);

  constructor(
    private readonly knowledgeAccess: KnowledgeAccessService,
  ) {}

  /**
   * Evalúa la intención, estructura semántica y necesidades epistémicas
   * para formular una política de atención a la memoria dinámica (no rígida).
   */
  evaluateAttentionPolicy(
    userMessage: string,
    options: {
      hasPriorContradiction?: boolean;
      confidence?: number;
    } = {},
  ): MemoryAttentionPolicy {
    const text = userMessage.toLowerCase();

    // 1. Detección de patrones relacionales (multi-hop / grafos / dependencias)
    const relationalTriggers = [
      'relacion', 'relación', 'conecta', 'depende', 'dependencia',
      'quién influyó', 'quien influyo', 'desarrolló', 'desarrollo',
      'vínculo', 'vinculo', 'grafo', 'ontología', 'ontologia',
      'arquitectura de dependencias', 'interacción entre', 'interaccion entre',
    ];
    const isRelational = relationalTriggers.some((t) => text.includes(t));

    // 2. Detección de patrones evolutivos / históricos / decisiones previas
    const evolutionaryTriggers = [
      'cómo cambió', 'como cambio', 'historia de', 'evolución', 'evolucion',
      'decisión previa', 'decision previa', 'qué concluimos', 'que concluimos',
      'snapshot', 'última vez', 'ultima vez', 'aprendido sobre',
    ];
    const isEvolutionary = evolutionaryTriggers.some((t) => text.includes(t));

    // 3. Detección de razonamiento causal puro o deducción de frontera
    const causalTriggers = [
      'por qué', 'por que', 'demuestra', 'algoritmo', 'invariante',
      'condición de carrera', 'concurrencia', 'idempotencia', 'raft',
      'paxos', 'consenso', 'circuit breaker', 'lww', 'vector clock',
    ];
    const isCausalInference = causalTriggers.some((t) => text.includes(t));

    // 4. Formulación de política contextual (flexible)
    const allowedTools: string[] = [];
    let enableGraphTool = false;
    let enableSnapshotTool = false;
    let enableRag = true; // RAG semántico como backbone
    let suggestedFocus: MemoryFocus = 'FACTUAL';
    let reasoning = '';

    if (options.hasPriorContradiction) {
      suggestedFocus = 'HYBRID';
      enableGraphTool = true;
      enableSnapshotTool = true;
      allowedTools.push('query_knowledge_graph', 'fetch_topic_snapshot');
      reasoning =
        'Contradicción epistémica detectada: habilitadas herramientas de grafo y snapshot para auditar precedentes.';
    } else if (isRelational) {
      suggestedFocus = 'RELATIONAL';
      enableGraphTool = true;
      allowedTools.push('query_knowledge_graph');
      reasoning =
        'Consulta orientada a relaciones o dependencias: habilitada herramienta de grafo bajo demanda.';
    } else if (isEvolutionary) {
      suggestedFocus = 'EVOLUTIONARY';
      enableSnapshotTool = true;
      allowedTools.push('fetch_topic_snapshot');
      reasoning =
        'Consulta orientada a trayectoria histórica: habilitada herramienta de snapshots temporales.';
    } else if (isCausalInference) {
      suggestedFocus = 'CAUSAL_INFERENCE';
      // En inferencia causal, el MAE habilita el grafo pero de forma opcional (no forzada en prompt)
      // para permitir que el modelo consulte contratos si lo requiere sin anclarlo prematuramente.
      enableGraphTool = true;
      allowedTools.push('query_knowledge_graph');
      reasoning =
        'Problema de razonamiento causal / algorítmico: herramienta de grafo disponible bajo demanda, sin inyección estática de contexto.';
    } else {
      suggestedFocus = 'FACTUAL';
      reasoning =
        'Consulta factual estándar: resuelta con RAG semántico sin sobrecarga de herramientas.';
    }

    return {
      enableRag,
      enableGraphTool,
      enableSnapshotTool,
      activateDialecticGate: options.hasPriorContradiction ?? false,
      suggestedFocus,
      reasoning,
      allowedTools,
    };
  }

  /**
   * Retorna las definiciones formales de herramientas para el LLM (formato OpenAPI/JSON Schema).
   */
  getEnabledTools(policy: MemoryAttentionPolicy): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    if (policy.enableGraphTool) {
      tools.push({
        type: 'function',
        function: {
          name: 'query_knowledge_graph',
          description:
            'Consulta el Grafo de Conocimiento activo para obtener relaciones, dependencias y procedencia entre entidades verificadas. Usar bajo demanda si el razonamiento requiere trazar conexiones ontológicas.',
          parameters: {
            type: 'object',
            properties: {
              entity: {
                type: 'string',
                description: 'Nombre de la entidad o concepto raíz a explorar (ej. "Raft", "LWW-Register").',
              },
              relationType: {
                type: 'string',
                description: 'Tipo opcional de relación a filtrar (ej. "USES", "DEVELOPED", "RELATED_TO").',
              },
              maxDepth: {
                type: 'integer',
                minimum: 1,
                maximum: 3,
                default: 2,
                description: 'Profundidad máxima del subgrafo (1 a 3 saltos).',
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 25,
                default: 10,
                description: 'Límite máximo de relaciones devueltas.',
              },
              includeProvenance: {
                type: 'boolean',
                default: true,
                description: 'Si se debe incluir procedencia documental activa.',
              },
            },
            required: ['entity'],
          },
        },
      });
    }

    if (policy.enableSnapshotTool) {
      tools.push({
        type: 'function',
        function: {
          name: 'fetch_topic_snapshot',
          description:
            'Recupera el historial de consensos y conclusiones previas registradas sobre un tema específico.',
          parameters: {
            type: 'object',
            properties: {
              topic: {
                type: 'string',
                description: 'Tema o concepto sobre el que recuperar snapshots históricos.',
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 5,
                default: 3,
              },
            },
            required: ['topic'],
          },
        },
      });
    }

    return tools;
  }

  /**
   * Ejecutor seguro de herramientas invocadas por el LLM.
   */
  async executeToolCall(
    toolName: string,
    args: any,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      if (toolName === 'query_knowledge_graph') {
        const query: KnowledgeGraphQuery = {
          entity: args.entity,
          relationType: args.relationType,
          maxDepth: args.maxDepth ?? 2,
          limit: args.limit ?? 10,
          includeProvenance: args.includeProvenance ?? true,
        };
        const res: KnowledgeGraphQueryResult =
          await this.knowledgeAccess.queryKnowledgeGraph(query);
        return { success: true, result: res };
      }

      if (toolName === 'fetch_topic_snapshot') {
        const snapshots = await this.knowledgeAccess.getActiveTopicSnapshots(
          args.topic,
          args.limit ?? 3,
        );
        return { success: true, result: snapshots };
      }

      return {
        success: false,
        error: `Herramienta desconocida o no autorizada por el MAE: ${toolName}`,
      };
    } catch (err: any) {
      this.logger.error(`Error ejecutando tool call ${toolName}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

