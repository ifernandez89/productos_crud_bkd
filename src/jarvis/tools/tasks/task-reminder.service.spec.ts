import { Test } from '@nestjs/testing';
import { TaskReminderService } from './task-reminder.service';
import { TaskRepository } from '../../repositories/task.repository';

describe('TaskReminderService', () => {
  let service: TaskReminderService;
  let taskRepo: {
    createTask: jest.Mock;
    findPendingTasks: jest.Mock;
    deleteTask: jest.Mock;
    clearPendingTasks: jest.Mock;
  };

  beforeEach(async () => {
    taskRepo = {
      createTask: jest.fn(),
      findPendingTasks: jest.fn(),
      deleteTask: jest.fn(),
      clearPendingTasks: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TaskReminderService,
        { provide: TaskRepository, useValue: taskRepo },
      ],
    }).compile();

    service = module.get(TaskReminderService);
  });

  it('detects a create-task command and persists it', async () => {
    taskRepo.createTask.mockResolvedValue({ id: 1, objective: 'Comprar pan', status: 'pending' });

    const reply = await service.handleTaskCommand('crea un pendiente: comprar pan', 'session-1');

    expect(taskRepo.createTask).toHaveBeenCalledWith({
      sessionId: 'session-1',
      objective: 'comprar pan',
      status: 'pending',
      priority: 'normal',
      category: 'compras',
      project: undefined,
    });
    expect(reply).toContain('Pendiente guardado');
    expect(reply).toContain('Comprar pan');
  });

  it('detects a natural create command that mentions the pending list', async () => {
    taskRepo.createTask.mockResolvedValue({ id: 2, objective: 'Ir al supermercado el sábado', status: 'pending' });

    const reply = await service.handleTaskCommand('podrías anotar en mi lista de pendientes ir al supermercado el sábado? debo comprar medias y zapatillas', 'session-1');

    expect(taskRepo.createTask).toHaveBeenCalledWith({
      sessionId: 'session-1',
      objective: 'ir al supermercado el sábado? debo comprar medias y zapatillas',
      status: 'pending',
      priority: 'normal',
      category: 'compras',
      project: undefined,
    });
    expect(reply).toContain('Pendiente guardado');
  });

  it('lists pending tasks from the repository', async () => {
    taskRepo.findPendingTasks.mockResolvedValue([
      { id: 1, objective: 'Pagar factura', status: 'pending' },
    ]);

    const reply = await service.handleTaskCommand('lista mis pendientes', 'session-1');

    expect(taskRepo.findPendingTasks).toHaveBeenCalledWith('session-1');
    expect(reply).toContain('Pagar factura');
  });

  it('detects an implicit list request for pending items', async () => {
    taskRepo.findPendingTasks.mockResolvedValue([
      { id: 1, objective: 'Pagar factura', status: 'pending' },
    ]);

    const reply = await service.handleTaskCommand('lista completa de pendientes', 'session-1');

    expect(taskRepo.findPendingTasks).toHaveBeenCalledWith('session-1');
    expect(reply).toContain('Pagar factura');
  });

  it('deletes a specific pending task', async () => {
    taskRepo.findPendingTasks.mockResolvedValue([
      { id: 7, objective: 'Comprar pan', status: 'pending' },
    ]);
    taskRepo.deleteTask.mockResolvedValue({ id: 7 });

    const reply = await service.handleTaskCommand('elimina el pendiente comprar pan', 'session-1');

    expect(taskRepo.deleteTask).toHaveBeenCalledWith(7);
    expect(reply).toContain('Se eliminó');
  });

  it('clears the entire pending list', async () => {
    taskRepo.clearPendingTasks.mockResolvedValue({ count: 2 });

    const reply = await service.handleTaskCommand('limpia toda la lista de pendientes', 'session-1');

    expect(taskRepo.clearPendingTasks).toHaveBeenCalledWith('session-1');
    expect(reply).toContain('Se limpió');
  });
});
