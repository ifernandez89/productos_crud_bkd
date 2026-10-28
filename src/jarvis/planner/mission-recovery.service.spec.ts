import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MissionCheckpointService, MissionCheckpoint } from './mission-checkpoint.service';
import { MissionRecoveryService } from './mission-recovery.service';
import { ExecutionEngine } from './execution-engine.service';
import { TaskRepository } from '../repositories/task.repository';

describe('MissionCheckpointService & MissionRecoveryService', () => {
  let checkpointService: MissionCheckpointService;
  let recoveryService: MissionRecoveryService;
  let mockTaskRepo: Partial<Record<keyof TaskRepository, jest.Mock>>;
  let mockExecutionEngine: Partial<Record<keyof ExecutionEngine, jest.Mock>>;

  const testCheckpointDir = path.resolve(process.cwd(), 'storage', 'checkpoints');
  const sampleTaskId = 99999;

  beforeEach(async () => {
    mockTaskRepo = {
      findTasksByStatus: jest.fn(),
      findAllInProgressOrRecoverable: jest.fn(),
      getTaskWithSteps: jest.fn(),
      updateTaskStatus: jest.fn(),
      updateStepStatus: jest.fn(),
    };

    mockExecutionEngine = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissionCheckpointService,
        MissionRecoveryService,
        { provide: TaskRepository, useValue: mockTaskRepo },
        { provide: ExecutionEngine, useValue: mockExecutionEngine },
      ],
    }).compile();

    checkpointService = module.get<MissionCheckpointService>(MissionCheckpointService);
    recoveryService = module.get<MissionRecoveryService>(MissionRecoveryService);
  });

  afterEach(() => {
    // Limpieza de archivos de prueba
    checkpointService.deleteCheckpoint(sampleTaskId);
  });

  describe('MissionCheckpointService (Incremental Disk Persistence)', () => {
    it('debe persistir un checkpoint en disco de forma atómica y recuperarlo', () => {
      const checkpoint: MissionCheckpoint = {
        taskId: sampleTaskId,
        objective: 'Investigar arquitectura resiliente',
        status: 'in_progress',
        currentStepIndex: 1,
        totalSteps: 3,
        completedSteps: [
          {
            stepNumber: 1,
            type: 'search',
            description: 'Buscar documentación',
            output: 'Resultados encontrados',
            completedAt: new Date().toISOString(),
          },
        ],
        accumulatedContext: ['[search] Resultados encontrados'],
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      checkpointService.saveCheckpoint(checkpoint);

      const loaded = checkpointService.loadCheckpoint(sampleTaskId);
      expect(loaded).toBeDefined();
      expect(loaded?.taskId).toBe(sampleTaskId);
      expect(loaded?.completedSteps).toHaveLength(1);
      expect(loaded?.accumulatedContext[0]).toContain('Resultados encontrados');
    });

    it('debe retornar null cuando un checkpoint no existe en disco', () => {
      const nonExistent = checkpointService.loadCheckpoint(888888);
      expect(nonExistent).toBeNull();
    });

    it('debe listar checkpoints activos presentes en disco', () => {
      const checkpoint: MissionCheckpoint = {
        taskId: sampleTaskId,
        objective: 'Test listado',
        status: 'in_progress',
        currentStepIndex: 0,
        totalSteps: 1,
        completedSteps: [],
        accumulatedContext: [],
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      checkpointService.saveCheckpoint(checkpoint);
      const list = checkpointService.listCheckpoints();
      expect(list.some((c) => c.taskId === sampleTaskId)).toBe(true);
    });

    it('debe eliminar el checkpoint de disco tras finalizar', () => {
      const checkpoint: MissionCheckpoint = {
        taskId: sampleTaskId,
        objective: 'Para borrar',
        status: 'completed',
        currentStepIndex: 1,
        totalSteps: 1,
        completedSteps: [],
        accumulatedContext: [],
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      checkpointService.saveCheckpoint(checkpoint);
      expect(checkpointService.loadCheckpoint(sampleTaskId)).toBeDefined();

      const deleted = checkpointService.deleteCheckpoint(sampleTaskId);
      expect(deleted).toBe(true);
      expect(checkpointService.loadCheckpoint(sampleTaskId)).toBeNull();
    });
  });

  describe('MissionRecoveryService (Crash Recovery & Idempotent Resumption)', () => {
    it('en arranque debe detectar misiones incompletas y marcarlas como waiting_recovery sin re-ejecutar', async () => {
      mockTaskRepo.findTasksByStatus!.mockResolvedValue([
        {
          id: sampleTaskId,
          objective: 'Misión interrumpida',
          status: 'in_progress',
          steps: [
            { id: 1, stepNumber: 1, description: 'Paso 1', status: 'completed' },
            { id: 2, stepNumber: 2, description: 'Paso 2', status: 'pending' },
          ],
        },
      ]);

      await recoveryService.onApplicationBootstrap();

      expect(mockTaskRepo.updateTaskStatus).toHaveBeenCalledWith(
        sampleTaskId,
        'waiting_recovery',
        expect.stringContaining('Progreso preservado: 1/2 pasos completados'),
      );
    });

    it('en arranque debe finalizar tareas huérfanas cuyos pasos ya estaban 100% completados', async () => {
      mockTaskRepo.findTasksByStatus!.mockResolvedValue([
        {
          id: sampleTaskId,
          objective: 'Misión casi completa',
          status: 'in_progress',
          result: 'Respuesta lista',
          steps: [
            { id: 1, stepNumber: 1, description: 'Paso 1', status: 'completed' },
            { id: 2, stepNumber: 2, description: 'Paso 2', status: 'completed' },
          ],
        },
      ]);

      await recoveryService.onApplicationBootstrap();

      expect(mockTaskRepo.updateTaskStatus).toHaveBeenCalledWith(
        sampleTaskId,
        'completed',
        'Respuesta lista',
      );
    });

    it('resumeMission debe arrojar NotFoundException si la tarea no existe', async () => {
      mockTaskRepo.getTaskWithSteps!.mockResolvedValue(null);

      await expect(recoveryService.resumeMission(12345)).rejects.toThrow(NotFoundException);
    });

    it('resumeMission debe arrojar BadRequestException si la tarea ya estaba completada', async () => {
      mockTaskRepo.getTaskWithSteps!.mockResolvedValue({
        id: sampleTaskId,
        status: 'completed',
        steps: [],
      });

      await expect(recoveryService.resumeMission(sampleTaskId)).rejects.toThrow(BadRequestException);
    });

    it('resumeMission debe invocar ExecutionEngine delegando la ejecución idempotente', async () => {
      mockTaskRepo.getTaskWithSteps!.mockResolvedValue({
        id: sampleTaskId,
        objective: 'Resumir documento',
        status: 'waiting_recovery',
        steps: [
          { id: 10, stepNumber: 1, description: 'buscar web', status: 'completed', result: 'Datos previos' },
          { id: 11, stepNumber: 2, description: 'resumir datos', status: 'pending' },
        ],
      });

      mockExecutionEngine.execute!.mockResolvedValue({
        taskId: sampleTaskId,
        objective: 'Resumir documento',
        answer: 'Resumen final generado',
        stepsCompleted: 2,
        stepsFailed: 0,
      });

      const res = await recoveryService.resumeMission(sampleTaskId);

      expect(mockExecutionEngine.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: sampleTaskId,
          objective: 'Resumir documento',
          steps: expect.arrayContaining([
            expect.objectContaining({ stepNumber: 1, status: 'completed', output: { content: 'Datos previos' } }),
            expect.objectContaining({ stepNumber: 2, status: 'pending' }),
          ]),
        }),
      );
      expect(res.answer).toBe('Resumen final generado');
    });
  });
});
