import { Injectable, Inject, Logger } from '@nestjs/common';
import { TaskRepository } from '../repositories/task.repository';
import { ILLMProvider } from '../llm/llm-provider.interface';
import { OllamaProvider } from '../llm/ollama.provider';
import { ExecutionEngine, ExecutionPlan, ExecutionStep, StepType } from './execution-engine.service';

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly executionEngine: ExecutionEngine,
    @Inject(OllamaProvider) private readonly llmProvider: ILLMProvider,
  ) {}

  async createPlan(objective: string, sessionId?: string) {
    this.logger.log(`Creando plan para: "${objective}"`);

    const systemPrompt = `
Eres Jarvis, un asistente de IA capaz de planificar.
Tu tarea es tomar un objetivo complejo y dividirlo en pasos simples y ejecutables.
DEBES devolver un JSON array exacto, y nada más. No devuelvas markdown (\`\`\`json) ni texto adicional.
Cada paso debe tener el siguiente formato:
[
  { "stepNumber": 1, "description": "Acción a realizar", "type": "search" },
  { "stepNumber": 2, "description": "Siguiente acción a realizar", "type": "summarize" }
]
Tipos de pasos disponibles: search, scrape, read_memory, read_docs, summarize, deduplicate, save, respond.
Si el objetivo parece temporal o efímero (ej. resultado de un partido, clima, horario), evita incluir un paso de save.
Mantén los pasos entre 2 y 6 máximo. Sé muy directo y específico.
    `.trim();

    const response = await this.llmProvider.generate({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: objective },
      ],
      temperature: 0.1,
    });

    let stepsArray: Array<{ stepNumber: number; description: string; type?: string }> = [];
    try {
      const cleanJson = response.content.replace(/```json/gi, '').replace(/```/g, '').trim();
      stepsArray = JSON.parse(cleanJson);
      if (!Array.isArray(stepsArray)) throw new Error('No es un array');
      stepsArray = stepsArray.map((s, i) => ({
        stepNumber: s.stepNumber || i + 1,
        description: s.description || 'Paso desconocido',
        type: s.type || 'respond',
      }));
    } catch (err) {
      this.logger.error(`Error parseando el plan del LLM: ${err.message}`);
      stepsArray = [
        { stepNumber: 1, description: 'Ejecutar objetivo directamente', type: 'respond' },
      ];
    }

    const task = await this.taskRepo.createTask({ sessionId, objective });
    await this.taskRepo.createTaskSteps(task.id, stepsArray);

    return this.taskRepo.getTaskWithSteps(task.id);
  }

  /**
   * Crea el plan Y lo ejecuta inmediatamente.
   * Retorna la respuesta final al usuario.
   */
  async createAndExecute(objective: string, sessionId?: string) {
    const task = await this.createPlan(objective, sessionId);
    if (!task) throw new Error('No se pudo crear el plan');

    // Construir el ExecutionPlan tipado
    const executionPlan: ExecutionPlan = {
      taskId: task.id,
      objective: task.objective,
      steps: (task.steps || []).map((s) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        description: s.description,
        type: (s.status === 'pending' ? this.inferStepType(s.description) : 'respond') as StepType,
        input: this.inferStepInput(s.description, objective),
        status: 'pending' as const,
      })) as ExecutionStep[],
    };

    return this.executionEngine.execute(executionPlan);
  }

  /**
   * Infiere el tipo de paso a partir de su descripción.
   */
  private inferStepType(description: string): StepType {
    const d = description.toLowerCase();
    if (/(buscar|busca|search|investigar)/.test(d))             return 'search';
    if (/(scrapear|scrape|extraer de url|leer url)/.test(d))    return 'scrape';
    if (/(memoria|recuerdo|preferencias|historial)/.test(d))    return 'read_memory';
    if (/(documento|pdf|biblioteca|archivo)/.test(d))           return 'read_docs';
    if (/(resumir|resumen|sintetizar|condensar)/.test(d))       return 'summarize';
    if (/(deduplicar|duplicados|limpiar)/.test(d))              return 'deduplicate';
    if (/(guardar|salvar|almacenar|indexar)/.test(d))           return 'save';
    return 'respond';
  }

  private inferStepInput(description: string, objective: string) {
    const urlMatch = description.match(/https?:\/\/[^\s]+/);
    return {
      query: objective,
      url: urlMatch?.[0],
    };
  }
}
