import { Injectable, Logger, Optional, ForbiddenException } from '@nestjs/common';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
  LLMEmbeddingResponse,
} from './llm-provider.interface';
import { LlamaCppProvider } from './llamacpp.provider';
import { OllamaProvider } from './ollama.provider';
import { OpenRouterProvider } from './openrouter.provider';
import {
  InferenceSupervisorService,
  SupervisorState,
} from './inference-supervisor.service';

export interface ProviderHealthReport {
  available: boolean;
  defaultModel: string;
}

export interface InferenceFailureInfo {
  timestamp: Date;
  provider: string;
  message: string;
}

export interface GatewayHealthStatus {
  activeProvider: string;
  activeModel: string;
  defaultModel: string;
  lastUsedModel: string;
  loadedModel: string;
  serverHealthy: boolean;
  modelReady: boolean;
  modelLoading: boolean;
  fallbackAvailable: boolean;
  circuitBreaker: 'closed' | 'open';
  lastFailure: InferenceFailureInfo | null;
  latencyMs?: number;
  failoverCount: number;
  lastModelSwitch?: Date;
  primary: string;
  fallback: string;
  autoFallbackEnabled: boolean;
  providers: Record<string, ProviderHealthReport>;
  supervisor?: SupervisorState;
}

/**
 * Pasarela unificada de inferencia (Inference Gateway).
 * Desacopla el núcleo de JarBees del motor de ejecución específico.
 * 
 * Permite ejecutar llama.cpp como motor primario local de alta velocidad
 * en GPU NVIDIA (RTX 5070), manteniendo conmutación transparente y
 * automática hacia Ollama (fallback) o Cloud (OpenRouter).
 */
@Injectable()
export class InferenceGatewayService implements ILLMProvider {
  private readonly logger = new Logger(InferenceGatewayService.name);

  private primaryProviderName: string;
  private fallbackProviderName: string;
  private readonly autoFallback: boolean;

  private readonly providers: Map<string, ILLMProvider>;

  // Telemetría y estado operativo diferenciado
  private loadedModel: string = 'qwen3:8b';
  private lastUsedModel: string = 'qwen3:8b';
  private lastModelSwitch?: Date;
  private lastLatencyMs?: number;
  private lastFailure: InferenceFailureInfo | null = null;
  private failoverCount = 0;

  // Cola/Mutex para sincronización de cambio de modelos (Router Mode)
  private modelSwitchMutex: Promise<void> = Promise.resolve();

  constructor(
    private readonly llamaCppProvider: LlamaCppProvider,
    private readonly ollamaProvider: OllamaProvider,
    private readonly openRouterProvider: OpenRouterProvider,
    @Optional()
    private readonly supervisor?: InferenceSupervisorService,
  ) {
    this.primaryProviderName =
      process.env.INFERENCE_PRIMARY_PROVIDER || 'llamacpp';
    this.fallbackProviderName =
      process.env.INFERENCE_FALLBACK_PROVIDER || 'ollama';
    this.autoFallback = process.env.INFERENCE_AUTO_FALLBACK !== 'false';

    this.providers = new Map<string, ILLMProvider>([
      ['llamacpp', this.llamaCppProvider],
      ['ollama', this.ollamaProvider],
      ['openrouter', this.openRouterProvider],
    ]);

    this.logger.log(
      `InferenceGateway inicializado. Primario: ${this.primaryProviderName} | Fallback: ${this.fallbackProviderName} | AutoFallback: ${this.autoFallback}`,
    );
  }

  getProviderName(): string {
    return 'gateway';
  }

  getDefaultModel(): string {
    const provider = this.getPrimaryProvider();
    return provider.getDefaultModel();
  }

  getPrimaryProvider(): ILLMProvider {
    return this.providers.get(this.primaryProviderName) || this.llamaCppProvider;
  }

  getFallbackProvider(): ILLMProvider {
    return this.providers.get(this.fallbackProviderName) || this.ollamaProvider;
  }

  getProvider(name: string): ILLMProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  setPrimaryProvider(name: string): void {
    if (this.providers.has(name.toLowerCase())) {
      this.primaryProviderName = name.toLowerCase();
      this.logger.log(`Proveedor primario actualizado a: ${this.primaryProviderName}`);
    } else {
      this.logger.warn(`Proveedor '${name}' desconocido. Proveedores válidos: ${[...this.providers.keys()].join(', ')}`);
    }
  }

  /**
   * Adquiere un cerrojo exclusivo para operaciones de conmutación de modelos
   * con soporte para timeout de espera en cola y cancelación anticipada (AbortSignal) usando Promise.race.
   */
  private async acquireModelSwitchLock(
    timeoutMs: number = 15000,
    signal?: AbortSignal,
  ): Promise<() => void> {
    if (signal?.aborted) {
      throw new Error('InferenceGateway: petición abortada antes de entrar en cola de inferencia');
    }

    let releaseLock: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const currentLock = this.modelSwitchMutex;
    this.modelSwitchMutex = this.modelSwitchMutex.then(() => nextLock).catch(() => {});

    const waitPromises: Promise<void>[] = [currentLock];

    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      const timeoutPromise = new Promise<void>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `InferenceGateway: timeout de espera en cola de inferencia (${timeoutMs}ms)`,
            ),
          );
        }, timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
      });
      waitPromises.push(timeoutPromise);
    }

    let abortHandler: (() => void) | undefined;
    if (signal) {
      const abortPromise = new Promise<void>((_, reject) => {
        abortHandler = () =>
          reject(
            new Error(
              'InferenceGateway: petición cancelada por el cliente mientras esperaba turno',
            ),
          );
        signal.addEventListener('abort', abortHandler, { once: true });
      });
      waitPromises.push(abortPromise);
    }

    try {
      await Promise.race(waitPromises);
    } catch (err) {
      if (releaseLock!) releaseLock!();
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    }

    return () => {
      if (releaseLock) releaseLock();
    };
  }

  /**
   * Verifica la disponibilidad del motor primario
   */
  async isAvailable(): Promise<boolean> {
    const primary = this.getPrimaryProvider();
    if (typeof primary.isAvailable === 'function') {
      const ok = await primary.isAvailable();
      if (ok) return true;
    }

    if (this.autoFallback) {
      const fallback = this.getFallbackProvider();
      if (typeof fallback.isAvailable === 'function') {
        return await fallback.isAvailable();
      }
    }

    return false;
  }

  /**
   * Generación con conmutación transparente por fallo, timeout desglosado y sincronización de modelos
   */
  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const requestedModel = options.model || this.getDefaultModel();
    this.lastUsedModel = requestedModel;
    const isModelSwitch = requestedModel !== this.loadedModel;
    const usesSingleSlotLlamaCpp =
      this.primaryProviderName === 'llamacpp' ||
      Boolean(options.model?.startsWith('llamacpp:'));

    let releaseLock: (() => void) | undefined;
    if (isModelSwitch || usesSingleSlotLlamaCpp) {
      const queueTimeout = options.timeouts?.queueWaitMs ?? 30000;
      releaseLock = await this.acquireModelSwitchLock(
        queueTimeout,
        options.abortSignal,
      );
    }

    try {
      // Si se especifica un prefijo explícito (ej: "ollama:qwen3:8b" o "llamacpp:qwen3:8b")
      if (
        options.model &&
        options.model.includes(':') &&
        (options.model.startsWith('ollama:') ||
          options.model.startsWith('llamacpp:') ||
          options.model.startsWith('openrouter:'))
      ) {
        const [prefix, ...rest] = options.model.split(':');
        const explicitProvider = this.getProvider(prefix);
        if (explicitProvider) {
          // Data Privacy Gate: validar si se permite inferencia cloud
          if (!this.isRemoteProviderAllowed(prefix, options)) {
            throw new ForbiddenException(
              `[Data Privacy Gate] Inferencia remota con '${prefix}' bloqueada: la consulta contiene datos privados/sensibles (sensitivity=${options.sensitivity || 'private'}) y no puede enviarse a un proveedor cloud.`,
            );
          }

          const cleanModel = rest.join(':');
          const res = await explicitProvider.generate({
            ...options,
            model: cleanModel,
          });
          this.recordSuccess(res, requestedModel, isModelSwitch);
          return res;
        }
      }

      const primary = this.getPrimaryProvider();
      const primaryName = this.primaryProviderName;

      // Data Privacy Gate para proveedor primario
      if (!this.isRemoteProviderAllowed(primaryName, options)) {
        throw new ForbiddenException(
          `[Data Privacy Gate] Inferencia primaria con proveedor cloud '${primaryName}' bloqueada por contener datos sensibles.`,
        );
      }

      let emittedTokensCount = 0;
      const primaryOptions: LLMGenerateOptions = options.onToken
        ? {
            ...options,
            onToken: (chunk: string) => {
              if (chunk && chunk.length > 0) {
                emittedTokensCount++;
              }
              options.onToken?.(chunk);
            },
          }
        : options;

      try {
        const res = await primary.generate(primaryOptions);
        this.recordSuccess(res, requestedModel, isModelSwitch);
        return res;
      } catch (primaryErr: any) {
        const errMsg = primaryErr?.message || String(primaryErr);
        this.recordFailure(primaryName, errMsg);

        // Si el proveedor primario falló DESPUÉS de haber emitido tokens parciales al stream,
        // está PROHIBIDO re-ejecutar en el proveedor de fallback (duplicaría texto parcial).
        if (emittedTokensCount > 0) {
          const midStreamErr: any = new Error(
            `MID_STREAM_FAILURE: el proveedor primario '${primaryName}' falló tras emitir ${emittedTokensCount} fragmentos (${errMsg}). Fallback bloqueado para impedir duplicación de respuesta parcial.`,
          );
          midStreamErr.code = 'MID_STREAM_FAILURE';
          midStreamErr.emittedTokensCount = emittedTokensCount;
          throw midStreamErr;
        }

        if (!this.autoFallback) {
          this.logger.error(
            `[gateway] Proveedor primario '${primaryName}' falló y autoFallback está desactivado: ${errMsg}`,
          );
          throw primaryErr;
        }

        // Si fue una cancelación del cliente, no hacer fallback a Ollama (evita trabajo innecesario)
        if (
          options.abortSignal?.aborted ||
          primaryErr?.code === 'ABORTED' ||
          errMsg.includes('ABORTED') ||
          errMsg.includes('canceled') ||
          errMsg.includes('cancelada')
        ) {
          throw primaryErr;
        }

        if (
          primaryName === 'llamacpp' &&
          this.supervisor &&
          (errMsg.includes('ECONNREFUSED') || errMsg.includes('connect'))
        ) {
          // Disparar intento de recuperación en segundo plano sin bloquear el fallback
          this.supervisor.recover().catch((err) => {
            this.logger.debug(`[gateway] Recuperación automática en background: ${err.message}`);
          });
        }

        const fallback = this.getFallbackProvider();
        const fallbackName = this.fallbackProviderName;

        // Data Privacy Gate para fallback
        if (!this.isRemoteProviderAllowed(fallbackName, options)) {
          this.logger.error(
            `❌ [gateway] Conmutación a fallback '${fallbackName}' bloqueada por Data Privacy Gate: la solicitud contiene datos privados (sensitivity=${options.sensitivity || 'private'}). Prevaleciendo confinamiento local.`,
          );
          throw new ForbiddenException(
            `[Data Privacy Gate] Inferencia cloud en fallback '${fallbackName}' bloqueada: los motores locales fallaron y la consulta contiene datos confidenciales que no pueden transmitirse a la nube.`,
          );
        }

        this.logger.warn(
          `⚠️ [gateway] Proveedor primario '${primaryName}' falló (${errMsg}). Conmutando automáticamente a fallback '${fallbackName}'...`,
        );

        try {
          const fallbackRes = await fallback.generate(options);
          this.failoverCount++;
          this.recordSuccess(fallbackRes, requestedModel, false);
          this.logger.log(
            `✅ [gateway] Fallback a '${fallbackName}' completado exitosamente en ${fallbackRes.latencyMs}ms`,
          );
          return fallbackRes;
        } catch (fallbackErr: any) {
          this.logger.error(
            `❌ [gateway] Ambos proveedores ('${primaryName}' y '${fallbackName}') fallaron. Error fallback: ${fallbackErr.message}`,
          );
          throw new Error(
            `InferenceGateway: todos los motores locales fallaron. Primario (${primaryName}): ${errMsg} | Fallback (${fallbackName}): ${fallbackErr.message}`,
          );
        }
      }
    } finally {
      if (releaseLock) {
        releaseLock();
      }
    }
  }

  /**
   * Data Privacy Gate:
   * Determina si una petición puede enviarse a proveedores remotos/cloud (ej: OpenRouter).
   * Por defecto, las peticiones que contienen datos privados, documentos de la biblioteca,
   * correos, memorias personales o credenciales quedan CONFINADAS estrictamente a nivel local.
   */
  isRemoteProviderAllowed(providerName: string, options: LLMGenerateOptions): boolean {
    const isRemote = providerName.toLowerCase() === 'openrouter';
    if (!isRemote) return true;

    // Si allowRemoteFallback está expresamente en false, bloquear
    if (options.allowRemoteFallback === false) {
      return false;
    }

    // Si la sensibilidad es 'private' o 'confidential', bloquear a menos que allowRemoteFallback sea explícitamente true
    if (options.sensitivity === 'private' || options.sensitivity === 'confidential') {
      return options.allowRemoteFallback === true;
    }

    // Heurística de detección de datos altamente sensibles si no se especificó sensitivity
    const allContent = (options.messages || [])
      .map((m) => m.content || '')
      .join(' ')
      .toLowerCase();

    const sensitiveTokens = [
      'password',
      'token',
      'secret',
      'api_key',
      'apikey',
      'private_key',
      'credencial',
      'usercredential',
      'refresh_token',
      'access_token',
    ];

    for (const t of sensitiveTokens) {
      if (allContent.includes(t)) {
        return false;
      }
    }

    return true;
  }

  private recordSuccess(
    res: LLMGenerateResponse,
    model: string,
    isModelSwitch: boolean,
  ): void {
    this.lastLatencyMs = res.latencyMs;
    this.loadedModel = model;
    if (isModelSwitch) {
      this.lastModelSwitch = new Date();
    }
  }

  private recordFailure(provider: string, message: string): void {
    this.lastFailure = {
      timestamp: new Date(),
      provider,
      message,
    };
  }

  /**
   * Cálculo de embeddings: delega estrictamente a Ollama para preservar el índice pgvector (bge-m3: 1024 dims).
   * Llama.cpp en este entorno ejecuta modelos de chat/código y no debe interferir con los embeddings vectoriales.
   */
  async embed(text: string): Promise<LLMEmbeddingResponse> {
    const ollama = this.providers.get('ollama');
    if (ollama) {
      return await ollama.embed(text);
    }
    throw new Error(
      'InferenceGatewayService: el cálculo de embeddings vectoriales requiere el proveedor Ollama con bge-m3 para garantizar 1024 dimensiones en pgvector.',
    );
  }

  /**
   * Reporte de estado de salud y telemetría de todos los componentes operativos
   */
  async getHealthStatus(): Promise<GatewayHealthStatus> {
    const status: Record<string, ProviderHealthReport> = {};

    for (const [name, provider] of this.providers.entries()) {
      let available = false;
      if (typeof provider.isAvailable === 'function') {
        try {
          available = await provider.isAvailable();
        } catch {
          available = false;
        }
      }
      status[name] = {
        available,
        defaultModel: provider.getDefaultModel(),
      };
    }

    let serverHealthy = false;
    let modelReady = false;
    let modelLoading = false;
    if (this.llamaCppProvider && typeof this.llamaCppProvider.getDetailedHealth === 'function') {
      const detailed = await this.llamaCppProvider.getDetailedHealth();
      serverHealthy = detailed.healthy;
      modelReady = detailed.modelReady;
      modelLoading = detailed.loading;
    } else if (status['llamacpp']?.available) {
      serverHealthy = true;
      modelReady = true;
    }

    const fallbackAvailable = status[this.fallbackProviderName]?.available ?? false;
    const supervisorState = this.supervisor
      ? {
          ...this.supervisor.getState(),
          gpu:
            typeof this.supervisor.getGpuTelemetry === 'function'
              ? this.supervisor.getGpuTelemetry()
              : undefined,
        }
      : undefined;
    const circuitBreaker: 'closed' | 'open' =
      supervisorState?.circuitBreakerTripped ? 'open' : 'closed';

    return {
      activeProvider: serverHealthy ? this.primaryProviderName : this.fallbackProviderName,
      defaultModel: this.getDefaultModel(),
      lastUsedModel: this.lastUsedModel,
      loadedModel: this.loadedModel,
      activeModel: this.loadedModel, // Alias para compatibilidad de cliente
      serverHealthy,
      modelReady,
      modelLoading,
      fallbackAvailable,
      circuitBreaker,
      lastFailure: this.lastFailure,
      latencyMs: this.lastLatencyMs,
      failoverCount: this.failoverCount,
      lastModelSwitch: this.lastModelSwitch,
      primary: this.primaryProviderName,
      fallback: this.fallbackProviderName,
      autoFallbackEnabled: this.autoFallback,
      providers: status,
      supervisor: supervisorState,
    };
  }
}
