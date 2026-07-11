import { Injectable, Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
  LLMEmbeddingResponse,
  LLMMessage,
} from './llm-provider.interface';
import { resolveOllamaModelName } from '../../shared/ollama-config';

@Injectable()
export class OllamaProvider implements ILLMProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  private model: ChatOllama | null = null;

  getProviderName(): string {
    return 'ollama';
  }

  getDefaultModel(): string {
    return resolveOllamaModelName('llama3.2:3b');
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const startTime = Date.now();

    // Crear modelo con numPredict dinámico según lo que pida cada llamada
    // Esto evita que el 400 hardcodeado corte respuestas largas (resúmenes, comparaciones)
    const numPredict = options.maxTokens ?? 400;
    const model = await this.getModel(numPredict);

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
        model: this.getDefaultModel(),
        provider: this.getProviderName(),
        latencyMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // Error de conexión — Ollama no está corriendo
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('connect')) {
        this.logger.error(`[ollama] No se puede conectar con Ollama en localhost:11434. ¿Está corriendo?`);
        throw new Error(
          '⚠️ No puedo responder en este momento porque el modelo de IA local (Ollama) no está disponible. ' +
          'Por favor iniciá Ollama ejecutando "ollama serve" en una terminal y volvé a intentar.',
        );
      }

      // Modelo no encontrado
      if (msg.includes('model') && (msg.includes('not found') || msg.includes('404'))) {
        this.logger.error(`[ollama] Modelo ${this.getDefaultModel()} no encontrado`);
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
   * Devuelve un modelo con el numPredict solicitado.
   * Reutiliza el modelo cacheado si el numPredict coincide,
   * sino crea uno nuevo (costo mínimo — solo cambia un parámetro).
   */
  private async getModel(numPredict: number): Promise<ChatOllama> {
    if (this.model && this.currentNumPredict === numPredict) {
      return this.model;
    }
    // Para el modelo "default" (400 tokens) cacheamos
    if (numPredict === 400) {
      if (!this.model) await this.initialize();
      return this.model!;
    }
    // Para llamadas con tokens distintos, crear instancia temporal
    return new ChatOllama({
      model:         this.getDefaultModel(),
      temperature:   0.2,
      topP:          0.85,
      topK:          15,
      numPredict,
      repeatPenalty: 1.1,
      numCtx:        4096,
      stop: ['\n\n\n', 'User:', 'Usuario:', 'Pregunta:', 'Q:', 'Human:'],
    });
  }

  private currentNumPredict = 400;

  private async initialize(): Promise<void> {
    this.currentNumPredict = 400;
    this.model = new ChatOllama({
      model:         this.getDefaultModel(),
      temperature:   0.2,
      topP:          0.85,
      topK:          15,
      numPredict:    400,
      repeatPenalty: 1.1,
      numCtx:        4096,
      stop: ['\n\n\n', 'User:', 'Usuario:', 'Pregunta:', 'Q:', 'Human:'],
    });
    this.logger.log(`Ollama provider initialized: ${this.getDefaultModel()}`);
  }
}
