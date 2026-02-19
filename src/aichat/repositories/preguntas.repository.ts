import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Pregunta } from '@prisma/client';

export interface IPreguntasRepository {
  create(texto: string, respuesta: string): Promise<Pregunta>;
  findAll(): Promise<Pregunta[]>;
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
}
