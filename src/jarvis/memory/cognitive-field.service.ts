import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConceptActivation {
  concept: string;
  activation: number;
  tags: string[];
}

@Injectable()
export class CognitiveFieldService {
  private readonly logger = new Logger(CognitiveFieldService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extrae conceptos clave del texto y actualiza su nivel de activación en la sesión.
   */
  async activateConcepts(
    sessionId: string,
    text: string,
    userId?: number,
  ): Promise<ConceptActivation[]> {
    if (!text || text.trim().length === 0) return [];

    const extracted = this.extractCandidateConcepts(text);
    if (extracted.length === 0) return [];

    const now = new Date();
    const updatedState: ConceptActivation[] = [];

    for (const item of extracted) {
      try {
        const existing = await this.prisma.cognitiveState.findFirst({
          where: { sessionId, concept: item.concept },
        });

        if (existing) {
          // Reforzar activación (hasta un máximo de 1.0)
          const newActivation = Math.min(1.0, existing.activation + 0.25);
          const updated = await this.prisma.cognitiveState.update({
            where: { id: existing.id },
            data: {
              activation: newActivation,
              lastActivatedAt: now,
              contextTags: JSON.stringify(item.tags),
            },
          });
          updatedState.push({
            concept: updated.concept,
            activation: updated.activation,
            tags: item.tags,
          });
        } else {
          // Crear nuevo estado conceptual inicial (0.5)
          const created = await this.prisma.cognitiveState.create({
            data: {
              sessionId,
              userId,
              concept: item.concept,
              activation: 0.5,
              decayRate: 0.05,
              contextTags: JSON.stringify(item.tags),
              lastActivatedAt: now,
            },
          });
          updatedState.push({
            concept: created.concept,
            activation: created.activation,
            tags: item.tags,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Error activando concepto "${item.concept}": ${err.message}`);
      }
    }

    // Aplicar decaimiento pasivo a otros conceptos
    await this.applyDecay(sessionId);

    return updatedState;
  }

  /**
   * Aplica decaimiento temporal pasivo a los conceptos de la sesión.
   */
  async applyDecay(sessionId: string): Promise<void> {
    try {
      const states = await this.prisma.cognitiveState.findMany({
        where: { sessionId, activation: { gt: 0.1 } },
      });

      const now = Date.now();
      for (const state of states) {
        const elapsedMinutes = (now - state.lastActivatedAt.getTime()) / (1000 * 60);
        if (elapsedMinutes > 5) {
          const newActivation = Math.max(0.0, state.activation - state.decayRate);
          await this.prisma.cognitiveState.update({
            where: { id: state.id },
            data: { activation: newActivation },
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error aplicando decaimiento en sesión ${sessionId}: ${err.message}`);
    }
  }

  /**
   * Recupera el campo de activación actual ordenado por relevancia.
   */
  async getActiveField(sessionId: string, limit = 8): Promise<ConceptActivation[]> {
    try {
      const states = await this.prisma.cognitiveState.findMany({
        where: { sessionId, activation: { gte: 0.2 } },
        orderBy: { activation: 'desc' },
        take: limit,
      });

      return states.map((s) => ({
        concept: s.concept,
        activation: s.activation,
        tags: this.parseTags(s.contextTags),
      }));
    } catch (err: any) {
      this.logger.warn(`Error recuperando campo activo: ${err.message}`);
      return [];
    }
  }

  /**
   * Formatea el campo cognitivo para ser inyectado como bloque de contexto en el System Prompt.
   */
  async formatFieldForContext(sessionId: string): Promise<string> {
    const active = await this.getActiveField(sessionId);
    if (active.length === 0) return '';

    const lines = active.map(
      (a) => `- ${a.concept} (activación: ${(a.activation * 100).toFixed(0)}%)`,
    );

    return `\n=== CAMPO COGNITIVO ACTIVO (Foco dinámico del usuario) ===\n${lines.join('\n')}\n`;
  }

  // ── Métodos Auxiliares ──────────────────────────────────────────────────────

  private extractCandidateConcepts(text: string): Array<{ concept: string; tags: string[] }> {
    const textLower = text.toLowerCase();
    const candidates: Array<{ concept: string; tags: string[] }> = [];

    const techKeywords = [
      'nestjs', 'prisma', 'postgresql', 'pgvector', 'ollama', 'qwen', 'gemma',
      'typescript', 'javascript', 'docker', 'playwright', 'rag', 'embeddings',
      'arquitectura', 'microservicios', 'seguridad', 'balance', 'astrologia',
    ];

    for (const kw of techKeywords) {
      if (textLower.includes(kw)) {
        candidates.push({ concept: kw, tags: ['técnico', 'dominio'] });
      }
    }

    // Extracción básica de sustantivos clave capitalizados
    const capitalizedWords = text.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]{3,}\b/g) || [];
    for (const word of capitalizedWords) {
      const wLower = word.toLowerCase();
      if (!candidates.some((c) => c.concept === wLower) && wLower.length > 3) {
        candidates.push({ concept: wLower, tags: ['entidad'] });
      }
    }

    return candidates.slice(0, 5);
  }

  private parseTags(tagsJson: string): string[] {
    try {
      return JSON.parse(tagsJson);
    } catch {
      return [];
    }
  }
}
