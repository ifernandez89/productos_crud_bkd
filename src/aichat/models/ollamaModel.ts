import { Injectable, Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import {
  IModelService,
  AIMessageResponse,
} from '../interfaces/model.interface';

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

  async invoke(prompt: string): Promise<AIMessageResponse> {
    const model = await this.getModel();
    const response = await model.invoke(prompt);
    return {
      content: response.content as string | AIMessageResponse['content'],
    };
  }

  private async create(): Promise<void> {
    this.model = new ChatOllama({
      model: 'llama3.2:3b',       //llama3.2:3b rapido para chat; qwen3.5:4b excedido de tiempo "Programacion"
      temperature: 0.3,
      topP: 0.85,
      topK: 15,
      numPredict: 400,            // subido de 256: evita corte en respuestas de conocimiento general
      repeatPenalty: 1.1,
      numCtx: 2048,               // limitar contexto para acelerar inferencia
      stop: ['\n\n\n'],
    });
    this.logger.log('Ollama model initialized');
  }
}
