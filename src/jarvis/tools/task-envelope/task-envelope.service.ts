import { Injectable, Logger } from '@nestjs/common';
import {
  TaskEnvelope,
  TaskIntent,
  ExecutionMode,
  OutputContract,
} from './task-envelope.types';
import { DialogueEvaluation } from '../../dialogue/dialogue.types';

/**
 * TaskEnvelopeService — Gestor de Contratos y Aislamiento de Herramientas (JCA Fase 2)
 *
 * Implementa las 5 Reglas Estructurales de Aislamiento de JCA:
 * 1. Separación Estricta de Canales (RAG jamás reescribe intenciones).
 * 2. Permisos Mínimos por Tarea (SYSTEM_ADMIN bloquea resúmenes bibliográficos).
 * 3. Contextos Estancos (Scopes delimitados).
 * 4. Salidas Estructuradas con Evidencia.
 * 5. Composición Centralizada.
 */
@Injectable()
export class TaskEnvelopeService {
  private readonly logger = new Logger(TaskEnvelopeService.name);

  createEnvelope(
    conversationId: string,
    rawIntent: string,
    dialogueEval?: DialogueEvaluation,
  ): TaskEnvelope {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Regla 1 & 2: Si es directiva operativa o SYSTEM_ADMIN, confinar herramientas
    if (
      dialogueEval?.isOperational ||
      rawIntent === 'SYSTEM_ADMIN' ||
      rawIntent === 'OPERATIONAL_DIRECTIVE'
    ) {
      return {
        conversationId,
        taskId,
        intent: 'SYSTEM_ADMIN',
        mode: 'MISSION',
        allowedTools: ['system', 'logger', 'evidence', 'verification'],
        contextScope: ['system_state', 'operational_directives'],
        outputContract: 'TEXT_EVIDENCE',
        requiresApproval: false,
      };
    }

    // Si es diálogo reflexivo o conversacional puro, denegar herramientas invasivas
    if (
      dialogueEval?.turnState === 'REFLECTIVE_CHAT' ||
      rawIntent === 'CONVERSATION' ||
      rawIntent === 'LOCAL'
    ) {
      return {
        conversationId,
        taskId,
        intent: 'CONVERSATION',
        mode: 'DIALOGUE',
        allowedTools: [],
        contextScope: ['working_memory', 'dialogue_history'],
        outputContract: 'TEXT_EVIDENCE',
        requiresApproval: false,
      };
    }

    if (rawIntent === 'RESEARCH' || rawIntent === 'RAG') {
      return {
        conversationId,
        taskId,
        intent: 'RESEARCH',
        mode: 'DIALOGUE',
        allowedTools: ['rag', 'corpus_selector', 'web_search'],
        contextScope: ['documents', 'web_results'],
        outputContract: 'TEXT_EVIDENCE',
        requiresApproval: false,
      };
    }

    if (rawIntent === 'CODE_EXECUTION' || rawIntent === 'CODING') {
      return {
        conversationId,
        taskId,
        intent: 'CODE_EXECUTION',
        mode: 'MISSION',
        allowedTools: ['coding', 'test_runner', 'git'],
        contextScope: ['codebase', 'tests'],
        outputContract: 'DIFF_PATCH',
        requiresApproval: true,
      };
    }

    // Explicación / Conocimiento general
    return {
      conversationId,
      taskId,
      intent: 'EXPLANATION',
      mode: 'DIALOGUE',
      allowedTools: ['rag', 'web_search'],
      contextScope: ['general_knowledge', 'working_memory'],
      outputContract: 'TEXT_EVIDENCE',
      requiresApproval: false,
    };
  }

  isToolAllowed(envelope: TaskEnvelope, toolName: string): boolean {
    const normalized = toolName.toLowerCase().trim();
    const allowed = envelope.allowedTools.map((t) => t.toLowerCase());
    return allowed.includes(normalized);
  }

  isScopeAllowed(envelope: TaskEnvelope, scopeName: string): boolean {
    const normalized = scopeName.toLowerCase().trim();
    const allowed = envelope.contextScope.map((s) => s.toLowerCase());
    return allowed.includes(normalized);
  }
}
