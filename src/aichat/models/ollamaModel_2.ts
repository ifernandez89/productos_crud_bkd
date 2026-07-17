import { Injectable, Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  IModelService,
  AIMessageResponse,
} from '../interfaces/model.interface';
import { resolveTechModel } from '../../shared/ollama-config';

export interface StructuredPrompt {
  system: string;
  user: string;
}

/**
 * Configuración del Modelo Qwen3:4b como Experto Técnico
 * Especializado en desarrollo de software y arquitectura
 */
export interface QwenTechExpertConfig {
  model: 'qwen3:4b';
  temperature: 0.2;
  topK: 5;
  chunkSize: number; // 800-1200
  chunkOverlap: number; // 150-250
  embeddingModel: 'bge-m3' | 'nomic-embed-text';
  reranker: boolean; // false por ahora
  domains: string[]; // NestJS, PostgreSQL, SQL, Drizzle, Alfresco, etc.
}

@Injectable()
export class OllamaQwenModelService implements IModelService {
  private readonly logger = new Logger(OllamaQwenModelService.name);
  private model: ChatOllama | null = null;

  /**
   * Sistema de prompt para Experto Técnico
   * Reduce alucinaciones con enfoque determinista
   */
  private readonly TECH_EXPERT_SYSTEM_PROMPT = `Eres un Experto Técnico especializado en desarrollo de software.

DOMINIOS DE EXPERTISE:
- NestJS (Framework & Best Practices)
- PostgreSQL (SQL avanzado, optimización)
- Drizzle ORM (Type-safe database)
- LangChain (Integración IA)
- pgvector (Búsqueda vectorial)
- Ollama (LLMs locales)
- Alfresco (Gestión de contenido empresarial)
- Arquitectura de software

DOCUMENTACIÓN BASE:
- NestJS Official Docs
- Drizzle ORM Docs
- PostgreSQL Docs
- LangChain Docs
- pgvector Docs
- Ollama Docs
- Alfresco Docs

COMPORTAMIENTO:
- Responde con precisión técnica
- Evita "alucinaciones": si no sabes, di "No tengo información sobre esto"
- Proporciona ejemplos de código cuando sea relevante
- Analiza stacktraces detalladamente
- Genera código siguiendo best practices
- Enfoque en soluciones producción-ready`;

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
   * en qwen3:4b y modelos instrucción-tuneados.
   */
  async invokeWithMessages(
    prompt: StructuredPrompt,
  ): Promise<AIMessageResponse> {
    const model = await this.getModel();
    const systemMsg = prompt.system || this.TECH_EXPERT_SYSTEM_PROMPT;
    const messages = [
      new SystemMessage(systemMsg),
      new HumanMessage(prompt.user),
    ];
    const response = await model.invoke(messages);
    return {
      content: response.content as string | AIMessageResponse['content'],
    };
  }

  private async create(): Promise<void> {
    /**
     * CONFIGURACIÓN: Qwen3:4b como Experto Técnico
     *
     * Parámetros de RAG (Retrieval-Augmented Generation):
     * - Chunk size: 1000 (rango 800-1200)
     * - Chunk overlap: 200 (rango 150-250)
     * - Embedding model: bge-m3 (recomendado para documents técnicos)
     * - Top K: 5 (documentos más relevantes)
     * - Reranker: deshabilitado (para futuro)
     */
    this.model = new ChatOllama({
      baseUrl: 'http://localhost:11434',
      model: resolveTechModel(), // OLLAMA_MODEL_TEST3_NAME en .env (qwen3:4b por defecto)
      temperature: 0.2, // Muy bajo: reduce alucinaciones y respuestas creativas
      topP: 0.85,
      topK: 5, // Conservador: solo los 5 tokens más probables
      numPredict: 500,
      repeatPenalty: 1.1,
      numCtx: 4096, // Contexto amplio para análisis de código
      // Stop tokens para cortar cuando el modelo intenta "seguir hablando"
      stop: ['\n\n\n', 'User:', 'Pregunta:', 'Q:', 'Human:', 'Usuario:', '---'],
    });

    this.logger.log(
      `🔧 Tech Expert Model initialized: ${resolveTechModel()} | ` +
        'Config: temp=0.2, topK=5, ctx=4096, RAG: chunk=1000, overlap=200, embedding=bge-m3',
    );
  }
}
