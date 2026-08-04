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
    this.model = new ChatOllama({
      model: resolveOllamaModelName('qwen3:1.7b'),
      temperature: 0.10, // Recomendado general: alta precisión, resp. deterministas, menor alucinación
      topP: 0.85, // Diversidad controlada
      topK: 20, // Limita opciones del modelo
      numPredict: 512, // Longitud de respuesta estándar
      repeatPenalty: 1.10, // Evita repeticiones
      numCtx: 8192, // Context window recomendado
      stop: ['\n\n\n', 'User:', 'Pregunta:', 'Q:', 'Human:', 'Usuario:'],
    });
    this.logger.log(
      'Ollama model initialized (Qwen3:1.7B base profile: temp=0.10, topK=20, topP=0.85, repeatPenalty=1.10, ctx=8192, predict=512)',
    );
  }
}
