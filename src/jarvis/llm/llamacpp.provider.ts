import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
  LLMEmbeddingResponse,
} from './llm-provider.interface';

/**
 * Proveedor de inferencia local de alta velocidad basado en llama.cpp (llama-server)
 * optimizado para GPU NVIDIA (CUDA 13 en RTX 5070 Blackwell).
 */
@Injectable()
export class LlamaCppProvider implements ILLMProvider {
  private readonly logger = new Logger(LlamaCppProvider.name);
  private readonly baseURL: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseURL = process.env.LLAMACPP_BASE_URL || 'http://127.0.0.1:8080';
    this.defaultModel = process.env.LLAMACPP_DEFAULT_MODEL || 'qwen3:8b';
    this.timeoutMs = parseInt(process.env.LLAMACPP_TIMEOUT_MS || '30000', 10);
  }

  getProviderName(): string {
    return 'llamacpp';
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Comprueba disponibilidad y estado del servidor llama-server
   */
  async isAvailable(): Promise<boolean> {
    const health = await this.getDetailedHealth();
    return health.healthy;
  }

  /**
   * Comprueba estado detallado (salud de red, modelo listo para tokens, o modelo cargándose)
   */
  async getDetailedHealth(): Promise<{
    healthy: boolean;
    modelReady: boolean;
    loading: boolean;
  }> {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 2000,
      });
      const status = response.data?.status;
      const isOk = status === 'ok';
      const isLoading = status === 'loading model';
      return {
        healthy: response.status === 200 && (isOk || isLoading),
        modelReady: response.status === 200 && isOk,
        loading: isLoading,
      };
    } catch {
      return { healthy: false, modelReady: false, loading: false };
    }
  }

  /**
   * Normaliza alias comunes hacia los presets del router
   */
  private resolveModelAlias(modelName?: string): string {
    if (!modelName) return this.getDefaultModel();
    const clean = modelName.trim().toLowerCase();
    const aliasMap: Record<string, string> = {
      'qwen3:8b': 'qwen3:8b',
      'qwen3:1.7b': 'qwen3:8b',
      'qwen3:4b': 'qwen3:8b',
      'qwen3': 'qwen3:8b',
      'qwen2.5-coder:7b': 'qwen2.5-coder:7b',
      'qwen-coder': 'qwen2.5-coder:7b',
      'coder': 'qwen2.5-coder:7b',
    };
    return aliasMap[clean] || modelName;
  }

  /**
   * Generación de completado de chat compatible con API OpenAI /v1/chat/completions
   */
  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const startTime = Date.now();
    const targetModel = this.resolveModelAlias(options.model);
    const isThinkingEnabled = options.think === true;
    const requestTimeout =
      options.timeouts?.generationMs || options.timeoutMs || this.timeoutMs;

    const payload: Record<string, any> = {
      model: targetModel,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 512,
      stream: false,
      chat_template_kwargs: {
        enable_thinking: isThinkingEnabled,
      },
    };

    if (options.topP !== undefined) payload.top_p = options.topP;
    if (options.topK !== undefined) payload.top_k = options.topK;
    if (options.stopSequences && options.stopSequences.length > 0) {
      payload.stop = options.stopSequences;
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/v1/chat/completions`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: requestTimeout,
          signal: options.abortSignal,
        },
      );

      const choice = response.data?.choices?.[0];
      let content = choice?.message?.content || 'Sin respuesta';

      // Si thinking estaba explícitamente apagado, purgar cualquier residuo <think>
      if (!isThinkingEnabled && content.includes('<think>')) {
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      }

      return {
        content,
        model: targetModel,
        provider: this.getProviderName(),
        tokensUsed: response.data?.usage?.total_tokens,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const msg = err.message || String(err);
      this.logger.error(
        `[llamacpp] Error en inferencia (${targetModel} @ ${this.baseURL}): ${msg}`,
      );
      throw err;
    }
  }

  /**
   * Generación de embeddings: restringida en LlamaCppProvider para proteger el índice de pgvector
   */
  async embed(text: string): Promise<LLMEmbeddingResponse> {
    // llama-server en JarBees corre en Router Mode con modelos de chat/código (Qwen3, Coder).
    // Los embeddings vectoriales de JarBees (pgvector) utilizan estrictamente bge-m3 (1024 dims).
    throw new Error(
      'LlamaCppProvider: los modelos de chat/código no deben utilizarse para embeddings. JarBees utiliza EmbeddingsService con bge-m3 (1024 dims).',
    );
  }
}
