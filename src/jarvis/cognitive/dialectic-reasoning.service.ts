import { Injectable, Logger } from '@nestjs/common';
import { OllamaProvider } from '../llm/ollama.provider';
import { resolveReasoningModel } from '../../shared/ollama-config';

export interface DialecticChunkInput {
  id?: number;
  content: string;
  metadata?: any;
  documentTitle?: string;
  author?: string;
}

export interface DialecticAuditTrail {
  modelUsed: string;
  latencyMs: number;
  rawThinkLength: number;
  deductionSteps: string[];
}

export interface DialecticAnalysisResponse {
  cleanMarkdownAnswer: string;
  auditTrail: DialecticAuditTrail;
  hasTensionsDetected: boolean;
  success: boolean;
}

@Injectable()
export class DialecticReasoningService {
  private readonly logger = new Logger(DialecticReasoningService.name);

  constructor(private readonly ollamaProvider: OllamaProvider) {}

  /**
   * Ejecuta el análisis dialéctico y contrastación epistémica profunda utilizando DeepSeek-R1.
   *
   * @param userQuery Pregunta o problema dialéctico planteado por el usuario.
   * @param chunks Fragmentos recuperados por RAG (pgvector / bge-m3).
   * @param customDirectives Instrucciones adicionales opcionales.
   */
  async analyzeDialecticContrasts(
    userQuery: string,
    chunks: DialecticChunkInput[],
    customDirectives?: string,
  ): Promise<DialecticAnalysisResponse> {
    const startTime = Date.now();
    const model = resolveReasoningModel();

    this.logger.log(
      `[DialecticReasoning] Iniciando contrastación con ${model} sobre ${chunks.length} fragmentos...`,
    );

    // Formatear los fragmentos con clara atribución de autor y fuente
    const formattedEvidence = chunks
      .map((c, idx) => {
        const title = c.documentTitle || c.metadata?.sourceFile || `Documento #${c.id || idx + 1}`;
        const author = c.author || c.metadata?.author || 'Autor / Fuente';
        return `[FRAGMENTO ${idx + 1}]
FUENTE: "${title}"
AUTOR ATRIBUIDO: ${author}
TEXTO:
${c.content}
--------------------------------------------------`;
      })
      .join('\n\n');

    const systemPrompt = `Sos el Motor de Razonamiento Crítico y Análisis Dialéctico de JarBees.
Tu especialidad es la contrastación epistémica rigurosa, la evaluación de hipótesis y la detección de contradicciones lógicas entre múltiples textos, ciencias y filosofías.

REGLAS DE RAZONAMIENTO ESTRICTAS (AUDITORÍA DE PREMISAS):
1. ATRIBUCIÓN EXACTA: Identificá y aislá qué afirma cada autor o texto por separado. PROHIBIDO atribuir a un autor lo que dijo otro.
2. DISTINCIÓN EPISTÉMICA OBLIGATORIA: En tu respuesta, separá claramente:
   - [EVIDENCIA DOCUMENTAL]: Citas o afirmaciones exactas presentes en los fragmentos.
   - [INTERPRETACIÓN DEL AUTOR]: La tesis o perspectiva particular de esa fuente.
   - [CONTRASTACIÓN / TENSIÓN]: Puntos donde las premisas chocan, difieren en método o son incompatibles.
   - [SÍNTESIS / HIPÓTESIS]: Analogías sugerentes o puentes conceptuales (aclarando siempre que son hipótesis, no demostraciones empíricas).
3. CONTROL DE ALUCINACIONES: Si un fragmento no respalda una afirmación, NO la inventes ni asumas que "seguramente pensaban igual".
4. ESTRUCTURA DE RESPUESTA:
   • 1. Tesis y Premisas de cada autor
   • 2. Puntos de Convergencia (si existen)
   • 3. Tensiones y Diferencias Irreconciliables
   • 4. Conclusión / Síntesis Crítica
${customDirectives ? `\nDIRECTIVAS ADICIONALES:\n${customDirectives}` : ''}`;

    const userPrompt = `CONSULTA A ANALIZAR:
"${userQuery}"

EVIDENCIA DOCUMENTAL DISPONIBLE (RAG):
${formattedEvidence}

Por favor, realizá la contrastación dialéctica profunda aplicando el protocolo de rigor epistémico.`;

    try {
      const response = await this.ollamaProvider.generate({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 2500,
      });

      const latencyMs = Date.now() - startTime;
      const rawContent = response.content;

      // ── Procesar y aislar el bloque <think> ──
      const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/i);
      const rawThink = thinkMatch ? thinkMatch[1].trim() : '';

      // Limpiar el contenido final para el usuario
      const cleanMarkdownAnswer = rawContent
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();

      // Extraer pasos de deducción estructurados sin volcar el monólogo crudo
      const deductionSteps = this.extractDeductionSteps(rawThink);

      const hasTensionsDetected = /tensi[oó]n|contradicci[oó]n|divergencia|incompatib|difieren/i.test(
        cleanMarkdownAnswer,
      );

      this.logger.log(
        `[DialecticReasoning] Análisis completado en ${latencyMs}ms (${deductionSteps.length} pasos de deducción).`,
      );

      return {
        cleanMarkdownAnswer,
        auditTrail: {
          modelUsed: model,
          latencyMs,
          rawThinkLength: rawThink.length,
          deductionSteps,
        },
        hasTensionsDetected,
        success: true,
      };
    } catch (err: any) {
      this.logger.error(
        `[DialecticReasoning] Error durante la inferencia con ${model}: ${err.message}`,
      );

      return {
        cleanMarkdownAnswer: `⚠️ No se pudo completar el análisis dialéctico profundo: ${err.message}`,
        auditTrail: {
          modelUsed: model,
          latencyMs: Date.now() - startTime,
          rawThinkLength: 0,
          deductionSteps: [],
        },
        hasTensionsDetected: false,
        success: false,
      };
    }
  }

  /**
   * Sintetiza el monólogo interno de <think> en pasos verificables y legibles,
   * descartando el parloteo reflexivo y preservando las decisiones clave de inferencia.
   */
  private extractDeductionSteps(rawThink: string): string[] {
    if (!rawThink) return [];

    // Dividir por saltos de línea y buscar frases deductivas clave
    const lines = rawThink
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 25);

    const steps: string[] = [];
    const stepRegex = /^(primero|luego|en cuanto a|respecto a|el autor|la contradicción|la premisa|notar que|sin embargo|concluyo|el fragmento|revisando|comparando)/i;

    for (const line of lines) {
      if (stepRegex.test(line) || line.startsWith('-') || line.startsWith('*')) {
        const cleaned = line.replace(/^[-*•\d.)\s]+/, '').trim();
        if (cleaned.length > 20 && !steps.includes(cleaned)) {
          steps.push(cleaned);
        }
      }
    }

    // Si no encontró patrones con viñetas, tomar 3 o 4 hitos secuenciales del texto
    if (steps.length === 0 && lines.length > 0) {
      const stepCount = Math.min(4, lines.length);
      const stride = Math.floor(lines.length / stepCount);
      for (let i = 0; i < stepCount; i++) {
        steps.push(lines[i * stride]);
      }
    }

    return steps.slice(0, 6);
  }
}
