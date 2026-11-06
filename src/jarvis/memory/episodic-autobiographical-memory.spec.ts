import { KnowledgeEvolutionService } from './knowledge-evolution.service';
import { ContextSelectorService } from '../context/context-selector.service';
import { IntentRouterService } from '../tools/intent/intent-router.service';
import { UncertaintyEngineService } from '../cognitive/uncertainty-engine.service';

describe('MEM-001 / MEM-002 / MEM-003 — Autobiographical & Episodic Memory Suite', () => {
  const mockLlm = {
    getProviderName: () => 'mock',
    getDefaultModel: () => 'qwen3:4b',
    isAvailable: async () => true,
    generate: jest.fn().mockResolvedValue({
      content: '{"topic":"Test","conclusion":"Conclusion","tags":["test"]}',
      model: 'qwen3:4b',
      provider: 'mock',
      latencyMs: 5,
    }),
  };

  function createMockPrisma() {
    const snapshots: any[] = [];
    const runs = new Map<number, any>([
      [
        72,
        {
          id: 72,
          sessionId: 'smoke-t5',
          question: 'Razonamiento científico vs astrología',
          answer: 'Separación estricta entre ciencia y simbolismo.',
          chunksRetrievedIds: '[]',
          createdAt: new Date('2026-11-05T23:45:00.000Z'),
        },
      ],
      [
        76,
        {
          id: 76,
          sessionId: 'daily-day001-t1',
          question: 'Buscá en nuestra colección qué plantea William Judge sobre el mesmerismo.',
          answer: 'Según William Judge - El mesmerismo...',
          chunksRetrievedIds: '[56365,56389]',
          createdAt: new Date('2026-11-05T23:56:24.123Z'),
        },
      ],
      [
        77,
        {
          id: 77,
          sessionId: 'daily-day001-t2',
          question: 'Analizá la arquitectura actual de JarBees. Identificá un posible punto de fallo entre IntentRouter, ContextSelector y CapabilityExecutor.',
          answer: 'Hipótesis de desacople y plan de 4 pasos de telemetría.',
          chunksRetrievedIds: '[]',
          createdAt: new Date('2026-11-05T23:56:48.190Z'),
        },
      ],
      [
        78,
        {
          id: 78,
          sessionId: 'daily-day001-t3',
          question: '¿Qué evidencia tenemos de que JarBees realmente está razonando mejor?',
          answer: 'Mejoramos gobernanza y RAG, pero el razonamiento autónomo sigue en desarrollo.',
          chunksRetrievedIds: '[]',
          createdAt: new Date('2026-11-05T23:57:05.551Z'),
        },
      ],
    ]);

    const messages = new Map<number, any>([
      [140, { id: 140, role: 'user', content: 'Pregunta T5' }],
      [141, { id: 141, role: 'assistant', content: 'Respuesta T5' }],
      [148, { id: 148, role: 'user', content: 'Pregunta Judge' }],
      [149, { id: 149, role: 'assistant', content: 'Respuesta Judge' }],
      [150, { id: 150, role: 'user', content: 'Pregunta IntentRouter' }],
      [151, { id: 151, role: 'assistant', content: 'Respuesta IntentRouter' }],
      [152, { id: 152, role: 'user', content: 'Pregunta Razonamiento' }],
      [153, { id: 153, role: 'assistant', content: 'Respuesta Razonamiento' }],
    ]);

    const documents = new Map<number, any>([
      [246, { id: 246, title: 'William Judge - El mesmerismo' }],
    ]);

    return {
      snapshots,
      agentRun: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(runs.get(where.id) ?? null),
        ),
        findMany: jest.fn(({ where }: any) => {
          let list = Array.from(runs.values());
          if (where?.createdAt) {
            list = list.filter(
              (r) =>
                r.createdAt >= where.createdAt.gte &&
                r.createdAt < where.createdAt.lt,
            );
          }
          return Promise.resolve(list);
        }),
      },
      conversationMessage: {
        findMany: jest.fn(({ where }: any) => {
          if (where?.id?.in) {
            return Promise.resolve(
              where.id.in
                .map((id: number) => messages.get(id))
                .filter(Boolean),
            );
          }
          return Promise.resolve([]);
        }),
      },
      document: {
        findMany: jest.fn(({ where }: any) => {
          if (where?.id?.in) {
            return Promise.resolve(
              where.id.in
                .map((id: number) => documents.get(id))
                .filter(Boolean),
            );
          }
          return Promise.resolve([]);
        }),
      },
      topicSnapshot: {
        findFirst: jest.fn(({ where }: any) =>
          Promise.resolve(
            snapshots.find((s) => s.agentRunId === where.agentRunId) ?? null,
          ),
        ),
        create: jest.fn(({ data }: any) => {
          const rec = {
            id: snapshots.length + 1,
            revocationStatus: 'ACTIVE',
            createdAt: data.createdAt ?? new Date(),
            ...data,
          };
          snapshots.push(rec);
          return Promise.resolve(rec);
        }),
        findMany: jest.fn(({ where }: any) => {
          let list = [...snapshots];
          if (where?.createdAt) {
            list = list.filter(
              (s) =>
                s.createdAt >= where.createdAt.gte &&
                s.createdAt < where.createdAt.lt,
            );
          }
          return Promise.resolve(
            list.sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            ),
          );
        }),
      },
    };
  }

  it('MEM-001 & MEM-003: validates epistemic item types and rejects episodes with nonexistent provenance IDs', async () => {
    const prisma = createMockPrisma();
    const service = new KnowledgeEvolutionService(
      prisma as any,
      mockLlm as any,
    );

    // 1. Invalid epistemic type
    const badSchema = service.validateEpisodeSchema({
      topic: 'Tema válido',
      summary: 'Resumen válido del episodio',
      conclusion: 'Conclusión válida',
      epistemicItems: [{ type: 'INVENTED_TYPE', content: 'Algo' }],
      sourceMessageIds: [148],
    });
    expect(badSchema.valid).toBe(false);

    // 2. Missing provenance anchor
    const noProv = service.validateEpisodeSchema({
      topic: 'Tema válido',
      summary: 'Resumen válido del episodio',
      conclusion: 'Conclusión válida',
      epistemicItems: [{ type: 'DECISION', content: 'Algo' }],
      sourceMessageIds: [],
      sourceDocIds: [],
    });
    expect(noProv.valid).toBe(false);

    // 3. Nonexistent DB IDs rejected by verifyProvenanceInDb
    const rejected = await service.recordVerifiedEpisode({
      topic: 'Episodio con IDs falsos',
      summary: 'Resumen válido del episodio',
      conclusion: 'Conclusión válida',
      epistemicItems: [{ type: 'DECISION', content: 'Decisión' }],
      entities: ['Test'],
      tags: ['test'],
      agentRunId: 9999,
      sourceMessageIds: [8888],
      sourceDocIds: [7777],
      sourceChunkIds: [],
    });
    expect(rejected.saved).toBe(false);
    expect(rejected.errors.length).toBe(3);

    // 4. Valid episode with verified provenance is persisted
    const saved = await service.recordVerifiedEpisode({
      topic: 'William Judge y el mesmerismo',
      summary: 'Investigación sobre el mesmerismo en la colección',
      conclusion: 'El mesmerismo es un arte de influencia anterior a Mesmer.',
      epistemicItems: [
        { type: 'USER_STATEMENT', content: 'Buscá qué plantea Judge' },
        { type: 'OBSERVED_FACT', content: 'Libro William Judge - El mesmerismo (Doc #246)' },
        { type: 'HYPOTHESIS', content: 'La sensitiva actúa como intermediaria' },
        { type: 'DECISION', content: 'Separar fuentes de interpretaciones' },
      ],
      entities: ['William Judge', 'Mesmerismo'],
      tags: ['william judge', 'mesmerismo'],
      sessionId: 'daily-day001-t1',
      agentRunId: 76,
      sourceMessageIds: [148, 149],
      sourceDocIds: [246],
      sourceChunkIds: [56365, 56389],
      occurredAt: new Date('2026-11-05T23:56:24.123Z'),
    });
    expect(saved.saved).toBe(true);
    expect(saved.episodeId).toBe(1);
  });

  it('MEM-002 & MEM-003: resolves temporal ranges, retrieves episodes for M1-M4, and enforces abstention on M5', async () => {
    const prisma = createMockPrisma();
    const service = new KnowledgeEvolutionService(
      prisma as any,
      mockLlm as any,
    );

    await service.recordVerifiedEpisode({
      topic: 'Evaluación inicial del razonamiento autónomo de JarBees',
      summary: 'Evaluación durante el Smoke Test del 5 de noviembre de 2026',
      conclusion: 'Buen rigor científico pero aún confundíamos gobernanza con razonamiento autónomo.',
      epistemicItems: [
        { type: 'HYPOTHESIS', content: 'El puntaje 3.65/4 parecía razonamiento puro' },
        { type: 'DECISION', content: 'Pasar al desafío diario' },
      ],
      entities: ['JarBees', 'Razonamiento Autónomo'],
      tags: ['razonamiento', 'autonomo', 'evaluacion'],
      agentRunId: 72,
      sourceMessageIds: [140, 141],
      sourceDocIds: [],
      sourceChunkIds: [],
      occurredAt: new Date('2026-11-05T23:45:00.000Z'),
    });

    await service.recordVerifiedEpisode({
      topic: 'William Judge y el mesmerismo',
      summary: 'Investigación documental sobre William Judge',
      conclusion: 'Judge describe el mesmerismo como influencia magnética y transmisión vía sensitiva.',
      epistemicItems: [
        { type: 'OBSERVED_FACT', content: 'Documento #246 William Judge - El mesmerismo' },
        { type: 'HYPOTHESIS', content: 'Transmisión en estado alterado' },
      ],
      entities: ['William Judge', 'Mesmerismo'],
      tags: ['william judge', 'mesmerismo'],
      agentRunId: 76,
      sourceMessageIds: [148, 149],
      sourceDocIds: [246],
      sourceChunkIds: [56365, 56389],
      occurredAt: new Date('2026-11-05T23:56:24.123Z'),
    });

    await service.recordVerifiedEpisode({
      topic: 'Posible desacople entre IntentRouter y ContextSelector',
      summary: 'Análisis de fallo potencial entre IntentRouter y ContextSelector',
      conclusion: 'IntentRouter puede inducir un ContextPlan restrictivo.',
      epistemicItems: [
        { type: 'HYPOTHESIS', content: 'Clasificación LOCAL apaga RAG en ContextSelector' },
        { type: 'DECISION', content: 'Recolectar telemetría correlacionada antes de modificar código' },
      ],
      entities: ['IntentRouter', 'ContextSelector', 'CapabilityExecutor'],
      tags: ['intentrouter', 'contextselector', 'desacople'],
      agentRunId: 77,
      sourceMessageIds: [150, 151],
      sourceDocIds: [],
      sourceChunkIds: [],
      occurredAt: new Date('2026-11-05T23:56:48.190Z'),
    });

    await service.recordVerifiedEpisode({
      topic: 'Evaluación crítica sobre el razonamiento autónomo frente al rendimiento',
      summary: 'Distinción entre eficiencia de recuperación y razonamiento autónomo',
      conclusion: 'Mejoramos infraestructura y gobernanza, pero no hay evidencia definitiva de deducción causal autónoma.',
      epistemicItems: [
        { type: 'OBSERVED_FACT', content: 'Mejora real en RAG y selección de capacidades' },
        { type: 'OPEN_QUESTION', content: 'Cómo generar hipótesis originales sin corpus' },
      ],
      entities: ['JarBees', 'Razonamiento Autónomo'],
      tags: ['razonamiento', 'autonomo', 'rendimiento', 'evolucion'],
      agentRunId: 78,
      sourceMessageIds: [152, 153],
      sourceDocIds: [],
      sourceChunkIds: [],
      occurredAt: new Date('2026-11-05T23:57:05.551Z'),
    });

    // M1 — Fecha exacta
    const m1 = await service.recallAutobiographicalMemory(
      '¿Qué investigamos el 5 de noviembre de 2026?',
    );
    expect(m1.isAutobiographicalQuery).toBe(true);
    expect(m1.temporalRange.hasExplicitDate).toBe(true);
    expect(m1.episodes.length).toBe(4);

    // M2 — Tema + Fuentes hidratadas
    const m2 = await service.recallAutobiographicalMemory(
      '¿Cuándo hablamos de William Judge y qué fuentes utilizamos?',
    );
    expect(m2.episodes.length).toBe(1);
    expect(m2.episodes[0].provenance.documents[0].title).toBe(
      'William Judge - El mesmerismo',
    );
    expect(m2.episodes[0].provenance.sourceChunkIds).toEqual([56365, 56389]);

    // M3 — Decisión sobre desacople IntentRouter y ContextSelector
    const m3 = await service.recallAutobiographicalMemory(
      '¿Qué decidimos respecto al posible desacople entre IntentRouter y ContextSelector?',
    );
    expect(m3.episodes.length).toBe(1);
    expect(m3.formattedContextBlock).toContain('[DECISION]');
    expect(m3.formattedContextBlock).toContain('[HYPOTHESIS]');

    // M4 — Evolución cronológica sobre razonamiento autónomo
    const m4 = await service.recallAutobiographicalMemory(
      '¿Cómo evolucionó nuestra evaluación sobre el razonamiento autónomo de JarBees?',
    );
    expect(m4.queryType).toBe('EVOLUTION');
    expect(m4.episodes.length).toBe(2);
    expect(m4.episodes[0].provenance.agentRunId).toBe(72);
    expect(m4.episodes[1].provenance.agentRunId).toBe(78);

    // M5 — Honestidad ante fecha sin registros (5 de noviembre de 2025)
    const m5 = await service.recallAutobiographicalMemory(
      '¿Qué decidimos el 5 de noviembre de 2025 sobre un tema del que no tenemos registros?',
    );
    expect(m5.episodes.length).toBe(0);
    expect(m5.emptyReason).toBe('NO_RECORDS_FOR_DATE');
    expect(m5.formattedContextBlock).toContain('0 REGISTROS ENCONTRADOS');
    expect(m5.formattedContextBlock).toContain('TERMINANTEMENTE PROHIBIDO inventar');
  });

  it('MEM-002: IntentRouter, ContextSelector, and UncertaintyEngine route autobiographical queries cleanly', async () => {
    const router = new IntentRouterService();
    const selector = new ContextSelectorService();
    const uncertainty = new UncertaintyEngineService();

    const query = '¿Cuándo hablamos de William Judge y qué fuentes utilizamos?';
    const intent = await router.classify(query);
    expect(intent.intent).toBe('LOCAL');
    expect(intent.confidence).toBe('high');

    const plan = selector.evaluate({
      userMessage: query,
      classifiedIntent: intent.intent,
      intentConfidence: intent.confidence as any,
      hasActiveSessionHistory: false,
    });
    expect(plan.sources.memory).toBe('REQUESTED');
    expect(plan.sources.rag).toBe('UNNEEDED');

    const uReport = uncertainty.evaluateUncertainty(query, []);
    expect(uReport.confidenceScore).toBe(95);
    expect(uReport.uncertaintyWarningDirectives).toBe('');
  });
});

