import { Injectable, Logger } from '@nestjs/common';
import {
  ConversationTurnState,
  AnaphoraResolution,
  DialogueEvaluation,
} from './dialogue.types';

export interface ChatMessageLike {
  role: string;
  content: string;
}

/**
 * DialogueEngineService — Motor de Inteligencia Conversacional (JCA Fase 1)
 *
 * Responsabilidades fundamentales:
 * 1. Seguimiento determinista del estado conversacional del hilo (Turn State).
 * 2. Resolución de deícticos y anáforas («eso», «la segunda opción», «lo anterior»).
 * 3. Aislamiento conversacional: evita activaciones espurias de herramientas bibliográficas
 *    en diálogos conceptuales o reflexivos (shouldBypassTools).
 */
@Injectable()
export class DialogueEngineService {
  private readonly logger = new Logger(DialogueEngineService.name);

  // Patrones operativos de alta prioridad
  private readonly OPERATIONAL_REGEX =
    /^(?:MISI[OÓ]N|REGISTRO|AUDITOR[IÍ]A|PREFLIGHT|IMPLEMENT[AÁ]|EJECUT[AÁ]|STANDBY|REFACTOR|BUGFIX|PROYECTO|CONFIGUR[AÁ]|DESPLEG[AÁ])\b/i;

  // Patrones de corrección de premisas
  private readonly CORRECTION_REGEX =
    /^(?:no,\s*me refer[ií]a|no,\s*quise decir|te equivocaste|est[aá]s equivocado|eso no es correcto|no es eso|corrijo|correcci[oó]n|en realidad no)\b/i;

  // Patrones de aclaración o profundización
  private readonly CLARIFICATION_REGEX =
    /^(?:a qu[eé] te refer[ií]s|ampli[aá]|explicame m[aá]s|por qu[eé]|desarroll[aá] eso|detall[aá] eso|qu[eé] significa eso|c[oó]mo ser[ií]a eso|dame m[aá]s detalles)\b/i;

  // Patrones de diálogo reflexivo / conceptual
  private readonly REFLECTIVE_REGEX =
    /^(?:qu[eé] opin[aá]s (?:de|sobre)|qu[eé] pens[aá]s (?:de|sobre)|reflexionemos|cu[aá]l es el sentido|te parece que|desde una perspectiva filos[oó]fica|hablemos de|qu[eé] sent[ií]s)\b/i;

  // Patrones deícticos (anáforas)
  private readonly DEICTIC_ORDINAL_REGEX =
    /\b(?:la|el)?\s*(primera|segunda|tercera|cuarta|quinta|[uú]ltima)\s+(opci[oó]n|alternativa|punto|propuesta|etapa|fase)\b/i;

  private readonly DEICTIC_PRONOUN_REGEX =
    /\b(?:sobre\s+eso|acerca\s+de\s+eso|con\s+eso|a\s+eso|de\s+eso|en\s+eso|eso\s+mismo|lo\s+anterior|lo\s+que\s+dijiste\s+reci[eé]n|lo\s+[uú]ltimo)\b/i;

  /**
   * Evalúa el turno actual considerando el mensaje del usuario y el historial reciente
   */
  evaluateTurn(
    userMessage: string,
    history: readonly ChatMessageLike[] = [],
  ): DialogueEvaluation {
    const trimmed = userMessage.trim();

    // 1. Clasificación del estado conversacional del turno
    const turnState = this.classifyTurnState(trimmed);

    // 2. Resolución de anáforas y antecedentes
    const anaphora = this.resolveAnaphora(trimmed, history);

    // 3. Determinación de bypass de herramientas
    const isOperational = turnState === 'OPERATIONAL_DIRECTIVE';
    const shouldBypassTools =
      turnState === 'REFLECTIVE_CHAT' ||
      (turnState === 'CLARIFICATION' && !isOperational);

    const resolvedMessage = anaphora.hasAnaphora
      ? anaphora.resolvedMessage
      : trimmed;

    const detectedTopics = this.extractFocalTopics(trimmed);

    return {
      turnState,
      originalMessage: trimmed,
      resolvedMessage,
      anaphora,
      isOperational,
      shouldBypassTools,
      confidenceScore: isOperational ? 0.99 : 0.90,
      detectedTopics,
    };
  }

  /**
   * Clasifica el estado conversacional
   */
  classifyTurnState(message: string): ConversationTurnState {
    const clean = message
      .replace(/^[¿?¡!"'\s]+/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (
      /^(?:mision|registro|auditoria|preflight|implementa|ejecuta|standby|refactor|bugfix|proyecto|configura|desplega)\b/.test(
        clean,
      )
    ) {
      return 'OPERATIONAL_DIRECTIVE';
    }
    if (
      /^(?:no,\s*me referia|no,\s*quise decir|te equivocaste|estas equivocado|eso no es correcto|no es eso|corrijo|correccion|en realidad no)\b/.test(
        clean,
      )
    ) {
      return 'CORRECTION';
    }
    if (
      /^(?:a que te referis|amplia|explicame mas|por que|desarrolla eso|detalla eso|que significa eso|como seria eso|dame mas detalles)\b/.test(
        clean,
      )
    ) {
      return 'CLARIFICATION';
    }
    if (
      /^(?:que opinas (?:de|sobre)|que pensas (?:de|sobre)|reflexionemos|cual es el sentido|te parece que|desde una perspectiva filosofica|hablemos de|que sentis)\b/.test(
        clean,
      )
    ) {
      return 'REFLECTIVE_CHAT';
    }
    return 'NEW_TOPIC';
  }

  /**
   * Resuelve deícticos referenciales utilizando el último turno del asistente
   */
  resolveAnaphora(
    message: string,
    history: readonly ChatMessageLike[],
  ): AnaphoraResolution {
    const lastAssistantMsg = this.findLastAssistantMessage(history);
    if (!lastAssistantMsg) {
      return {
        hasAnaphora: false,
        originalMessage: message,
        resolvedMessage: message,
        referencedAntecedent: null,
        confidence: 1.0,
      };
    }

    // Caso A: Deíctico ordinal («la segunda opción», «el primer punto»)
    const ordinalMatch = message.match(this.DEICTIC_ORDINAL_REGEX);
    if (ordinalMatch) {
      const ordinal = ordinalMatch[1].toLowerCase();
      const extractedOption = this.extractNumberedOption(
        lastAssistantMsg.content,
        ordinal,
      );

      if (extractedOption) {
        const enriched = `${message} [Referencia resuelta: "${extractedOption}"]`;
        return {
          hasAnaphora: true,
          originalMessage: message,
          resolvedMessage: enriched,
          referencedAntecedent: extractedOption,
          confidence: 0.95,
        };
      }
    }

    // Caso B: Deíctico pronominal («eso», «lo anterior», «lo que dijiste»)
    const pronounMatch = message.match(this.DEICTIC_PRONOUN_REGEX);
    if (pronounMatch) {
      const coreTheme = this.extractCoreThemeFromAssistantMessage(
        lastAssistantMsg.content,
      );
      if (coreTheme) {
        const enriched = `${message} [Referencia al tema anterior: "${coreTheme}"]`;
        return {
          hasAnaphora: true,
          originalMessage: message,
          resolvedMessage: enriched,
          referencedAntecedent: coreTheme,
          confidence: 0.88,
        };
      }
    }

    return {
      hasAnaphora: false,
      originalMessage: message,
      resolvedMessage: message,
      referencedAntecedent: null,
      confidence: 1.0,
    };
  }

  private findLastAssistantMessage(
    history: readonly ChatMessageLike[],
  ): ChatMessageLike | null {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant' && history[i].content) {
        return history[i];
      }
    }
    return null;
  }

  /**
   * Extrae la opción 1, 2, 3... de listas numeradas del mensaje del asistente
   */
  private extractNumberedOption(
    content: string,
    ordinal: string,
  ): string | null {
    const ordinalMap: Record<string, number> = {
      primera: 1,
      primer: 1,
      segunda: 2,
      segundo: 2,
      tercera: 3,
      tercer: 3,
      cuarta: 4,
      cuarto: 4,
      quinta: 5,
      quinto: 5,
      última: -1,
      ultima: -1,
    };

    const targetIndex = ordinalMap[ordinal];
    if (!targetIndex) return null;

    // Buscar patrones tipo: "1. Texto...", "1) Texto...", "- Opción 1: Texto..."
    const lines = content.split('\n');
    const numberedItems: string[] = [];

    for (const line of lines) {
      const match = line.match(
        /^(?:\s*[-*]?\s*)?(?:(\d+)[\.\)]|\*{0,2}(?:Opci[oó]n|Alternativa)\s+(\d+)\*{0,2}:?)\s*(.*)/i,
      );
      if (match) {
        const itemText = (match[3] || line).trim();
        if (itemText.length > 5) {
          numberedItems.push(itemText.replace(/^\*{1,2}|\*{1,2}$/g, ''));
        }
      }
    }

    if (numberedItems.length === 0) return null;

    if (targetIndex === -1) {
      return numberedItems[numberedItems.length - 1];
    }

    if (targetIndex <= numberedItems.length) {
      return numberedItems[targetIndex - 1];
    }

    return null;
  }

  /**
   * Extrae el tema central del último turno del asistente (primer párrafo o título)
   */
  private extractCoreThemeFromAssistantMessage(content: string): string | null {
    const clean = content.replace(/```[\s\S]*?```/g, '').trim();
    const lines = clean.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    const firstLine = lines[0].replace(/^[#*-\s]+/, '').trim();
    if (firstLine.length > 10 && firstLine.length < 120) {
      return firstLine;
    }
    return lines[0].substring(0, 80);
  }

  private extractFocalTopics(message: string): string[] {
    const topics: string[] = [];
    const matches = message.matchAll(/\b([A-ZÁÉÍÓÚ][a-zñáéíóú]{3,}(?:\s+[A-ZÁÉÍÓÚ][a-zñáéíóú]{3,})*)\b/g);
    for (const m of matches) {
      topics.push(m[1]);
    }
    return topics.slice(0, 5);
  }
}
