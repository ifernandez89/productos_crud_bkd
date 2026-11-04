import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  JneTelemetryEvent,
  JneObserverConfig,
  JneCognitiveMetrics,
  JneEventType,
} from './jne-observer.types';
import {
  LLMGenerateOptions,
  LLMGenerateResponse,
} from '../llm/llm-provider.interface';

/**
 * JneObserverService — Observador Pasivo en Shadow Mode
 * 
 * Principio rector: "Zero Impact & Pure Telemetry"
 * 1. Jamás bloquea, muta ni altera la inferencia productiva ni la respuesta devuelta al usuario.
 * 2. Opera de forma completamente tolerante a fallos (fail-safe).
 * 3. Incorpora redacción automática de secretos y datos confidenciales.
 * 4. Detecta de forma pasiva eventos de secuestro léxico (RAG context hijacking).
 */
@Injectable()
export class JneObserverService implements OnModuleDestroy {
  private readonly logger = new Logger(JneObserverService.name);

  private config: JneObserverConfig = {
    enabled: process.env.JNE_SHADOW_MODE_ENABLED === 'true',
    maxQueueSize: 1000,
    flushIntervalMs: 5000,
    redactSensitiveData: true,
    silentFailures: true,
  };

  private readonly eventQueue: JneTelemetryEvent[] = [];
  private totalInferences = 0;
  private totalFailures = 0;
  private totalFallbacks = 0;
  private totalHijackAlerts = 0;
  private latencySum = 0;
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    if (this.config.enabled) {
      this.startFlushTimer();
      this.logger.log('JNE Observer inicializado en SHADOW MODE (Activo).');
    } else {
      this.logger.log('JNE Observer inicializado en STANDBY (Inactivo).');
    }
  }

  onModuleDestroy() {
    this.shutdown();
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.eventQueue.length = 0;
  }

  enable(): void {
    this.config.enabled = true;
    this.startFlushTimer();
    this.logger.log('[JNE Observer] Shadow Mode ACTIVADO dinámicamente.');
  }

  disable(): void {
    this.config.enabled = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.logger.log('[JNE Observer] Shadow Mode DESACTIVADO dinámicamente.');
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  configure(partial: Partial<JneObserverConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Registro pasivo de inferencia exitosa
   */
  recordInferenceSuccess(
    options: LLMGenerateOptions,
    response: LLMGenerateResponse,
    providerName: string,
  ): void {
    if (!this.config.enabled) return;

    try {
      this.totalInferences++;
      this.latencySum += response.latencyMs || 0;

      const promptText = this.extractPromptExcerpt(options);
      const responseText = response.content || '';

      const isHijack = this.detectPassiveHijacking(promptText, responseText);
      if (isHijack) {
        this.totalHijackAlerts++;
      }

      const event: JneTelemetryEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        eventType: isHijack ? 'HIJACK_SUSPECTED' : 'INFERENCE_SUCCESS',
        provider: providerName,
        model: response.model || options.model || 'unknown',
        latencyMs: response.latencyMs || 0,
        status: 'OK',
        tokens: {
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          totalTokens: response.tokensUsed,
          tokensPerSecond: response.tokensPerSecond,
        },
        sensitivity: options.sensitivity || 'public',
        payloadRedacted: this.config.redactSensitiveData,
        promptExcerpt: this.redact(promptText),
        responseExcerpt: this.redact(responseText.substring(0, 300)),
        metadata: {
          isHijackRisk: isHijack,
          stream: Boolean(options.stream),
          temperature: options.temperature,
        },
      };

      this.enqueueEvent(event);
    } catch (err: any) {
      if (!this.config.silentFailures) {
        this.logger.warn(`Error en recordInferenceSuccess de JNE Observer: ${err.message}`);
      }
    }
  }

  /**
   * Registro pasivo de fallo de inferencia
   */
  recordInferenceFailure(
    options: LLMGenerateOptions,
    error: any,
    providerName: string,
  ): void {
    if (!this.config.enabled) return;

    try {
      this.totalFailures++;
      const promptText = this.extractPromptExcerpt(options);

      const event: JneTelemetryEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        eventType: 'INFERENCE_FAILURE',
        provider: providerName,
        model: options.model || 'unknown',
        latencyMs: 0,
        status: 'ERROR',
        sensitivity: options.sensitivity || 'public',
        payloadRedacted: this.config.redactSensitiveData,
        promptExcerpt: this.redact(promptText),
        error: String(error?.message || error || 'Unknown error'),
      };

      this.enqueueEvent(event);
    } catch (err: any) {
      if (!this.config.silentFailures) {
        this.logger.warn(`Error en recordInferenceFailure de JNE Observer: ${err.message}`);
      }
    }
  }

  /**
   * Registro pasivo de evento de conmutación de proveedor (Fallback)
   */
  recordFallback(
    primaryProvider: string,
    fallbackProvider: string,
    model: string,
    reason: string,
  ): void {
    if (!this.config.enabled) return;

    try {
      this.totalFallbacks++;
      const event: JneTelemetryEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        eventType: 'INFERENCE_FAILURE',
        provider: primaryProvider,
        model,
        latencyMs: 0,
        status: 'FALLBACK',
        sensitivity: 'public',
        payloadRedacted: false,
        error: `Conmutación a fallback (${fallbackProvider}): ${reason}`,
      };

      this.enqueueEvent(event);
    } catch (err: any) {
      if (!this.config.silentFailures) {
        this.logger.warn(`Error en recordFallback de JNE Observer: ${err.message}`);
      }
    }
  }

  /**
   * Registro de bloqueo por Data Privacy Gate
   */
  recordPrivacyBlocked(
    options: LLMGenerateOptions,
    provider: string,
    reason: string,
  ): void {
    if (!this.config.enabled) return;

    try {
      const event: JneTelemetryEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        eventType: 'DATA_PRIVACY_BLOCKED',
        provider,
        model: options.model || 'unknown',
        latencyMs: 0,
        status: 'BLOCKED',
        sensitivity: options.sensitivity || 'confidential',
        payloadRedacted: true,
        error: reason,
      };

      this.enqueueEvent(event);
    } catch (err: any) {
      if (!this.config.silentFailures) {
        this.logger.warn(`Error en recordPrivacyBlocked de JNE Observer: ${err.message}`);
      }
    }
  }

  /**
   * Consulta de métricas cognitivas consolidadas
   */
  getMetrics(): JneCognitiveMetrics {
    const avgLatency =
      this.totalInferences > 0 ? this.latencySum / this.totalInferences : 0;
    const ifid =
      this.totalInferences > 0
        ? Math.max(0, 1 - this.totalHijackAlerts / this.totalInferences)
        : 1.0;

    const lastEvent = this.eventQueue[this.eventQueue.length - 1];

    return {
      totalEventsObserved: this.eventQueue.length,
      totalInferences: this.totalInferences,
      totalFailures: this.totalFailures,
      totalFallbacks: this.totalFallbacks,
      totalHijackAlerts: this.totalHijackAlerts,
      intentionFidelityIndex: parseFloat(ifid.toFixed(4)),
      averageLatencyMs: parseFloat(avgLatency.toFixed(2)),
      lastObservedTimestamp: lastEvent?.timestamp,
    };
  }

  getRecentEvents(limit = 50): readonly JneTelemetryEvent[] {
    return this.eventQueue.slice(-limit);
  }

  clearQueue(): void {
    this.eventQueue.length = 0;
  }

  /**
   * Redactor defensivo de secretos y datos confidenciales
   */
  redact(text: string): string {
    if (!this.config.redactSensitiveData || !text) return text;

    return text
      .replace(/Bearer\s+[A-Za-z0-9_\-\.]{16,}/gi, 'Bearer [REDACTED]')
      .replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED_API_KEY]')
      .replace(
        /(password|secret|token|api_key|apikey)\s*[:=]\s*["']?[^\s"'\n]+["']?/gi,
        '$1: [REDACTED]',
      );
  }

  /**
   * Detector pasivo de secuestro léxico (Patrón Casos #001 y #002)
   */
  private detectPassiveHijacking(prompt: string, response: string): boolean {
    const isOperationalPrompt =
      /(MISI[OÓ]N|INCIDENTE|AUDITOR[IÍ]A|PREFLIGHT|STANDBY|REFACTOR|BUGFIX|PROYECTO)\b/i.test(
        prompt,
      );

    const isBookSummaryResponse =
      /(RESUMEN EJECUTIVO DE LA OBRA|RESUMEN DEL DOCUMENTO|PUNTOS CLAVE Y CONCEPTOS|MAPA DEL CONOCIMIENTO|Viaje astral|Guía para Pulseras|Carl Gustav Jung - 8 JUNG)/i.test(
        response,
      );

    return isOperationalPrompt && isBookSummaryResponse;
  }

  private extractPromptExcerpt(options: LLMGenerateOptions): string {
    if (!options.messages || options.messages.length === 0) return '';
    const lastMsg = options.messages[options.messages.length - 1];
    if (typeof lastMsg.content === 'string') {
      return lastMsg.content.substring(0, 300);
    }
    return '[Multimodal Payload]';
  }

  private enqueueEvent(event: JneTelemetryEvent): void {
    if (this.eventQueue.length >= this.config.maxQueueSize) {
      this.eventQueue.shift(); // Descarte FIFO para mantener ring buffer acotado
    }
    this.eventQueue.push(event);
  }

  private generateEventId(): string {
    return `jne_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private startFlushTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      // Periodic keepalive / unref to avoid blocking node event loop
    }, this.config.flushIntervalMs);
    if (this.flushTimer && typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }
}
