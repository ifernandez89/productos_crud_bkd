import { Injectable, Optional } from '@nestjs/common';
import { CapabilityRegistryService } from '../config/capability-registry.service';
import { JarvisIdentityService } from '../config/jarvis-identity.service';
import { TelemetryInspectionService } from '../llm/telemetry-inspection.service';
import { TripartiteMemoryService } from '../memory/tripartite-memory.service';
import { UserProfileRepository } from '../repositories/user-profile.repository';

export interface CoreContextProfileInput {
  name?: string | null;
  country?: string | null;
  language?: string | null;
  timezone?: string | null;
}

export interface CoreContextResult {
  markdown: string;
  lineCount: number;
  maxLinesLimit: 25;
  estimatedTokens: number;
  activeCapabilities: string[];
  degradedCapabilities: string[];
  unavailableCapabilities: string[];
}

/**
 * CoreContextService — Política de selección de contexto permanente ultra-compacto (máximo 25 líneas).
 *
 * Inspirado en el diseño de ~/.dsh/AGENTS.md (Agente DSH), implementado nativamente en JarBees:
 * - Conserva únicamente: identidad estable, perfil del usuario, reglas permanentes,
 *   política de autonomía/HITL, capacidades reales detectadas y estado resumido de memoria/presupuesto.
 * - Garantiza por contrato estricto un límite máximo de 25 líneas para evitar inflar el prompt.
 */
@Injectable()
export class CoreContextService {
  public static readonly MAX_LINES = 25;

  constructor(
    @Optional() private readonly userProfileRepo?: UserProfileRepository,
    @Optional() private readonly identityService?: JarvisIdentityService,
    @Optional()
    private readonly capabilityRegistry?: CapabilityRegistryService,
    @Optional() private readonly tripartiteMemory?: TripartiteMemoryService,
    @Optional()
    private readonly telemetryInspection?: TelemetryInspectionService,
  ) {}

  async buildCoreContext(options?: {
    sessionId?: string;
    profileOverride?: CoreContextProfileInput;
    mode?: string;
  }): Promise<CoreContextResult> {
    let profile: CoreContextProfileInput = options?.profileOverride ?? {};
    if (!options?.profileOverride && this.userProfileRepo) {
      try {
        profile = await this.userProfileRepo.getOrCreate();
      } catch {
        profile = {};
      }
    }

    const identity = this.identityService?.getIdentity();
    const assistantName = identity?.name || 'JarBees';
    const userName = profile.name || 'Operador';
    const userLang = profile.language || 'es-AR';
    const userTz = profile.timezone || 'America/Argentina/Buenos_Aires';
    const userCountry = profile.country || 'Argentina';

    const capSnapshot = this.capabilityRegistry?.getSnapshot();
    const availableCaps = capSnapshot?.summary.available ?? [
      'LLM_LOCAL_CODER',
      'PGVECTOR_RAG',
      'CODE_VERIFICATION_HARNESS',
    ];
    const degradedCaps = capSnapshot?.summary.degraded ?? [];
    const unavailableCaps = capSnapshot?.summary.unavailable ?? [];

    let workingCount = 0;
    let episodicCount = 0;
    let entitiesCount = 0;
    let pendingHypotheses = 0;

    if (this.tripartiteMemory) {
      try {
        const memStats = await this.tripartiteMemory.getStats();
        workingCount = memStats.working.totalActiveItems;
        episodicCount = memStats.episodicTotal;
        entitiesCount = memStats.associativeEntities;
        pendingHypotheses = memStats.associativePendingHypotheses;
      } catch {
        // Fallback silencioso
      }
    }

    const tokenReport = this.telemetryInspection?.getTokenTelemetryReport();
    const contextTier = tokenReport?.contextEvaluation.tier ?? 'BELOW_2K';
    const contextStatus = tokenReport?.selfRegulation.status ?? 'OPTIMAL';

    const now = new Date();
    const nowYear = now.getFullYear();
    let nowFullDateStr = '';
    let nowTimeStr = '';
    try {
      nowFullDateStr = new Intl.DateTimeFormat('es-AR', {
        timeZone: userTz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(now);
      nowTimeStr = new Intl.DateTimeFormat('es-AR', {
        timeZone: userTz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);
    } catch {
      nowFullDateStr = now.toDateString();
      nowTimeStr = now.toTimeString().slice(0, 5);
    }

    const rawLines: string[] = [
      `# ${assistantName} CoreContext (Max 25 Lines)`,
      `- Identidad: ${assistantName} | Orquestador técnico multidisciplinario y especialista de ingeniería.`,
      `- Usuario: ${userName} | País: ${userCountry} | Idioma: ${userLang} | Zona: ${userTz}`,
      `- Anclaje Temporal: ${nowFullDateStr}, ${nowTimeStr} hs (${userTz}) | Año Oficial: ${nowYear}`,
      `- Modo Activo: ${options?.mode || 'auto'}`,
      `## Reglas Permanentes e Invariantes`,
      `- Comunicación: Directa, concisa, técnica y estructurada en GitHub Markdown.`,
      `- Anclaje Temporal: Año en curso ${nowYear}. Usar SIEMPRE la Fecha Oficial; jamás alucinar cortes pasados (2023/2024).`,
      `- Honestidad Epistémica: Jamás inventar hechos, fuentes, métricas ni salidas de herramientas.`,
      `- Separación Hipótesis/Hecho: Ninguna hipótesis pasa a hecho sin evidencia verificada (sourceDocId/quote).`,
      `- Código e Ingeniería: Validar sintaxis AST, contratos exportados y tests aislados antes de concluir.`,
      `## Autonomía y Gobernanza (HITL)`,
      `- Aprobación Humana Obligatoria (HITL): Requerida antes de integrar cambios al workspace o acciones sensibles.`,
      `- Confinamiento: Prohibido modificar verification/**, security/** o archivos .env* sin token criptográfico.`,
      `- Rollback: Restaurar automáticamente el mejor checkpoint físico (SHA-256) ante regresiones de score.`,
      `## Capacidades Reales Detectadas (CapabilityRegistry)`,
      `- Operativas (AVAILABLE): ${availableCaps.length > 0 ? availableCaps.join(', ') : 'ninguna'}`,
      `- Degradadas (DEGRADED): ${degradedCaps.length > 0 ? degradedCaps.join(', ') : 'ninguna'}`,
      `- No Disponibles (UNAVAILABLE): ${unavailableCaps.length > 0 ? unavailableCaps.join(', ') : 'ninguna'}`,
      `- Regla de Ruteo: No planificar ni invocar herramientas marcadas como UNAVAILABLE.`,
      `## Estado de Memoria Tripartita y Presupuesto`,
      `- Working Memory (TTL): ${workingCount} ítems activos | Episodic Memory: ${episodicCount} recuerdos`,
      `- Associative TripleStore: ${entitiesCount} entidades | Hipótesis en cuarentena: ${pendingHypotheses}`,
      `- Presupuesto de Contexto: Escalón ${contextTier} (${contextStatus}) | Auto-inspección: telemetry_inspection`,
    ];

    const boundedLines = rawLines.slice(0, CoreContextService.MAX_LINES);
    const markdown = boundedLines.join('\n');
    const estimatedTokens = Math.ceil(markdown.length / 3.8);

    return {
      markdown,
      lineCount: boundedLines.length,
      maxLinesLimit: CoreContextService.MAX_LINES,
      estimatedTokens,
      activeCapabilities: availableCaps,
      degradedCapabilities: degradedCaps,
      unavailableCapabilities: unavailableCaps,
    };
  }
}

