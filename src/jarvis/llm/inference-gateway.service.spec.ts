import { Test, TestingModule } from '@nestjs/testing';
import { InferenceGatewayService } from './inference-gateway.service';
import { LlamaCppProvider } from './llamacpp.provider';
import { OllamaProvider } from './ollama.provider';
import { OpenRouterProvider } from './openrouter.provider';
import { LLMGenerateResponse } from './llm-provider.interface';

describe('InferenceGatewayService', () => {
  let gateway: InferenceGatewayService;
  let llamaCppMock: jest.Mocked<LlamaCppProvider>;
  let ollamaMock: jest.Mocked<OllamaProvider>;
  let openRouterMock: jest.Mocked<OpenRouterProvider>;

  beforeEach(async () => {
    llamaCppMock = {
      getProviderName: jest.fn().mockReturnValue('llamacpp'),
      getDefaultModel: jest.fn().mockReturnValue('qwen3:8b'),
      isAvailable: jest.fn().mockResolvedValue(true),
      generate: jest.fn(),
      embed: jest.fn(),
    } as any;

    ollamaMock = {
      getProviderName: jest.fn().mockReturnValue('ollama'),
      getDefaultModel: jest.fn().mockReturnValue('qwen3:8b'),
      isAvailable: jest.fn().mockResolvedValue(true),
      generate: jest.fn(),
      embed: jest.fn(),
    } as any;

    openRouterMock = {
      getProviderName: jest.fn().mockReturnValue('openrouter'),
      getDefaultModel: jest.fn().mockReturnValue('mistral'),
      isAvailable: jest.fn().mockResolvedValue(false),
      generate: jest.fn(),
      embed: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InferenceGatewayService,
        { provide: LlamaCppProvider, useValue: llamaCppMock },
        { provide: OllamaProvider, useValue: ollamaMock },
        { provide: OpenRouterProvider, useValue: openRouterMock },
      ],
    }).compile();

    gateway = module.get<InferenceGatewayService>(InferenceGatewayService);
  });

  it('debe tener a llamacpp como proveedor primario y ollama como fallback por defecto', () => {
    expect(gateway.getPrimaryProvider().getProviderName()).toBe('llamacpp');
    expect(gateway.getFallbackProvider().getProviderName()).toBe('ollama');
  });

  describe('generate', () => {
    it('debe usar el motor primario (llamacpp) cuando está saludable', async () => {
      const mockResponse: LLMGenerateResponse = {
        content: 'Respuesta rápida desde RTX 5070',
        model: 'qwen3:8b',
        provider: 'llamacpp',
        latencyMs: 15,
      };

      llamaCppMock.generate.mockResolvedValueOnce(mockResponse);

      const result = await gateway.generate({
        messages: [{ role: 'user', content: 'Hola' }],
      });

      expect(result).toEqual(mockResponse);
      expect(llamaCppMock.generate).toHaveBeenCalledTimes(1);
      expect(ollamaMock.generate).not.toHaveBeenCalled();
    });

    it('debe conmutar automáticamente a Ollama si llamacpp falla por ECONNREFUSED', async () => {
      llamaCppMock.generate.mockRejectedValueOnce(
        new Error('connect ECONNREFUSED 127.0.0.1:8080'),
      );

      const fallbackResponse: LLMGenerateResponse = {
        content: 'Respuesta recuperada desde Ollama fallback',
        model: 'qwen3:8b',
        provider: 'ollama',
        latencyMs: 120,
      };

      ollamaMock.generate.mockResolvedValueOnce(fallbackResponse);

      const result = await gateway.generate({
        messages: [{ role: 'user', content: 'Pregunta crítica' }],
      });

      expect(result.content).toBe('Respuesta recuperada desde Ollama fallback');
      expect(result.provider).toBe('ollama');
      expect(llamaCppMock.generate).toHaveBeenCalledTimes(1);
      expect(ollamaMock.generate).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar error compuesto si tanto llamacpp como ollama fallan', async () => {
      llamaCppMock.generate.mockRejectedValueOnce(new Error('llamacpp caído'));
      ollamaMock.generate.mockRejectedValueOnce(new Error('ollama caído'));

      await expect(
        gateway.generate({
          messages: [{ role: 'user', content: 'Test caída total' }],
        }),
      ).rejects.toThrow(/InferenceGateway: todos los motores locales fallaron/);
    });

    it('debe respetar prefijo explícito en el modelo (ej: ollama:qwen3:8b)', async () => {
      const explicitResponse: LLMGenerateResponse = {
        content: 'Respuesta directa de Ollama',
        model: 'qwen3:8b',
        provider: 'ollama',
        latencyMs: 50,
      };

      ollamaMock.generate.mockResolvedValueOnce(explicitResponse);

      const result = await gateway.generate({
        model: 'ollama:qwen3:8b',
        messages: [{ role: 'user', content: 'Forzando Ollama' }],
      });

      expect(result.provider).toBe('ollama');
      expect(ollamaMock.generate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'qwen3:8b' }),
      );
      expect(llamaCppMock.generate).not.toHaveBeenCalled();
    });
  });

  describe('getHealthStatus', () => {
    it('debe reportar estado de disponibilidad y telemetría enriquecida', async () => {
      llamaCppMock.getDetailedHealth = jest.fn().mockResolvedValue({
        healthy: true,
        loading: false,
      });

      const health = await gateway.getHealthStatus();

      expect(health.primary).toBe('llamacpp');
      expect(health.fallback).toBe('ollama');
      expect(health.activeProvider).toBe('llamacpp');
      expect(health.serverHealthy).toBe(true);
      expect(health.modelLoading).toBe(false);
      expect(health.circuitBreaker).toBe('closed');
      expect(health.autoFallbackEnabled).toBe(true);
      expect(health.providers.llamacpp.available).toBe(true);
      expect(health.providers.ollama.available).toBe(true);
      expect(health.providers.openrouter.available).toBe(false);
    });
  });

  describe('embed', () => {
    it('debe delegar el cálculo de embeddings estrictamente a Ollama (bge-m3 1024 dims)', async () => {
      const mockVector = [0.1, 0.2, 0.3];
      ollamaMock.embed.mockResolvedValueOnce({
        embedding: mockVector,
        model: 'bge-m3:latest',
        provider: 'ollama',
      });

      const res = await gateway.embed('Texto a vectorizar');
      expect(res.provider).toBe('ollama');
      expect(ollamaMock.embed).toHaveBeenCalledWith('Texto a vectorizar');
    });
  });
});
