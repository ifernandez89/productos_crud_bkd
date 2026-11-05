/**
 * JCA-001 Misión 12: Matriz de Homologación E2E del Sistema Integrado
 * 
 * Verifica los 18 escenarios de extremo a extremo que integran:
 * - Capa 1: Política de Selección de Contexto (ContextSelectorService)
 * - Capa 2: Motor de Recuperación Documental RAG (PgVector & ScoredChunk)
 * - Capa 3: Ejecutor y Registro de Capacidades (CapabilityRegistry & CapabilityExecutor)
 * - Pipeline Conversacional: Síntesis de contexto, directivas anti-alucinación y degradación.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ContextSelectorService } from '../context/context-selector.service.ts';
import { CapabilityRegistry } from './capability-registry.service.ts';
import { CapabilityExecutor } from './capability-executor.service.ts';
import { MathCapability } from './math.capability.ts';
import { WebSearchCapability } from './web-search.capability.ts';
import type {
  CapabilityResult,
  MathResultData,
  WebSearchResultData,
} from './capability.interface.ts';
import type { ContextPlan } from '../context/context-selector.interface.ts';

// ── Pipeline Conversacional Integrado para Homologación E2E ───────────────────

interface ConversationalRunResult {
  response: string;
  toolsUsed: string[];
  contextPlan: ContextPlan;
  ragExecuted: boolean;
  ragChunksCount: number;
  mathExecuted: boolean;
  mathResult?: CapabilityResult<MathResultData>;
  webExecuted: boolean;
  webResult?: CapabilityResult<WebSearchResultData>;
  contextSnippetInjected?: string;
  fallbackDirectiveInjected?: string;
  degradedGracefully: boolean;
}

class ConversationalPipelineHarness {
  readonly selector: ContextSelectorService;
  readonly registry: CapabilityRegistry;
  readonly executor: CapabilityExecutor;

  constructor(
    customWebProvider?: (q: string, cat?: string, sig?: AbortSignal) => Promise<any>,
  ) {
    this.selector = new ContextSelectorService();
    this.registry = new CapabilityRegistry();
    this.registry.register(new MathCapability());
    this.registry.register(new WebSearchCapability(customWebProvider));
    this.executor = new CapabilityExecutor(this.registry);
  }

  async run(
    userMessage: string,
    options: {
      sessionId?: string;
      classifiedIntent?: any;
      mockCorpusDocs?: Array<{ id: number; title: string; content: string; similarity: number }>;
    } = {},
  ): Promise<ConversationalRunResult> {
    const sessionId = options.sessionId || 'e2e-session-001';
    const toolsUsed: string[] = [];

    // 1. Evaluación de Política de Contexto JCA-001 (Capa 1)
    const contextPlan = this.selector.evaluate({
      userMessage,
      classifiedIntent: options.classifiedIntent,
    });

    const ragAuthorized =
      contextPlan.sources.rag === 'REQUESTED' ||
      contextPlan.sources.rag === 'SELECTED';

    // 2. RAG Documental (Capa 2)
    let ragExecuted = false;
    let ragChunksCount = 0;
    let prefetchedRagContext: string | undefined = undefined;

    if (ragAuthorized) {
      ragExecuted = true;
      const docs = options.mockCorpusDocs || [
        {
          id: 101,
          title: 'Documento de Referencia',
          content: 'Contenido verificado recuperado desde la biblioteca vectorial.',
          similarity: 0.88,
        },
      ];
      ragChunksCount = docs.length;
      prefetchedRagContext = docs
        .map((d) => `[Doc #${d.id} - ${d.title} (sim: ${d.similarity})]: ${d.content}`)
        .join('\n');
      toolsUsed.push('rag');
    }

    // 3. Capacidades Desacopladas JCA-001 (Capa 3)
    let capabilityContextSnippet: string | undefined = undefined;
    let capabilityFallbackDirective: string | undefined = undefined;
    let mathExecuted = false;
    let mathResult: CapabilityResult<MathResultData> | undefined = undefined;
    let webExecuted = false;
    let webResult: CapabilityResult<WebSearchResultData> | undefined = undefined;

    // 3.1 MathCapability
    const isMathActive =
      (contextPlan.activeTools?.includes('math') ||
        contextPlan.suggestedAction === 'TOOL' ||
        contextPlan.policyReason === 'ARITHMETIC_EXPLANATION' ||
        MathCapability.isMathExpression(userMessage)) &&
      contextPlan.sources?.tools !== 'EXCLUDED' &&
      contextPlan.toolStates?.math !== 'EXCLUDED';

    if (isMathActive) {
      mathExecuted = true;
      mathResult = await this.executor.execute<MathResultData>(
        'math',
        userMessage,
        contextPlan,
        sessionId,
      );

      if (mathResult.status === 'SUCCESS' && mathResult.data) {
        toolsUsed.push('math_capability');
        const requiresExplanation = /(explica|por que|desarrolla|paso a paso)/i.test(userMessage);
        const isCombined = ragAuthorized || contextPlan.suggestedAction === 'HYBRID_SEARCH';

        if (!requiresExplanation && !isCombined) {
          // Retorno directo determinista
          return {
            response: mathResult.data.formattedResult || mathResult.data.result,
            toolsUsed,
            contextPlan,
            ragExecuted,
            ragChunksCount,
            mathExecuted,
            mathResult,
            webExecuted,
            webResult,
            degradedGracefully: false,
          };
        } else {
          capabilityContextSnippet = mathResult.promptContextSnippet;
        }
      } else if (mathResult.status === 'RECOVERABLE_ERROR' && mathResult.fallbackDirective) {
        capabilityFallbackDirective = mathResult.fallbackDirective;
      }
    }

    // 3.2 WebSearchCapability
    const isWebActive =
      (contextPlan.sources?.web === 'REQUESTED' ||
        contextPlan.sources?.web === 'SELECTED' ||
        contextPlan.suggestedAction === 'WEB_SEARCH' ||
        contextPlan.suggestedAction === 'HYBRID_SEARCH' ||
        contextPlan.activeTools?.includes('sports')) &&
      contextPlan.sources?.web !== 'EXCLUDED' &&
      !contextPlan.exclusions?.excludeWeb;

    if (isWebActive) {
      webExecuted = true;
      const isSports = contextPlan.activeTools?.includes('sports');
      webResult = await this.executor.execute<WebSearchResultData>(
        'web_search',
        userMessage,
        contextPlan,
        sessionId,
      );

      if (webResult.status === 'SUCCESS' && webResult.data) {
        toolsUsed.push('web_search_capability');
        if (isSports) toolsUsed.push('sports_category');
        capabilityContextSnippet = capabilityContextSnippet
          ? `${capabilityContextSnippet}\n\n${webResult.promptContextSnippet}`
          : webResult.promptContextSnippet;
      } else if (webResult.status === 'NO_RESULTS' || webResult.status === 'TIMEOUT' || webResult.status === 'RECOVERABLE_ERROR') {
        toolsUsed.push(`web_search_${webResult.status.toLowerCase()}`);
        if (webResult.fallbackDirective) {
          capabilityFallbackDirective = capabilityFallbackDirective
            ? `${capabilityFallbackDirective}\n\n${webResult.fallbackDirective}`
            : webResult.fallbackDirective;
        }
      }
    }

    // 4. Síntesis Final / Respuesta Conversacional
    const parts: string[] = [];
    if (prefetchedRagContext) parts.push(`[CONTEXTO_RAG]\n${prefetchedRagContext}`);
    if (capabilityContextSnippet) parts.push(`[CONTEXTO_CAPACIDAD]\n${capabilityContextSnippet}`);
    if (capabilityFallbackDirective) parts.push(`[DIRECTIVA_FALLBACK]\n${capabilityFallbackDirective}`);

    let simulatedAnswer = '';
    if (parts.length > 0) {
      simulatedAnswer = `Respuesta sintetizada con contexto:\n${parts.join('\n\n')}`;
    } else {
      simulatedAnswer = `Respuesta puramente conversacional para: "${userMessage}"`;
    }

    return {
      response: simulatedAnswer,
      toolsUsed,
      contextPlan,
      ragExecuted,
      ragChunksCount,
      mathExecuted,
      mathResult,
      webExecuted,
      webResult,
      contextSnippetInjected: capabilityContextSnippet,
      fallbackDirectiveInjected: capabilityFallbackDirective,
      degradedGracefully: !!capabilityFallbackDirective,
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE DE HOMOLOGACIÓN E2E (E2E-01 a E2E-18)
// ══════════════════════════════════════════════════════════════════════════════

describe('JCA-001 Misión 12: Matriz de Homologación E2E Integral', () => {

  it('E2E-01: "¿Qué es la percepción?" -> Respuesta conceptual pura; sin RAG ni herramientas innecesarias', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run('¿Qué es la percepción?');

    assert.strictEqual(result.contextPlan.sources.rag, 'UNNEEDED', 'RAG debe ser UNNEEDED');
    assert.strictEqual(result.contextPlan.sources.web, 'UNNEEDED', 'Web debe ser UNNEEDED');
    assert.strictEqual(result.contextPlan.sources.tools, 'UNNEEDED', 'Tools debe ser UNNEEDED');
    assert.strictEqual(result.contextPlan.suggestedAction, 'LLM', 'suggestedAction debe ser LLM');
    assert.strictEqual(result.ragExecuted, false, 'No debe ejecutar RAG');
    assert.strictEqual(result.mathExecuted, false, 'No debe ejecutar Math');
    assert.strictEqual(result.webExecuted, false, 'No debe ejecutar Web');
    assert.match(result.response, /Respuesta puramente conversacional/);
  });

  it('E2E-02: "¿Qué dicen mis documentos sobre hipnosis?" -> RAG autorizado y recuperación documental', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run('¿Qué dicen mis documentos sobre la hipnosis?', {
      mockCorpusDocs: [
        { id: 10, title: 'Tratado de Hipnosis', content: 'Metodología de inducción clásica.', similarity: 0.89 },
      ],
    });

    assert.strictEqual(result.contextPlan.sources.rag, 'REQUESTED', 'RAG debe ser REQUESTED');
    assert.strictEqual(result.ragExecuted, true, 'RAG debe haber ejecutado');
    assert.strictEqual(result.ragChunksCount, 1, 'Debe haber recuperado el fragmento');
    assert.strictEqual(result.mathExecuted, false, 'Math no debe ejecutarse');
    assert.strictEqual(result.webExecuted, false, 'Web no debe ejecutarse');
    assert.match(result.response, /Tratado de Hipnosis/);
  });

  it('E2E-03: "¿Cuánto es 125 × 8?" -> Math local determinista 1000 sin inferencia innecesaria', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run('¿Cuánto es 125 * 8?');

    assert.strictEqual(result.mathExecuted, true);
    assert.strictEqual(result.ragExecuted, false);
    assert.strictEqual(result.webExecuted, false);
    assert.strictEqual(result.mathResult?.status, 'SUCCESS');
    assert.strictEqual(result.mathResult?.data?.numericValue, 1000);
    assert.strictEqual(result.mathResult?.data?.verified, true);
    assert.strictEqual(result.response, '1000', 'Debe retornar directamente el cálculo verificado');
  });

  it('E2E-04: "¿Qué hora será si comienzo a las 14:30 y dura 180 minutos?" -> Math/DateMath resuelve 17:30', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run('¿Qué hora será si comienzo a las 14:30 y dura 180 minutos?');

    assert.strictEqual(result.mathExecuted, true);
    assert.strictEqual(result.mathResult?.status, 'SUCCESS');
    assert.strictEqual(result.mathResult?.data?.result, '17:30');
    assert.strictEqual(result.mathResult?.data?.verified, true);
    assert.match(result.response, /17:30/);
  });

  it('E2E-05: "¿Qué ocurrió hoy en el congreso?" -> WebSearch con procedencia estructurada', async () => {
    const harness = new ConversationalPipelineHarness(async (q) => ({
      query: q,
      effectiveCategory: 'noticias',
      items: [
        {
          title: 'Sesión legislativa de hoy',
          url: 'https://noticias.gob.ar/sesion',
          sourceDomain: 'noticias.gob.ar',
          snippet: 'El parlamento aprobó los proyectos en debate.',
          publishedDate: '2026-11-05',
        },
      ],
      totalItemsFound: 1,
      sourcesAttempted: ['gov_wire'],
      fromCache: false,
    }));

    const result = await harness.run('¿Qué ocurrió hoy en el congreso?');

    assert.strictEqual(result.webExecuted, true);
    assert.strictEqual(result.webResult?.status, 'SUCCESS');
    assert.strictEqual(result.webResult?.data?.items[0].sourceDomain, 'noticias.gob.ar');
    assert.match(result.contextSnippetInjected || '', /https:\/\/noticias\.gob\.ar\/sesion/);
  });

  it('E2E-06: "Consulta deportiva reciente" -> WebSearch con categoría deportes sin agentes especiales', async () => {
    const harness = new ConversationalPipelineHarness(async (q, cat) => ({
      query: q,
      effectiveCategory: cat || 'deportes',
      items: [
        {
          title: 'Resultado del partido',
          url: 'https://deportes.ejemplo.com/boca',
          sourceDomain: 'deportes.ejemplo.com',
          snippet: 'Boca ganó 2-0 en el partido de anoche.',
        },
      ],
      totalItemsFound: 1,
      sourcesAttempted: ['sports_crawler'],
      fromCache: false,
    }));

    const result = await harness.run('¿Cómo salió Boca anoche en el partido?');

    assert.strictEqual(result.webExecuted, true);
    assert.strictEqual(result.contextPlan.activeTools.includes('sports'), true);
    assert.strictEqual(result.webResult?.data?.effectiveCategory, 'deportes');
    assert.ok(result.toolsUsed.includes('sports_category'));
  });

  it('E2E-07: "Cálculo con Math explícitamente excluido" -> No ejecutar Math ni rutas alternativas', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run('¿Cuánto es 125 * 8? No uses calculadora ni herramientas matemáticas');

    assert.strictEqual(result.contextPlan.sources.tools, 'EXCLUDED', 'Tools debe ser EXCLUDED');
    assert.strictEqual(result.contextPlan.toolStates.math, 'EXCLUDED', 'math debe ser EXCLUDED');
    assert.strictEqual(result.mathExecuted, false, 'Math NO debe ejecutarse en el pipeline');
    assert.ok(!result.toolsUsed.includes('math_capability'));
  });

  it('E2E-08: "Búsqueda web explícitamente excluida" -> No ejecutar WebSearch', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run('¿Qué ocurrió hoy con el lanzamiento? Sin buscar en la web ni internet');

    assert.strictEqual(result.contextPlan.sources.web, 'EXCLUDED', 'Web debe ser EXCLUDED');
    assert.strictEqual(result.contextPlan.exclusions.excludeWeb, true);
    assert.strictEqual(result.webExecuted, false, 'WebSearch NO debe ejecutarse en el pipeline');
    assert.ok(!result.toolsUsed.includes('web_search_capability'));
  });

  it('E2E-09: "Búsqueda web sin resultados" -> Degradación transparente y directiva anti-alucinación', async () => {
    const harness = new ConversationalPipelineHarness(async (q) => ({
      query: q,
      effectiveCategory: 'general',
      items: [],
      totalItemsFound: 0,
      sourcesAttempted: ['empty_engine'],
      fromCache: false,
    }));

    const result = await harness.run('Busca información sobre xyz987_inexistente_entidad_2026 en internet');

    assert.strictEqual(result.webExecuted, true);
    assert.strictEqual(result.webResult?.status, 'NO_RESULTS');
    assert.ok(result.toolsUsed.includes('web_search_no_results'));
    assert.match(result.fallbackDirectiveInjected || '', /No se encontraron páginas relevantes|La búsqueda web no arrojó resultados/);
    assert.match(result.fallbackDirectiveInjected || '', /Responde con/);
  });

  it('E2E-10: "Error DNS o de conexión" -> Flujo continúa sin colapsar y degrada de forma controlada', async () => {
    const harness = new ConversationalPipelineHarness(async () => {
      const err = new Error('getaddrinfo ENOTFOUND api.search.org');
      (err as any).code = 'ENOTFOUND';
      throw err;
    });

    const result = await harness.run('Busca noticias de hoy en la web');

    assert.strictEqual(result.webExecuted, true);
    assert.strictEqual(result.webResult?.status, 'RECOVERABLE_ERROR');
    assert.ok(result.toolsUsed.includes('web_search_recoverable_error'));
    assert.match(result.fallbackDirectiveInjected || '', /información externa no estuvo disponible|La búsqueda externa no estuvo disponible/);
    assert.strictEqual(result.degradedGracefully, true);
  });

  it('E2E-11: "Timeout de proveedor no cooperante" -> El llamador recibe TIMEOUT sin afirmar cancelación no demostrada', async () => {
    const uncooperativeProvider = async () => {
      await new Promise((r) => setTimeout(r, 120));
      return { query: 'timeout test', items: [], totalItemsFound: 0, sourcesAttempted: [], fromCache: false };
    };

    const harness = new ConversationalPipelineHarness(uncooperativeProvider);

    const startTime = Date.now();
    const execResult = await harness.executor.execute(
      'web_search',
      'consulta lenta',
      {
        sources: { rag: 'UNNEEDED', memory: 'UNNEEDED', web: 'REQUESTED', conversationHistory: 'UNNEEDED', tools: 'UNNEEDED' },
        ambiguity: { needsClarification: false, contextConfidence: 0.9, isAmbiguous: false, confidence: 'high', conflicts: [] },
        exclusions: {},
        toolStates: {},
        activeTools: [],
        policyReason: 'EXPLICIT_WEB',
        suggestedAction: 'WEB_SEARCH',
      },
      'timeout-session',
      { timeoutMs: 25 },
    );

    const elapsed = Date.now() - startTime;
    assert.strictEqual(execResult.status, 'TIMEOUT');
    assert.ok(elapsed < 90, `El llamador debe ser liberado oportunamente (elapsed: ${elapsed}ms)`);
    assert.strictEqual(execResult.abortSignalSent, true, 'Debe haber enviado la señal');
    assert.strictEqual(execResult.underlyingOperationCancelled, false, 'No debe declarar cancelación si el proveedor no cooperó');
  });

  it('E2E-12: "Pregunta documental con exclusión explícita" -> Precedencia de exclusión preservada', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run('¿Qué dice el libro sobre alquimia? Pero sin usar documentos ni biblioteca');

    assert.strictEqual(result.contextPlan.sources.rag, 'EXCLUDED', 'RAG debe estar EXCLUDED');
    assert.strictEqual(result.contextPlan.exclusions.excludeDocuments, true);
    assert.strictEqual(result.ragExecuted, false, 'RAG NO debe ejecutarse');
    assert.ok(!result.toolsUsed.includes('rag'));
  });

  it('E2E-13: "Dos solicitudes concurrentes diferentes" -> Ejecuciones independientes', async () => {
    const harness = new ConversationalPipelineHarness();

    const [res1, res2] = await Promise.all([
      harness.run('¿Cuánto es 100 * 5?', { sessionId: 's1' }),
      harness.run('¿Cuánto es 200 * 3?', { sessionId: 's1' }),
    ]);

    assert.strictEqual(res1.response, '500');
    assert.strictEqual(res2.response, '600');
    assert.strictEqual(res1.mathResult?.data?.numericValue, 500);
    assert.strictEqual(res2.mathResult?.data?.numericValue, 600);
  });

  it('E2E-14: "Dos solicitudes idénticas concurrentes" -> Deduplicación segura dentro del ámbito autorizado', async () => {
    let callCounter = 0;
    const slowWebProvider = async (q: string) => {
      callCounter++;
      await new Promise((r) => setTimeout(r, 40));
      return {
        query: q,
        effectiveCategory: 'economia',
        items: [{ title: 'Deduplicated hit', url: 'https://ejemplo.com', sourceDomain: 'ejemplo.com', snippet: 'Data' }],
        totalItemsFound: 1,
        sourcesAttempted: ['mock'],
        fromCache: false,
      };
    };

    const harness = new ConversationalPipelineHarness(slowWebProvider);

    const [res1, res2] = await Promise.all([
      harness.run('Buscar en la web cotización del euro hoy', { sessionId: 'same-session-dedup' }),
      harness.run('Buscar en la web cotización del euro hoy', { sessionId: 'same-session-dedup' }),
    ]);

    assert.strictEqual(res1.webResult?.status, 'SUCCESS');
    assert.strictEqual(res2.webResult?.status, 'SUCCESS');
    assert.strictEqual(callCounter, 1, 'El proveedor debe ser invocado exactamente una vez por deduplicación');
  });

  it('E2E-15: "Consulta conceptual que menciona incidentalmente un PDF" -> No activar RAG por mera mención', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run(
      'Leí en un PDF que la fotosíntesis genera glucosa, ¿cómo funciona exactamente el ciclo de Calvin a nivel molecular?',
    );

    assert.strictEqual(result.contextPlan.sources.rag, 'UNNEEDED', 'RAG debe ser UNNEEDED');
    assert.strictEqual(result.ragExecuted, false, 'No debe activar RAG por mención accidental de PDF');
    assert.ok(!result.toolsUsed.includes('rag'));
  });

  it('E2E-16: "Solicitud documental formulada naturalmente" -> Activar RAG correctamente', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run('¿Qué explica el Kybalion en mi biblioteca sobre el principio de ritmo?', {
      mockCorpusDocs: [
        { id: 44, title: 'El Kybalion', content: 'Todo fluye y refluye; todo tiene sus períodos de avance y retroceso.', similarity: 0.92 },
      ],
    });

    assert.strictEqual(result.contextPlan.sources.rag, 'REQUESTED', 'RAG debe ser REQUESTED');
    assert.strictEqual(result.ragExecuted, true, 'RAG debe ejecutarse');
    assert.strictEqual(result.ragChunksCount, 1);
    assert.match(result.response, /El Kybalion/);
  });

  it('E2E-17: "Math y RAG necesarios en una misma consulta" -> Coordinación sin duplicaciones ni pérdida de contexto', async () => {
    const harness = new ConversationalPipelineHarness();
    const result = await harness.run(
      'Revisa en mis documentos el balance contable y explicá cuánto es 125 * 8',
      {
        mockCorpusDocs: [
          { id: 99, title: 'Balance Anual', content: 'Activo corriente: $50.000.', similarity: 0.85 },
        ],
      },
    );

    assert.strictEqual(result.ragExecuted, true, 'RAG debe ejecutarse');
    assert.strictEqual(result.mathExecuted, true, 'Math debe ejecutarse');
    assert.strictEqual(result.webExecuted, false, 'Web no debe ejecutarse');
    assert.strictEqual(result.mathResult?.status, 'SUCCESS');
    assert.strictEqual(result.mathResult?.data?.numericValue, 1000);
    // Ambos contextos sintetizados en la respuesta para el LLM
    assert.match(result.response, /Balance Anual/);
    assert.match(result.response, /1000/);
    assert.ok(result.toolsUsed.includes('rag'));
    assert.ok(result.toolsUsed.includes('math_capability'));
  });

  it('E2E-18: "Web y RAG necesarios en una misma consulta" -> Coordinación híbrida con procedencia diferenciada', async () => {
    const harness = new ConversationalPipelineHarness(async (q) => ({
      query: q,
      effectiveCategory: 'noticias',
      items: [
        {
          title: 'Noticias IA Noviembre 2026',
          url: 'https://technews.org/ai-update',
          sourceDomain: 'technews.org',
          snippet: 'Nuevos avances en modelos multimodales y agentes autónomos.',
        },
      ],
      totalItemsFound: 1,
      sourcesAttempted: ['tech_crawler'],
      fromCache: false,
    }));

    const result = await harness.run(
      'Compara lo que dicen mis documentos sobre inteligencia artificial con las últimas noticias de hoy en la web',
      {
        mockCorpusDocs: [
          { id: 105, title: 'Teoría de Inteligencia Artificial', content: 'Modelos simbólicos vs conexionistas.', similarity: 0.87 },
        ],
      },
    );

    assert.strictEqual(result.contextPlan.suggestedAction, 'HYBRID_SEARCH', 'suggestedAction debe ser HYBRID_SEARCH');
    assert.strictEqual(result.ragExecuted, true, 'RAG debe ejecutarse');
    assert.strictEqual(result.webExecuted, true, 'Web debe ejecutarse');
    assert.strictEqual(result.mathExecuted, false, 'Math no debe ejecutarse');
    assert.ok(result.toolsUsed.includes('rag'));
    assert.ok(result.toolsUsed.includes('web_search_capability'));
    // Procedencia diferenciada presente en el contexto inyectado
    assert.match(result.response, /Teoría de Inteligencia Artificial/);
    assert.match(result.response, /https:\/\/technews\.org\/ai-update/);
  });
});
