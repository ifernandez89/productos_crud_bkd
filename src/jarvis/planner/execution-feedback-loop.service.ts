import { Injectable, Logger } from '@nestjs/common';
import { InferenceGatewayService } from '../llm/inference-gateway.service';

export type CodeLanguage = 'typescript' | 'javascript' | 'json' | 'sql';

export interface CodeValidationResult {
  valid: boolean;
  error?: string;
}

export interface ExecutionLoopOptions {
  language?: CodeLanguage;
  systemPrompt?: string;
  fastModel?: string;
  escalationModel?: string;
  maxAttempts?: number;
}

export interface ExecutionLoopResult {
  success: boolean;
  attempts: number;
  escalated: boolean;
  code: string;
  modelUsed: string;
  validationError?: string;
  diagnostics?: string[];
  latencyMs: number;
}

/**
 * ExecutionFeedbackLoopService (Fase 2 - RTX 5070 Specialist Swapping)
 *
 * Implementa la canalización directa de inferencia y escalamiento adaptativo:
 * - Intento 1: Qwen 3 4B genera la solución inicial a máxima velocidad (~120-140 t/s).
 * - Verificación: Validación determinista sintáctica (TypeScript, JSON, SQL, delimitadores).
 * - Intento 2: Si la verificación falla, transfiere el diagnóstico exacto de compilación
 *   al especialista superior (Qwen 3 8B o DeepSeek-R1 8B) para resolver la discrepancia.
 */
@Injectable()
export class ExecutionFeedbackLoopService {
  private readonly logger = new Logger(ExecutionFeedbackLoopService.name);

  constructor(private readonly inferenceGateway: InferenceGatewayService) {}

  /**
   * Extrae el bloque de código de una respuesta Markdown.
   */
  extractCode(text: string): string {
    const codeBlockMatch = text.match(/```(?:[a-zA-Z0-9_\-]+)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }
    return text.trim();
  }

  /**
   * Valida sintácticamente el código de manera determinista y aislada.
   */
  validateCode(code: string, language: CodeLanguage = 'typescript'): CodeValidationResult {
    const trimmed = code.trim();
    if (!trimmed) {
      return { valid: false, error: 'El código generado está vacío.' };
    }

    if (language === 'json') {
      try {
        JSON.parse(trimmed);
        return { valid: true };
      } catch (err: any) {
        return { valid: false, error: `JSON Parse Error: ${err.message}` };
      }
    }

    // Validación de balance de delimitadores: {}, (), []
    const delimiterError = this.checkBalancedDelimiters(trimmed);
    if (delimiterError) {
      return { valid: false, error: delimiterError };
    }

    // Validación de strings y templates sin cerrar
    const stringError = this.checkUnclosedLiterals(trimmed);
    if (stringError) {
      return { valid: false, error: stringError };
    }

    if (language === 'sql') {
      const upper = trimmed.toUpperCase();
      if (
        !upper.includes('SELECT') &&
        !upper.includes('INSERT') &&
        !upper.includes('UPDATE') &&
        !upper.includes('DELETE') &&
        !upper.includes('CREATE')
      ) {
        return { valid: false, error: 'SQL inválido: no contiene una sentencia DML/DDL reconocida.' };
      }
    }

    return { valid: true };
  }

  /**
   * Ejecuta el bucle de retroalimentación 4B ➔ Verificación ➔ 8B.
   */
  async executeTask(
    prompt: string,
    options: ExecutionLoopOptions = {},
  ): Promise<ExecutionLoopResult> {
    const startTime = Date.now();
    const language = options.language || 'typescript';
    const fastModel = options.fastModel || 'qwen3:4b';
    const escalationModel = options.escalationModel || 'qwen3:8b';
    const diagnostics: string[] = [];

    this.logger.log(
      `[ExecutionFeedbackLoop] Intento 1: Generando solución inicial con ${fastModel} (${language})...`,
    );

    // ── Intento 1: Fast Model (4B) ──────────────────────────────────────────
    const attempt1Response = await this.inferenceGateway.generate({
      model: fastModel,
      messages: [
        {
          role: 'system',
          content:
            options.systemPrompt ||
            `Eres un especialista en programación. Genera exclusivamente código ${language} válido, limpio y sin comentarios innecesarios dentro de bloques de código markdown.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
    });

    const code1 = this.extractCode(attempt1Response.content);
    const validation1 = this.validateCode(code1, language);

    if (validation1.valid) {
      const elapsed = Date.now() - startTime;
      this.logger.log(
        `✅ [ExecutionFeedbackLoop] Intento 1 validado exitosamente con ${fastModel} en ${elapsed}ms`,
      );
      return {
        success: true,
        attempts: 1,
        escalated: false,
        code: code1,
        modelUsed: fastModel,
        latencyMs: elapsed,
      };
    }

    // ── Intento 2: Escalamiento (8B) ─────────────────────────────────────────
    const diagnostic = validation1.error || 'Fallo de verificación sintáctica desconocido.';
    diagnostics.push(diagnostic);

    this.logger.warn(
      `⚠️ [ExecutionFeedbackLoop] Intento 1 falló verificación: ${diagnostic}. Escalando a ${escalationModel}...`,
    );

    const escalationPrompt = [
      `La solución previa para la siguiente solicitud falló la verificación determinista:`,
      `SOLICITUD: ${prompt}`,
      ``,
      `CÓDIGO CON ERROR:`,
      `\`\`\`${language}`,
      code1,
      `\`\`\``,
      ``,
      `DIAGNÓSTICO EXACTO DEL COMPILADOR/VALIDADOR:`,
      diagnostic,
      ``,
      `Corrige rigurosamente el error detectado y devuelve el código corregido dentro de un bloque markdown.`,
    ].join('\n');

    const attempt2Response = await this.inferenceGateway.generate({
      model: escalationModel,
      messages: [
        {
          role: 'system',
          content:
            options.systemPrompt ||
            `Eres un arquitecto senior de software. Corrige el código que falló la compilación asegurando sintaxis perfecta en ${language}.`,
        },
        { role: 'user', content: escalationPrompt },
      ],
      temperature: 0.1,
    });

    const code2 = this.extractCode(attempt2Response.content);
    const validation2 = this.validateCode(code2, language);
    const elapsed = Date.now() - startTime;

    if (validation2.valid) {
      this.logger.log(
        `✅ [ExecutionFeedbackLoop] Escalamiento a ${escalationModel} resolvió el error satisfactoriamente en ${elapsed}ms`,
      );
    } else {
      diagnostics.push(validation2.error || 'Fallo tras escalamiento.');
      this.logger.error(
        `❌ [ExecutionFeedbackLoop] Escalamiento no pudo resolver el error sintáctico: ${validation2.error}`,
      );
    }

    return {
      success: validation2.valid,
      attempts: 2,
      escalated: true,
      code: code2,
      modelUsed: escalationModel,
      validationError: validation2.error,
      diagnostics,
      latencyMs: elapsed,
    };
  }

  // ── Verificadores sintácticos deterministas ────────────────────────────────

  private checkBalancedDelimiters(code: string): string | null {
    const stack: { char: string; index: number }[] = [];
    const pairs: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
    let inString: string | null = null;
    let escape = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (inString) {
        if (char === inString) inString = null;
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = char;
        continue;
      }

      if (char === '{' || char === '(' || char === '[') {
        stack.push({ char, index: i });
      } else if (char === '}' || char === ')' || char === ']') {
        const expected = pairs[char];
        const last = stack.pop();
        if (!last || last.char !== expected) {
          return `Delimitador desbalanceado: '${char}' inesperado en posición ${i}`;
        }
      }
    }

    if (stack.length > 0) {
      const unclosed = stack[stack.length - 1];
      return `Delimitador sin cerrar: '${unclosed.char}' en posición ${unclosed.index}`;
    }

    return null;
  }

  private checkUnclosedLiterals(code: string): string | null {
    let inString: string | null = null;
    let escape = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (inString) {
        if (char === inString) {
          inString = null;
        }
      } else if (char === '"' || char === "'" || char === '`') {
        inString = char;
      }
    }

    if (inString) {
      return `String literal no cerrado (delimitador: ${inString})`;
    }

    return null;
  }
}
