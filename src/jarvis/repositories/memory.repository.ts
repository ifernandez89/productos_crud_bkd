import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Memory } from '@prisma/client';

export interface CreateMemoryData {
  content: string;
  category: string;
  importance?: number;
}

@Injectable()
export class MemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateMemoryData): Promise<Memory> {
    return this.prisma.memory.create({
      data: {
        content: data.content,
        category: data.category,
        importance: data.importance ?? 1,
      },
    });
  }

  async update(id: number, data: Partial<CreateMemoryData>): Promise<Memory> {
    return this.prisma.memory.update({
      where: { id },
      data: {
        ...data,
        lastAccessed: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async get(id: number): Promise<Memory | null> {
    const memory = await this.prisma.memory.findUnique({ where: { id } });
    if (memory) {
      // Actualizar lastAccessed al recuperar
      await this.prisma.memory.update({
        where: { id },
        data: { lastAccessed: new Date() },
      });
    }
    return memory;
  }

  async getByCategory(category: string, limit = 10): Promise<Memory[]> {
    return this.prisma.memory.findMany({
      where: { category },
      orderBy: [{ importance: 'desc' }, { lastAccessed: 'desc' }],
      take: limit,
    });
  }

  async getTopImportant(limit = 5): Promise<Memory[]> {
    return this.prisma.memory.findMany({
      orderBy: [{ importance: 'desc' }, { lastAccessed: 'desc' }],
      take: limit,
    });
  }

  async search(query: string, limit = 5): Promise<Memory[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    if (terms.length === 0) return this.getTopImportant(limit);

    return this.prisma.memory.findMany({
      where: {
        OR: terms.map((term) => ({
          content: { contains: term, mode: 'insensitive' },
        })),
      },
      orderBy: [{ importance: 'desc' }, { lastAccessed: 'desc' }],
      take: limit,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.memory.delete({ where: { id } });
  }

  async findAll(): Promise<Memory[]> {
    return this.prisma.memory.findMany({
      orderBy: [{ importance: 'desc' }, { category: 'asc' }],
    });
  }
}
