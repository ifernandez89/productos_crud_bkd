import { Injectable, Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  IModelService,
  AIMessageResponse,
} from '../interfaces/model.interface';
import { resolveOllamaModelName } from '../../shared/ollama-config';

export interface StructuredPrompt {
  system: string;
  user: string;
}

@Injectable()
export class OllamaModelService implements IModelService {
  private readonly logger = new Logger(OllamaModelService.name);
  private model: ChatOllama | null = null;

  async getModel(): Promise<ChatOllama> {
    if (!this.model) {
      await this.create();
    }
    return this.model;
  }

  /** Invocación con string plano (compatibilidad hacia atrás) */
  async invoke(prompt: string): Promise<AIMessageResponse> {
    const model = await this.getModel();
    const response = await model.invoke(prompt);
    return {
      content: response.content as string | AIMessageResponse['content'],
    };
  }

  /**
   * Invocación con mensajes estructurados.
   * Separar System de Human mejora considerablemente la calidad
   * en llama3.2 y modelos instrucción-tuneados.
   */
  async invokeWithMessages(prompt: StructuredPrompt): Promise<AIMessageResponse> {
    const model = await this.getModel();
    const messages = [
      new SystemMessage(prompt.system),
      new HumanMessage(prompt.user),
    ];
    const response = await model.invoke(messages);
    return {
      content: response.content as string | AIMessageResponse['content'],
    };
  }

  private async create(): Promise<void> {
    this.model = new ChatOllama({
      model: resolveOllamaModelName('llama3.2:3b'),
      temperature: 0.2,            // bajado de 0.3 → más determinista
      topP: 0.85,
      topK: 15,
      numPredict: 400,
      repeatPenalty: 1.1,
      numCtx: 4096,                // subido de 2048 → mejor comprensión de contexto largo
      // Stop tokens ampliados: cortan antes si el modelo intenta "seguir hablando"
      stop: ['\n\n\n', 'User:', 'Pregunta:', 'Q:', 'Human:', 'Usuario:'],
    });
    this.logger.log('Ollama model initialized (Jarvis config: temp=0.2, ctx=4096)');
  }
}
