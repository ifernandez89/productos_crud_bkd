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
 * optimizado para GPU NVIDIA (CUDA 13 en RTX 5070 Blackwell, 12 GB VRAM, -c 6144, -np 1).
 */
@Injectable()
export class LlamaCppProvider implements ILLMProvider {
  private readonly logger = new Logger(LlamaCppProvider.name);
  private readonly baseURL: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly defaultConnectTimeoutMs: number;
  private readonly reservedOutputTokens: number;

  constructor() {
    this.baseURL = process.env.LLAMACPP_BASE_URL || 'http://127.0.0.1:8080';
    this.defaultModel = process.env.LLAMACPP_DEFAULT_MODEL || 'qwen3:8b';
    this.timeoutMs = parseInt(process.env.LLAMACPP_TIMEOUT_MS || '45000', 10);
    this.defaultConnectTimeoutMs = parseInt(
      process.env.LLAMACPP_CONNECT_TIMEOUT_MS || '5000',
      10,
    );
    this.reservedOutputTokens = parseInt(
      process.env.LLAMACPP_RESERVED_OUTPUT_TOKENS || '1024',
      10,
    );
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
        headers: { Connection: 'close' },
        validateStatus: () => true,
      });
      const status = response.data?.status;
      const errMsg = String(response.data?.error?.message || '').toLowerCase();
      const isOk = response.status === 200 && status === 'ok';
      const isLoading =
        status === 'loading model' || errMsg.includes('loading model');
      const isSlotBusy =
        response.status === 503 &&
        (status === 'no slot available' || errMsg.includes('slot'));
      return {
        healthy: isOk || isLoading || isSlotBusy,
        modelReady: isOk || isSlotBusy,
        loading: isLoading,
      };
    } catch {
      return { healthy: false, modelReady: false, loading: false };
    }
  }

  /**
   * Normaliza alias comunes hacia los presets del router (incluyendo Qwen2.5-Coder-14B y 7B)
   */
  resolveModelAlias(modelName?: string): string {
    if (!modelName) return this.getDefaultModel();
    const clean = modelName.trim().toLowerCase();
    const configuredCoder =
      process.env.LLAMACPP_CODER_MODEL || 'qwen2.5-coder:7b';
    const aliasMap: Record<string, string> = {
      'qwen3:8b': 'qwen3:8b',
      'qwen3:1.7b': 'qwen3:8b',
      'qwen3:4b': 'qwen3:8b',
      qwen3: 'qwen3:8b',
      'qwen2.5-coder:7b': 'qwen2.5-coder:7b',
      'qwen2.5-coder:14b': 'qwen2.5-coder:14b',
      'qwen2.5-coder-14b': 'qwen2.5-coder:14b',
      'qwen-coder-14b': 'qwen2.5-coder:14b',
      'coder-14b': 'qwen2.5-coder:14b',
      'qwen-coder': configuredCoder,
      coder: configuredCoder,
    };
    return aliasMap[clean] || modelName;
  }

  /**
   * Verifica explícitamente si un identificador o alias corresponde a un preset GGUF registrado
   * en JarBees (evitando asumir que llama-server reconoce cualquier tag de Ollama).
   */
  verifyModelAlias(modelName?: string): {
    requested: string;
    resolvedAlias: string;
    isRegisteredPreset: boolean;
    expectedGgufFile?: string;
  } {
    const requested = modelName || this.getDefaultModel();
    const resolvedAlias = this.resolveModelAlias(requested);
    const ggufMap: Record<string, string> = {
      'qwen3:8b': 'Qwen3-8B-Q4_K_M.gguf',
      'qwen2.5-coder:7b': 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
      'qwen2.5-coder:14b': 'qwen2.5-coder-14b-q4_k_m.gguf',
    };
    const expectedGgufFile = ggufMap[resolvedAlias];
    return {
      requested,
      resolvedAlias,
      isRegisteredPreset: Boolean(expectedGgufFile),
      expectedGgufFile,
    };
  }

  /**
   * Generación de completado de chat compatible con API OpenAI /v1/chat/completions.
   * Soporta modo sincrónico JSON y modo Streaming SSE con diferenciación de
   * connectTimeout vs generationTimeout y cancelación por AbortSignal.
   */
  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    if (options.abortSignal?.aborted) {
      const abortErr: any = new Error(
        'ABORTED: solicitud cancelada antes de iniciar inferencia en llama.cpp',
      );
      abortErr.code = 'ABORTED';
      throw abortErr;
    }

    const startTime = Date.now();
    const targetModel = this.resolveModelAlias(options.model);
    const isThinkingEnabled = options.think === true;
    const useStreaming =
      options.stream === true || typeof options.onToken === 'function';

    const connectTimeoutMs =
      options.timeouts?.connectMs ?? this.defaultConnectTimeoutMs;
    const generationTimeoutMs =
      options.timeouts?.generationMs || options.timeoutMs || this.timeoutMs;
    const maxTokens =
      options.maxTokens ??
      options.reservedOutputTokens ??
      this.reservedOutputTokens;

    const payload: Record<string, any> = {
      model: targetModel,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.1,
      max_tokens: maxTokens,
      stream: useStreaming,
      chat_template_kwargs: {
        enable_thinking: isThinkingEnabled,
      },
    };

    if (options.topP !== undefined) payload.top_p = options.topP;
    if (options.topK !== undefined) payload.top_k = options.topK;
    if (options.stopSequences && options.stopSequences.length > 0) {
      payload.stop = options.stopSequences;
    }

    if (useStreaming) {
      return this.generateStreaming(
        payload,
        targetModel,
        isThinkingEnabled,
        connectTimeoutMs,
        generationTimeoutMs,
        startTime,
        options,
      );
    }

    const internalAbort = new AbortController();
    let connectTimer: NodeJS.Timeout | undefined;
    let generationTimer: NodeJS.Timeout | undefined;
    let timedOutPhase: 'CONNECT_TIMEOUT' | 'GENERATION_TIMEOUT' | null = null;

    if (
      options.timeouts?.connectMs !== undefined &&
      options.timeouts.connectMs > 0 &&
      options.timeouts.connectMs < generationTimeoutMs
    ) {
      connectTimer = setTimeout(() => {
        timedOutPhase = 'CONNECT_TIMEOUT';
        internalAbort.abort();
      }, options.timeouts.connectMs);
      connectTimer.unref?.();
    }

    generationTimer = setTimeout(() => {
      if (!timedOutPhase) timedOutPhase = 'GENERATION_TIMEOUT';
      internalAbort.abort();
    }, generationTimeoutMs);
    generationTimer.unref?.();

    const onExternalAbort = () => internalAbort.abort();
    options.abortSignal?.addEventListener('abort', onExternalAbort, {
      once: true,
    });

    try {
      const responsePromise = axios.post(
        `${this.baseURL}/v1/chat/completions`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Connection: 'close',
          },
          timeout: generationTimeoutMs,
          signal: internalAbort.signal,
        },
      );

      const response = await responsePromise;
      if (connectTimer) clearTimeout(connectTimer);

      const choice = response.data?.choices?.[0];
      let content = choice?.message?.content || 'Sin respuesta';

      if (!isThinkingEnabled && content.includes('<think>')) {
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      }

      const usage = response.data?.usage;
      const timings = response.data?.timings;
      const elapsedMs = Math.max(1, Date.now() - startTime);
      const completionTokens =
        usage?.completion_tokens ?? timings?.predicted_n;
      const tokensPerSecond =
        timings?.predicted_per_second ??
        (completionTokens ? (completionTokens / elapsedMs) * 1000 : undefined);

      const requestId =
        response.data?.id ||
        `llamacpp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      return {
        content,
        model: targetModel,
        provider: this.getProviderName(),
        requestId,
        httpStatus: response.status,
        endpointUrl: `${this.baseURL}/v1/chat/completions`,
        tokensUsed: usage?.total_tokens,
        promptTokens: usage?.prompt_tokens ?? timings?.prompt_n,
        completionTokens,
        tokensPerSecond: tokensPerSecond
          ? Number(tokensPerSecond.toFixed(2))
          : undefined,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      if (options.abortSignal?.aborted) {
        const abortErr: any = new Error(
          'ABORTED: petición cancelada por el cliente durante inferencia llama.cpp',
        );
        abortErr.code = 'ABORTED';
        throw abortErr;
      }
      if (timedOutPhase === 'CONNECT_TIMEOUT') {
        const connErr: any = new Error(
          `CONNECT_TIMEOUT: llama-server no respondió en los primeros ${connectTimeoutMs}ms`,
        );
        connErr.code = 'CONNECT_TIMEOUT';
        throw connErr;
      }
      if (timedOutPhase === 'GENERATION_TIMEOUT') {
        const genErr: any = new Error(
          `GENERATION_TIMEOUT: la generación en llama-server excedió ${generationTimeoutMs}ms`,
        );
        genErr.code = 'GENERATION_TIMEOUT';
        throw genErr;
      }

      const msg = err.message || String(err);
      this.logger.error(
        `[llamacpp] Error en inferencia (${targetModel} @ ${this.baseURL}): ${msg}`,
      );
      throw err;
    } finally {
      if (connectTimer) clearTimeout(connectTimer);
      if (generationTimer) clearTimeout(generationTimer);
      options.abortSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Ejecución SSE (Server-Sent Events) sobre /v1/chat/completions con stream: true.
   */
  private async generateStreaming(
    payload: Record<string, any>,
    targetModel: string,
    isThinkingEnabled: boolean,
    connectTimeoutMs: number,
    generationTimeoutMs: number,
    startTime: number,
    options: LLMGenerateOptions,
  ): Promise<LLMGenerateResponse> {
    const internalAbort = new AbortController();
    let connectTimer: NodeJS.Timeout | undefined;
    let generationTimer: NodeJS.Timeout | undefined;
    let timedOutPhase: 'CONNECT_TIMEOUT' | 'GENERATION_TIMEOUT' | null = null;

    connectTimer = setTimeout(() => {
      timedOutPhase = 'CONNECT_TIMEOUT';
      internalAbort.abort();
    }, connectTimeoutMs);
    connectTimer.unref?.();

    generationTimer = setTimeout(() => {
      if (!timedOutPhase) timedOutPhase = 'GENERATION_TIMEOUT';
      internalAbort.abort();
    }, generationTimeoutMs);
    generationTimer.unref?.();

    const onExternalAbort = () => internalAbort.abort();
    options.abortSignal?.addEventListener('abort', onExternalAbort, {
      once: true,
    });

    try {
      const response = await axios.post(
        `${this.baseURL}/v1/chat/completions`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Connection: 'close',
          },
          responseType: 'stream',
          timeout: generationTimeoutMs,
          signal: internalAbort.signal,
        },
      );

      // Recibimos cabeceras HTTP -> limpiar connectTimer
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = undefined;
      }

      const streamData = response.data;

      // Compatibilidad con mocks que devuelven JSON directo en lugar de ReadableStream
      if (streamData && typeof streamData.on !== 'function') {
        const directContent =
          streamData?.choices?.[0]?.message?.content || 'Sin respuesta';
        if (options.onToken && directContent) {
          options.onToken(directContent);
        }
        return {
          content: directContent,
          model: targetModel,
          provider: this.getProviderName(),
          tokensUsed: streamData?.usage?.total_tokens,
          latencyMs: Date.now() - startTime,
        };
      }

      let fullContent = '';
      let sseBuffer = '';
      let promptTokens: number | undefined;
      let completionTokens = 0;

      await new Promise<void>((resolve, reject) => {
        let doneReceived = false;
        streamData.on('data', (chunk: Buffer | string) => {
          sseBuffer += chunk.toString('utf8');
          const lines = sseBuffer.split(/\r?\n/);
          sseBuffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || !line.startsWith('data:')) continue;
            const dataPayload = line.slice(5).trim();
            if (dataPayload === '[DONE]') {
              doneReceived = true;
              continue;
            }
            try {
              const parsed = JSON.parse(dataPayload);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                fullContent += delta;
                completionTokens++;
                options.onToken?.(delta);
              }
              if (parsed?.usage?.prompt_tokens) {
                promptTokens = parsed.usage.prompt_tokens;
              }
              if (parsed?.usage?.completion_tokens) {
                completionTokens = parsed.usage.completion_tokens;
              }
            } catch {
              // Ignorar líneas parciales o keep-alive comments
            }
          }
        });

        streamData.on('end', () => resolve());
        streamData.on('close', () => {
          if (doneReceived) resolve();
        });
        streamData.on('error', (streamErr: Error) => reject(streamErr));
      });

      if (!isThinkingEnabled && fullContent.includes('<think>')) {
        fullContent = fullContent
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .trim();
      }

      const elapsedMs = Math.max(1, Date.now() - startTime);
      const tokensPerSecond =
        completionTokens > 0
          ? Number(((completionTokens / elapsedMs) * 1000).toFixed(2))
          : undefined;

      return {
        content: fullContent || 'Sin respuesta',
        model: targetModel,
        provider: this.getProviderName(),
        requestId: `llamacpp_sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        httpStatus: response.status,
        endpointUrl: `${this.baseURL}/v1/chat/completions`,
        tokensUsed:
          promptTokens !== undefined
            ? promptTokens + completionTokens
            : completionTokens,
        promptTokens,
        completionTokens,
        tokensPerSecond,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      if (options.abortSignal?.aborted) {
        const abortErr: any = new Error(
          'ABORTED: stream SSE cancelado por el cliente',
        );
        abortErr.code = 'ABORTED';
        throw abortErr;
      }
      if (timedOutPhase === 'CONNECT_TIMEOUT') {
        const connErr: any = new Error(
          `CONNECT_TIMEOUT: sin conexión SSE en ${connectTimeoutMs}ms`,
        );
        connErr.code = 'CONNECT_TIMEOUT';
        throw connErr;
      }
      if (timedOutPhase === 'GENERATION_TIMEOUT') {
        const genErr: any = new Error(
          `GENERATION_TIMEOUT: stream SSE excedió ${generationTimeoutMs}ms`,
        );
        genErr.code = 'GENERATION_TIMEOUT';
        throw genErr;
      }
      throw err;
    } finally {
      if (connectTimer) clearTimeout(connectTimer);
      if (generationTimer) clearTimeout(generationTimer);
      options.abortSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Generación de embeddings: restringida en LlamaCppProvider para proteger el índice de pgvector
   */
  async embed(_text: string): Promise<LLMEmbeddingResponse> {
    throw new Error(
      'LlamaCppProvider: los modelos de chat/código no deben utilizarse para embeddings. JarBees utiliza EmbeddingsService con bge-m3 (1024 dims).',
    );
  }
}
