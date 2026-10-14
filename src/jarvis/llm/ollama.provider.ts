import { Injectable, Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
  LLMEmbeddingResponse,
  LLMMessage,
} from './llm-provider.interface';
import { resolveOllamaModelName } from '../../shared/ollama-config';
import { OllamaRecoveryService } from './ollama.recovery.service';

@Injectable()
export class OllamaProvider implements ILLMProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  private model: ChatOllama | null = null;

  constructor(private readonly recoveryService: OllamaRecoveryService) {}

  getProviderName(): string {
    return 'ollama';
  }

  getDefaultModel(): string {
    return resolveOllamaModelName('qwen3:8b');
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const startTime = Date.now();
    const requestedModel = options.model || this.getDefaultModel();

    // Crear modelo con numPredict dinámico según lo que pida cada llamada
    const numPredict = options.maxTokens ?? 512;
    const model = await this.getModel(
      numPredict,
      requestedModel,
      options.temperature,
      options.stopSequences,
    );

    // Convertir mensajes a formato LangChain
    const messages = options.messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          return new HumanMessage(msg.content);
      }
    });

    try {
      const response = await model.invoke(messages);

      const content =
        typeof response.content === 'string'
          ? response.content
          : Array.isArray(response.content)
            ? response.content.map((p: any) => p.text || '').join(' ')
            : 'Sin respuesta';

      return {
        content,
        model: requestedModel,
        provider: this.getProviderName(),
        latencyMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // Error de conexión — intentar recuperación automática antes de rendirse
      if (
        msg.includes('fetch failed') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('connect')
      ) {
        this.logger.warn(
          `[ollama] ECONNREFUSED detectado — intentando recuperación automática...`,
        );

        // OllamaRecoveryService levanta Ollama y espera hasta que responda.
        // Si el circuit breaker está abierto, lanza un error descriptivo.
        await this.recoveryService.recover();

        // Retry único — si Ollama respondió, esto debería funcionar
        this.logger.log('[ollama] Retry después de recovery exitoso');
        const retryResponse = await model.invoke(messages);
        const retryContent =
          typeof retryResponse.content === 'string'
            ? retryResponse.content
            : Array.isArray(retryResponse.content)
              ? retryResponse.content.map((p: any) => p.text || '').join(' ')
              : 'Sin respuesta';

        return {
          content: retryContent,
          model: this.getDefaultModel(),
          provider: this.getProviderName(),
          latencyMs: Date.now() - startTime,
        };
      }

      // Modelo no encontrado
      if (
        msg.includes('model') &&
        (msg.includes('not found') || msg.includes('404'))
      ) {
        this.logger.error(
          `[ollama] Modelo ${this.getDefaultModel()} no encontrado`,
        );
        throw new Error(
          `⚠️ El modelo "${this.getDefaultModel()}" no está descargado. ` +
            `Ejecutá "ollama pull ${this.getDefaultModel()}" para descargarlo.`,
        );
      }

      throw err;
    }
  }

  async embed(text: string): Promise<LLMEmbeddingResponse> {
    throw new Error('Embeddings not yet implemented for Ollama provider');
  }

  /**
   * Devuelve un modelo con los parámetros solicitados.
   * Soporta modelos de razonamiento (Qwen3, DeepSeek-R1) y modelos estándar.
   */
  private async getModel(
    numPredict: number,
    modelName?: string,
    temperature?: number,
    customStop?: string[],
  ): Promise<ChatOllama> {
    const targetModel = modelName || this.getDefaultModel();
    const isReasoning = targetModel.includes('deepseek-r1') || targetModel.includes('reasoning') || targetModel.includes('qwen3');

    if (
      this.model &&
      this.currentNumPredict === numPredict &&
      targetModel === this.getDefaultModel() &&
      temperature === undefined &&
      !customStop
    ) {
      return this.model;
    }

    if (
      numPredict === 512 &&
      targetModel === this.getDefaultModel() &&
      temperature === undefined &&
      !customStop
    ) {
      if (!this.model) await this.initialize();
      return this.model!;
    }

    const stopSequences = customStop !== undefined
      ? customStop
      : (isReasoning ? undefined : ['\n\n\n', 'User:', 'Usuario:', 'Pregunta:', 'Q:', 'Human:']);

    return new ChatOllama({
      model: targetModel,
      temperature: temperature ?? (isReasoning ? 0.6 : 0.10),
      topP: isReasoning ? 0.95 : 0.85,
      topK: isReasoning ? 40 : 20,
      numPredict,
      repeatPenalty: 1.10,
      numCtx: isReasoning ? 16384 : 8192,
      stop: stopSequences,
    });
  }

  private currentNumPredict = 512;

  private async initialize(): Promise<void> {
    this.currentNumPredict = 512;
    this.model = new ChatOllama({
      model: this.getDefaultModel(),
      temperature: 0.10,
      topP: 0.85,
      topK: 20,
      numPredict: 512,
      repeatPenalty: 1.10,
      numCtx: 8192,
      stop: ['\n\n\n', 'User:', 'Usuario:', 'Pregunta:', 'Q:', 'Human:'],
    });
    this.logger.log(
      `Ollama provider initialized (Qwen3:1.7B base profile: temp=0.10, topK=20, topP=0.85, ctx=8192): ${this.getDefaultModel()}`,
    );
  }
}
