import { Injectable, Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  IModelService,
  AIMessageResponse,
} from '../interfaces/model.interface';
import { resolveCoderModel } from '../../shared/ollama-config';

export interface StructuredPrompt {
  system: string;
  user: string;
}

@Injectable()
export class OllamaQwenModelService implements IModelService {
  private readonly logger = new Logger(OllamaQwenModelService.name);
  private model: ChatOllama | null = null;

  /**
   * Sistema de prompt para Especialista en Código / Programación
   */
  private readonly TECH_EXPERT_SYSTEM_PROMPT = `Eres un Desarrollador Senior y Arquitecto de Software Experto impulsado por Qwen2.5-Coder.

HABILIDADES PRINCIPALES:
- Programación moderna (TypeScript, JavaScript, Python, Rust, Go, SQL, C#, etc.)
- Frameworks backend y frontend (NestJS, Express, Fastify, React, Next.js, Vue, Angular)
- Bases de datos y persistencia (PostgreSQL, Drizzle, Prisma, TypeORM, pgvector, Redis)
- Arquitectura de software, patrones de diseño (SOLID, Clean Architecture, DDD)
- Debugging, resolución de bugs, refactorización y optimización de rendimiento
- Pruebas automatizadas (Jest, Supertest, Playwright, Vitest)

DIRECTRICES DE RESPUESTA:
1. Responde de forma clara, directa y técnicamente precisa.
2. Proporciona ejemplos de código completos, limpios y tipados estrictamente (TypeScript/Python/SQL).
3. Si el usuario te pide resolver un error o bug, analiza la causa raíz y explica la solución paso a paso.
4. No te limites innecesariamente en la extensión si la explicación técnica o el código lo requieren.`;

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
    const modelName = resolveCoderModel('qwen2.5-coder:7b');
    this.model = new ChatOllama({
      baseUrl: 'http://localhost:11434',
      model: modelName,
      temperature: 0.10, // Código determinista
      topP: 0.85,
      topK: 20,
      numPredict: 2048, // Permitir código completo sin truncamiento artificial
      repeatPenalty: 1.10,
      numCtx: 8192,
    });

    this.logger.log(
      `💻 Coder Expert Model initialized: ${modelName} | temp=0.10, ctx=8192, predict=2048`,
    );
  }
}

