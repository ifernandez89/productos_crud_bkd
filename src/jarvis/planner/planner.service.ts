import { Injectable, Inject, Logger } from '@nestjs/common';
import { TaskRepository } from '../repositories/task.repository';
import { ILLMProvider } from '../llm/llm-provider.interface';
import { OllamaProvider } from '../llm/ollama.provider';

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly taskRepo: TaskRepository,
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
  { "stepNumber": 1, "description": "Acción a realizar" },
  { "stepNumber": 2, "description": "Siguiente acción a realizar" }
]
Mantén los pasos entre 2 y 5 máximo. Sé muy directo y específico.
    `.trim();

    const response = await this.llmProvider.generate({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: objective },
      ],
      temperature: 0.1, // Baja temperatura para JSON más determinista
    });

    let stepsArray: Array<{ stepNumber: number; description: string }> = [];
    try {
      // Limpiar por si el LLM devuleve markdown
      const cleanJson = response.content.replace(/```json/gi, '').replace(/```/g, '').trim();
      stepsArray = JSON.parse(cleanJson);
      
      // Validar la estructura básica
      if (!Array.isArray(stepsArray)) throw new Error('No es un array');
      stepsArray = stepsArray.map((s, i) => ({
        stepNumber: s.stepNumber || i + 1,
        description: s.description || 'Paso desconocido',
      }));
    } catch (err) {
      this.logger.error(`Error parseando el plan del LLM: ${err.message}`);
      // Fallback a un paso único
      stepsArray = [
        { stepNumber: 1, description: 'Ejecutar objetivo directamente (fallback)' },
      ];
    }

    const task = await this.taskRepo.createTask({ sessionId, objective });
    await this.taskRepo.createTaskSteps(task.id, stepsArray);

    return this.taskRepo.getTaskWithSteps(task.id);
  }
}
