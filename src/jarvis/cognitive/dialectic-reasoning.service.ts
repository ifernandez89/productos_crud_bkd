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

    const auditPrompt = `Sos el Auditor de Evidencia y Control Epistemológico de JarBees.
Tu única tarea es auditar las afirmaciones y presupuestos de la consulta frente a los fragmentos documentales disponibles.

PROTOCOLO DE AUDITORÍA:
1. Extraé cada premisa implícita o explícita de la consulta.
2. ¿Aparece textualmente respaldada en los fragmentos? (RESPALDO DOCUMENTAL: SÍ o NO).
3. ¿Está validada por la ciencia o la experimentación independiente? (RESPALDO EMPÍRICO: DEMOSTRADO / HIPÓTESIS / ESPECULACIÓN / PSEUDOCIENCIA).
4. ¿El autor citado sostiene realmente esa afirmación? Si la consulta le atribuye conceptos no presentes en los textos, denuncialo como ATRIBUCIÓN FALSA O APÓCRIFA.
5. Sé directo, forense y no intentes responder la pregunta aún, solo emití la Ficha de Auditoría.`;

    const systemPrompt = `Sos el Motor de Razonamiento Crítico y Análisis Dialéctico de JarBees.
Tu especialidad es la contrastación epistémica rigurosa, la evaluación de hipótesis y la detección de contradicciones lógicas entre múltiples textos, ciencias y filosofías.

PROTOCOLO PERMANENTE: AUDITORÍA DE PREMISAS Y ATRIBUCIONES (7 PASOS):
1. IDENTIFICAR LAS PREMISAS: Descomponer la pregunta en afirmaciones verificables, hipótesis e interpretaciones (incluso ante formulaciones sutiles como "explicá el mecanismo...", "¿por qué sabemos que...?" o "relacioná este descubrimiento...").
2. VERIFICAR LA ATRIBUCIÓN: Comprobar si el autor citado sostiene realmente la afirmación atribuida. PROHIBIDO atribuir a un autor lo que este nunca escribió o demostró.
3. ALCANCE DE LA EVIDENCIA (DOCUMENTAL vs. EMPÍRICA): No confundir que una afirmación aparezca en una fuente con que haya sido demostrada científicamente. La evidencia documental determina qué afirma una fuente; la calidad metodológica y la evidencia independiente determinan cuánto respaldo merece esa afirmación.
4. DETECTAR PREMISAS NO RESPALDADAS O FALSAS: Si los fragmentos recuperados no confirman una premisa o si esta contradice el consenso científico, decláralo explícitamente y corregí la premisa antes de responder.
5. EXAMINAR CONTRADICCIONES: Si la biblioteca contiene evidencia contradictoria, identificar las posiciones y explicar sus diferencias sin forzar una armonización artificial.
6. RESPUESTA CONDICIONAL: Si una hipótesis no está establecida, analizar qué se seguiría de ella en modo condicional sin presentarla como un hecho.
7. NO FABRICAR TRAZABILIDAD (ANTI-SYCOPHANCY): Nunca atribuir a un documento una afirmación que solo aparece en la pregunta, en el conocimiento paramétrico o en una inferencia propia.

ESTRUCTURA DE RESPUESTA:
• 1. Auditoría de Premisas y Fuentes
• 2. Tesis y Enfoque de cada autor / disciplina
• 3. Puntos de Convergencia o Analogías Válidas
• 4. Tensiones Irreconciliables y Límites Metodológicos
• 5. Conclusión y Síntesis Crítica Proporcional
${customDirectives ? `\nDIRECTIVAS ADICIONALES:\n${customDirectives}` : ''}`;

    try {
      let auditSummary = '';
      if (chunks.length > 0) {
        try {
          const auditRes = await this.ollamaProvider.generate({
            model,
            messages: [
              { role: 'system', content: auditPrompt },
              {
                role: 'user',
                content: `CONSULTA: "${userQuery}"\n\nFRAGMENTOS DOCUMENTALES:\n${formattedEvidence}\n\nEmití la Ficha de Auditoría de Evidencia:`,
              },
            ],
            temperature: 0.2,
            maxTokens: 1000,
          });
          auditSummary = auditRes.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        } catch (auditErr: any) {
          this.logger.warn(`[DialecticReasoning] Auditoría previa omitida por error: ${auditErr.message}`);
        }
      }

      const userPrompt = `CONSULTA A ANALIZAR:
"${userQuery}"

${auditSummary ? `FICHA PREVIA DE AUDITORÍA DE EVIDENCIA:\n${auditSummary}\n\n` : ''}EVIDENCIA DOCUMENTAL DISPONIBLE (RAG):
${formattedEvidence}

Por favor, realizá la contrastación dialéctica profunda aplicando el protocolo de rigor epistémico.`;

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
