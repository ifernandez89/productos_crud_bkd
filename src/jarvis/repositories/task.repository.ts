import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createTask(data: { sessionId?: string; objective: string; status?: string; priority?: string; category?: string; project?: string }) {
    return this.prisma.task.create({
      data: {
        sessionId: data.sessionId,
        objective: data.objective,
        status: data.status ?? 'in_progress',
        priority: data.priority ?? 'normal',
        category: data.category,
        project: data.project,
      },
    });
  }

  async createTaskSteps(taskId: number, steps: Array<{ stepNumber: number; description: string }>) {
    return this.prisma.taskStep.createMany({
      data: steps.map((s) => ({
        taskId,
        stepNumber: s.stepNumber,
        description: s.description,
        status: 'pending',
      })),
    });
  }

  async getTaskWithSteps(taskId: number) {
    return this.prisma.task.findUnique({
      where: { id: taskId },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });
  }

  async updateTaskStatus(taskId: number, status: string, result?: string) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { status, result },
    });
  }

  async updateTaskObjective(taskId: number, objective: string) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { objective },
    });
  }

  async deleteTask(taskId: number) {
    return this.prisma.task.delete({ where: { id: taskId } });
  }

  async clearPendingTasks(sessionId?: string) {
    return this.prisma.task.deleteMany({
      where: {
        status: 'pending',
        ...(sessionId ? { sessionId } : {}),
      },
    });
  }

  async findPendingTasks(sessionId?: string) {
    return this.prisma.task.findMany({
      where: {
        status: 'pending',
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateStepStatus(stepId: number, status: string, result?: string) {
    return this.prisma.taskStep.update({
      where: { id: stepId },
      data: { status, result },
    });
  }
}
