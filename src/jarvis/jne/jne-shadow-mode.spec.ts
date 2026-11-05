import { JneObserverService } from './jne-observer.service';
import { InferenceGatewayService } from '../llm/inference-gateway.service';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
} from '../llm/llm-provider.interface';
import { ForbiddenException } from '@nestjs/common';

describe('JNE Shadow Mode — Batería de Validación E1–E9 y E4-B (Fase 0.2)', () => {
  let observer: JneObserverService;
  let mockPrimary: jest.Mocked<ILLMProvider>;
  let mockFallback: jest.Mocked<ILLMProvider>;
  let mockOpenRouter: jest.Mocked<ILLMProvider>;
  let gateway: InferenceGatewayService;

  beforeEach(() => {
    observer = new JneObserverService();
    observer.enable();

    mockPrimary = {
      getProviderName: jest.fn().mockReturnValue('llamacpp'),
      getDefaultModel: jest.fn().mockReturnValue('qwen3:8b'),
      isAvailable: jest.fn().mockResolvedValue(true),
      generate: jest.fn().mockResolvedValue({
        content: 'Respuesta técnica correcta del modelo.',
        model: 'qwen3:8b',
        provider: 'llamacpp',
        latencyMs: 120,
        tokensUsed: 45,
        promptTokens: 25,
        completionTokens: 20,
      } as LLMGenerateResponse),
    } as any;

    mockFallback = {
      getProviderName: jest.fn().mockReturnValue('ollama'),
      getDefaultModel: jest.fn().mockReturnValue('qwen3:8b'),
      isAvailable: jest.fn().mockResolvedValue(true),
      generate: jest.fn().mockResolvedValue({
        content: 'Respuesta generada vía fallback.',
        model: 'qwen3:8b',
        provider: 'ollama',
        latencyMs: 350,
      } as LLMGenerateResponse),
    } as any;

    mockOpenRouter = {
      getProviderName: jest.fn().mockReturnValue('openrouter'),
      getDefaultModel: jest.fn().mockReturnValue('qwen3:8b'),
      isAvailable: jest.fn().mockResolvedValue(true),
      generate: jest.fn().mockResolvedValue({
        content: 'Respuesta cloud.',
        model: 'qwen3:8b',
        provider: 'openrouter',
        latencyMs: 500,
      } as LLMGenerateResponse),
    } as any;

    gateway = new InferenceGatewayService(
      mockPrimary as any,
      mockFallback as any,
      mockOpenRouter as any,
      undefined,
      observer,
    );
  });

  afterEach(() => {
    observer.shutdown();
  });

  // ── E1: Idempotencia y Cero Impacto (ON vs OFF) ──────────────────────────────
  test('E1: Observer ON vs OFF no altera en absoluto la respuesta de la pasarela', async () => {
    const options: LLMGenerateOptions = {
      messages: [{ role: 'user', content: 'Calcular hash SHA-256' }],
    };

    // 1. Ejecución con Observer ON
    observer.enable();
    const resOn = await gateway.generate(options);

    // 2. Ejecución con Observer OFF
    observer.disable();
    const resOff = await gateway.generate(options);

    expect(resOn.content).toBe(resOff.content);
    expect(resOn.model).toBe(resOff.model);
    expect(resOn.provider).toBe(resOff.provider);
  });

  // ── E2: Captura de Telemetría de Frontera ────────────────────────────────────
  test('E2: Captura de telemetría con latency, modelo, proveedor y tokens', async () => {
    const options: LLMGenerateOptions = {
      messages: [{ role: 'user', content: 'Auditoría de memoria' }],
    };

    await gateway.generate(options);

    const events = observer.getRecentEvents(10);
    expect(events.length).toBeGreaterThanOrEqual(1);

    const event = events[events.length - 1];
    expect(event.eventType).toBe('INFERENCE_SUCCESS');
    expect(event.provider).toBe('llamacpp');
    expect(event.model).toBe('qwen3:8b');
    expect(event.latencyMs).toBe(120);
    expect(event.tokens?.totalTokens).toBe(45);
    expect(event.status).toBe('OK');
  });

  // ── E3: Validación de Esquema de Eventos ─────────────────────────────────────
  test('E3: Cumplimiento de contrato y estructura de JneTelemetryEvent', async () => {
    const options: LLMGenerateOptions = {
      messages: [{ role: 'user', content: 'Prueba de contrato' }],
    };

    await gateway.generate(options);
    const event = observer.getRecentEvents(1)[0];

    expect(event.id).toMatch(/^jne_\d+_[a-z0-9]+$/);
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(typeof event.payloadRedacted).toBe('boolean');
    expect(['public', 'private', 'confidential']).toContain(event.sensitivity);
  });

  // ── E4 & E4-B: Privacidad, Data Privacy Gate y Redacción de Secretos ─────────
  test('E4: Data Privacy Gate bloquea inferencia cloud con datos confidenciales y lo audita', async () => {
    const sensitiveOptions: LLMGenerateOptions = {
      messages: [{ role: 'user', content: 'Consulta confidencial con api_key privada' }],
      model: 'openrouter:qwen3:8b',
      sensitivity: 'confidential',
      allowRemoteFallback: false,
    };

    await expect(gateway.generate(sensitiveOptions)).rejects.toThrow(
      ForbiddenException,
    );

    const events = observer.getRecentEvents(5);
    const blockedEvent = events.find((e) => e.eventType === 'DATA_PRIVACY_BLOCKED');
    expect(blockedEvent).toBeDefined();
    expect(blockedEvent?.status).toBe('BLOCKED');
    expect(blockedEvent?.sensitivity).toBe('confidential');
  });

  test('E4-B: Redacción automática de secretos (Tokens, API Keys, Passwords)', () => {
    const dirtyText =
      'Usuario autenticado con Bearer abc1234567890123456789 y apiKey: sk-1234567890abcdef1234567890 con password: "MiClaveSecreta123"';
    const redacted = observer.redact(dirtyText);

    expect(redacted).not.toContain('Bearer abc1234567890123456789');
    expect(redacted).toContain('Bearer [REDACTED]');
    expect(redacted).not.toContain('sk-1234567890abcdef1234567890');
    expect(redacted).toContain('apiKey: [REDACTED]');
    expect(redacted).not.toContain('MiClaveSecreta123');
    expect(redacted).toContain('password: [REDACTED]');
  });

  // ── E5: Gestión de Cola Acotada (Ring Buffer FIFO) ──────────────────────────
  test('E5: Ring buffer respeta maxQueueSize descartando eventos antiguos en FIFO', () => {
    observer.configure({ maxQueueSize: 5 });

    for (let i = 0; i < 10; i++) {
      observer.recordInferenceSuccess(
        { messages: [{ role: 'user', content: `Consulta #${i}` }] },
        { content: `Resp #${i}`, model: 'qwen3:8b', provider: 'llamacpp', latencyMs: 10 },
        'llamacpp',
      );
    }

    const events = observer.getRecentEvents(10);
    expect(events.length).toBe(5);
    expect(events[events.length - 1].promptExcerpt).toContain('Consulta #9');
  });

  // ── E6: Resiliencia Fail-Safe (El Observer jamás rompe la inferencia) ─────────
  test('E6: Si el Observer falla internamente, la inferencia de la pasarela no se interrumpe', async () => {
    // Forzar fallo interno en el método enqueue
    jest.spyOn(observer as any, 'enqueueEvent').mockImplementationOnce(() => {
      throw new Error('Fallo crítico simulado de memoria en Observer');
    });

    const options: LLMGenerateOptions = {
      messages: [{ role: 'user', content: 'Consulta bajo fallo de observador' }],
    };

    // La llamada debe completar con éxito sin lanzar error
    const res = await gateway.generate(options);
    expect(res.content).toBe('Respuesta técnica correcta del modelo.');
  });

  // ── E7: Graceful Shutdown y Teardown Limpio ──────────────────────────────────
  test('E7: Shutdown libera colas e intervalos sin handles pendientes', () => {
    observer.enable();
    expect(observer.isEnabled()).toBe(true);

    observer.shutdown();
    expect(observer.getRecentEvents().length).toBe(0);
  });

  // ── E8: Observación de Conmutación Transparente (Fallback) ───────────────────
  test('E8: Observa y registra el evento de Fallback cuando el primario falla', async () => {
    mockPrimary.generate.mockRejectedValueOnce(
      new Error('ECONNREFUSED: llama-server no responde'),
    );

    const options: LLMGenerateOptions = {
      messages: [{ role: 'user', content: 'Consulta con fallback' }],
    };

    const res = await gateway.generate(options);

    expect(res.provider).toBe('openrouter');
    expect(res.content).toBe('Respuesta cloud.');

    const events = observer.getRecentEvents(10);
    const failureEvent = events.find((e) => e.status === 'ERROR');
    const fallbackSuccess = events.find((e) => e.provider === 'openrouter');

    expect(failureEvent).toBeDefined();
    expect(fallbackSuccess).toBeDefined();
    expect(observer.getMetrics().totalFallbacks).toBe(1);
  });

  // ── E9: Detección Pasiva de Secuestro Léxico (Casos #001 y #002) ─────────────
  test('E9: Detecta secuestro léxico (Patrón Jung/Pulseras) y calcula el Índice IFID', async () => {
    // Simular el Caso #002: Prompt operativo que recibe un resumen bibliográfico espurio
    mockPrimary.generate.mockResolvedValueOnce({
      content:
        '### RESUMEN EJECUTIVO DE LA OBRA: "Carl Gustav Jung - 8 JUNG"\nAutor: Carl Gustav Jung',
      model: 'qwen3:8b',
      provider: 'llamacpp',
      latencyMs: 12000,
    });

    const hijackPrompt: LLMGenerateOptions = {
      messages: [
        {
          role: 'user',
          content:
            'REGISTRO DE INCIDENTE FORENSE — ANEXO JNE-006.5-A: NO eliminar documento Jung...',
        },
      ],
    };

    await gateway.generate(hijackPrompt);

    const events = observer.getRecentEvents(5);
    const alert = events.find((e) => e.eventType === 'HIJACK_SUSPECTED');
    expect(alert).toBeDefined();
    expect(alert?.metadata?.isHijackRisk).toBe(true);

    const metrics = observer.getMetrics();
    expect(metrics.totalHijackAlerts).toBe(1);
    expect(metrics.intentionFidelityIndex).toBeLessThan(1.0);
  });
});
