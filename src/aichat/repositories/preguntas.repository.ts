import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Pregunta } from '@prisma/client';

export interface CreatePreguntaData {
  texto: string;
  respuesta?: string;
  estado?: string;
  errorMessage?: string | null;
  errorStatus?: number | null;
}

export interface IPreguntasRepository {
  create(data: CreatePreguntaData): Promise<Pregunta>;
  findAll(): Promise<Pregunta[]>;
  findRelevant(texto: string, limit?: number): Promise<Pregunta[]>;
}

@Injectable()
export class PreguntasRepository implements IPreguntasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePreguntaData): Promise<Pregunta> {
    return this.prisma.pregunta.create({
      data: {
        texto: data.texto,
        respuesta: data.respuesta ?? '',
        estado: data.estado ?? 'success',
        errorMessage: data.errorMessage ?? null,
        errorStatus: data.errorStatus ?? null,
      },
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
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .split(/[^\p{L}\p{N}]+/u)
          .map((term) => term.trim())
          .filter((term) => term.length >= 4),
      ),
    ).slice(0, 8);

    if (terms.length === 0) {
      return this.prisma.pregunta.findMany({
        where: { estado: 'success' },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    // Busca en texto Y en respuesta, solo registros exitosos
    const matches = await this.prisma.pregunta.findMany({
      where: {
        estado: 'success',
        respuesta: { not: '' },
        OR: terms.flatMap((term) => [
          { texto: { contains: term, mode: 'insensitive' as const } },
          { respuesta: { contains: term, mode: 'insensitive' as const } },
        ]),
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 4, // traer más para poder rankear
    });

    if (matches.length === 0) {
      // Fallback: últimas preguntas exitosas
      return this.prisma.pregunta.findMany({
        where: { estado: 'success', respuesta: { not: '' } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    // Rankear por cantidad de términos que coinciden (texto tiene más peso que respuesta)
    const scored = matches.map((m) => {
      const textoNorm = m.texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const respNorm = m.respuesta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const score = terms.reduce((acc, term) => {
        if (textoNorm.includes(term)) acc += 2;   // coincidencia en pregunta vale doble
        if (respNorm.includes(term)) acc += 1;
        return acc;
      }, 0);
      return { record: m, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.record);
  }
}
