import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  MissionDefinition,
  MissionLifecycleState,
  MissionSubtask,
  MissionCheckpointRecord,
  MissionEventNotification,
} from './mission.types';
import { TaskEnvelope } from '../tools/task-envelope/task-envelope.types';

/**
 * MissionEngineService — Motor de Ejecución Agéntica Asíncrona (JCA Fase 3)
 *
 * Implementa la máquina de estados determinista para misiones prolongadas:
 * 1. Planificar (desglose en subtareas con precondiciones).
 * 2. Ejecutar (sandboxed en background sin congelar el diálogo).
 * 3. Observar (captura de código de salida, diffs y hashes).
 * 4. Verificar (rechazo de conclusiones sin evidencia formal).
 * 5. Persistir (Checkpoints atómicos).
 * 6. Informar (Notificaciones no invasivas para el Dialogue Engine).
 */
@Injectable()
export class MissionEngineService {
  private readonly logger = new Logger(MissionEngineService.name);

  // Registro de misiones en memoria (sincronizable con PostgreSQL)
  private readonly missions = new Map<string, MissionDefinition>();
  private readonly notifications = new Map<string, MissionEventNotification[]>();

  /**
   * Crea una nueva misión con su TaskEnvelope gobernado
   */
  createMission(
    id: string,
    title: string,
    objective: string,
    envelope: TaskEnvelope,
    subtasks: Array<{ id: string; description: string; tool: string }>,
  ): MissionDefinition {
    const mission: MissionDefinition = {
      id,
      title,
      objective,
      envelope,
      state: 'PENDING',
      subtasks: subtasks.map((s) => ({
        ...s,
        status: 'pending',
      })),
      checkpoints: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.missions.set(id, mission);
    this.addNotification(envelope.conversationId, {
      missionId: id,
      type: 'STARTED',
      message: `Misión "${title}" registrada e iniciada en background.`,
      timestamp: new Date(),
    });

    return mission;
  }

  getMission(id: string): MissionDefinition | undefined {
    return this.missions.get(id);
  }

  /**
   * Ejecuta la máquina de estados de la misión paso a paso
   */
  async executeStep(
    missionId: string,
    subtaskId: string,
    executor: () => Promise<{ verified: boolean; hash?: string; exitCode?: number; diff?: string; summary?: string }>,
  ): Promise<MissionSubtask> {
    const mission = this.missions.get(missionId);
    if (!mission) {
      throw new Error(`Misión #${missionId} no encontrada.`);
    }

    const subtask = mission.subtasks.find((s) => s.id === subtaskId);
    if (!subtask) {
      throw new Error(`Subtarea #${subtaskId} no encontrada en la misión #${missionId}.`);
    }

    // Transición: EXECUTING -> OBSERVING -> VERIFYING
    mission.state = 'EXECUTING';
    subtask.status = 'in_progress';
    mission.updatedAt = new Date();

    try {
      const evidence = await executor();

      // Regla de Oro JCA: Rechazo de conclusiones sin evidencia verificada
      if (!evidence.verified) {
        subtask.status = 'failed';
        subtask.evidence = evidence;
        mission.state = 'FAILED';
        mission.error = `Fallo en verificación de subtarea #${subtaskId}: ${evidence.summary || 'Sin evidencia verificable'}`;
        
        this.addNotification(mission.envelope.conversationId, {
          missionId,
          type: 'STEP_FAILED',
          message: `Fallo en subtarea "${subtask.description}": ${mission.error}`,
          timestamp: new Date(),
        });
        return subtask;
      }

      subtask.status = 'completed';
      subtask.evidence = evidence;

      // Crear checkpoint incremental
      const checkpointHash = this.calculateCheckpointHash(mission);
      const checkpointRecord: MissionCheckpointRecord = {
        stepIndex: mission.checkpoints.length + 1,
        state: 'CHECKPOINTED',
        timestamp: new Date(),
        evidenceHash: checkpointHash,
      };
      mission.checkpoints.push(checkpointRecord);
      mission.state = 'CHECKPOINTED';
      mission.updatedAt = new Date();

      this.addNotification(mission.envelope.conversationId, {
        missionId,
        type: 'CHECKPOINT',
        message: `Hito completado en misión "${mission.title}": ${subtask.description}. Checkpoint registrado (#${checkpointRecord.stepIndex}).`,
        timestamp: new Date(),
      });

      // Si todas las subtareas concluyeron con éxito, finalizar la misión
      const allCompleted = mission.subtasks.every((s) => s.status === 'completed');
      if (allCompleted) {
        mission.state = 'COMPLETED';
        mission.finalEvidence = {
          totalSteps: mission.subtasks.length,
          checkpointsCount: mission.checkpoints.length,
          lastHash: checkpointHash,
        };

        this.addNotification(mission.envelope.conversationId, {
          missionId,
          type: 'FINISHED',
          message: `Misión "${mission.title}" COMPLETADA con éxito (${mission.subtasks.length}/${mission.subtasks.length} tareas verificadas).`,
          timestamp: new Date(),
        });
      }

      return subtask;
    } catch (err: any) {
      subtask.status = 'failed';
      mission.state = 'FAILED';
      mission.error = err.message;

      this.addNotification(mission.envelope.conversationId, {
        missionId,
        type: 'STEP_FAILED',
        message: `Error de ejecución en misión "${mission.title}": ${err.message}`,
        timestamp: new Date(),
      });
      return subtask;
    }
  }

  /**
   * Reanuda una misión interrumpida desde su último checkpoint verificado
   */
  resumeFromCheckpoint(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.checkpoints.length === 0) {
      return false;
    }

    // Revertir subtareas incompletas a pending
    for (const subtask of mission.subtasks) {
      if (subtask.status !== 'completed') {
        subtask.status = 'pending';
      }
    }

    mission.state = 'CHECKPOINTED';
    mission.error = undefined;
    mission.updatedAt = new Date();

    this.addNotification(mission.envelope.conversationId, {
      missionId,
      type: 'STARTED',
      message: `Misión "${mission.title}" reanudada exitosamente desde el checkpoint #${mission.checkpoints.length}.`,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Recupera y consume las notificaciones pendientes para un hilo de diálogo
   */
  drainNotificationsForConversation(conversationId: string): MissionEventNotification[] {
    const pending = this.notifications.get(conversationId) || [];
    this.notifications.set(conversationId, []);
    return pending;
  }

  private addNotification(conversationId: string, notif: MissionEventNotification): void {
    const current = this.notifications.get(conversationId) || [];
    current.push(notif);
    this.notifications.set(conversationId, current);
  }

  private calculateCheckpointHash(mission: MissionDefinition): string {
    const payload = JSON.stringify({
      id: mission.id,
      subtasksCompleted: mission.subtasks.filter((s) => s.status === 'completed'),
      timestamp: Date.now(),
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}
