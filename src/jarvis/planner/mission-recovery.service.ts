import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TaskRepository } from '../repositories/task.repository';
import { MissionCheckpointService } from './mission-checkpoint.service';
import {
  ExecutionEngine,
  ExecutionPlan,
  ExecutionStep,
  StepType,
} from './execution-engine.service';

@Injectable()
export class MissionRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MissionRecoveryService.name);

  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly checkpointService: MissionCheckpointService,
    private readonly executionEngine: ExecutionEngine,
  ) {}

  /**
   * Al arrancar NestJS, detecta misiones que quedaron 'in_progress' debido a un reinicio/crash
   * y las pone a resguardo en estado 'waiting_recovery' preservando todo su progreso en disco y BD.
   */
  async onApplicationBootstrap() {
    this.logger.log('Iniciando verificación de recuperación de misiones huérfanas...');
    try {
      const interruptedTasks = await this.taskRepo.findTasksByStatus('in_progress');

      if (interruptedTasks.length === 0) {
        this.logger.log('No se encontraron misiones interrumpidas. Sistema consistente.');
        return;
      }

      this.logger.warn(
        `Se detectaron ${interruptedTasks.length} misiones interrumpidas en estado 'in_progress'. Procesando recuperación...`,
      );

      for (const task of interruptedTasks) {
        await this.handleOrphanTask(task);
      }
    } catch (err: any) {
      this.logger.error(`Error en ciclo de recuperación de misiones: ${err.message}`);
    }
  }

  /**
   * Gestiona una tarea huérfana encontrada en arranque.
   */
  private async handleOrphanTask(task: any): Promise<void> {
    const checkpoint = this.checkpointService.loadCheckpoint(task.id);
    const totalSteps = task.steps?.length || 0;
    const completedSteps = task.steps?.filter((s: any) => s.status === 'completed') || [];

    if (totalSteps > 0 && completedSteps.length === totalSteps) {
      // Todos los pasos estaban terminados pero faltó actualizar el status final
      this.logger.log(
        `Misión #${task.id} tenía todos sus pasos completos (${totalSteps}/${totalSteps}). Marcando como 'completed'.`,
      );
      await this.taskRepo.updateTaskStatus(
        task.id,
        'completed',
        task.result || 'Misión completada previa a reinicio de servidor.',
      );
      if (checkpoint) {
        checkpoint.status = 'completed';
        this.checkpointService.saveCheckpoint(checkpoint);
      }
      return;
    }

    // Hay pasos pendientes: marcar como waiting_recovery
    const diagnostic = `Misión interrumpida por reinicio de proceso. Progreso preservado: ${completedSteps.length}/${totalSteps} pasos completados. Lista para reanudación idempotente.`;
    this.logger.warn(`Misión #${task.id}: ${diagnostic}`);

    await this.taskRepo.updateTaskStatus(task.id, 'waiting_recovery', diagnostic);

    if (checkpoint) {
      checkpoint.status = 'waiting_recovery';
      this.checkpointService.saveCheckpoint(checkpoint);
    }
  }

  /**
   * Lista todas las misiones que pueden ser reanudadas.
   */
  async getRecoverableMissions(): Promise<any[]> {
    const tasks = await this.taskRepo.findAllInProgressOrRecoverable();
    return tasks.map((t) => {
      const checkpoint = this.checkpointService.loadCheckpoint(t.id);
      return {
        id: t.id,
        objective: t.objective,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        stepsTotal: t.steps.length,
        stepsCompleted: t.steps.filter((s: any) => s.status === 'completed').length,
        hasCheckpointOnDisk: !!checkpoint,
        checkpointSummary: checkpoint
          ? {
              completedStepsCount: checkpoint.completedSteps.length,
              accumulatedContextCount: checkpoint.accumulatedContext.length,
              updatedAt: checkpoint.updatedAt,
            }
          : null,
      };
    });
  }

  /**
   * Reanuda la ejecución de una misión interrumpida sin re-ejecutar pasos ya completados.
   */
  async resumeMission(taskId: number): Promise<any> {
    const task = await this.taskRepo.getTaskWithSteps(taskId);
    if (!task) {
      throw new NotFoundException(`Misión #${taskId} no encontrada.`);
    }

    if (task.status === 'completed') {
      throw new BadRequestException(`La misión #${taskId} ya está completada.`);
    }

    this.logger.log(`Reanudando misión #${taskId}: "${task.objective}"`);

    // Cargar o inferir plan de ejecución
    const executionPlan: ExecutionPlan = {
      taskId: task.id,
      objective: task.objective,
      steps: (task.steps || []).map((s: any) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        description: s.description,
        type: this.inferStepType(s.description),
        input: this.inferStepInput(s.description, task.objective),
        status: s.status,
        output: s.result ? { content: s.result } : undefined,
      })) as ExecutionStep[],
    };

    return this.executionEngine.execute(executionPlan);
  }

  private inferStepType(description: string): StepType {
    const d = description.toLowerCase();
    if (/(buscar|busca|search|investigar)/.test(d)) return 'search';
    if (/(scrapear|scrape|extraer de url|leer url)/.test(d)) return 'scrape';
    if (/(memoria|recuerdo|preferencias|historial)/.test(d)) return 'read_memory';
    if (/(documento|pdf|biblioteca|archivo)/.test(d)) return 'read_docs';
    if (/(resumir|resumen|sintetizar|condensar)/.test(d)) return 'summarize';
    if (/(deduplicar|duplicados|limpiar)/.test(d)) return 'deduplicate';
    if (/(guardar|salvar|almacenar|indexar)/.test(d)) return 'save';
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
