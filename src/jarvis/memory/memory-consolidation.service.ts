import { Injectable, Logger, Optional } from '@nestjs/common';
import { EntityGraphRepository } from '../repositories/entity-graph.repository';
import { MemoryRepository } from '../repositories/memory.repository';
import { TripartiteMemoryService } from './tripartite-memory.service';
import { WorkingMemoryService } from './working-memory.service';

export interface SleepConsolidationOptions {
  dryRun?: boolean;
  sessionId?: string;
  similarityThreshold?: number; // default 0.90
  staleDaysThreshold?: number; // default 30
  promoteWorkingSalienceThreshold?: number; // default 0.85
  reason?: 'on_demand_endpoint' | 'inactivity_detected' | 'agent_tool';
}

export interface SupersededDecisionRecord {
  olderMemoryId: number;
  newerMemoryId: number;
  topicKey: string;
  olderContent: string;
  newerContent: string;
  supersededAt: string;
}

export interface SleepConsolidationReport {
  timestamp: string;
  dryRun: boolean;
  triggerReason: string;
  durationMs: number;
  workingMemory: {
    expiredPruned: number;
    promotedToEpisodic: number;
  };
  episodicMemory: {
    scannedCount: number;
    duplicatesMerged: number;
    removedMemoryIds: number[];
    decisionsSuperseded: SupersededDecisionRecord[];
    staleDecayedCount: number;
  };
  epistemicAudit: {
    pendingHypothesesScanned: number;
    hypothesesPreservedInQuarantine: number;
    autoPromotedToFact: number; // Siempre 0 por salvaguarda epistémica
    invariantEnforced: string;
  };
}

/**
 * MemoryConsolidationService — Rutina 'sleep' de mantenimiento, consolidación y calibración epistémica.
 *
 * Inspirada en la herramienta sleep de Mnemosyne (Agente DSH), llevada un paso más allá para JarBees:
 * - Invocable por demanda (endpoint POST /jarbees/memory/sleep o comando/tool cuando se detecta inactividad).
 * - Deduplica recuerdos episódicos redundantes.
 * - Detecta decisiones que cambiaron (DECISION_SUPERSEDED) preservando la trazabilidad histórica sin borrar el origen.
 * - Aplica decaimiento temporal a recuerdos obsoletos.
 * - SALVAGUARDA EPISTÉMICA ESTRICTA: Jamás transforma automáticamente una hipótesis (PendingRelation)
 *   en un hecho confirmado (KnowledgeRelation) durante una consolidación desatendida.
 */
@Injectable()
export class MemoryConsolidationService {
  private readonly logger = new Logger(MemoryConsolidationService.name);
  private lastSleepReport: SleepConsolidationReport | null = null;

  constructor(
    private readonly workingMemory: WorkingMemoryService,
    private readonly tripartiteMemory: TripartiteMemoryService,
    @Optional() private readonly memoryRepo?: MemoryRepository,
    @Optional() private readonly entityGraphRepo?: EntityGraphRepository,
  ) {}

  getLastSleepReport(): SleepConsolidationReport | null {
    return this.lastSleepReport;
  }

  /**
   * Ejecuta un ciclo completo de consolidación 'sleep' bajo demanda.
   */
  async executeSleepCycle(
    options: SleepConsolidationOptions = {},
  ): Promise<SleepConsolidationReport> {
    const startMs = Date.now();
    const dryRun = options.dryRun === true;
    const similarityThreshold = options.similarityThreshold ?? 0.9;
    const staleDaysThreshold = options.staleDaysThreshold ?? 30;
    const promoteSalience = options.promoteWorkingSalienceThreshold ?? 0.85;
    const triggerReason = options.reason ?? 'on_demand_endpoint';

    // 1. Limpieza de Working Memory y promoción de ítems de alta relevancia
    const expiredPruned = dryRun ? 0 : this.workingMemory.pruneExpired(startMs);
    const activeWorking = options.sessionId
      ? this.workingMemory.listActive(options.sessionId, startMs)
      : this.workingMemory.listAllActive(startMs);

    let promotedToEpisodic = 0;
    if (this.memoryRepo) {
      const existingMemories = await this.memoryRepo.findAll();
      for (const wm of activeWorking) {
        if (wm.salience >= promoteSalience && wm.accessCount >= 2) {
          const alreadyExists = existingMemories.some(
            (em) =>
              this.tripartiteMemory.computeCharacterTrigramSimilarity(
                em.content,
                wm.content,
              ) >= similarityThreshold,
          );
          if (!alreadyExists) {
            promotedToEpisodic += 1;
            if (!dryRun) {
              await this.memoryRepo.create({
                content: wm.content,
                category: wm.tags[0] || 'working_promoted',
                importance: Math.max(1, Math.round(wm.salience * 5)),
              });
            }
          }
        }
      }
    }

    // 2. Deduplicación Episódica, Detección de Contradicciones (DECISION_SUPERSEDED) y Decay Temporal
    let scannedCount = 0;
    let duplicatesMerged = 0;
    const removedMemoryIds: number[] = [];
    const decisionsSuperseded: SupersededDecisionRecord[] = [];
    let staleDecayedCount = 0;

    if (this.memoryRepo) {
      const allMemories = await this.memoryRepo.findAll();
      scannedCount = allMemories.length;

      // Ordenar por fecha de actualización descendente (más recientes primero)
      const sortedByRecency = [...allMemories].sort((a, b) => {
        const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : a.id;
        const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : b.id;
        return tB - tA;
      });

      const removedSet = new Set<number>();

      for (let i = 0; i < sortedByRecency.length; i++) {
        const newer = sortedByRecency[i];
        if (removedSet.has(newer.id)) continue;

        for (let j = i + 1; j < sortedByRecency.length; j++) {
          const older = sortedByRecency[j];
          if (removedSet.has(older.id)) continue;
          if (older.category !== newer.category) continue;

          const sim = this.tripartiteMemory.computeCharacterTrigramSimilarity(
            newer.content,
            older.content,
          );

          // 2a. Duplicados casi idénticos
          if (sim >= similarityThreshold && !this.hasOpposingPolarity(newer.content, older.content)) {
            duplicatesMerged += 1;
            removedSet.add(older.id);
            removedMemoryIds.push(older.id);
            if (!dryRun) {
              const boostedImportance = Math.min(
                10,
                Math.max(newer.importance || 1, older.importance || 1) + 1,
              );
              await this.memoryRepo.update(newer.id, {
                importance: boostedImportance,
              });
              await this.memoryRepo.delete(older.id);
            }
            continue;
          }

          // 2b. Detección de decisiones cambiadas o contradictorias (mismo tema, polaridad opuesta o directiva actualizada)
          if (
            !older.content.startsWith('[DECISION_SUPERSEDED') &&
            !newer.content.startsWith('[DECISION_SUPERSEDED')
          ) {
            const contradiction = this.detectDecisionContradiction(
              newer.content,
              older.content,
            );
            if (contradiction.isContradiction) {
              const supersededAt = new Date(startMs).toISOString();
              decisionsSuperseded.push({
                olderMemoryId: older.id,
                newerMemoryId: newer.id,
                topicKey: contradiction.topicKey,
                olderContent: older.content,
                newerContent: newer.content,
                supersededAt,
              });

              if (!dryRun) {
                const taggedContent = `[DECISION_SUPERSEDED by #${newer.id} at ${supersededAt}] ${older.content}`;
                await this.memoryRepo.update(older.id, {
                  content: taggedContent,
                  importance: 1,
                });
              }
            }
          }
        }
      }

      // 2c. Decaimiento temporal de recuerdos obsoletos no accedidos
      const staleCutoffMs = startMs - staleDaysThreshold * 24 * 60 * 60 * 1000;
      for (const mem of sortedByRecency) {
        if (removedSet.has(mem.id)) continue;
        const lastAccessMs = mem.lastAccessed
          ? new Date(mem.lastAccessed).getTime()
          : startMs;
        if (lastAccessMs < staleCutoffMs && (mem.importance ?? 1) > 1) {
          staleDecayedCount += 1;
          if (!dryRun) {
            await this.memoryRepo.update(mem.id, {
              importance: Math.max(1, (mem.importance ?? 2) - 1),
            });
          }
        }
      }
    }

    // 3. Auditoría Epistémica sobre Hipótesis en Cuarentena (PendingRelation)
    let pendingHypothesesScanned = 0;
    if (this.entityGraphRepo) {
      try {
        const pendingList = await this.entityGraphRepo.listPending('PENDING');
        pendingHypothesesScanned = pendingList.length;
      } catch {
        pendingHypothesesScanned = 0;
      }
    }

    const report: SleepConsolidationReport = {
      timestamp: new Date().toISOString(),
      dryRun,
      triggerReason,
      durationMs: Math.max(1, Date.now() - startMs),
      workingMemory: {
        expiredPruned,
        promotedToEpisodic,
      },
      episodicMemory: {
        scannedCount,
        duplicatesMerged,
        removedMemoryIds,
        decisionsSuperseded,
        staleDecayedCount,
      },
      epistemicAudit: {
        pendingHypothesesScanned,
        hypothesesPreservedInQuarantine: pendingHypothesesScanned,
        autoPromotedToFact: 0,
        invariantEnforced:
          'EPISTEMIC_GUARDRAIL_ACTIVE: Ninguna hipótesis en PendingRelation fue promovida automáticamente a hecho durante sleep.',
      },
    };

    this.lastSleepReport = report;
    return report;
  }

  /**
   * Detecta si dos enunciados comparten el mismo sujeto/concepto técnico pero expresan
   * decisiones contrapuestas (ej. activar vs desactivar, usar X vs no usar X).
   */
  private detectDecisionContradiction(
    newerText: string,
    olderText: string,
  ): { isContradiction: boolean; topicKey: string } {
    const tokensNew = this.extractSignificantTokens(newerText);
    const tokensOld = this.extractSignificantTokens(olderText);

    const shared = tokensNew.filter((t) => tokensOld.includes(t));
    if (shared.length < 2) {
      return { isContradiction: false, topicKey: '' };
    }

    const opposing = this.hasOpposingPolarity(newerText, olderText);
    const substitution = this.hasSubstitutionIntent(newerText, olderText);

    if (!opposing && !substitution) {
      return { isContradiction: false, topicKey: '' };
    }

    return {
      isContradiction: true,
      topicKey: shared.slice(0, 3).join('_'),
    };
  }

  private hasSubstitutionIntent(newerText: string, _olderText: string): boolean {
    const subPattern =
      /(?:en lugar de|en vez de|reemplaz(?:ar|a|ando|ado)?|sustitu(?:ir|ye|yendo)?|migra(?:r|ndo|cion|ción)?|cambiar(?:\s+\w+)?\s+por|depreca(?:r|ndo|do)?)/i;
    return subPattern.test(newerText);
  }

  private hasOpposingPolarity(a: string, b: string): boolean {
    const negPattern =
      /\b(no|nunca|jamás|jamas|desactivar|deshabilitar|false|prohibido|evitar|descartar)\b/i;
    const posPattern =
      /\b(sí|si|siempre|activar|habilitar|true|obligatorio|usar|adoptar)\b/i;

    const aHasNeg = negPattern.test(a);
    const bHasNeg = negPattern.test(b);
    const aHasPos = posPattern.test(a);
    const bHasPos = posPattern.test(b);

    return (aHasNeg && !bHasNeg && bHasPos) || (!aHasNeg && aHasPos && bHasNeg);
  }

  private extractSignificantTokens(text: string): string[] {
    const stopWords = new Set([
      'no',
      'si',
      'sí',
      'el',
      'la',
      'los',
      'las',
      'de',
      'del',
      'en',
      'por',
      'para',
      'con',
      'sin',
      'usar',
      'activar',
      'desactivar',
      'habilitar',
      'deshabilitar',
      'true',
      'false',
      'nunca',
      'siempre',
      'debe',
      'como',
      'este',
      'esta',
    ]);

    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9_.-]+/)
      .filter((t) => t.length >= 3 && !stopWords.has(t));
  }
}

