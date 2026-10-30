import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { LlamaCppProvider } from './llamacpp.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LlamaCppProvider', () => {
  let provider: LlamaCppProvider;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LlamaCppProvider],
    }).compile();

    provider = module.get<LlamaCppProvider>(LlamaCppProvider);
  });

  it('debe tener el nombre de proveedor correcto', () => {
    expect(provider.getProviderName()).toBe('llamacpp');
  });

  it('debe devolver qwen3:8b como modelo por defecto', () => {
    expect(provider.getDefaultModel()).toBe('qwen3:8b');
  });

  describe('isAvailable', () => {
    it('debe devolver true cuando /health responde 200 ok', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'ok' },
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/health'),
        expect.any(Object),
      );
    });

    it('debe devolver false cuando /health falla o se cae la red', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('generate', () => {
    it('debe enviar la estructura OpenAI compatible con enable_thinking: false por defecto', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: 'Respuesta generada por llama.cpp',
              },
            },
          ],
          usage: { total_tokens: 42 },
        },
      });

      const res = await provider.generate({
        messages: [{ role: 'user', content: 'Hola mundo' }],
        temperature: 0.2,
        maxTokens: 256,
      });

      expect(res.content).toBe('Respuesta generada por llama.cpp');
      expect(res.provider).toBe('llamacpp');
      expect(res.tokensUsed).toBe(42);
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/completions'),
        expect.objectContaining({
          model: 'qwen3:8b',
          messages: [{ role: 'user', content: 'Hola mundo' }],
          temperature: 0.2,
          max_tokens: 256,
          chat_template_kwargs: {
            enable_thinking: false,
          },
        }),
        expect.any(Object),
      );
    });

    it('debe purgar bloques <think> si thinking no está habilitado', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: '<think>pensamiento interno residual</think>Respuesta final limpia',
              },
            },
          ],
          usage: { total_tokens: 30 },
        },
      });

      const res = await provider.generate({
        messages: [{ role: 'user', content: '¿Cuánto es 2+2?' }],
      });

      expect(res.content).toBe('Respuesta final limpia');
      expect(res.content).not.toContain('<think>');
    });

    it('debe habilitar thinking si options.think es true', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: '<think>razonando paso a paso</think>Solución explicada',
              },
            },
          ],
        },
      });

      const res = await provider.generate({
        messages: [{ role: 'user', content: 'Problema complejo' }],
        think: true,
      });

      expect(res.content).toContain('<think>razonando paso a paso</think>');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chat_template_kwargs: {
            enable_thinking: true,
          },
        }),
        expect.any(Object),
      );
    });

    it('debe soportar streaming SSE con onToken y ensamblar el contenido completo', async () => {
      const { EventEmitter } = require('events');
      const fakeStream = new EventEmitter();

      mockedAxios.post.mockImplementationOnce(async () => {
        setImmediate(() => {
          fakeStream.emit(
            'data',
            Buffer.from(
              'data: {"choices":[{"delta":{"content":"export const "}}]}\n\n' +
                'data: {"choices":[{"delta":{"content":"x = 42;"}}]}\n\n' +
                'data: [DONE]\n\n',
            ),
          );
          fakeStream.emit('end');
        });
        return { status: 200, data: fakeStream } as any;
      });

      const tokens: string[] = [];
      const res = await provider.generate({
        model: 'qwen2.5-coder:14b',
        stream: true,
        onToken: (t) => tokens.push(t),
        messages: [{ role: 'user', content: 'Genera x = 42' }],
      });

      expect(tokens).toEqual(['export const ', 'x = 42;']);
      expect(res.content).toBe('export const x = 42;');
      expect(res.model).toBe('qwen2.5-coder:14b');
    });

    it('debe cancelar inmediatamente si abortSignal ya está abortado', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        provider.generate({
          messages: [{ role: 'user', content: 'Cancelado' }],
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow(/ABORTED/);
    });
  });

  describe('embed', () => {
    it('debe proteger contra el uso de modelos de chat para embeddings preservando bge-m3 1024 dims', async () => {
      await expect(provider.embed('Texto para vectorizar')).rejects.toThrow(
        /bge-m3 \(1024 dims\)/,
      );
    });
  });
});
