import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Pregunta } from '@prisma/client';

export interface IPreguntasRepository {
  create(texto: string, respuesta: string): Promise<Pregunta>;
  findAll(): Promise<Pregunta[]>;
  findRelevant(texto: string, limit?: number): Promise<Pregunta[]>;
}

@Injectable()
export class PreguntasRepository implements IPreguntasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(texto: string, respuesta: string): Promise<Pregunta> {
    return this.prisma.pregunta.create({
      data: { texto, respuesta },
    });
  }

  async findAll(): Promise<Pregunta[]> {
    return this.prisma.pregunta.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRelevant(texto: string, limit: number = 5): Promise<Pregunta[]> {
    const terms = Array.from(
      new Set(
        texto
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .map((term) => term.trim())
          .filter((term) => term.length >= 4),
      ),
    ).slice(0, 8);

    if (terms.length === 0) {
      return this.prisma.pregunta.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    const matches = await this.prisma.pregunta.findMany({
      where: {
        OR: terms.map((term) => ({
          texto: {
            contains: term,
            mode: 'insensitive',
          },
        })),
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    });

    if (matches.length > 0) {
      return matches.slice(0, limit);
    }

    return this.prisma.pregunta.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
