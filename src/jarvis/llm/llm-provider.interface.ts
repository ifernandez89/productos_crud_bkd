/**
 * Interfaz unificada para proveedores de LLM
 * Permite intercambiar Ollama, OpenRouter, OpenAI, Gemini sin tocar lógica de negocio
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: any; image?: string; [key: string]: any }>;
}

export interface LLMTimeouts {
  connectMs?: number;      // Tiempo máx para conectar con el servidor (ej: 3500ms)
  queueWaitMs?: number;    // Tiempo máx de espera en cola de cambio de modelo (ej: 15000ms)
  generationMs?: number;   // Tiempo máx para generar la respuesta completa (ej: 45000ms)
}

export type DataSensitivityLevel = 'public' | 'private' | 'confidential';

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  images?: string[];                  // Base64 o URLs de imágenes para modelos de visión
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
  think?: boolean;
  timeoutMs?: number;       // Timeout global personalizado para esta petición
  timeouts?: LLMTimeouts;   // Timeouts desglosados por fase operativa
  abortSignal?: AbortSignal;// Señal para cancelación temprana (cliente desconectado)
  sensitivity?: DataSensitivityLevel; // Nivel de confidencialidad de la consulta
  allowRemoteFallback?: boolean;      // Si false, prohíbe conmutar a proveedores cloud
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

  /**
   * Verifica disponibilidad y conectividad del motor
   */
  isAvailable?(): Promise<boolean>;
}

export const LLM_GATEWAY = Symbol('LLM_GATEWAY');
