import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { existsSync } from 'fs';
import { InferenceDiagnosticsService } from '../llm/inference-diagnostics.service';
import { InferenceGatewayService } from '../llm/inference-gateway.service';
import { LlamaCppProvider } from '../llm/llamacpp.provider';
import { OllamaProvider } from '../llm/ollama.provider';
import { CapabilitiesService } from './capabilities.service';

export type CapabilityId =
  | 'LLM_LOCAL_CODER'
  | 'LLM_FALLBACK_OLLAMA'
  | 'PGVECTOR_RAG'
  | 'ISOLATED_TEST_RUNNER'
  | 'CODE_VERIFICATION_HARNESS'
  | 'WEB_BROWSER_SEARCH'
  | 'VISION'
  | 'VOICE'
  | 'KNOWLEDGE_GRAPH';

export type CapabilityStatus = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';

export interface CapabilityEntry {
  id: CapabilityId;
  label: string;
  category: 'inference' | 'memory' | 'verification' | 'tools' | 'multimodal';
  status: CapabilityStatus;
  reason: string;
  lastCheckedAt: string;
  lastChangedAt: string;
  latencyMs?: number;
  metadata?: Record<string, any>;
}

export interface CapabilityChangeEvent {
  capabilityId: CapabilityId;
  previousStatus: CapabilityStatus;
  newStatus: CapabilityStatus;
  reason: string;
  timestamp: string;
}

export interface CapabilityRegistrySnapshot {
  updatedAt: string;
  dryRun: boolean;
  summary: {
    available: CapabilityId[];
    degraded: CapabilityId[];
    unavailable: CapabilityId[];
  };
  capabilities: Record<CapabilityId, CapabilityEntry>;
  recentEvents: CapabilityChangeEvent[];
}

export interface RefreshCapabilitiesOptions {
  dryRun?: boolean;
  probeNetwork?: boolean;
}

/**
 * CapabilityRegistryService — Detección activa y disponibilidad real de capacidades de JarBees.
 *
 * Inspirado en global-agents-refresh de Agente DSH, adaptado a la arquitectura NestJS de JarBees:
 * - Se inicializa al arrancar la aplicación (OnModuleInit).
 * - Se actualiza reactivamente ante eventos de cambio de servicio (notifyServiceChange).
 * - Alimenta a CoreContextService, IntentRouterService y PlannerService para evitar
 *   intentar usar herramientas caídas o inexistentes.
 */
@Injectable()
export class CapabilityRegistryService implements OnModuleInit {
  private readonly logger = new Logger(CapabilityRegistryService.name);
  private readonly entries = new Map<CapabilityId, CapabilityEntry>();
  private readonly recentEvents: CapabilityChangeEvent[] = [];
  private readonly maxEventsHistory = 50;
  private lastUpdatedAt: string = new Date().toISOString();

  constructor(
    @Optional() private readonly capabilitiesConfig?: CapabilitiesService,
    @Optional() private readonly llamaCppProvider?: LlamaCppProvider,
    @Optional() private readonly ollamaProvider?: OllamaProvider,
    @Optional() private readonly inferenceGateway?: InferenceGatewayService,
    @Optional()
    private readonly inferenceDiagnostics?: InferenceDiagnosticsService,
  ) {
    this.initializeBaselineEntries();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.refreshCapabilities({ probeNetwork: false });
    } catch (err: any) {
      this.logger.warn(
        `Sondeo inicial de capacidades completado con advertencias: ${err?.message}`,
      );
    }
  }

  private initializeBaselineEntries(): void {
    const now = new Date().toISOString();
    const staticCaps = this.capabilitiesConfig?.getCapabilities() ?? {
      voice: true,
      memory: true,
      astronomy: true,
      math: true,
      calendar: true,
    };

    const useLlamaCppCoder = process.env.USE_LLAMACPP_CODER === 'true';

    const defaults: CapabilityEntry[] = [
      {
        id: 'LLM_LOCAL_CODER',
        label: 'Qwen2.5-Coder-14B (llama.cpp GPU)',
        category: 'inference',
        status: useLlamaCppCoder ? 'AVAILABLE' : 'DEGRADED',
        reason: useLlamaCppCoder
          ? 'USE_LLAMACPP_CODER activo'
          : 'Modo bajo demanda (USE_LLAMACPP_CODER=false por defecto)',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
      {
        id: 'LLM_FALLBACK_OLLAMA',
        label: 'Ollama Local Fallback',
        category: 'inference',
        status: 'AVAILABLE',
        reason: 'Proveedor de respaldo configurado',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
      {
        id: 'PGVECTOR_RAG',
        label: 'PostgreSQL + pgvector + bge-m3 RAG',
        category: 'memory',
        status: staticCaps.memory !== false ? 'AVAILABLE' : 'UNAVAILABLE',
        reason:
          staticCaps.memory !== false
            ? 'Memoria vectorial habilitada'
            : 'Deshabilitado en capabilities.json',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
      {
        id: 'ISOLATED_TEST_RUNNER',
        label: 'Sandbox Aislado de Ejecución de Pruebas',
        category: 'verification',
        status: existsSync(process.execPath) ? 'AVAILABLE' : 'UNAVAILABLE',
        reason: existsSync(process.execPath)
          ? 'Runtime Node.js verificado para subprocesos aislados'
          : 'Ejecutable Node no encontrado',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
      {
        id: 'CODE_VERIFICATION_HARNESS',
        label: 'Arnés de Verificación AST + Rollback SHA-256',
        category: 'verification',
        status: 'AVAILABLE',
        reason: 'StaticPreValidator, CheckpointManager y RepairController activos',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
      {
        id: 'WEB_BROWSER_SEARCH',
        label: 'Navegación Web y Búsqueda Externa',
        category: 'tools',
        status: 'AVAILABLE',
        reason: 'Motor de búsqueda e investigación web activo',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
      {
        id: 'VISION',
        label: 'Análisis Visual Multimodal',
        category: 'multimodal',
        status: 'AVAILABLE',
        reason: 'Servicio de visión registrado',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
      {
        id: 'VOICE',
        label: 'Síntesis y Reconocimiento de Voz',
        category: 'multimodal',
        status: staticCaps.voice !== false ? 'AVAILABLE' : 'UNAVAILABLE',
        reason:
          staticCaps.voice !== false
            ? 'Capacidad de voz habilitada en configuración'
            : 'Voz deshabilitada en capabilities.json',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
      {
        id: 'KNOWLEDGE_GRAPH',
        label: 'Grafo Asociativo TripleStore (KnowledgeEntity/Relation)',
        category: 'memory',
        status: staticCaps.memory !== false ? 'AVAILABLE' : 'UNAVAILABLE',
        reason: 'Esquema relacional y cuarentena epistémica activos',
        lastCheckedAt: now,
        lastChangedAt: now,
      },
    ];

    for (const item of defaults) {
      this.entries.set(item.id, item);
    }
  }

  /**
   * Notificación reactiva ante cambios de estado de un servicio (ej. caída de llama-server,
   * apertura de circuit breaker, recuperación de Ollama, etc.).
   */
  notifyServiceChange(
    id: CapabilityId,
    status: CapabilityStatus,
    reason: string,
    metadata?: Record<string, any>,
  ): CapabilityEntry {
    const now = new Date().toISOString();
    const current = this.entries.get(id);
    if (!current) {
      const created: CapabilityEntry = {
        id,
        label: id,
        category: 'tools',
        status,
        reason,
        lastCheckedAt: now,
        lastChangedAt: now,
        metadata,
      };
      this.entries.set(id, created);
      return created;
    }

    const statusChanged = current.status !== status;
    if (statusChanged) {
      this.recordEvent({
        capabilityId: id,
        previousStatus: current.status,
        newStatus: status,
        reason,
        timestamp: now,
      });
    }

    const updated: CapabilityEntry = {
      ...current,
      status,
      reason,
      lastCheckedAt: now,
      lastChangedAt: statusChanged ? now : current.lastChangedAt,
      metadata: metadata ? { ...current.metadata, ...metadata } : current.metadata,
    };

    this.entries.set(id, updated);
    this.lastUpdatedAt = now;
    return updated;
  }

  /**
   * Refresca el estado real de las capacidades sondeando los proveedores e infraestructura.
   * Soporta modo dryRun (calcula y devuelve el estado sin mutar el registro en memoria).
   */
  async refreshCapabilities(
    options: RefreshCapabilitiesOptions = {},
  ): Promise<CapabilityRegistrySnapshot> {
    const dryRun = options.dryRun === true;
    const probeNetwork = options.probeNetwork ?? true;
    const now = new Date().toISOString();

    const workingCopy = new Map<CapabilityId, CapabilityEntry>();
    for (const [k, v] of this.entries.entries()) {
      workingCopy.set(k, { ...v });
    }

    const applyUpdate = (
      id: CapabilityId,
      status: CapabilityStatus,
      reason: string,
      latencyMs?: number,
      metadata?: Record<string, any>,
    ) => {
      const existing = workingCopy.get(id);
      if (!existing) return;
      const changed = existing.status !== status;
      if (!dryRun && changed) {
        this.recordEvent({
          capabilityId: id,
          previousStatus: existing.status,
          newStatus: status,
          reason,
          timestamp: now,
        });
      }
      workingCopy.set(id, {
        ...existing,
        status,
        reason,
        latencyMs: latencyMs ?? existing.latencyMs,
        lastCheckedAt: now,
        lastChangedAt: changed ? now : existing.lastChangedAt,
        metadata: metadata
          ? { ...existing.metadata, ...metadata }
          : existing.metadata,
      });
    };

    // 1. Verificar configuración estática base
    const staticCaps = this.capabilitiesConfig?.getCapabilities();
    if (staticCaps) {
      if (staticCaps.voice === false) {
        applyUpdate('VOICE', 'UNAVAILABLE', 'Desactivado en capabilities.json');
      }
      if (staticCaps.memory === false) {
        applyUpdate(
          'PGVECTOR_RAG',
          'UNAVAILABLE',
          'Desactivado en capabilities.json',
        );
        applyUpdate(
          'KNOWLEDGE_GRAPH',
          'UNAVAILABLE',
          'Desactivado en capabilities.json',
        );
      }
    }

    // 2. Sondear proveedores de inferencia si probeNetwork está activo
    if (probeNetwork) {
      if (this.inferenceDiagnostics) {
        try {
          const diag = await this.inferenceDiagnostics.runDiagnostics({
            runInferenceProbe: false,
          });
          if (diag.overallStatus === 'HEALTHY') {
            applyUpdate(
              'LLM_LOCAL_CODER',
              'AVAILABLE',
              'llama-server operativo y modelo listo',
              diag.llamaCpp.healthLatencyMs,
              {
                vramFreeMiB: diag.gpuTelemetry?.vramFreeMiB,
                model: diag.aliasVerification.resolvedAlias,
              },
            );
          } else if (diag.overallStatus === 'DEGRADED') {
            applyUpdate(
              'LLM_LOCAL_CODER',
              'DEGRADED',
              `Degradado: ${diag.failureCode}`,
              diag.llamaCpp.healthLatencyMs,
            );
          } else {
            applyUpdate(
              'LLM_LOCAL_CODER',
              'UNAVAILABLE',
              `No disponible: ${diag.failureCode}`,
              diag.llamaCpp.healthLatencyMs,
            );
          }

          applyUpdate(
            'LLM_FALLBACK_OLLAMA',
            diag.gatewayMetrics.fallbackAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
            diag.gatewayMetrics.fallbackAvailable
              ? 'Ollama fallback responde OK'
              : 'Ollama fallback sin respuesta',
          );
        } catch (err: any) {
          applyUpdate(
            'LLM_LOCAL_CODER',
            'DEGRADED',
            `Error sondeando diagnóstico: ${err?.message}`,
          );
        }
      } else if (this.llamaCppProvider) {
        try {
          const start = Date.now();
          const health = await this.llamaCppProvider.getDetailedHealth();
          const latency = Date.now() - start;
          if (health.healthy && health.modelReady) {
            applyUpdate(
              'LLM_LOCAL_CODER',
              'AVAILABLE',
              'llama-server /health OK',
              latency,
            );
          } else if (health.healthy && health.loading) {
            applyUpdate(
              'LLM_LOCAL_CODER',
              'DEGRADED',
              'Cargando pesos GGUF en VRAM',
              latency,
            );
          } else {
            applyUpdate(
              'LLM_LOCAL_CODER',
              'UNAVAILABLE',
              'llama-server fuera de línea',
              latency,
            );
          }
        } catch {
          applyUpdate(
            'LLM_LOCAL_CODER',
            'UNAVAILABLE',
            'llama-server inalcanzable',
          );
        }
      }

      if (!this.inferenceDiagnostics && this.ollamaProvider) {
        try {
          const available = await this.ollamaProvider.isAvailable();
          applyUpdate(
            'LLM_FALLBACK_OLLAMA',
            available ? 'AVAILABLE' : 'UNAVAILABLE',
            available ? 'Ollama /api/tags OK' : 'Ollama no disponible',
          );
        } catch {
          applyUpdate(
            'LLM_FALLBACK_OLLAMA',
            'UNAVAILABLE',
            'Ollama inalcanzable',
          );
        }
      }
    }

    if (!dryRun) {
      for (const [k, v] of workingCopy.entries()) {
        this.entries.set(k, v);
      }
      this.lastUpdatedAt = now;
    }

    return this.buildSnapshotFromMap(
      workingCopy,
      dryRun ? now : this.lastUpdatedAt,
      dryRun,
    );
  }

  getSnapshot(): CapabilityRegistrySnapshot {
    return this.buildSnapshotFromMap(this.entries, this.lastUpdatedAt, false);
  }

  getCapability(id: CapabilityId): CapabilityEntry | undefined {
    return this.entries.get(id);
  }

  isCapabilityOperational(id: CapabilityId): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    return entry.status === 'AVAILABLE' || entry.status === 'DEGRADED';
  }

  /**
   * Devuelve los tipos de pasos permitidos para PlannerService según las capacidades reales operativas.
   */
  getAllowedPlannerStepTypes(): string[] {
    const allowed: string[] = ['summarize', 'deduplicate', 'respond'];

    if (this.isCapabilityOperational('WEB_BROWSER_SEARCH')) {
      allowed.push('search', 'scrape');
    }
    if (this.isCapabilityOperational('PGVECTOR_RAG')) {
      allowed.push('read_memory', 'read_docs', 'save');
    }
    if (this.isCapabilityOperational('CODE_VERIFICATION_HARNESS')) {
      allowed.push('verify_code');
    }

    return allowed;
  }

  /**
   * Evalúa si un intent de IntentRouterService está respaldado por capacidades activas.
   * Si la capacidad está caída, sugiere un fallback seguro.
   */
  evaluateIntentSupport(intent: string): {
    supported: boolean;
    effectiveIntent: string;
    reason?: string;
  } {
    if (
      (intent === 'WEB' || intent === 'URL' || intent === 'SITE_SEARCH') &&
      !this.isCapabilityOperational('WEB_BROWSER_SEARCH')
    ) {
      const fallback = this.isCapabilityOperational('PGVECTOR_RAG')
        ? 'RAG'
        : 'LOCAL';
      return {
        supported: false,
        effectiveIntent: fallback,
        reason: `Capacidad WEB_BROWSER_SEARCH no disponible; degradando intent ${intent} -> ${fallback}`,
      };
    }

    if (intent === 'RAG' && !this.isCapabilityOperational('PGVECTOR_RAG')) {
      return {
        supported: false,
        effectiveIntent: 'LOCAL',
        reason: 'Capacidad PGVECTOR_RAG no disponible; degradando intent RAG -> LOCAL',
      };
    }

    return { supported: true, effectiveIntent: intent };
  }

  private recordEvent(event: CapabilityChangeEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxEventsHistory) {
      this.recentEvents.length = this.maxEventsHistory;
    }
  }

  private buildSnapshotFromMap(
    map: Map<CapabilityId, CapabilityEntry>,
    updatedAt: string,
    dryRun: boolean,
  ): CapabilityRegistrySnapshot {
    const available: CapabilityId[] = [];
    const degraded: CapabilityId[] = [];
    const unavailable: CapabilityId[] = [];
    const capabilities = {} as Record<CapabilityId, CapabilityEntry>;

    for (const [id, entry] of map.entries()) {
      capabilities[id] = { ...entry };
      if (entry.status === 'AVAILABLE') available.push(id);
      else if (entry.status === 'DEGRADED') degraded.push(id);
      else unavailable.push(id);
    }

    return {
      updatedAt,
      dryRun,
      summary: { available, degraded, unavailable },
      capabilities,
      recentEvents: [...this.recentEvents],
    };
  }
}

