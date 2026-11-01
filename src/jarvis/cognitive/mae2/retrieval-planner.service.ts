import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionEvaluationContext,
  RetrievalDecision,
  RetrievalDecisionRecord,
  RetrievalPlan,
} from './mae2.types';
import { MemoryAttentionPolicyService } from './memory-attention-policy.service';
import { MemoryDecisionLoggerService } from './memory-decision-logger.service';

@Injectable()
export class RetrievalPlannerService {
  private readonly logger = new Logger(RetrievalPlannerService.name);

  constructor(
    private readonly policyService: MemoryAttentionPolicyService,
    private readonly loggerService: MemoryDecisionLoggerService,
  ) {}

  /**
   * Procesa el contexto de la consulta, evalúa la política de atención, registra la decisión y genera el plan de recuperación.
   */
  createPlan(context: DecisionEvaluationContext): {
    record: RetrievalDecisionRecord;
    plan: RetrievalPlan;
  } {
    const record = this.policyService.evaluatePolicy(context);
    this.loggerService.logDecision(record);
    const plan = this.buildPlanFromRecord(record);

    return { record, plan };
  }

  /**
   * Construye un plan estructurado a partir de un registro de decisión.
   */
  buildPlanFromRecord(record: RetrievalDecisionRecord): RetrievalPlan {
    switch (record.decision) {
      case RetrievalDecision.NO_RETRIEVAL:
        return {
          decision: record.decision,
          allowedTools: [],
          maxTokensBudget: 0,
          shouldExecuteMemoryQuery: false,
          instructions:
            'SUFICIENCIA OPERATIVA: Razona directamente usando tu conocimiento base y el contexto inmediato. No consultes memoria externa para evitar interferencia.',
        };

      case RetrievalDecision.DEFERRED_RETRIEVAL:
        return {
          decision: record.decision,
          allowedTools: ['bounded_context_search'],
          maxTokensBudget: record.dimensions.estimatedTokenCost || 250,
          shouldExecuteMemoryQuery: true,
          instructions:
            'AMBIGÜEDAD DETECTADA: Realiza una búsqueda contextual acotada o solicita aclaración si faltan detalles críticos antes de asumir hechos del proyecto.',
        };

      case RetrievalDecision.SELECTIVE_RAG:
        return {
          decision: record.decision,
          allowedTools: ['query_rag_passages'],
          maxTokensBudget: record.dimensions.estimatedTokenCost || 600,
          shouldExecuteMemoryQuery: true,
          instructions:
            'RECUPERACIÓN FACTUAL SELECTIVA: Consulta pasajes documentales específicos del proyecto JarBees y ancla tu respuesta estrictamente en la evidencia recuperada.',
        };

      case RetrievalDecision.SELECTIVE_GRAPH:
        return {
          decision: record.decision,
          allowedTools: ['query_knowledge_graph'],
          maxTokensBudget: record.dimensions.estimatedTokenCost || 450,
          shouldExecuteMemoryQuery: true,
          instructions:
            'RELACIONES Y LINAJE BAJO DEMANDA: Invoca query_knowledge_graph únicamente para resolver contratos ontológicos y dependencias causales.',
        };

      case RetrievalDecision.SELECTIVE_SNAPSHOT:
        return {
          decision: record.decision,
          allowedTools: ['fetch_topic_snapshot'],
          maxTokensBudget: record.dimensions.estimatedTokenCost || 350,
          shouldExecuteMemoryQuery: true,
          instructions:
            'EVOLUCIÓN HISTÓRICA: Recupera snapshots temporales para contextualizar cómo cambiaron las hipótesis o consensos del proyecto en el tiempo.',
        };

      case RetrievalDecision.DIALECTIC_AUDIT:
        return {
          decision: record.decision,
          allowedTools: [
            'audit_dialectic_conflict',
            'query_knowledge_graph',
            'fetch_topic_snapshot',
          ],
          maxTokensBudget: record.dimensions.estimatedTokenCost || 800,
          shouldExecuteMemoryQuery: true,
          instructions:
            'DESAFÍO EPISTÉMICO DETECTADO: Audita el conflicto contrastando la procedencia, vigencia y nueva evidencia aportada por el usuario.',
        };
    }
  }
}

