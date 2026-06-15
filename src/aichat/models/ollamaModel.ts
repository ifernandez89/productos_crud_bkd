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
      model: 'llama3.2:3b',
      temperature: 0.3,
      topP: 0.9,
      topK: 20,
      numPredict: 512,
      repeatPenalty: 1.1,
      stop: [],
    });
    this.logger.log('Ollama model initialized');
  }
}
