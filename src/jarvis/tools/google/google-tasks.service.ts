import { Injectable, Logger } from '@nestjs/common';
import { google, tasks_v1 } from 'googleapis';
import { GoogleAuthService } from '../../../google/google-auth.service';

@Injectable()
export class GoogleTasksService {
  private readonly logger = new Logger(GoogleTasksService.name);

  constructor(private googleAuthService: GoogleAuthService) {}

  async getTasksClient(): Promise<tasks_v1.Tasks | null> {
    const auth = await this.googleAuthService.getAuthenticatedClient();
    if (!auth) {
      this.logger.warn('[Google Tasks] No hay cliente autenticado. El usuario debe loguearse.');
      return null;
    }
    return google.tasks({ version: 'v1', auth });
  }

  async getPendingTasks(maxResults: number = 15): Promise<string | null> {
    const tasksApi = await this.getTasksClient();
    if (!tasksApi) return null;

    try {
      const response = await tasksApi.tasks.list({
        tasklist: '@default',
        maxResults,
        showCompleted: false,
        showHidden: false,
      });

      const tasks = response.data.items;
      if (!tasks || tasks.length === 0) {
        return 'No tienes tareas pendientes en tu lista principal.';
      }

      const formattedTasks = tasks.map((task, i) => {
        let text = `${i + 1}. [ ] **${task.title}**`;
        if (task.notes) text += `\n   📝 _${task.notes.replace(/\n/g, ' ')}_`;
        if (task.due) {
          const dueDate = new Date(task.due).toLocaleDateString('es-AR');
          text += `\n   ⏰ Vence: ${dueDate}`;
        }
        return text;
      });

      return `📋 **Tus Tareas Pendientes:**\n${formattedTasks.join('\n')}`;
    } catch (error) {
      this.logger.error(`[Google Tasks] Error obteniendo tareas: ${error.message}`);
      return 'Ocurrió un error al intentar leer tus tareas. Verifica tus permisos.';
    }
  }

  async createTask(title: string, notes?: string, dueIso?: string): Promise<string> {
    const tasksApi = await this.getTasksClient();
    if (!tasksApi) return 'No tengo acceso a tu cuenta de Google. Por favor autentícate primero.';

    try {
      const taskBody: tasks_v1.Schema$Task = { title };
      if (notes) taskBody.notes = notes;
      if (dueIso) taskBody.due = dueIso;

      const res = await tasksApi.tasks.insert({
        tasklist: '@default',
        requestBody: taskBody,
      });

      return `✅ Tarea creada con éxito: **${res.data.title}**`;
    } catch (error) {
      this.logger.error(`[Google Tasks] Error creando tarea: ${error.message}`);
      return `❌ Hubo un error al crear la tarea: ${error.message}`;
    }
  }
}
