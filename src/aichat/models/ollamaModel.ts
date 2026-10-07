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
  async invokeWithMessages(
    prompt: StructuredPrompt,
  ): Promise<AIMessageResponse> {
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
    const modelName = resolveOllamaModelName('qwen2.5:7b');
    this.model = new ChatOllama({
      model: modelName,
      temperature: 0.20, // Conversación natural
      topP: 0.85,
      topK: 20,
      numPredict: 1024,
      repeatPenalty: 1.10,
      numCtx: 8192,
    });
    this.logger.log(
      `💬 Chatbot Model initialized: ${modelName} | temp=0.20, ctx=8192, predict=1024`,
    );
  }
}
