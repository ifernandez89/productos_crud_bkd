import { Injectable, Logger } from '@nestjs/common';
import {
  TaskContractValidationResult,
  ConversationTaskState,
} from './dialogue.types';
import { ResponseNoveltyGuardService } from './response-novelty-guard.service';

@Injectable()
export class TaskContractValidatorService {
  private readonly logger = new Logger(TaskContractValidatorService.name);

  constructor(
    private readonly noveltyGuard: ResponseNoveltyGuardService,
  ) {}

  /**
   * Valida que la respuesta generada por el LLM cumpla con el contrato de la tarea
   */
  validate(
    candidateResponse: string,
    state: ConversationTaskState,
    userInput: string,
  ): TaskContractValidationResult {
    const trimmed = candidateResponse.trim();
    if (!trimmed) {
      return {
        isValid: false,
        taskType: state.activeTask,
        violationReason: 'La respuesta generada está vacía.',
        suggestedAction: 'REGENERATE_WITH_HIGH_TEMP',
      };
    }

    // 1. Contrato de Novedad (Chistes, alternativas)
    if (state.noveltyRequired && state.previousOutputs.length > 0) {
      const novelty = this.noveltyGuard.checkNovelty(
        trimmed,
        state.previousOutputs,
      );
      if (!novelty.isNovel) {
        this.logger.warn(
          `[TaskContractValidator] Violación de novedad en ${state.activeTask}: ${novelty.reason}`,
        );
        return {
          isValid: false,
          taskType: state.activeTask,
          violationReason: novelty.reason,
          suggestedAction: 'REGENERATE_WITH_HIGH_TEMP',
        };
      }
    }

    // 2. Contrato de Traducción
    if (state.activeTask === 'TRANSLATE') {
      const translationCheck = this.validateTranslation(
        trimmed,
        userInput,
        state.targetLanguage || 'en',
      );
      if (!translationCheck.isValid) {
        this.logger.warn(
          `[TaskContractValidator] Violación de traducción: ${translationCheck.violationReason}`,
        );
        return translationCheck;
      }
    }

    // 3. Contrato de Acertijos Semánticos (Ej. El acertijo del 2.º lugar)
    if (state.activeTask === 'SOLVE_RIDDLE') {
      const riddleCheck = this.validateRiddleReasoning(trimmed, userInput);
      if (!riddleCheck.isValid) {
        this.logger.warn(
          `[TaskContractValidator] Violación de razonamiento en acertijo: ${riddleCheck.violationReason}`,
        );
        return riddleCheck;
      }
    }

    // 4. Contrato de Herramientas (Evitar respuestas evasivas "si querés te digo la hora")
    if (state.activeTask === 'EXECUTE_TOOL') {
      const toolCheck = this.validateToolResponse(trimmed, userInput);
      if (!toolCheck.isValid) {
        this.logger.warn(
          `[TaskContractValidator] Violación de herramienta: ${toolCheck.violationReason}`,
        );
        return toolCheck;
      }
    }

    return {
      isValid: true,
      taskType: state.activeTask,
      suggestedAction: 'NONE',
    };
  }

  // ── Validadores específicos ──────────────────────────────────────────────────

  private validateTranslation(
    candidate: string,
    userInput: string,
    targetLanguage: string,
  ): TaskContractValidationResult {
    const normCandidate = this.noveltyGuard.normalize(candidate);
    const normInput = this.noveltyGuard.normalize(userInput);

    // Si la respuesta es idéntica al input o a la frase a traducir, no tradujo nada
    if (normCandidate === normInput) {
      return {
        isValid: false,
        taskType: 'TRANSLATE',
        violationReason: 'La respuesta es idéntica a la frase original sin traducir.',
        suggestedAction: 'REGENERATE_WITH_HIGH_TEMP',
      };
    }

    // Si el destino es inglés, verificar presencia de palabras inglesas o ausencia de texto 100% español idéntico
    if (targetLanguage === 'en') {
      const englishTokens = new Set([
        'the', 'is', 'are', 'was', 'were', 'session', 'operator',
        'expired', 'please', 'reconnect', 'log', 'in', 'and', 'to',
        'has', 'have', 'user', 'you', 'your', 'again',
      ]);

      const candidateWords = normCandidate.split(' ');
      const matchCount = candidateWords.filter((w) => englishTokens.has(w)).length;

      // Si la entrada pedía traducir la sesión expiró y devolvió español
      if (
        /sesion.*expir/i.test(normInput) &&
        /sesion.*expir/i.test(normCandidate) &&
        matchCount === 0
      ) {
        return {
          isValid: false,
          taskType: 'TRANSLATE',
          violationReason:
            'Se solicitó traducción al inglés pero la respuesta sigue en español.',
          suggestedAction: 'REGENERATE_WITH_HIGH_TEMP',
        };
      }
    }

    return { isValid: true, taskType: 'TRANSLATE', suggestedAction: 'NONE' };
  }

  private validateRiddleReasoning(
    candidate: string,
    userInput: string,
  ): TaskContractValidationResult {
    const normCandidate = this.noveltyGuard.normalize(candidate);
    const normInput = this.noveltyGuard.normalize(userInput);

    // Caso clásico: Carrera y segundo lugar
    if (
      /(?:adelantas|pasas|superas).*(?:segundo|2do|2°)/i.test(normInput)
    ) {
      // Si concluye erróneamente que quedas en primer lugar:
      const answersFirstPlace =
        /(?:en el|en|qued[aá]s en|pas[aá]s a|ocupas el)\s+(?:primer|primerisimo|1er|1\b|primero)\s+(?:lugar|puesto)/i.test(
          normCandidate,
        ) ||
        /\bquedas primero\b/i.test(normCandidate) ||
        /\bquedarias primero\b/i.test(normCandidate);

      const acknowledgesSecondPlace =
        /(?:segundo lugar|segundo puesto|en segundo|qued[aá]s segundo|2do|2°)/i.test(
          normCandidate,
        );

      if (answersFirstPlace && !acknowledgesSecondPlace) {
        return {
          isValid: false,
          taskType: 'SOLVE_RIDDLE',
          violationReason:
            'Respuesta errónea al acertijo: adelantar al segundo puesto te sitúa en el segundo puesto, no en el primero.',
          suggestedAction: 'REGENERATE_WITH_CHAIN_OF_THOUGHT',
        };
      }
    }

    return { isValid: true, taskType: 'SOLVE_RIDDLE', suggestedAction: 'NONE' };
  }

  private validateToolResponse(
    candidate: string,
    userInput: string,
  ): TaskContractValidationResult {
    const normCandidate = this.noveltyGuard.normalize(candidate);
    const normInput = this.noveltyGuard.normalize(userInput);

    // Pregunta por la hora
    if (/(?:que hora es|hora actual|la hora)/i.test(normInput)) {
      // Si la respuesta es puramente conversacional ("si queres te muestro la hora...", "te gustaría que te la muestre")
      const isEvasiveOffer =
        /(?:queres|deseas|gustaria|puedo decirte|puedo mostrarte|te digo).*hora/i.test(
          normCandidate,
        ) && !/\b\d{1,2}:\d{2}\b/.test(candidate);

      if (isEvasiveOffer) {
        return {
          isValid: false,
          taskType: 'EXECUTE_TOOL',
          violationReason:
            'La respuesta ofrece mostrar la hora en vez de ejecutar la consulta y mostrarla.',
          suggestedAction: 'FORCE_TOOL_EXECUTION',
        };
      }
    }

    return { isValid: true, taskType: 'EXECUTE_TOOL', suggestedAction: 'NONE' };
  }
}

