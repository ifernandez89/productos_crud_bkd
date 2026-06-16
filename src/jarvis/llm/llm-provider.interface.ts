/**
 * Interfaz unificada para proveedores de LLM
 * Permite intercambiar Ollama, OpenRouter, OpenAI, Gemini sin tocar lógica de negocio
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface LLMGenerateResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed?: number;
  latencyMs: number;
}

export interface LLMEmbeddingResponse {
  embedding: number[];
  model: string;
  provider: string;
}

export interface ILLMProvider {
  /**
   * Genera texto a partir de mensajes
   */
  generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse>;

  /**
   * Genera embeddings para búsqueda semántica
   */
  embed(text: string): Promise<LLMEmbeddingResponse>;

  /**
   * Nombre del proveedor
   */
  getProviderName(): string;

  /**
   * Modelo por defecto
   */
  getDefaultModel(): string;
}
