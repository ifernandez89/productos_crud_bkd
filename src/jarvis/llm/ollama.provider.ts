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

@Injectable()
export class OllamaProvider implements ILLMProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  private model: ChatOllama | null = null;

  getProviderName(): string {
    return 'ollama';
  }

  getDefaultModel(): string {
    return 'llama3.2:3b';
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const startTime = Date.now();

    if (!this.model) {
      await this.initialize();
    }

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
      const response = await this.model!.invoke(messages);

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
    // Ollama tiene un endpoint de embeddings separado
    // Por ahora placeholder, se implementaría con axios a http://localhost:11434/api/embeddings
    throw new Error('Embeddings not yet implemented for Ollama provider');
  }

  private async initialize(): Promise<void> {
    this.model = new ChatOllama({
      model: this.getDefaultModel(),
      temperature: 0.2, // determinista para asistente
      topP: 0.85,
      topK: 15,
      numPredict: 400,
      repeatPenalty: 1.1,
      numCtx: 4096, // contexto largo para memoria + docs
      stop: ['\n\n\n', 'User:', 'Usuario:', 'Pregunta:', 'Q:', 'Human:'],
    });
    this.logger.log(`Ollama provider initialized: ${this.getDefaultModel()}`);
  }
}
