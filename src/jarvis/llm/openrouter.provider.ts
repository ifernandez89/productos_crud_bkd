import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  ILLMProvider,
  LLMGenerateOptions,
  LLMGenerateResponse,
  LLMEmbeddingResponse,
} from './llm-provider.interface';

@Injectable()
export class OpenRouterProvider implements ILLMProvider {
  private readonly logger = new Logger(OpenRouterProvider.name);
  private readonly apiKey: string;
  private readonly baseURL = 'https://openrouter.ai/api/v1';

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
  }

  getProviderName(): string {
    return 'openrouter';
  }

  getDefaultModel(): string {
    return 'mistralai/mistral-7b-instruct:free';
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse> {
    const startTime = Date.now();

    const response = await axios.post(
      `${this.baseURL}/chat/completions`,
      {
        model: this.getDefaultModel(),
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 512,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'Jarvis',
          'Content-Type': 'application/json',
        },
      },
    );

    const latencyMs = Date.now() - startTime;
    const choice = response.data.choices?.[0];

    return {
      content: choice?.message?.content || 'Sin respuesta',
      model: this.getDefaultModel(),
      provider: this.getProviderName(),
      tokensUsed: response.data.usage?.total_tokens,
      latencyMs,
    };
  }

  async embed(text: string): Promise<LLMEmbeddingResponse> {
    throw new Error('Embeddings not supported by OpenRouter provider');
  }
}
