/**
 * JCA-001: Capa 3 - Capability Executor Service
 * 
 * Orquestador centralizado de ejecución de capacidades operativas.
 * Responsabilidades mandatarias:
 * 1. Verificación obligatoria de autorización contra ContextPlan y directivas de exclusión.
 * 2. Aplicación forzada de timeout central mediante AbortController y Promise.race.
 * 3. Aislamiento total de excepciones (ningún error no capturado se propaga al LLM).
 * 4. Deduplicación segura de ejecuciones concurrentes idénticas en la misma sesión.
 * 5. Generación de directivas anti-alucinación en escenarios de fallback.
 * 6. Telemetría estructurada sin volcar datos privados del usuario.
 */

import { createHash } from 'node:crypto';
import type {
  CapabilityExecutionContext,
  CapabilityResult,
  CapabilityExecutionStatus,
  ICapability,
} from './capability.interface.ts';
import { CapabilityRegistry } from './capability-registry.service.ts';
import type { ContextPlan } from '../context/context-selector.interface.ts';

export interface CapabilityExecutorOptions {
  /** Sobrescribe el timeout por defecto de la capacidad (en milisegundos) */
  overrideTimeoutMs?: number;
}

export interface TelemetryLogEntry {
  timestamp: string;
  sessionId: string;
  capabilityId: string;
  status: CapabilityExecutionStatus;
  durationMs: number;
  safetyLevel: string;
  hasData: boolean;
  errorCode?: string;
  underlyingOperationCancelled?: boolean;
}

export class CapabilityExecutor {
  private readonly inFlight = new Map<string, Promise<CapabilityResult<any>>>();
  private readonly telemetryLogs: TelemetryLogEntry[] = [];

  private readonly registry: CapabilityRegistry;
  private readonly onTelemetry?: (entry: TelemetryLogEntry) => void;

  constructor(
    registry: CapabilityRegistry,
    onTelemetry?: (entry: TelemetryLogEntry) => void,
  ) {
    this.registry = registry;
    this.onTelemetry = onTelemetry;
  }

  /**
   * Ejecuta una capacidad bajo control central de autorización, timeout y errores.
   */
  async execute<T = unknown>(
    capabilityId: string,
    userMessage: string,
    contextPlan: ContextPlan,
    sessionId: string,
    options: CapabilityExecutorOptions = {},
  ): Promise<CapabilityResult<T>> {
    const startTime = Date.now();
    const normalizedCapId = (capabilityId || '').trim().toLowerCase();

    // ── 1. Validación de Parámetros de Entrada ─────────────────────────────────
    if (!normalizedCapId) {
      return this.buildErrorResult(
        'unknown',
        'INVALID_CAPABILITY_ID',
        'Identificador de capacidad no especificado.',
        Date.now() - startTime,
        'READ_ONLY',
      );
    }

    if (!userMessage || typeof userMessage !== 'string') {
      return this.buildErrorResult(
        normalizedCapId,
        'INVALID_USER_MESSAGE',
        'El mensaje de usuario debe ser una cadena de texto no vacía.',
        Date.now() - startTime,
        'READ_ONLY',
      );
    }

    if (!contextPlan || !contextPlan.sources || !contextPlan.exclusions) {
      return this.buildErrorResult(
        normalizedCapId,
        'INVALID_CONTEXT_PLAN',
        'ContextPlan malformado o no proporcionado.',
        Date.now() - startTime,
        'READ_ONLY',
      );
    }

    const safeSessionId = (sessionId || 'anonymous-session').trim();

    // ── 2. Localización de la Capacidad en el Registry ─────────────────────────
    const capability = this.registry.get<T>(normalizedCapId);
    if (!capability) {
      return this.buildErrorResult(
        normalizedCapId,
        'CAPABILITY_NOT_FOUND',
        `Capacidad '${normalizedCapId}' no encontrada en el registro.`,
        Date.now() - startTime,
        'READ_ONLY',
      );
    }

    // ── 3. Verificación Central de Autorización y Exclusiones ──────────────────
    const authCheck = this.verifyAuthorization(capability, contextPlan);
    if (!authCheck.authorized) {
      const durationMs = Date.now() - startTime;
      const result: CapabilityResult<T> = {
        capabilityId: normalizedCapId,
        status: 'UNAUTHORIZED',
        safetyLevel: capability.safetyLevel,
        durationMs,
        error: {
          code: authCheck.code,
          message: authCheck.reason,
          recoverable: false,
        },
        fallbackDirective: authCheck.fallbackDirective,
      };
      this.recordTelemetry(safeSessionId, result);
      return result;
    }

    // ── 4. Comprobación Pura de Aptitud (canHandle) ────────────────────────────
    if (!capability.canHandle(userMessage, contextPlan)) {
      const durationMs = Date.now() - startTime;
      const result: CapabilityResult<T> = {
        capabilityId: normalizedCapId,
        status: 'NO_RESULTS',
        safetyLevel: capability.safetyLevel,
        durationMs,
        fallbackDirective: `La capacidad '${normalizedCapId}' no es apta para resolver esta consulta. Responde con el conocimiento base del LLM.`,
      };
      this.recordTelemetry(safeSessionId, result);
      return result;
    }

    // ── 5. Clave de Deduplicación Multidimensional ────────────────────────────
    // Combina: sessionId + capabilityId + ámbito de permisos + hash de la consulta
    const authScope = this.computeAuthScope(contextPlan);
    const paramsHash = createHash('sha256')
      .update(userMessage.trim().toLowerCase())
      .digest('hex')
      .slice(0, 16);
    const deduplicationKey = `${safeSessionId}:${normalizedCapId}:${authScope}:${paramsHash}`;

    // Si ya existe una ejecución idéntica en vuelo para este mismo ámbito, reutilizar promesa
    const existingInFlight = this.inFlight.get(deduplicationKey);
    if (existingInFlight) {
      return existingInFlight as Promise<CapabilityResult<T>>;
    }

    // ── 6. Ejecución Protegida con Timeout y AbortController ───────────────────
    const executionPromise = this.executeWithTimeoutAndProtection<T>(
      capability,
      userMessage,
      contextPlan,
      safeSessionId,
      options,
      startTime,
    );

    this.inFlight.set(deduplicationKey, executionPromise);

    try {
      const result = await executionPromise;
      this.recordTelemetry(safeSessionId, result);
      return result;
    } finally {
      this.inFlight.delete(deduplicationKey);
    }
  }

  /**
   * Ejecuta la capacidad envolviéndola en Promise.race con un temporizador estricto
   * y una señal AbortController.
   */
  private async executeWithTimeoutAndProtection<T>(
    capability: ICapability<T>,
    userMessage: string,
    contextPlan: ContextPlan,
    sessionId: string,
    options: CapabilityExecutorOptions,
    startTime: number,
  ): Promise<CapabilityResult<T>> {
    const timeoutMs =
      typeof options.overrideTimeoutMs === 'number' && options.overrideTimeoutMs > 0
        ? options.overrideTimeoutMs
        : capability.defaultTimeoutMs;

    const abortController = new AbortController();
    let timeoutTimer: NodeJS.Timeout | null = null;
    let didTimeout = false;

    const timeoutPromise = new Promise<CapabilityResult<T>>((resolve) => {
      timeoutTimer = setTimeout(() => {
        didTimeout = true;
        abortController.abort();
        const durationMs = Date.now() - startTime;
        resolve({
          capabilityId: capability.id,
          status: 'TIMEOUT',
          safetyLevel: capability.safetyLevel,
          durationMs,
          error: {
            code: 'CAPABILITY_EXECUTION_TIMEOUT',
            message: `La capacidad '${capability.id}' superó el presupuesto temporal de ${timeoutMs}ms.`,
            recoverable: true,
          },
          underlyingOperationCancelled: true,
          fallbackDirective: this.buildTimeoutDirective(capability.id),
        });
      }, timeoutMs);
    });

    const executionContext: CapabilityExecutionContext = {
      sessionId,
      userMessage,
      contextPlan,
      abortSignal: abortController.signal,
    };

    try {
      const capabilityPromise = Promise.resolve().then(() => capability.execute(executionContext));
      const outcome = await Promise.race([capabilityPromise, timeoutPromise]);

      if (timeoutTimer) clearTimeout(timeoutTimer);

      if (didTimeout) {
        return outcome;
      }

      // Validar resultado obtenido de la capacidad
      if (!outcome || typeof outcome !== 'object') {
        const durationMs = Date.now() - startTime;
        return this.buildErrorResult(
          capability.id,
          'MALFORMED_CAPABILITY_RESULT',
          `La capacidad '${capability.id}' retornó un resultado malformado no compatible con el contrato.`,
          durationMs,
          capability.safetyLevel,
        );
      }

      return outcome;
    } catch (err: unknown) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);

      return {
        capabilityId: capability.id,
        status: 'RECOVERABLE_ERROR',
        safetyLevel: capability.safetyLevel,
        durationMs,
        error: {
          code: 'UNHANDLED_CAPABILITY_EXCEPTION',
          message: errMsg,
          recoverable: true,
          underlyingError: err,
        },
        fallbackDirective: this.buildErrorFallbackDirective(capability.id),
      };
    }
  }

  /**
   * Comprueba las directivas de exclusión y estados de fuente en ContextPlan.
   */
  private verifyAuthorization(
    capability: ICapability<any>,
    contextPlan: ContextPlan,
  ): { authorized: boolean; code: string; reason: string; fallbackDirective?: string } {
    const capId = capability.id.toLowerCase();

    // 1. Verificación para Búsqueda Web
    if (capId === 'web_search') {
      if (contextPlan.exclusions.excludeWeb || contextPlan.sources.web === 'EXCLUDED') {
        return {
          authorized: false,
          code: 'WEB_SEARCH_EXPLICITLY_EXCLUDED',
          reason: 'Búsqueda web bloqueada por directiva de exclusión del usuario.',
          fallbackDirective:
            '[DIRECTIVA MANDATORIA]: El usuario ha solicitado expresamente NO buscar en internet. Responde utilizando únicamente el conocimiento base del modelo, sin inventar hechos actuales ni resultados en vivo.',
        };
      }
    }

    // 2. Verificación para Matemáticas
    if (capId === 'math') {
      if (contextPlan.toolStates.math === 'EXCLUDED' || contextPlan.sources.tools === 'EXCLUDED') {
        return {
          authorized: false,
          code: 'MATH_TOOL_EXPLICITLY_EXCLUDED',
          reason: 'Herramienta de cálculo bloqueada por directiva de exclusión del usuario.',
          fallbackDirective:
            '[DIRECTIVA MANDATORIA]: El usuario ha solicitado responder sin calculadora. Explica la fórmula y razonamiento pero respeta la directiva sin usar herramientas.',
        };
      }
    }

    // 3. Comprobación genérica de toolStates
    const specificToolState = contextPlan.toolStates[capId as any];
    if (specificToolState === 'EXCLUDED') {
      return {
        authorized: false,
        code: `TOOL_${capId.toUpperCase()}_EXCLUDED`,
        reason: `La capacidad '${capId}' fue excluida explícitamente en el plan de contexto.`,
        fallbackDirective: `[DIRECTIVA MANDATORIA]: La herramienta '${capId}' fue excluida por el usuario. No intentes invocarla.`,
      };
    }

    return { authorized: true, code: 'AUTHORIZED', reason: 'Capacidad autorizada.' };
  }

  /**
   * Calcula un hash del ámbito de autorización para la clave de deduplicación.
   */
  private computeAuthScope(contextPlan: ContextPlan): string {
    const webBlocked = contextPlan.exclusions.excludeWeb || contextPlan.sources.web === 'EXCLUDED';
    const mathBlocked = contextPlan.toolStates.math === 'EXCLUDED';
    const toolsBlocked = contextPlan.sources.tools === 'EXCLUDED';
    return `w:${webBlocked ? 0 : 1}_m:${mathBlocked ? 0 : 1}_t:${toolsBlocked ? 0 : 1}`;
  }

  private buildTimeoutDirective(capabilityId: string): string {
    if (capabilityId === 'web_search') {
      return '[INSTRUCCIÓN DE SEGURIDAD]: La búsqueda de información externa agotó el tiempo de espera (TIMEOUT). Responde con tu conocimiento base general. NO inventes hechos recientes, marcadores deportivos ni cotizaciones.';
    }
    if (capabilityId === 'math') {
      return '[INSTRUCCIÓN DE SEGURIDAD]: La operación matemática excedió el tiempo límite. Puedes explicar la fórmula y el procedimiento algebraico, pero NO presentes un resultado numérico final no verificado como exacto.';
    }
    return `[INSTRUCCIÓN DE SEGURIDAD]: La capacidad '${capabilityId}' superó el tiempo límite de ejecución. Procede sin utilizar datos no verificados.`;
  }

  private buildErrorFallbackDirective(capabilityId: string): string {
    if (capabilityId === 'math') {
      return '[INSTRUCCIÓN DE SEGURIDAD]: El cálculo automático no pudo completarse. Explica la metodología paso a paso pero advierte que el cálculo numérico no pudo ser verificado determinísticamente.';
    }
    if (capabilityId === 'web_search') {
      return '[INSTRUCCIÓN DE SEGURIDAD]: La recuperación web falló por un error de conexión o scraping. Aclara con transparencia que la información externa no estuvo disponible.';
    }
    return `[INSTRUCCIÓN DE SEGURIDAD]: La capacidad '${capabilityId}' presentó un error operacional. Procede con prudencia cognitiva.`;
  }

  private buildErrorResult<T>(
    capabilityId: string,
    code: string,
    message: string,
    durationMs: number,
    safetyLevel: string,
  ): CapabilityResult<T> {
    const result: CapabilityResult<T> = {
      capabilityId,
      status: 'RECOVERABLE_ERROR',
      safetyLevel: safetyLevel as any,
      durationMs,
      error: { code, message, recoverable: true },
      fallbackDirective: this.buildErrorFallbackDirective(capabilityId),
    };
    return result;
  }

  private recordTelemetry(sessionId: string, result: CapabilityResult<any>): void {
    const entry: TelemetryLogEntry = {
      timestamp: new Date().toISOString(),
      sessionId,
      capabilityId: result.capabilityId,
      status: result.status,
      durationMs: result.durationMs,
      safetyLevel: result.safetyLevel,
      hasData: Boolean(result.data),
      errorCode: result.error?.code,
      underlyingOperationCancelled: result.underlyingOperationCancelled,
    };
    this.telemetryLogs.push(entry);
    if (this.onTelemetry) {
      try {
        this.onTelemetry(entry);
      } catch {
        // Ignorar errores del listener de telemetría para no afectar la ejecución
      }
    }
  }

  /** Retorna el historial de telemetría registrado */
  getTelemetryLogs(): TelemetryLogEntry[] {
    return [...this.telemetryLogs];
  }

  /** Limpia el registro de telemetría (para suites de pruebas) */
  clearTelemetry(): void {
    this.telemetryLogs.length = 0;
  }
}
