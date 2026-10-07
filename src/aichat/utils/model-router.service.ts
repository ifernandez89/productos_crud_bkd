import { Injectable, Logger } from '@nestjs/common';
import {
  resolveCoderModel,
  resolveOllamaModelName,
} from '../../shared/ollama-config';
import {
  normalizeDiscipline,
  SpecialistDiscipline,
} from '../../shared/disciplines';

export interface ModelRouterDecision {
  model: string;
  discipline: SpecialistDiscipline;
  reason: string;
  keywords: string[];
}

/**
 * Router inteligente que elige entre disciplinas y modelos según el selector o el contenido.
 */
@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);

  /**
   * Keywords que indican una pregunta técnica → usar Coder (qwen2.5-coder:7b)
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

    // General Dev Terms
    'código',
    'codigo',
    'code',
    'función',
    'funcion',
    'function',
    'clase',
    'class',
    'método',
    'metodo',
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
   * Determina el especialista y modelo a usar, considerando el selector manual (mode) y el prompt.
   */
  routeToModel(prompt: string, explicitMode?: string): ModelRouterDecision {
    const discipline = normalizeDiscipline(explicitMode);
    const coderModel = resolveCoderModel('qwen2.5-coder:7b');
    const generalModel = resolveOllamaModelName('qwen2.5:7b');

    // 1. Si el frontend especificó 'coder'
    if (discipline === 'coder') {
      return {
        model: coderModel,
        discipline: 'coder',
        reason: 'Especialista Coder seleccionado manualmente desde la interfaz',
        keywords: [],
      };
    }

    // 2. Si el frontend especificó 'chatbot'
    if (discipline === 'chatbot') {
      return {
        model: generalModel,
        discipline: 'chatbot',
        reason: 'Especialista Chatbot seleccionado manualmente desde la interfaz',
        keywords: [],
      };
    }

    // 3. Si el frontend especificó cualquier otra disciplina fija
    if (discipline !== 'auto') {
      return {
        model: generalModel,
        discipline,
        reason: `Disciplina ${discipline} seleccionada por el selector de la UI`,
        keywords: [],
      };
    }

    // 4. Modo Automático: Detección heurística por palabras clave
    const lowerPrompt = prompt.toLowerCase();
    const detectedKeywords = this.TECH_KEYWORDS.filter((keyword) =>
      lowerPrompt.includes(keyword),
    );

    if (detectedKeywords.length > 0) {
      return {
        model: coderModel,
        discipline: 'coder',
        reason: `Pregunta técnica detectada automáticamente (${detectedKeywords.length} keywords)`,
        keywords: detectedKeywords,
      };
    }

    return {
      model: generalModel,
      discipline: 'chatbot',
      reason: 'Conversación general asistida',
      keywords: [],
    };
  }

  /**
   * Versión simplificada que retorna el nombre del modelo
   */
  getModel(prompt: string, explicitMode?: string): string {
    return this.routeToModel(prompt, explicitMode).model;
  }

  /**
   * Log detallado de la decisión de ruteo
   */
  logRouting(decision: ModelRouterDecision, prompt: string): void {
    this.logger.debug(
      `🔀 Specialist Router: [${decision.discipline}] ${decision.model} | ` +
        `Reason: ${decision.reason}` +
        (decision.keywords.length ? ` | Keywords: [${decision.keywords.join(', ')}]` : ''),
    );
  }
}

