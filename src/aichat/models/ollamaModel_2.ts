import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  IModelService,
  AIMessageResponse,
} from '../interfaces/model.interface';
import { resolveCoderModel } from '../../shared/ollama-config';
import { LlamaCppProvider } from '../../jarvis/llm/llamacpp.provider';

export interface StructuredPrompt {
  system: string;
  user: string;
}

@Injectable()
export class OllamaQwenModelService implements IModelService {
  private readonly logger = new Logger(OllamaQwenModelService.name);
  private model: ChatOllama | null = null;

  constructor(
    @Optional()
    private readonly llamaCppProvider: LlamaCppProvider = new LlamaCppProvider(),
  ) {}

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

  private isLlamaCppEnabled(): boolean {
    return process.env.USE_LLAMACPP_CODER === 'true';
  }

  async getModel(): Promise<ChatOllama> {
    if (!this.model) {
      await this.create();
    }
    return this.model!;
  }

  /** Invocación con string plano (compatibilidad hacia atrás) */
  async invoke(prompt: string): Promise<AIMessageResponse> {
    if (this.isLlamaCppEnabled() && this.llamaCppProvider) {
      try {
        const coderModel =
          process.env.LLAMACPP_CODER_MODEL || 'qwen2.5-coder:14b';
        const aliasCheck =
          typeof this.llamaCppProvider.verifyModelAlias === 'function'
            ? this.llamaCppProvider.verifyModelAlias(coderModel)
            : { resolvedAlias: coderModel, isRegisteredPreset: true };

        if (!aliasCheck.isRegisteredPreset) {
          this.logger.warn(
            `[OllamaQwenModelService] El alias '${coderModel}' no está registrado como preset GGUF en LlamaCppProvider; usando fallback ChatOllama.`,
          );
        } else {
          const res = await this.llamaCppProvider.generate({
            model: aliasCheck.resolvedAlias,
            temperature: 0.1,
            reservedOutputTokens: parseInt(
              process.env.LLAMA_RESERVED_OUTPUT_TOKENS || '1024',
              10,
            ),
            messages: [
              { role: 'system', content: this.TECH_EXPERT_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          });
          return { content: res.content };
        }
      } catch (err: any) {
        this.logger.warn(
          `[OllamaQwenModelService] Fallo en llama.cpp directo (${err.message}); conmutando a fallback ChatOllama...`,
        );
      }
    }

    const model = await this.getModel();
    const response = await model.invoke(prompt);
    return {
      content: response.content as string | AIMessageResponse['content'],
    };
  }

  /**
   * Invocación con mensajes estructurados: intenta primero llama-server.exe (Qwen2.5-Coder-14B, -c 6144)
   * si está habilitado manualmente (USE_LLAMACPP_CODER=true) y el alias GGUF es válido,
   * y cae de forma reversible a ChatOllama en caso contrario.
   */
  async invokeWithMessages(
    prompt: StructuredPrompt,
  ): Promise<AIMessageResponse> {
    const systemMsg = prompt.system || this.TECH_EXPERT_SYSTEM_PROMPT;

    if (this.isLlamaCppEnabled() && this.llamaCppProvider) {
      try {
        const coderModel =
          process.env.LLAMACPP_CODER_MODEL || 'qwen2.5-coder:14b';
        const aliasCheck =
          typeof this.llamaCppProvider.verifyModelAlias === 'function'
            ? this.llamaCppProvider.verifyModelAlias(coderModel)
            : { resolvedAlias: coderModel, isRegisteredPreset: true };

        if (!aliasCheck.isRegisteredPreset) {
          this.logger.warn(
            `[OllamaQwenModelService] El alias '${coderModel}' no está registrado como preset GGUF en LlamaCppProvider; usando fallback ChatOllama.`,
          );
        } else {
          const res = await this.llamaCppProvider.generate({
            model: aliasCheck.resolvedAlias,
            temperature: 0.1,
            reservedOutputTokens: parseInt(
              process.env.LLAMA_RESERVED_OUTPUT_TOKENS || '1024',
              10,
            ),
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: prompt.user },
            ],
          });
          return { content: res.content };
        }
      } catch (err: any) {
        this.logger.warn(
          `[OllamaQwenModelService] Fallo en llama.cpp directo (${err.message}); conmutando a fallback ChatOllama...`,
        );
      }
    }

    const model = await this.getModel();
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
      temperature: 0.1, // Código determinista
      topP: 0.85,
      topK: 20,
      numPredict: 1024, // Reserva de salida alineada con presupuesto de 6144 tokens
      repeatPenalty: 1.1,
      numCtx: 6144,
    });

    this.logger.log(
      `💻 Coder Expert Fallback Model initialized: ${modelName} | temp=0.10, ctx=6144, predict=1024`,
    );
  }
}
