import { Injectable, Logger } from '@nestjs/common';
import { TaskRepository } from '../../repositories/task.repository';

@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name);

  constructor(private readonly taskRepo: TaskRepository) {}

  async handleTaskCommand(message: string, sessionId?: string): Promise<string> {
    const normalized = message.trim().toLowerCase();
    const original = message.trim();

    const createIntent = /\b(agrega|agregar|añade|anade|anotar|anota|apunta|apuntar|guardar|guarda|incluir|incluye|poner|pon|agregue|agregué|agregá|agendar|agenda)\b/i.test(normalized);
    const pendingContext = /\b(pendiente|pendientes|lista\s+de\s+pendientes|lista|recordatorio|tarea)\b/i.test(normalized);
    const listContext = /\b(lista|listar|mostrar|ver|recordar|recuerda|recordarme|dime)\b/i.test(normalized);

    if ((createIntent && pendingContext) || /\b(crea|crear|agrega|agregar|añade|anade|anotar|anota)\b.*\b(pendiente|pendientes|tarea|tareas|recordatorio|recordatorios)\b/i.test(normalized)) {
      const objective = this.extractObjective(original);
      if (objective) {
        const task = await this.taskRepo.createTask({
          sessionId,
          objective,
          status: 'pending',
          priority: this.inferPriority(message),
          category: this.inferCategory(message),
          project: this.inferProject(message),
        });
        this.logger.log(`Pendiente persistido: ${objective}`);
        return `✅ Pendiente guardado: ${task.objective}`;
      }
    }

    if (listContext && /\b(pendientes|tareas|recordatorios|lista\s+completa)\b/i.test(normalized)) {
      const tasks = await this.taskRepo.findPendingTasks(sessionId);
      if (!tasks.length) {
        return 'No tenés pendientes guardados.';
      }

      const formatted = tasks.map((task, index) => `${index + 1}. ${task.objective}`).join('\n');
      return `📋 Tus pendientes:\n${formatted}`;
    }

    return '';
  }

  private inferPriority(message: string): string {
    const normalized = message.toLowerCase();
    if (/\b(urgente|importante|prioritario|ahora|inmediato|crítico|critico)\b/.test(normalized)) return 'high';
    if (/\b(urgencia|muy urgente|super urgente|critical)\b/.test(normalized)) return 'critical';
    return 'normal';
  }

  private inferCategory(message: string): string | undefined {
    const normalized = message.toLowerCase();
    if (/\b(comprar|compra|supermercado|mercado|mercado|medias|zapatillas|leche|yerba|pasta|pan|alimentos|comida)\b/.test(normalized)) return 'compras';
    if (/\b(trabajo|proyecto|deploy|aws|nestjs|docker|prisma|backend|frontend|api|servicio|servidor)\b/.test(normalized)) return 'tecnologia';
    if (/\b(casa|hogar|lavar|limpieza|reparar|mantenimiento)\b/.test(normalized)) return 'personal';
    return undefined;
  }

  private inferProject(message: string): string | undefined {
    const normalized = message.toLowerCase();
    if (/\b(jarbees|jarvis|ai|ia|mcp|rag|embeddings|graph|llm|ollama)\b/.test(normalized)) return 'JarBees';
    return undefined;
  }

  private extractObjective(message: string): string {
    let result = message.trim();

    const prefixes = [
      /^(?:podr(?:í|i)as|podrias|quiero|quisiera|me\spodr(?:í|i)as|me\spodrias)\s+/i,
      /^(?:agrega|agregar|añade|anade|anotar|anota|apunta|apuntar|guardar|guarda|incluir|incluye|poner|pon|agregue|agregué|agregá|agendar|agenda)\s+/i,
      /^(?:a\s+la\s+lista(?:\s+de\s+pendientes)?|en\s+mi\s+lista(?:\s+de\s+pendientes)?|en\s+la\s+lista(?:\s+de\s+pendientes)?|a\s+mi\s+lista(?:\s+de\s+pendientes)?|en\s+mi\s+lista\s+de\s+pendientes|a\s+la\s+lista\s+de\s+pendientes|en\s+la\s+lista\s+de\s+pendientes)\s+/i,
      /^(?:un\s+pendiente|una\s+tarea|un\s+recordatorio|la\s+lista\s+de\s+pendientes|mi\s+lista\s+de\s+pendientes)\s+/i,
      /^crea\s+/i,
      /^crear\s+/i,
    ];

    for (const prefix of prefixes) {
      result = result.replace(prefix, '').trim();
    }

    result = result.replace(/^[:\-\s]+/, '').trim();
    result = result.replace(/^(?:un|una)\s+(?:pendiente|tarea|recordatorio)\s*[:\-]?\s*/i, '').trim();
    result = result.replace(/^[\(\[]+|[\)\]]+$/g, '').trim();

    return result;
  }
}
