import { Injectable, Logger } from '@nestjs/common';
import {
  ConversationTaskState,
  TaskType,
  ChatMessageLike,
} from './dialogue.types';
import { ResponseNoveltyGuardService } from './response-novelty-guard.service';

@Injectable()
export class ConversationalContinuityService {
  private readonly logger = new Logger(ConversationalContinuityService.name);

  // Almacén en memoria de estados de tarea por sessionId con TTL de 2 horas
  private readonly sessionStates = new Map<string, ConversationTaskState>();
  private readonly SESSION_TTL_MS = 2 * 60 * 60 * 1000;

  constructor(
    private readonly noveltyGuard: ResponseNoveltyGuardService,
  ) {}

  /**
   * Obtiene o inicializa el estado de continuidad de una sesión
   */
  getState(sessionId: string): ConversationTaskState {
    const existing = this.sessionStates.get(sessionId);
    if (existing && Date.now() - existing.updatedAt < this.SESSION_TTL_MS) {
      return existing;
    }

    const initial: ConversationTaskState = {
      sessionId,
      activeTask: 'GENERAL_CHAT',
      previousOutputs: [],
      language: 'es',
      constraints: [],
      noveltyRequired: false,
      deliberationRequired: false,
      updatedAt: Date.now(),
    };
    this.sessionStates.set(sessionId, initial);
    return initial;
  }

  /**
   * Resuelve y actualiza la intención contextual del turno actual,
   * considerando el historial y las anáforas de modificación.
   */
  resolveTurn(
    sessionId: string,
    userMessage: string,
    history: readonly ChatMessageLike[] = [],
  ): {
    currentState: ConversationTaskState;
    injectedPromptConstraints: string[];
    isContinuation: boolean;
    detectedChange?: string;
  } {
    const prevState = this.getState(sessionId);
    const trimmed = userMessage.trim();
    const normalized = this.noveltyGuard.normalize(trimmed);

    // 1. Identificar si el turno es una continuación o modificación del estado previo
    const continuationAnalysis = this.analyzeContinuation(normalized, prevState);

    // 2. Determinar la tarea activa (nueva o heredada/modificada)
    let activeTask: TaskType = prevState.activeTask;
    let targetLanguage = prevState.targetLanguage;
    let noveltyRequired = false;
    let deliberationRequired = false;
    const constraints: string[] = [];

    if (continuationAnalysis.isContinuation) {
      activeTask = continuationAnalysis.newTask || prevState.activeTask;
      noveltyRequired = continuationAnalysis.noveltyRequired;
      deliberationRequired = continuationAnalysis.deliberationRequired;
      if (continuationAnalysis.targetLanguage) {
        targetLanguage = continuationAnalysis.targetLanguage;
      }
    } else {
      // Es una nueva tarea o consulta autónoma
      const detected = this.detectTaskType(normalized, trimmed);
      activeTask = detected.taskType;
      targetLanguage = detected.targetLanguage;
      deliberationRequired = detected.deliberationRequired;
      noveltyRequired = false;
    }

    // 3. Preparar restricciones para inyección en el prompt
    const promptConstraints: string[] = [];

    if (noveltyRequired && prevState.previousOutputs.length > 0) {
      const taskLabel =
        activeTask === 'TELL_JOKE'
          ? 'chiste'
          : activeTask === 'EXPLAIN'
            ? 'explicación'
            : 'respuesta';

      const negativeConstraint = this.noveltyGuard.generateNegativeConstraintPrompt(
        prevState.previousOutputs,
        taskLabel,
      );
      if (negativeConstraint) {
        promptConstraints.push(negativeConstraint);
        constraints.push(`novelty_required:${taskLabel}`);
      }
    }

    if (activeTask === 'TRANSLATE') {
      const targetLangName =
        targetLanguage === 'en'
          ? 'Inglés'
          : targetLanguage === 'es'
            ? 'Español'
            : targetLanguage || 'el idioma solicitado';

      promptConstraints.push(
        `[INSTRUCCIÓN ESTRICTA DE TRADUCCIÓN]`,
        `Operación obligatoria: Traduce el texto al ${targetLangName}.`,
        `Queda PROHIBIDO devolver el texto en su idioma original sin traducir y PROHIBIDO añadir explicaciones o preámbulos.`,
        `Devuelve exclusivamente el texto traducido al ${targetLangName}.`,
      );
      constraints.push(`translate_to:${targetLanguage || 'en'}`);
    }

    if (activeTask === 'SOLVE_RIDDLE' || deliberationRequired) {
      promptConstraints.push(
        `[INSTRUCCIÓN DE DELIBERACIÓN Y RAZONAMIENTO PASO A PASO]`,
        `Este problema contiene una trampa lógica o de lenguaje.`,
        `Antes de responder, reflexiona paso a paso:`,
        `1. ¿Cuál es el estado inicial de cada elemento o posición?`,
        `2. Si adelantas a alguien en el puesto N, ¿ocupas el puesto N o el puesto N-1? (Ejemplo: adelantar al 2.° te sitúa en el 2.°, NO en el 1.°).`,
        `3. Emite tu conclusión formal basada estrictamente en la deducción lógica.`,
      );
      constraints.push('deliberation_required');
    }

    // 4. Actualizar estado en memoria
    const updatedState: ConversationTaskState = {
      sessionId,
      activeTask,
      lastOutput: prevState.lastOutput,
      previousOutputs: prevState.previousOutputs,
      language: prevState.language,
      targetLanguage,
      constraints,
      requestedChange: continuationAnalysis.detectedChange,
      noveltyRequired,
      deliberationRequired,
      updatedAt: Date.now(),
    };

    this.sessionStates.set(sessionId, updatedState);

    return {
      currentState: updatedState,
      injectedPromptConstraints: promptConstraints,
      isContinuation: continuationAnalysis.isContinuation,
      detectedChange: continuationAnalysis.detectedChange,
    };
  }

  /**
   * Registra una salida emitida por el asistente para control de novedad futuro
   */
  recordAssistantOutput(
    sessionId: string,
    output: string,
    taskType?: TaskType,
  ): void {
    const trimmed = output.trim();
    if (!trimmed) return;

    const state = this.getState(sessionId);
    const updatedOutputs = [...state.previousOutputs, trimmed].slice(-5); // Mantener últimas 5

    const updatedState: ConversationTaskState = {
      ...state,
      activeTask: taskType || state.activeTask,
      lastOutput: trimmed,
      previousOutputs: updatedOutputs,
      updatedAt: Date.now(),
    };

    this.sessionStates.set(sessionId, updatedState);
  }

  /**
   * Limpia o reinicia el estado de una sesión
   */
  clearState(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }

  // ── Métodos privados de detección léxica y deíctica ─────────────────────────

  private analyzeContinuation(
    normalized: string,
    prevState: ConversationTaskState,
  ): {
    isContinuation: boolean;
    noveltyRequired: boolean;
    deliberationRequired: boolean;
    newTask?: TaskType;
    targetLanguage?: string;
    detectedChange?: string;
  } {
    // Si no había tarea previa relevante, no puede ser continuación directa de tarea
    const hasPreviousTask =
      prevState.activeTask !== 'GENERAL_CHAT' ||
      prevState.previousOutputs.length > 0;

    // Patrón 1: Petición explícita de novedad ("otro", "uno más", "más gracioso", "diferente")
    const isJokeContinuation =
      prevState.activeTask === 'TELL_JOKE' &&
      /(otro|otra|uno mas|otro mas|aun mas|todavia mas|mas gracioso|mas divertida|mas bueno|chiste nuevo|cambia de chiste|no me gusto)/i.test(
        normalized,
      );

    if (isJokeContinuation) {
      return {
        isContinuation: true,
        noveltyRequired: true,
        deliberationRequired: false,
        newTask: 'TELL_JOKE',
        detectedChange: 'make_it_funnier_and_novel',
      };
    }

    // Patrón 2: Modificador genérico de novedad ("otro", "dame otro", "uno nuevo")
    const isGenericNovelty =
      hasPreviousTask &&
      /^(?:dame |contame |decime )?(?:otro|otra|uno mas|otro mas|diferente|uno nuevo)\b/i.test(
        normalized,
      );

    if (isGenericNovelty) {
      return {
        isContinuation: true,
        noveltyRequired: true,
        deliberationRequired: false,
        newTask: prevState.activeTask,
        detectedChange: 'provide_alternative',
      };
    }

    // Patrón 3: Cambio de idioma relativo ("ahora en inglés", "pasalo a inglés", "traducilo")
    const isLanguageShift =
      hasPreviousTask &&
      /(ahora en ingles|pasalo a ingles|traducilo|traducelo|en ingles|now in english)/i.test(
        normalized,
      );

    if (isLanguageShift) {
      return {
        isContinuation: true,
        noveltyRequired: false,
        deliberationRequired: false,
        newTask: 'TRANSLATE',
        targetLanguage: 'en',
        detectedChange: 'translate_previous_to_english',
      };
    }

    // Patrón 4: Solicitud de revisión o corrección ("revisalo", "pensalo bien", "estás seguro?")
    const isReview =
      hasPreviousTask &&
      /(revisalo|pensalo bien|estas seguro|fijate bien|no es correcto|te equivocaste|seguro que es asi)/i.test(
        normalized,
      );

    if (isReview) {
      return {
        isContinuation: true,
        noveltyRequired: false,
        deliberationRequired: true,
        newTask: prevState.activeTask,
        detectedChange: 'deliberate_and_correct',
      };
    }

    // Si no encaja en modificadores de continuación, no es continuación forzada
    return {
      isContinuation: false,
      noveltyRequired: false,
      deliberationRequired: false,
    };
  }

  private detectTaskType(
    normalized: string,
    rawText: string,
  ): {
    taskType: TaskType;
    targetLanguage?: string;
    deliberationRequired: boolean;
  } {
    // 1. Chistes / Humor
    if (
      /(?:contame|decime|sabes)?\s*(?:un\s+)?(?:chiste|broma|chistecito)\b/i.test(
        normalized,
      )
    ) {
      return { taskType: 'TELL_JOKE', deliberationRequired: false };
    }

    // 2. Acertijos y trampas lógicas conocidas
    if (
      /(?:acertijo|adivinanza|problema de logica)\b/i.test(normalized) ||
      /(?:en una carrera|si adelantas|adelantas al|segundo puesto|segundo lugar|carrera.*adelantas)/i.test(
        normalized,
      )
    ) {
      return { taskType: 'SOLVE_RIDDLE', deliberationRequired: true };
    }

    // 3. Traducción explícita
    if (
      /(?:traduc(?:e|i|ir|ime)|translate)\b/i.test(normalized) ||
      /(?:al ingles|to english|en ingles)\b/i.test(normalized)
    ) {
      const isEnglish = /(?:al ingles|en ingles|to english)\b/i.test(normalized);
      return {
        taskType: 'TRANSLATE',
        targetLanguage: isEnglish ? 'en' : 'es',
        deliberationRequired: false,
      };
    }

    // 4. Herramientas explícitas (hora, clima, cálculo)
    if (
      /(?:que hora es|hora actual|que dia es|fecha de hoy|pronostico|clima en|cuanto es \d+)/i.test(
        normalized,
      )
    ) {
      return { taskType: 'EXECUTE_TOOL', deliberationRequired: false };
    }

    // 5. Búsqueda documental / RAG
    if (
      /(?:segun el libro|en el documento|que dice el pdf|busca en la biblioteca|biblioteca de documentos)/i.test(
        normalized,
      )
    ) {
      return { taskType: 'RAG_SEARCH', deliberationRequired: false };
    }

    // 6. Código y programación
    if (
      /(?:escribe una funcion|codigo|typescript|python|async await|refactoriza|componente react)/i.test(
        normalized,
      )
    ) {
      return { taskType: 'CODE', deliberationRequired: false };
    }

    return { taskType: 'GENERAL_CHAT', deliberationRequired: false };
  }
}

