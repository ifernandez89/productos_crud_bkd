import { Injectable, Logger } from '@nestjs/common';
import { TaskRepository } from '../../repositories/task.repository';

@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name);

  constructor(private readonly taskRepo: TaskRepository) {}

  async handleTaskCommand(message: string, sessionId?: string): Promise<string> {
    const normalized = message.trim().toLowerCase();
    const original = message.trim();

    // ── 1. BORRAR — evaluar PRIMERO para que "borra el pendiente X" no dispare create ──
    const deleteIntent = /\b(eliminar|elimina|borrar|borra|borre|quitar|quita|sacar|saca|tachar|tacha|limpiar|limpia|remover|remueve|remové|borrá|quitá)\b/i.test(normalized);
    if (deleteIntent) {
      // Limpiar toda la lista
      if (/\b(todo|toda|todos|todas|completa|toda la lista|todas las tareas|todo lo|limpiar todo)\b/i.test(normalized)) {
        await this.taskRepo.clearPendingTasks(sessionId);
        return '🧹 Se limpió la lista de pendientes.';
      }

      // Borrar por número: "borra el 2", "elimina el pendiente 3"
      const byNumber = normalized.match(/\b(?:el|la|pendiente|tarea)?\s*#?(\d+)\b/);
      if (byNumber) {
        const index = parseInt(byNumber[1], 10) - 1;
        const tasks = await this.taskRepo.findPendingTasks(sessionId);
        if (tasks[index]) {
          await this.taskRepo.deleteTask(tasks[index].id);
          return `🗑️ Se eliminó el pendiente: ${tasks[index].objective}`;
        }
        return `No encontré un pendiente con ese número.`;
      }

      // Borrar por nombre: extraer qué viene después del comando de borrado
      const target = this.extractDeleteTarget(original);
      if (target) {
        const tasks = await this.taskRepo.findPendingTasks(sessionId);
        const match = tasks.find((task) =>
          task.objective.toLowerCase().includes(target.toLowerCase()),
        );
        if (match) {
          await this.taskRepo.deleteTask(match.id);
          return `🗑️ Se eliminó el pendiente: ${match.objective}`;
        }
        // Mostrar lista para que el usuario pueda usar número
        if (tasks.length > 0) {
          const list = tasks.map((t, i) => `${i + 1}. ${t.objective}`).join('\n');
          return `No encontré un pendiente que coincida con "${target}". Tus pendientes actuales:\n${list}\n\nPodés borrar por número, ej: "borra el 2"`;
        }
        return `No encontré ese pendiente para eliminar.`;
      }

      return '';
    }

    // ── 2. LISTAR ───────────────────────────────────────────────────────────────
    const listIntent = /\b(lista|listar|mostrar|ver|show|cuáles|cuales|tengo|dime|decime)\b/i.test(normalized);
    if (listIntent && /\b(pendientes|tareas|recordatorios)\b/i.test(normalized)) {
      const tasks = await this.taskRepo.findPendingTasks(sessionId);
      if (!tasks.length) return 'No tenés pendientes guardados.';
      const formatted = tasks.map((t, i) => `${i + 1}. ${t.objective}`).join('\n');
      return `📋 Tus pendientes:\n${formatted}`;
    }

    // ── 3. MARCAR COMO COMPLETADO ───────────────────────────────────────────────
    const completeIntent = /\b(completar|completé|completé|hice|hice el|ya hice|terminé|terminé|listo|marcar como|marcar)\b/i.test(normalized);
    if (completeIntent && /\b(pendiente|tarea)\b/i.test(normalized)) {
      const byNumber = normalized.match(/\b(?:el|la|pendiente|tarea)?\s*#?(\d+)\b/);
      if (byNumber) {
        const index = parseInt(byNumber[1], 10) - 1;
        const tasks = await this.taskRepo.findPendingTasks(sessionId);
        if (tasks[index]) {
          await this.taskRepo.updateTaskStatus(tasks[index].id, 'completed');
          return `✅ Pendiente completado: ${tasks[index].objective}`;
        }
      }
    }

    // ── 4. CREAR — solo si el mensaje tiene intención clara de agregar algo nuevo ──
    // Patrones explícitos de creación: "agregar X a mis pendientes", "nuevo pendiente: X"
    const explicitCreate =
      /\b(agregar?|añadir?|anotar?|apuntar?|guardar?|incluir?|agendar?|agregá|anotá|apuntá)\b/i.test(normalized) &&
      /\b(pendiente|pendientes|lista|tarea|tareas|recordatorio)\b/i.test(normalized);

    const implicitCreate =
      /\b(nuevo\s+pendiente|nueva\s+tarea|pendiente\s+nuevo|nuevo\s+recordatorio)\b/i.test(normalized) ||
      /^pendiente[:\s]/i.test(normalized) ||
      /^tarea[:\s]/i.test(normalized);

    if (explicitCreate || implicitCreate) {
      const objective = this.extractCreateObjective(original);
      if (objective && objective.length > 2) {
        const task = await this.taskRepo.createTask({
          sessionId,
          objective,
          status: 'pending',
          priority: this.inferPriority(message),
          category: this.inferCategory(message),
          project: this.inferProject(message),
        });
        this.logger.log(`Pendiente persistido: ${objective}`);
        return `✅ Pendiente guardado: ${task.objective}\n\nPara ver tu lista decí "lista de pendientes". Para borrarlo: "borra el pendiente ${objective}".`;
      }
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
    if (/\b(comprar|compra|supermercado|mercado|medias|zapatillas|leche|yerba|pasta|pan|alimentos|comida)\b/.test(normalized)) return 'compras';
    if (/\b(trabajo|proyecto|deploy|aws|nestjs|docker|prisma|backend|frontend|api|servicio|servidor)\b/.test(normalized)) return 'tecnologia';
    if (/\b(casa|hogar|lavar|limpieza|reparar|mantenimiento)\b/.test(normalized)) return 'personal';
    return undefined;
  }

  private inferProject(message: string): string | undefined {
    const normalized = message.toLowerCase();
    if (/\b(jarbees|jarvis|ai|ia|mcp|rag|embeddings|graph|llm|ollama)\b/.test(normalized)) return 'JarBees';
    return undefined;
  }

  /**
   * Extrae el nombre del pendiente a borrar.
   * Ej: "borra el pendiente comprar leche" → "comprar leche"
   *     "elimina comprar" → "comprar"
   */
  private extractDeleteTarget(message: string): string {
    let result = message.trim();

    // Quitar el verbo de borrado al inicio
    result = result.replace(/^\b(eliminar|elimina|borrar|borra|borre|quitar|quita|sacar|saca|tachar|tacha|limpiar|limpia|remover|remueve|remové|borrá|quitá)\b\s*/i, '').trim();
    // Quitar artículos y "el/la pendiente/tarea"
    result = result.replace(/^(?:el|la|los|las|mi|mis)\s+/i, '').trim();
    result = result.replace(/^(?:pendiente|tarea|recordatorio|item)\s*/i, '').trim();
    result = result.replace(/^(?:el|la|los|las)\s+/i, '').trim();
    result = result.replace(/^[:\-\s]+/, '').trim();

    return result;
  }

  /**
   * Extrae el objetivo del nuevo pendiente a crear.
   * Ej: "agregar comprar leche a mis pendientes" → "comprar leche"
   *     "pendiente: llamar al médico" → "llamar al médico"
   */
  private extractCreateObjective(message: string): string {
    let result = message.trim();

    // Quitar frases introductorias de creación
    result = result.replace(/^(?:podrías|podrias|quiero|quisiera|me podrías|me podrias)\s+/i, '').trim();
    result = result.replace(/^(?:agregar?|añadir?|anotar?|apuntar?|guardar?|incluir?|agendar?|agregá|anotá|apuntá|crea[r]?)\s+/i, '').trim();

    // Quitar "nuevo pendiente:", "pendiente:", etc.
    result = result.replace(/^(?:nuevo\s+)?(?:pendiente|tarea|recordatorio)\s*[:\-]?\s*/i, '').trim();

    // Quitar la parte "a mis pendientes / en la lista / etc." que puede estar al final o al inicio
    result = result.replace(/\s+(?:a\s+)?(?:mis?|la|tus?)\s+(?:lista\s+de\s+)?(?:pendientes|tareas|recordatorios)[\s\S]*$/i, '').trim();
    result = result.replace(/^(?:a\s+)?(?:mis?|la|tus?)\s+(?:lista\s+de\s+)?(?:pendientes|tareas|recordatorios)\s*/i, '').trim();
    result = result.replace(/^(?:en\s+)?(?:la|mi)\s+lista(?:\s+de\s+pendientes)?\s*/i, '').trim();

    // Limpiar residuos
    result = result.replace(/^[:\-\s]+/, '').trim();
    result = result.replace(/^(?:un|una|el|la)\s+(?:pendiente|tarea|recordatorio)\s*[:\-]?\s*/i, '').trim();

    return result;
  }
}
