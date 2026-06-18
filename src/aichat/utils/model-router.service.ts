import { Injectable, Logger } from '@nestjs/common';

export interface ModelRouterDecision {
  model: 'qwen3:4b' | 'llama3.2:3b';
  reason: string;
  keywords: string[];
}

/**
 * Router inteligente que elige entre modelos según el contenido del prompt.
 * Usa detección de palabras clave para identificar tareas técnicas.
 */
@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);

  /**
   * Keywords que indican una pregunta técnica → usar Qwen3:4b (experto técnico)
   */
  private readonly TECH_KEYWORDS = [
    // Framework & Languages
    'nestjs',
    'typescript',
    'javascript',
    'nodejs',
    'node.js',
    'react',
    'angular',
    'vue',
    'express',
    'fastify',
    'python',
    'java',
    'golang',
    'rust',
    'csharp',
    'c#',
    'java',
    'kotlin',

    // Database
    'postgresql',
    'postgres',
    'drizzle',
    'orm',
    'sql',
    'mongodb',
    'mysql',
    'redis',
    'elasticsearch',
    'pgvector',
    'schema',
    'migration',
    'query',
    'index',
    'join',
    'transaction',

    // Architecture & DevOps
    'microservicios',
    'microservices',
    'docker',
    'kubernetes',
    'k8s',
    'aws',
    'azure',
    'gcp',
    'devops',
    'ci/cd',
    'deployment',
    'scaling',
    'load-balancing',
    'cache',
    'async',
    'concurrency',

    // Code Quality & Debugging
    'debugging',
    'debug',
    'error',
    'exception',
    'stacktrace',
    'bug',
    'crash',
    'performance',
    'optimization',
    'refactor',
    'refactoring',
    'testing',
    'unit test',
    'integration test',
    'mock',
    'jest',
    'mocha',
    'cypress',
    'eslint',
    'prettier',
    'sonarqube',

    // LLM & AI
    'ollama',
    'langchain',
    'llm',
    'embeddings',
    'rag',
    'vector',
    'semantic',
    'llm',
    'model',
    'prompt',
    'agent',
    'tool',

    // Frameworks & Libraries
    'typeorm',
    'sequelize',
    'prisma',
    'hasura',
    'graphql',
    'rest',
    'api',
    'endpoint',
    'middleware',
    'guard',
    'pipe',
    'filter',
    'interceptor',
    'decorator',

    // Advanced Topics
    'architecture',
    'design pattern',
    'solid',
    'dependency injection',
    'module',
    'service',
    'controller',
    'repository',
    'dto',
    'entity',
    'interface',
    'type',
    'enum',
    'generic',
    'advanced',
    'complex',
    'technical',

    // Alfresco & Enterprise
    'alfresco',
    'ecm',
    'content',
    'workflow',

    // General Dev Terms
    'código',
    'code',
    'función',
    'function',
    'clase',
    'class',
    'método',
    'method',
    'propiedad',
    'property',
    'variable',
    'constante',
    'constant',
    'implementar',
    'implement',
    'solucionar',
    'solve',
    'resolver',
  ];

  /**
   * Analiza el prompt y determina qué modelo usar.
   * Retorna la decisión con razón y keywords detectadas.
   */
  routeToModel(prompt: string): ModelRouterDecision {
    const lowerPrompt = prompt.toLowerCase();

    // Buscar palabras clave técnicas
    const detectedKeywords = this.TECH_KEYWORDS.filter((keyword) =>
      lowerPrompt.includes(keyword),
    );

    const isTechnical = detectedKeywords.length > 0;

    if (isTechnical) {
      return {
        model: 'qwen3:4b',
        reason: `Pregunta técnica detectada (${detectedKeywords.length} keywords)`,
        keywords: detectedKeywords,
      };
    }

    return {
      model: 'llama3.2:3b',
      reason: 'Pregunta general / conversación',
      keywords: [],
    };
  }

  /**
   * Versión simplificada que solo retorna el nombre del modelo
   */
  getModel(prompt: string): 'qwen3:4b' | 'llama3.2:3b' {
    return this.routeToModel(prompt).model;
  }

  /**
   * Log detallado de la decisión de ruteo
   */
  logRouting(decision: ModelRouterDecision, prompt: string): void {
    this.logger.debug(
      `🔀 Model Router: ${decision.model} | ` +
        `Reason: ${decision.reason} | ` +
        `Keywords: [${decision.keywords.join(', ')}]`,
    );
  }
}
