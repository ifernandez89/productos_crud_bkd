import { Injectable, Logger, Inject } from '@nestjs/common';
import { TaskRepository } from '../repositories/task.repository';
import { ILLMProvider } from '../llm/llm-provider.interface';
import { OllamaProvider } from '../llm/ollama.provider';
import { BrowserToolService } from '../tools/browser/browser-tool.service';
import { DocumentIngestService } from '../library/document-ingest.service';
import { MemoryRepository } from '../repositories/memory.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { EmbeddingsService } from '../library/embeddings.service';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type StepType =
  | 'search'       // búsqueda web via Playwright
  | 'scrape'       // scrapear URL específica
  | 'read_memory'  // consultar memorias relevantes
  | 'read_docs'    // consultar documentos RAG
  | 'summarize'    // resumir contenido acumulado
  | 'save'         // guardar resultado en Knowledge
  | 'deduplicate'  // eliminar duplicados
  | 'respond';     // generar respuesta final al usuario

export interface StepInput {
  query?: string;
  url?: string;
  content?: string;
  context?: string;
}

export interface StepOutput {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionStep {
  id: number;
  stepNumber: number;
  description: string;
  type: StepType;
  input: StepInput;
  output?: StepOutput;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  durationMs?: number;
}

export interface ExecutionPlan {
  taskId: number;
  objective: string;
  steps: ExecutionStep[];
}

// ── Knowledge Filter & Score ─────────────────────────────────────────────────

export interface KnowledgeScore {
  novelty: number;        // 0-10: ¿Es nuevo o único?
  importance: number;     // 0-10: ¿Qué tan importante es?
  reusability: number;    // 0-10: ¿Se puede reutilizar en otros contextos?
  confidence: number;     // 0-10: ¿Qué tan confiable es la fuente?
}

export interface KnowledgeFilterResult {
  shouldSave: boolean;
  score: KnowledgeScore;
  reason: string;
}

export interface ExecutionResult {
  taskId: number;
  objective: string;
  answer: string;
  stepsCompleted: number;
  stepsFailed: number;
  totalDurationMs: number;
  savedToKnowledge: boolean;
  // Nuevo formato unificado
  title?: string;
  summary?: string;
  facts?: string[];
  sources?: string[];
  confidence?: number;
  artifacts?: Record<string, unknown>[];
  // Registro de ejecución para aprendizaje
  executionLog?: {
    plan: string;
    steps: string[];
    toolsUsed: string[];
    cost?: number;
    quality?: number;
  };
}

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * ExecutionEngine — El cerebro ejecutor de JarBees.
 *
 * Transforma un plan de pasos en acciones reales:
 *   search → scrape → extract → deduplicate → summarize → save → respond
 *
 * Cada paso es independiente y reutilizable. El mismo engine sirve para
 * investigar, procesar PDFs, consultar GitHub, navegar el Browser, etc.
 * Solo cambia el plan — el engine siempre es el mismo.
 */
@Injectable()
export class ExecutionEngine {
  private readonly logger = new Logger(ExecutionEngine.name);

  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly browserTool: BrowserToolService,
    private readonly ingestService: DocumentIngestService,
    private readonly memoryRepo: MemoryRepository,
    private readonly documentRepo: DocumentRepository,
    @Inject(OllamaProvider) private readonly llm: ILLMProvider,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Ejecuta un plan completo paso a paso.
   * Los resultados de pasos previos se acumulan como contexto.
   */
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.logger.log(`[engine] ejecutando plan #${plan.taskId}: "${plan.objective.slice(0, 80)}"`);

    // Marcar task como in_progress
    await this.taskRepo.updateTaskStatus(plan.taskId, 'in_progress');

    const accumulatedContext: string[] = [];
    let stepsCompleted = 0;
    let stepsFailed = 0;
    let finalAnswer = '';
    let savedToKnowledge = false;

    for (const step of plan.steps) {
      const stepStart = Date.now();

      try {
        // Marcar step como running
        await this.taskRepo.updateStepStatus(step.id, 'running');
        this.logger.log(`[engine] step ${step.stepNumber}/${plan.steps.length}: ${step.type} — "${step.description.slice(0, 60)}"`);

        const output = await this.executeStep(step, accumulatedContext, plan.objective);

        // Guardar resultado en DB
        await this.taskRepo.updateStepStatus(step.id, 'completed', output.content);

        // Acumular contexto para pasos siguientes
        if (output.content.trim().length > 20) {
          accumulatedContext.push(`[${step.type}] ${output.content.slice(0, 2000)}`);
        }

        // Si es el paso final de respuesta, capturar como answer
        if (step.type === 'respond') {
          finalAnswer = output.content;
        }

        // Si se guardó en knowledge, marcar flag
        if (step.type === 'save') {
          savedToKnowledge = true;
        }

        step.output = output;
        step.status = 'completed';
        step.durationMs = Date.now() - stepStart;
        stepsCompleted++;

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`[engine] step ${step.stepNumber} falló: ${msg}`);

        await this.taskRepo.updateStepStatus(step.id, 'failed', `Error: ${msg}`);
        step.status = 'failed';
        step.error = msg;
        step.durationMs = Date.now() - stepStart;
        stepsFailed++;

        // Si un paso crítico falla y no tenemos contexto, abortar
        if (accumulatedContext.length === 0 && step.type !== 'save') {
          this.logger.warn(`[engine] abortando plan — paso crítico sin contexto previo`);
          break;
        }
        // En otros casos, continuar con el siguiente paso
      }
    }

    // Si no hubo paso 'respond', generar respuesta final con el contexto acumulado
    if (!finalAnswer && accumulatedContext.length > 0) {
      finalAnswer = await this.generateFinalAnswer(plan.objective, accumulatedContext);
    } else if (!finalAnswer) {
      finalAnswer = 'No pude completar la investigación. Intentá reformular el objetivo.';
    }

    const totalDurationMs = Date.now() - startTime;

    // Actualizar status final de la task
    const finalStatus = stepsFailed > 0 && stepsCompleted === 0 ? 'failed' : 'completed';
    await this.taskRepo.updateTaskStatus(plan.taskId, finalStatus, finalAnswer.slice(0, 1000));

    this.logger.log(
      `[engine] plan #${plan.taskId} finalizado: ${stepsCompleted} ok, ${stepsFailed} errores, ${totalDurationMs}ms`,
    );

    // Construir registro de ejecución para aprendizaje
    const executionLog = {
      plan: plan.objective,
      steps: plan.steps.map((s) => `${s.stepNumber}. ${s.description} (${s.type})`),
      toolsUsed: plan.steps
        .filter((s) => ['search', 'scrape', 'read_memory', 'read_docs'].includes(s.type))
        .map((s) => s.type),
      cost: this.estimateCost(totalDurationMs),
      quality: this.estimateQuality(stepsCompleted, stepsFailed, finalAnswer),
    };

    return {
      taskId: plan.taskId,
      objective: plan.objective,
      answer: finalAnswer,
      stepsCompleted,
      stepsFailed,
      totalDurationMs,
      savedToKnowledge,
      // Nuevo formato unificado
      title: plan.objective.slice(0, 100),
      summary: finalAnswer.slice(0, 500),
      facts: this.extractFacts(accumulatedContext),
      sources: this.extractSources(accumulatedContext),
      confidence: this.estimateConfidence(stepsCompleted, stepsFailed),
      artifacts: this.extractArtifacts(accumulatedContext),
      executionLog,
    };
  }

  // ── Knowledge Filter & Score ─────────────────────────────────────────────────

  /**
   * Evalúa si un resultado merece ser guardado en Knowledge.
   * Filtra información efímera (como resultados de partidos) vs. conocimiento duradero.
   */
  evaluateKnowledgeValue(
    objective: string,
    answer: string,
    context: string[],
  ): KnowledgeFilterResult {
    // Heurística simple: preguntas sobre eventos específicos en el tiempo suelen ser efímeras
    const timeSpecificPatterns = [
      'partido de hoy',
      'resultado de',
      'qué hora es',
      'clima de hoy',
      'noticia de hoy',
      'último',
      'hoy',
      'ayer',
      'mañana',
    ];

    const isTimeSpecific = timeSpecificPatterns.some((p) =>
      objective.toLowerCase().includes(p),
    );

    if (isTimeSpecific) {
      return {
        shouldSave: false,
        score: {
          novelty: 2,
          importance: 3,
          reusability: 1,
          confidence: 5,
        },
        reason: 'Información efímera (eventos temporales)',
      };
    }

    // Si no es temporal, evaluar potencial de valor
    const score: KnowledgeScore = {
      novelty: this.estimateNovelty(objective, answer),
      importance: this.estimateImportance(objective),
      reusability: this.estimateReusability(objective),
      confidence: this.estimateConfidenceFromContext(context),
    };

    const totalScore = score.novelty + score.importance + score.reusability + score.confidence;
    const shouldSave = totalScore >= 15; // Umbral para guardar

    return {
      shouldSave,
      score,
      reason: shouldSave
        ? 'Alto potencial de valor (conceptos, arquitectura, hipótesis)'
        : 'Valor moderado o bajo',
    };
  }

  // ── Helpers de evaluación ────────────────────────────────────────────────────

  private estimateCost(durationMs: number): number {
    // Estimación simple: $0.0001 por segundo de procesamiento
    return (durationMs / 1000) * 0.0001;
  }

  private estimateQuality(completed: number, failed: number, answer: string): number {
    // 0-10: calidad de la ejecución
    if (failed > 0 && completed === 0) return 2;
    if (answer.length < 100) return 4;
    if (completed > 0 && failed === 0) return 8;
    return 6;
  }

  private estimateConfidence(completed: number, failed: number): number {
    if (failed > 0) return 5;
    if (completed > 3) return 9;
    return 7;
  }

  private estimateNovelty(objective: string, answer: string): number {
    // Detectar términos técnicos o conceptos complejos
    const technicalTerms = [
      'arquitectura',
      'diseño',
      'patrón',
      'algoritmo',
      'estrategia',
      'hipótesis',
      'modelo',
      'framework',
      'librería',
    ];
    const matches = technicalTerms.filter((t) =>
      objective.toLowerCase().includes(t) || answer.toLowerCase().includes(t),
    );
    return Math.min(10, matches.length * 3);
  }

  private estimateImportance(objective: string): number {
    const importantTerms = [
      'arquitectura',
      'estrategia',
      'plan',
      'decisión',
      'conclusión',
      'aprendizaje',
      'mejores prácticas',
    ];
    const matches = importantTerms.filter((t) =>
      objective.toLowerCase().includes(t),
    );
    return Math.min(10, matches.length * 3);
  }

  private estimateReusability(objective: string): number {
    // Conceptos abstractos son más reutilizables
    const abstractTerms = [
      'cómo',
      'por qué',
      'estrategia',
      'patrón',
      'principio',
      'metodología',
    ];
    const matches = abstractTerms.filter((t) =>
      objective.toLowerCase().includes(t),
    );
    return Math.min(10, matches.length * 3);
  }

  private estimateConfidenceFromContext(context: string[]): number {
    if (context.length === 0) return 5;
    if (context.some((c) => c.includes('source') || c.includes('fuente'))) return 8;
    return 6;
  }

  private extractFacts(context: string[]): string[] {
    // Extraer líneas que parecen hechos (contienen verbos en presente o pasado)
    const facts: string[] = [];
    context.forEach((c) => {
      const lines = c.split('\n');
      lines.forEach((l) => {
        if (l.length > 20 && l.length < 300) {
          facts.push(l.trim());
        }
      });
    });
    return facts.slice(0, 10); // Máximo 10 hechos
  }

  private extractSources(context: string[]): string[] {
    // Buscar URLs o referencias a fuentes
    const sources: string[] = [];
    context.forEach((c) => {
      const matches = c.match(/https?:\/\/[^\s]+/g);
      if (matches) sources.push(...matches);
    });
    return [...new Set(sources)].slice(0, 5); // Máximo 5 fuentes únicas
  }

  private extractArtifacts(context: string[]): Record<string, unknown>[] {
    // Buscar estructuras JSON o código en el contexto
    const artifacts: Record<string, unknown>[] = [];
    context.forEach((c) => {
      if (c.includes('{') && c.includes('}')) {
        artifacts.push({ content: c.slice(0, 500) });
      }
    });
    return artifacts;
  }

  // ── Ejecución individual de pasos ────────────────────────────────────────────

  private async executeStep(
    step: ExecutionStep,
    context: string[],
    objective: string,
  ): Promise<StepOutput> {
    switch (step.type) {
      case 'search':
        return this.executeSearch(step, objective);

      case 'scrape':
        return this.executeScrape(step);

      case 'read_memory':
        return this.executeReadMemory(step, objective);

      case 'read_docs':
        return this.executeReadDocs(step, objective);

      case 'summarize':
        return this.executeSummarize(step, context, objective);

      case 'deduplicate':
        return this.executeDeduplicate(context);

      case 'save':
        return this.executeSave(step, context, objective);

      case 'respond':
        return this.executeRespond(step, context, objective);

      default:
        throw new Error(`Tipo de paso desconocido: ${step.type}`);
    }
  }

  // ── Implementación de cada tipo de paso ─────────────────────────────────────

  private async executeSearch(step: ExecutionStep, objective: string): Promise<StepOutput> {
    const query = step.input.query || objective;
    const results = await this.browserTool.search(query, 5);

    if (results.length === 0) {
      return { content: `Sin resultados de búsqueda para: "${query}"` };
    }

    const content = results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n');

    return {
      content,
      metadata: { urls: results.map((r) => r.url), count: results.length },
    };
  }

  private async executeScrape(step: ExecutionStep): Promise<StepOutput> {
    const url = step.input.url;
    if (!url) throw new Error('Scrape requiere una URL');

    const result = await this.browserTool.fetch(url);

    if ('error' in result) {
      return { content: `No se pudo scrapear ${url}: ${result.error}` };
    }

    const content = [
      `# ${result.title}`,
      result.description ? `> ${result.description}` : '',
      '',
      result.headlines.length > 0
        ? `**Titulares:**\n${result.headlines.slice(0, 10).map((h) => `- ${h}`).join('\n')}`
        : '',
      '',
      result.excerpt,
    ]
      .filter(Boolean)
      .join('\n');

    return { content, metadata: { url, wordCount: result.wordCount } };
  }

  private async executeReadMemory(step: ExecutionStep, objective: string): Promise<StepOutput> {
    const query = step.input.query || objective;
    const memories = await this.memoryRepo.search(query, 5);

    if (memories.length === 0) {
      return { content: 'Sin memorias relevantes encontradas.' };
    }

    const content = memories
      .map((m) => `- [${m.category}] ${m.content}`)
      .join('\n');

    return { content: `**Memorias relevantes:**\n${content}` };
  }

  private async executeReadDocs(step: ExecutionStep, objective: string): Promise<StepOutput> {
    const query = step.input.query || objective;
    let chunks = [] as any[];
    try {
      const queryEmbedding = await this.embeddingsService.generateEmbedding(query);
      chunks = await this.documentRepo.searchChunksSemantic(queryEmbedding, 5);
    } catch (err: any) {
      this.logger.warn(`[planner:executeReadDocs] Fallback a búsqueda textual: ${err.message}`);
      chunks = await this.documentRepo.searchChunks(query, 5);
    }

    if (chunks.length === 0) {
      return { content: 'Sin documentos relevantes en la biblioteca.' };
    }

    const content = chunks
      .map((c) => `[${(c as any).document?.title || 'Doc'}]\n${c.content}`)
      .join('\n---\n');

    return { content: `**Documentos relevantes:**\n${content}` };
  }

  private async executeSummarize(
    step: ExecutionStep,
    context: string[],
    objective: string,
  ): Promise<StepOutput> {
    const contextText = step.input.content || context.join('\n\n---\n\n');

    if (!contextText.trim()) {
      return { content: 'No hay contenido para resumir.' };
    }

    const response = await this.llm.generate({
      messages: [
        {
          role: 'system',
          content: 'Sos un asistente que resume contenido de forma clara y en español. Sé conciso pero completo. No inventes información.',
        },
        {
          role: 'user',
          content: `Objetivo: ${objective}\n\nContenido a resumir:\n${contextText.slice(0, 6000)}\n\nGenerá un resumen estructurado con los puntos más importantes.`,
        },
      ],
      temperature: 0.2,
    });

    return { content: response.content };
  }

  private async executeDeduplicate(context: string[]): Promise<StepOutput> {
    if (context.length < 2) {
      return { content: context[0] || 'Sin contenido para deduplicar.' };
    }

    // Deduplicación simple: eliminar oraciones repetidas por similitud textual
    const allLines = context
      .join('\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 20);

    const unique: string[] = [];
    for (const line of allLines) {
      const isDuplicate = unique.some((u) => {
        const words = new Set(line.toLowerCase().split(/\s+/));
        const uWords = new Set(u.toLowerCase().split(/\s+/));
        let shared = 0;
        for (const w of words) { if (uWords.has(w)) shared++; }
        return shared / Math.max(words.size, uWords.size) > 0.7;
      });
      if (!isDuplicate) unique.push(line);
    }

    return {
      content: unique.join('\n'),
      metadata: { originalLines: allLines.length, uniqueLines: unique.length },
    };
  }

  private async executeSave(
    step: ExecutionStep,
    context: string[],
    objective: string,
  ): Promise<StepOutput> {
    const content = step.input.content || context.join('\n\n---\n\n');

    if (!content.trim() || content.length < 100) {
      return { content: 'Contenido insuficiente para guardar.' };
    }

    const evaluation = this.evaluateKnowledgeValue(objective, content, context);

    if (!evaluation.shouldSave) {
      return {
        content: `No se guardó en Knowledge: ${evaluation.reason}`,
        metadata: { skipped: true, score: evaluation.score },
      };
    }

    const title = step.input.query || objective.slice(0, 100);
    const result = await this.ingestService.ingestText(
      title,
      content,
      'execution-result',
    );

    return {
      content: `Guardado en biblioteca: "${title}" (${result.chunks} chunks)`,
      metadata: {
        documentId: result.documentId,
        score: evaluation.score,
        reason: evaluation.reason,
      },
    };
  }

  private async executeRespond(
    step: ExecutionStep,
    context: string[],
    objective: string,
  ): Promise<StepOutput> {
    return { content: await this.generateFinalAnswer(objective, context) };
  }

  // ── Generación de respuesta final ───────────────────────────────────────────

  private async generateFinalAnswer(
    objective: string,
    context: string[],
  ): Promise<string> {
    const contextText = context.join('\n\n---\n\n').slice(0, 8000);

    const response = await this.llm.generate({
      messages: [
        {
          role: 'system',
          content:
            'Sos JarBees, un asistente personal inteligente. ' +
            'Respondé en español de forma clara, directa y completa. ' +
            'Usá el contexto provisto. No inventes información no presente en el contexto.',
        },
        {
          role: 'user',
          content: `Objetivo: ${objective}\n\nContexto recopilado:\n${contextText}\n\nGenerá una respuesta final completa y bien organizada.`,
        },
      ],
      temperature: 0.3,
    });

    return response.content;
  }
}
