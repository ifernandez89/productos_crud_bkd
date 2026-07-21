import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConceptActivation {
  concept: string;
  activation: number;
  tags: string[];
  isEntangled?: boolean;
}

@Injectable()
export class CognitiveFieldService {
  private readonly logger = new Logger(CognitiveFieldService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extrae conceptos clave del texto, los activa y busca conceptos entrelazados (QICA 2.0).
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
    const activatedConceptsList: string[] = [];

    for (const item of extracted) {
      try {
        activatedConceptsList.push(item.concept);
        const existing = await this.prisma.cognitiveState.findFirst({
          where: { sessionId, concept: item.concept },
        });

        if (existing) {
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

    // ── QICA 2.0: Entrelazamiento Cognitivo & Co-activación No-Local ───────────
    await this.processEntanglement(sessionId, activatedConceptsList, updatedState);

    // ── QICA 2.0: Decoherencia y Olvido Inteligente Avanzado ─────────────────
    await this.applyAdvancedDecoherence(sessionId);

    return updatedState;
  }

  /**
   * QICA 2.0: Busca conceptos entrelazados en la base de datos y los co-activa automáticamente.
   */
  private async processEntanglement(
    sessionId: string,
    activeConcepts: string[],
    updatedState: ConceptActivation[],
  ): Promise<void> {
    if (activeConcepts.length === 0) return;

    try {
      // 1. Reforzar el entrelazamiento entre pares de conceptos activados juntos
      for (let i = 0; i < activeConcepts.length; i++) {
        for (let j = i + 1; j < activeConcepts.length; j++) {
          const cA = activeConcepts[i] < activeConcepts[j] ? activeConcepts[i] : activeConcepts[j];
          const cB = activeConcepts[i] < activeConcepts[j] ? activeConcepts[j] : activeConcepts[i];

          const existingEnt = await this.prisma.cognitiveEntanglement.findUnique({
            where: { conceptA_conceptB: { conceptA: cA, conceptB: cB } },
          });

          if (existingEnt) {
            await this.prisma.cognitiveEntanglement.update({
              where: { id: existingEnt.id },
              data: {
                correlationStrength: Math.min(1.0, existingEnt.correlationStrength + 0.05),
                interactionCount: existingEnt.interactionCount + 1,
                lastCoActivatedAt: new Date(),
              },
            });
          } else {
            await this.prisma.cognitiveEntanglement.create({
              data: {
                conceptA: cA,
                conceptB: cB,
                correlationStrength: 0.5,
                interactionCount: 1,
              },
            });
          }
        }
      }

      // 2. Co-activar conceptos no-locales entrelazados con los activos
      const entanglements = await this.prisma.cognitiveEntanglement.findMany({
        where: {
          OR: [
            { conceptA: { in: activeConcepts } },
            { conceptB: { in: activeConcepts } },
          ],
          correlationStrength: { gte: 0.4 },
        },
        orderBy: { correlationStrength: 'desc' },
        take: 5,
      });

      for (const ent of entanglements) {
        const targetConcept = activeConcepts.includes(ent.conceptA) ? ent.conceptB : ent.conceptA;
        if (!updatedState.some((s) => s.concept === targetConcept)) {
          const boost = ent.correlationStrength * 0.4;
          updatedState.push({
            concept: targetConcept,
            activation: Math.min(1.0, boost),
            tags: ['entrelazado'],
            isEntangled: true,
          });
          this.logger.log(
            `[QICA:Entrelazamiento] Co-activado "${targetConcept}" por relación con impulso ${boost.toFixed(2)}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error en procesamiento de entrelazamiento: ${err.message}`);
    }
  }

  /**
   * QICA 2.0: Decoherencia y Olvido Inteligente Avanzado
   * Formula: activation = (recency * importance * utility) - noise
   */
  async applyAdvancedDecoherence(sessionId: string): Promise<void> {
    try {
      const states = await this.prisma.cognitiveState.findMany({
        where: { sessionId, activation: { gt: 0.05 } },
      });

      const now = Date.now();
      for (const state of states) {
        const elapsedHours = (now - state.lastActivatedAt.getTime()) / (1000 * 3600);
        
        // Ponderación de recencia (0.0 a 1.0)
        const recency = Math.exp(-0.1 * elapsedHours);
        const importance = 0.8;
        const utility = state.activation;
        const environmentalNoise = 0.02 * elapsedHours;

        const newActivation = Math.max(0.0, recency * importance * utility - environmentalNoise);

        if (Math.abs(newActivation - state.activation) > 0.02) {
          await this.prisma.cognitiveState.update({
            where: { id: state.id },
            data: { activation: newActivation },
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error aplicando decoherencia avanzada en sesión ${sessionId}: ${err.message}`);
    }
  }

  /**
   * Recupera el campo de activación actual ordenado por relevancia.
   */
  async getActiveField(sessionId: string, limit = 10): Promise<ConceptActivation[]> {
    try {
      const states = await this.prisma.cognitiveState.findMany({
        where: { sessionId, activation: { gte: 0.15 } },
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

    const lines = active.map((a) => {
      const tagLabel = a.isEntangled ? ' (⚡ entrelazado)' : '';
      return `- ${a.concept}${tagLabel} (activación: ${(a.activation * 100).toFixed(0)}%)`;
    });

    return `\n=== CAMPO COGNITIVO Y GRAFO ENTRELAZADO (Foco dinámico) ===\n${lines.join('\n')}\n`;
  }

  // ── Métodos Auxiliares ──────────────────────────────────────────────────────

  private extractCandidateConcepts(text: string): Array<{ concept: string; tags: string[] }> {
    const textLower = text.toLowerCase();
    const candidates: Array<{ concept: string; tags: string[] }> = [];

    const techKeywords = [
      'nestjs', 'prisma', 'postgresql', 'pgvector', 'ollama', 'qwen', 'gemma',
      'typescript', 'javascript', 'docker', 'playwright', 'rag', 'embeddings',
      'arquitectura', 'microservicios', 'seguridad', 'balance', 'astrologia',
      'conciencia', 'autonomia', 'agentes', 'inteligencia', 'entrelazamiento',
    ];

    for (const kw of techKeywords) {
      if (textLower.includes(kw)) {
        candidates.push({ concept: kw, tags: ['técnico', 'dominio'] });
      }
    }

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
