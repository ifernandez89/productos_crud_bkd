import { Injectable, Logger } from '@nestjs/common';
import { DateMathTool } from '../date-math/date-math.tool';
import { PowerBalanceTool } from '../energy/power-balance.tool';

export interface ToolValidationResult {
  valid: boolean;
  effectiveAnswer?: string;
  reason?: string;
  fallbackToLLM: boolean;
}

@Injectable()
export class ToolResultValidatorService {
  private readonly logger = new Logger(ToolResultValidatorService.name);
  private readonly dateMathTool = new DateMathTool();
  private readonly powerBalanceTool = new PowerBalanceTool();

  /**
   * Valida si el resultado de una herramienta realmente respondió a la incógnita del usuario.
   * Si detecta una respuesta insuficiente, desvío o falso positivo, ejecuta recuperación.
   */
  validateToolResult(
    userMessage: string,
    toolName: string,
    rawResult: string | null | undefined,
  ): ToolValidationResult {
    if (!rawResult || rawResult.trim() === '') {
      return {
        valid: false,
        reason: 'Herramienta devolvió resultado vacío',
        fallbackToLLM: true,
      };
    }

    const n = userMessage
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    const cleanResult = rawResult.trim();

    // ── 1. Validación de Hora/Fecha actual vs Cálculos y Proyecciones Temporales ──
    // Ejemplo: si el usuario pregunta "Si un evento comienza a las 23:30 y dura 150 min, ¿a qué hora termina?",
    // una herramienta que devuelva "Hora actual: 18:16" no respondió la pregunta.
    const isDurationOrProjectionQuery =
      /(?:dura|duracion|a que hora termina|dentro de \d+|en \d+ dias|que fecha sera|cada \d+ dias|se repite)/i.test(
        n,
      );
    const isStaticCurrentTimeResult =
      /^Hora actual:\s*\d{1,2}:\d{2}/i.test(cleanResult) ||
      /^Hoy es (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/i.test(cleanResult);

    if (isDurationOrProjectionQuery && isStaticCurrentTimeResult) {
      this.logger.warn(
        `[validator:invalid] Tool devolvió hora fija actual pero la consulta requiere cálculo temporal: "${userMessage}"`,
      );
      // Intento de recuperación determinista con DateMathTool
      const dateMathRes = this.dateMathTool.resolve(userMessage);
      if (dateMathRes.handled && dateMathRes.result) {
        this.logger.log(`[validator:recovery → date-math] Cálculo resuelto exitosamente.`);
        return {
          valid: true,
          effectiveAnswer: dateMathRes.result,
          reason: 'Recuperado con DateMathTool determinista',
          fallbackToLLM: false,
        };
      }

      return {
        valid: false,
        reason: 'Hora actual fija no responde consulta de duración temporal',
        fallbackToLLM: true,
      };
    }

    // ── 2. Validación de Búsqueda Web Fallida vs Pregunta Conceptual/Teórica ──
    // Ejemplo: si el usuario pregunta "¿Cómo investigarías experimentalmente si un material conduce mejor el calor?",
    // un mensaje "No encontré resultados en internet para: ..." no es una respuesta aceptable si el LLM
    // posee el conocimiento conceptual para responder con rigor.
    const isSearchFailureMessage =
      cleanResult.includes('No encontré resultados en internet para:') ||
      cleanResult.includes('⚠️ No tengo datos verificados para responder esto') ||
      cleanResult.includes('Intenté buscar en') && cleanResult.includes('pero no pude obtener contenido');

    const isExplanatoryQuery =
      /(?:como se forma|por que se produce|por que ocurre|que es (?:un |una |el |la |los |las )?|en que consiste|como funciona|que produce|que causa|explicame|explica |defini |definir |que diferencias? (?:existe|existen) entre|cual(?:es)? (?:es|son) la(?:s)? diferencias? entre|por que (?:un |una |el |la |los |las |dos |algunos? |suele |se |puede |no )|por que vemos|como puede la energia|como se puede demostrar|como investigarias)/i.test(
        n,
      );

    if (isSearchFailureMessage && isExplanatoryQuery) {
      this.logger.warn(
        `[validator:invalid] Búsqueda web fallida en pregunta conceptual/explicativa. Redirigiendo a LLM: "${userMessage}"`,
      );
      return {
        valid: false,
        reason: 'Búsqueda web sin resultados en consulta conceptual; requiere LLM',
        fallbackToLLM: true,
      };
    }

    // ── 3. Validación de Autonomía de Batería y Energía ──
    // Si la consulta es de autonomía o balance de potencia, comprobar si PowerBalanceTool puede resolverla
    const isPowerQuery =
      /(?:autonomia|bateria|baterias|inversor|tamano aproximado de una instalacion solar)/i.test(n) &&
      /(?:wh|w|kwh|kw|ah|eficiencia|horas)/i.test(n);
    if (isPowerQuery) {
      const powerRes = this.powerBalanceTool.resolve(userMessage);
      if (powerRes.handled && powerRes.result) {
        return {
          valid: true,
          effectiveAnswer: powerRes.result,
          reason: 'Resuelto con PowerBalanceTool determinista',
          fallbackToLLM: false,
        };
      }
    }

    // ── 4. Validación de Clima Astrológico vs Mecánica Celeste / Física ──
    // Si el resultado es una carta astrológica ("Clima Astrológico...") pero la consulta era sobre
    // mecánica celeste (e.g. "¿Por qué vemos siempre la misma cara de la Luna?"), invalidar y derivar a LLM.
    const isAstrologyResult = cleanResult.includes('Clima Astrológico') || cleanResult.includes('Energías del día:');
    const isPhysicalQuery = /(misma cara|acoplamiento|marea|rotacion|traslacion|orbita|gravedad|conservacion de la energia)/i.test(n);

    if (isAstrologyResult && isPhysicalQuery) {
      this.logger.warn(
        `[validator:invalid] Se devolvió carta astrológica en pregunta de física/mecánica celeste. Redirigiendo a LLM.`,
      );
      return {
        valid: false,
        reason: 'Carta astrológica inadecuada para fenómeno de física/mecánica celeste',
        fallbackToLLM: true,
      };
    }

    return {
      valid: true,
      effectiveAnswer: rawResult,
      fallbackToLLM: false,
    };
  }
}

