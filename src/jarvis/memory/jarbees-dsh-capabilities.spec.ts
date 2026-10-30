import { CapabilityRegistryService } from '../config/capability-registry.service';
import { TelemetryInspectionService } from '../llm/telemetry-inspection.service';
import { PlannerService } from '../planner/planner.service';
import { CoreContextService } from '../prompt/core-context.service';
import { SkillRegistryService } from '../skills/skill-registry.service';
import { IntentRouterService } from '../tools/intent/intent-router.service';
import { ToolRegistryService } from '../tools/registry/tool-registry.service';
import { MemoryConsolidationService } from './memory-consolidation.service';
import { TripartiteMemoryService } from './tripartite-memory.service';
import { WorkingMemoryService } from './working-memory.service';

describe('JarBees DSH Capabilities & Autonomous Telemetry Suite (Phases 1-5)', () => {
  // ── FASE 1: Telemetría para IA & CoreContext (<= 25 líneas) ──────────────────
  describe('Phase 1 — TelemetryInspectionService & CoreContextService (<= 25 lines)', () => {
    it('tracks token consumption, calculates tier distribution, and provides self-regulation guidance', () => {
      const mockMissionManager: any = {
        listMissionRecords: () => [
          {
            missionId: 'mission_alpha',
            status: 'completed',
            createdAt: '2026-10-30T12:00:00.000Z',
            updatedAt: '2026-10-30T12:01:00.000Z',
            budget: {
              maxTotalTokens: 24000,
              maxRepairs: 2,
              maxDurationMs: 180000,
            },
            budgetUsage: {
              promptTokens: 2400,
              completionTokens: 600,
              totalTokens: 3000,
              repairsUsed: 1,
              durationMs: 4200,
              budgetExceeded: false,
            },
            llmCallsHistory: [
              {
                attemptIndex: 0,
                purpose: 'INITIAL_GENERATION',
                requestId: 'req_1',
                provider: 'llamacpp',
                model: 'qwen2.5-coder:14b',
                promptTokens: 2400,
                completionTokens: 600,
                tokensUsed: 3000,
                tokensPerSecond: 56.4,
                durationMs: 1060,
              },
            ],
          },
        ],
      };

      const telemetry = new TelemetryInspectionService(mockMissionManager);

      telemetry.recordTokenUsage({
        provider: 'llamacpp',
        model: 'qwen2.5-coder:14b',
        promptTokens: 1200,
        completionTokens: 300,
        tokensPerSecond: 58.2,
        latencyMs: 515,
      });

      const report = telemetry.getTokenTelemetryReport();
      expect(report.totals.callsCount).toBe(2);
      expect(report.totals.promptTokens).toBe(3600);
      expect(report.totals.completionTokens).toBe(900);
      expect(report.totals.totalTokens).toBe(4500);
      expect(report.totals.avgTokensPerSecond).toBeGreaterThan(55);
      expect(report.tierDistribution.BELOW_2K).toBe(1);
      expect(report.tierDistribution['2K_3K_LOCALIZED']).toBe(1);
      expect(report.selfRegulation.status).toBe('OPTIMAL');
      expect(report.selfRegulation.shouldCompactContext).toBe(false);

      // Evaluar presión de contexto en escalón 5K_6K_NEAR_LIMIT
      const nearLimitReport = telemetry.getTokenTelemetryReport({
        currentPromptTokens: 5050,
      });
      expect(nearLimitReport.contextEvaluation.tier).toBe('5K_6K_NEAR_LIMIT');
      expect(nearLimitReport.selfRegulation.status).toBe('NEAR_LIMIT');
      expect(nearLimitReport.selfRegulation.shouldCompactContext).toBe(true);

      // Evaluar presupuesto de misión
      const budgetReport = telemetry.getBudgetTelemetryReport();
      expect(budgetReport.missionsCount).toBe(1);
      expect(budgetReport.missions[0].missionId).toBe('mission_alpha');
      expect(budgetReport.missions[0].tokenUtilizationPercent).toBe(12.5);
    });

    it('generates a CoreContext strictly bounded to <= 25 lines and registers introspection tools', async () => {
      const capRegistry = new CapabilityRegistryService();
      await capRegistry.onModuleInit();
      capRegistry.notifyServiceChange(
        'VOICE',
        'DEGRADED',
        'Sin micrófono físico conectado',
      );

      const workingMem = new WorkingMemoryService();
      workingMem.set({
        sessionId: 's1',
        key: 'active_task',
        content: 'Integrando capacidades DSH',
      });
      const tripartite = new TripartiteMemoryService(workingMem);
      const telemetry = new TelemetryInspectionService();

      const coreContextSvc = new CoreContextService(
        undefined,
        undefined,
        capRegistry,
        tripartite,
        telemetry,
      );

      const core = await coreContextSvc.buildCoreContext({
        sessionId: 's1',
        profileOverride: {
          name: 'Ignacio',
          country: 'Argentina',
          language: 'es-AR',
          timezone: 'America/Argentina/Buenos_Aires',
        },
        mode: 'coder',
      });

      expect(core.lineCount).toBeLessThanOrEqual(25);
      expect(core.markdown.split('\n').length).toBeLessThanOrEqual(25);
      expect(core.markdown).toContain('Ignacio');
      expect(core.markdown).toContain('VOICE');
      expect(core.degradedCapabilities).toContain('VOICE');

      const toolRegistry = new ToolRegistryService();
      expect(toolRegistry.findByName('telemetry_inspection')).toBeDefined();
      expect(toolRegistry.findByName('capability_registry')).toBeDefined();
      expect(toolRegistry.findByName('memory_sleep')).toBeDefined();
    });
  });

  // ── FASE 2: CapabilityRegistry Dinámico (Startup + Event-Driven) ─────────────
  describe('Phase 2 — CapabilityRegistryService, IntentRouter & Planner Integration', () => {
    it('updates capabilities on service state changes, supports dryRun, and gates IntentRouter & Planner', async () => {
      const capRegistry = new CapabilityRegistryService();
      await capRegistry.onModuleInit();

      // Simular caída de búsqueda web (event-driven)
      capRegistry.notifyServiceChange(
        'WEB_BROWSER_SEARCH',
        'UNAVAILABLE',
        'Sin conectividad externa',
      );

      const snap = capRegistry.getSnapshot();
      expect(snap.summary.unavailable).toContain('WEB_BROWSER_SEARCH');
      expect(snap.recentEvents.length).toBeGreaterThanOrEqual(1);
      expect(snap.recentEvents[0].capabilityId).toBe('WEB_BROWSER_SEARCH');

      // Verificar modo dryRun en refreshCapabilities
      const drySnap = await capRegistry.refreshCapabilities({
        dryRun: true,
        probeNetwork: false,
      });
      expect(drySnap.dryRun).toBe(true);

      // Verificar integración con IntentRouterService
      const router = new IntentRouterService(undefined, capRegistry);
      const routed = await router.classify(
        'busca en internet las últimas noticias de hoy',
      );
      expect(routed.intent).toBe('RAG');
      expect(routed.reason).toContain('WEB_BROWSER_SEARCH no disponible');

      // Verificar integración con PlannerService (filtra 'search' y 'scrape' cuando WEB_BROWSER_SEARCH está UNAVAILABLE)
      const allowedSteps = capRegistry.getAllowedPlannerStepTypes();
      expect(allowedSteps).not.toContain('search');
      expect(allowedSteps).not.toContain('scrape');

      const createdSteps: any[] = [];
      const mockTaskRepo: any = {
        createTask: jest.fn().mockResolvedValue({ id: 99, objective: 'test' }),
        createTaskSteps: jest
          .fn()
          .mockImplementation((_id: number, steps: any[]) => {
            createdSteps.push(...steps);
          }),
        getTaskWithSteps: jest.fn().mockResolvedValue({
          id: 99,
          objective: 'test',
          steps: createdSteps,
        }),
      };
      const mockLlm: any = {
        generate: jest.fn().mockResolvedValue({
          content: JSON.stringify([
            {
              stepNumber: 1,
              description: 'Buscar en la web',
              type: 'search',
            },
            {
              stepNumber: 2,
              description: 'Resumir hallazgos',
              type: 'summarize',
            },
          ]),
          promptTokens: 120,
          completionTokens: 45,
        }),
      };

      const planner = new PlannerService(
        mockTaskRepo,
        {} as any,
        mockLlm,
        capRegistry,
      );
      await planner.createPlan('Investigar tema X');

      // El paso 'search' alucinado por el LLM fue sanitizado a 'respond' porque WEB_BROWSER_SEARCH está UNAVAILABLE
      expect(createdSteps[0].type).toBe('respond');
      expect(createdSteps[1].type).toBe('summarize');
    });

    it('routes composite user identity and personal memory queries to LOCAL instead of direct TOOL', async () => {
      const router = new IntentRouterService();
      const res = await router.classify(
        'Sabes quién soy? Que sabes sobre mi? Que fecha es hoy? Y dime, esta pronosticado lluvia para está noche?',
      );
      expect(res.intent).toBe('LOCAL');
      expect(res.reason).toBe('personal identity and memory query');
    });
  });

  // ── FASE 3: Memoria Tripartita (Working + Episodic 50/30/20 + TripleStore) ───
  describe('Phase 3 — TripartiteMemoryService (Working TTL/Miller, Episodic 50/30/20 & Epistemic Quarantine)', () => {
    it('enforces WorkingMemory TTL and Miller capacity limit (max 7 items per session)', () => {
      const wm = new WorkingMemoryService();
      const baseTime = 1_700_000_000_000;

      // Insertar 7 ítems con distintas saliencias
      for (let i = 1; i <= 7; i++) {
        wm.set(
          {
            sessionId: 'sess_miller',
            key: `item_${i}`,
            content: `Contenido ${i}`,
            salience: i * 0.1, // item_1 tiene la menor salience (0.1)
            ttlMs: 60_000,
          },
          baseTime + i,
        );
      }

      expect(wm.listActive('sess_miller', baseTime + 10).length).toBe(7);

      // Insertar el 8vo ítem: debe desalojar a item_1 (menor salience = 0.1)
      wm.set(
        {
          sessionId: 'sess_miller',
          key: 'item_8',
          content: 'Contenido prioritario 8',
          salience: 0.95,
          ttlMs: 60_000,
        },
        baseTime + 20,
      );

      const active = wm.listActive('sess_miller', baseTime + 25);
      expect(active.length).toBe(7);
      expect(active.find((x) => x.key === 'item_1')).toBeUndefined();
      expect(active[0].key).toBe('item_8');

      // Avanzar el reloj más allá del TTL (60s) -> todos expiran
      expect(wm.listActive('sess_miller', baseTime + 120_000).length).toBe(0);
    });

    it('computes Episodic Hybrid Search (50% vector + 30% FTS + 20% importance) and enforces TripleStore epistemic quarantine', async () => {
      const wm = new WorkingMemoryService();
      const mockMemoryRepo: any = {
        findAll: jest.fn().mockResolvedValue([
          {
            id: 1,
            content:
              'Qwen2.5-Coder-14B opera en llama.cpp sobre RTX 5070 con 58 tokens por segundo',
            category: 'architecture',
            importance: 10,
          },
          {
            id: 2,
            content: 'Receta de cocina para preparar empanadas salteñas',
            category: 'general',
            importance: 2,
          },
        ]),
      };

      const savedPending: any[] = [];
      const savedRelations: any[] = [];
      const mockEntityGraphRepo: any = {
        savePendingRelation: jest.fn().mockImplementation(async (data) => {
          const rec = { id: savedPending.length + 1, ...data };
          savedPending.push(rec);
          return rec;
        }),
        upsertEntity: jest
          .fn()
          .mockImplementation(async (name, type) => ({ id: 10, name, type })),
        upsertRelation: jest
          .fn()
          .mockImplementation(async (sourceId, targetId, relationType, opts) => {
            const rel = {
              id: savedRelations.length + 100,
              sourceId,
              targetId,
              relationType,
              ...opts,
            };
            savedRelations.push(rel);
            return rel;
          }),
      };

      const tripartite = new TripartiteMemoryService(
        wm,
        mockMemoryRepo,
        mockEntityGraphRepo,
      );

      const matches = await tripartite.searchEpisodicHybrid(
        'Qwen2.5-Coder-14B RTX 5070 llama.cpp',
        {
          limit: 2,
          precomputedVectorScores: { 1: 0.92, 2: 0.08 },
        },
      );

      expect(matches.length).toBe(2);
      expect(matches[0].id).toBe(1);
      // Para id=1: vector=0.92 (0.46) + lexical=1.0 (0.30) + importance=1.0 (0.20) = 0.96
      expect(matches[0].hybridScore).toBeCloseTo(0.96, 2);
      expect(matches[0].hybridScore).toBeGreaterThan(matches[1].hybridScore);

      // 1. Tripleta sin evidencia documental (hipótesis) -> DEBE ir a cuarentena (PendingRelation)
      const hypothesisOutcome = await tripartite.recordAssociativeTriple({
        subject: 'JarBees',
        predicate: 'USES' as any,
        object: 'Motor Experimental Cuántico',
        confidence: 0.95,
        isVerifiedFact: false,
      });
      expect(hypothesisOutcome.status).toBe('QUARANTINED_AS_HYPOTHESIS');
      expect(savedPending.length).toBe(1);
      expect(savedRelations.length).toBe(0);

      // 2. Tripleta verificada con respaldo documental (quote + confidence >= 0.85 + isVerifiedFact=true) -> KnowledgeRelation
      const factOutcome = await tripartite.recordAssociativeTriple({
        subject: 'JarBees',
        subjectType: 'PROJECT' as any,
        predicate: 'USES' as any,
        object: 'PostgreSQL pgvector',
        objectType: 'TECHNOLOGY' as any,
        confidence: 0.95,
        sourceDocId: 42,
        quote: 'JarBees almacena embeddings de 1024 dimensiones en PostgreSQL pgvector.',
        isVerifiedFact: true,
      });
      expect(factOutcome.status).toBe('COMMITTED_TO_GRAPH');
      expect(savedRelations.length).toBe(1);
    });
  });

  // ── FASE 4: Rutina 'sleep' de Consolidación con Salvaguarda Epistémica ──────
  describe('Phase 4 — MemoryConsolidationService (sleep routine)', () => {
    it('promotes salient working memory, merges duplicates, flags DECISION_SUPERSEDED, and never auto-promotes hypotheses to facts', async () => {
      const wm = new WorkingMemoryService();
      // Ítem con alta relevancia y >= 2 accesos para ser promovido
      wm.set({
        sessionId: 's_sleep',
        key: 'important_finding',
        content: 'El límite seguro de entrada en contexto de 6144 es 5120 tokens',
        salience: 0.92,
        tags: ['engineering'],
      });
      wm.get('s_sleep', 'important_finding'); // accessCount = 2

      const inMemoryDb: any[] = [
        {
          id: 10,
          content: 'Activar USE_LLAMACPP_CODER=true siempre en producción global',
          category: 'decision',
          importance: 5,
          updatedAt: new Date('2026-10-20T10:00:00Z'),
          lastAccessed: new Date('2026-10-20T10:00:00Z'),
        },
        {
          id: 11,
          content: 'No activar USE_LLAMACPP_CODER=true en producción global',
          category: 'decision',
          importance: 8,
          updatedAt: new Date('2026-10-29T10:00:00Z'),
          lastAccessed: new Date('2026-10-29T10:00:00Z'),
        },
        {
          id: 12,
          content: 'Ejecutar Jest siempre con --runInBand para evitar OOM',
          category: 'rule',
          importance: 6,
          updatedAt: new Date('2026-10-25T10:00:00Z'),
          lastAccessed: new Date('2026-10-25T10:00:00Z'),
        },
        {
          id: 13,
          content: 'Ejecutar Jest siempre con --runInBand para evitar OOM',
          category: 'rule',
          importance: 7,
          updatedAt: new Date('2026-10-28T10:00:00Z'),
          lastAccessed: new Date('2026-10-28T10:00:00Z'),
        },
        {
          id: 14,
          content: 'Nota temporal antigua de hace dos meses',
          category: 'notes',
          importance: 4,
          updatedAt: new Date('2026-08-01T10:00:00Z'),
          lastAccessed: new Date('2026-08-01T10:00:00Z'),
        },
      ];

      const mockMemoryRepo: any = {
        findAll: jest.fn().mockImplementation(async () => [...inMemoryDb]),
        create: jest.fn().mockImplementation(async (data) => {
          const created = {
            id: inMemoryDb.length + 100,
            ...data,
            updatedAt: new Date(),
            lastAccessed: new Date(),
          };
          inMemoryDb.push(created);
          return created;
        }),
        update: jest.fn().mockImplementation(async (id, data) => {
          const idx = inMemoryDb.findIndex((m) => m.id === id);
          if (idx >= 0) {
            inMemoryDb[idx] = { ...inMemoryDb[idx], ...data };
            return inMemoryDb[idx];
          }
          return null;
        }),
        delete: jest.fn().mockImplementation(async (id) => {
          const idx = inMemoryDb.findIndex((m) => m.id === id);
          if (idx >= 0) inMemoryDb.splice(idx, 1);
        }),
      };

      const mockEntityGraphRepo: any = {
        listPending: jest.fn().mockResolvedValue([
          {
            id: 501,
            sourceName: 'Hipótesis A',
            targetName: 'Fenómeno B',
            status: 'PENDING',
            confidence: 0.7,
          },
          {
            id: 502,
            sourceName: 'Hipótesis C',
            targetName: 'Fenómeno D',
            status: 'PENDING',
            confidence: 0.6,
          },
        ]),
      };

      const tripartite = new TripartiteMemoryService(
        wm,
        mockMemoryRepo,
        mockEntityGraphRepo,
      );
      const consolidation = new MemoryConsolidationService(
        wm,
        tripartite,
        mockMemoryRepo,
        mockEntityGraphRepo,
      );

      const report = await consolidation.executeSleepCycle({
        reason: 'inactivity_detected',
      });

      // 1. Promovió el ítem de WorkingMemory
      expect(report.workingMemory.promotedToEpisodic).toBe(1);

      // 2. Fusionó el duplicado exacto (#12 y #13)
      expect(report.episodicMemory.duplicatesMerged).toBe(1);
      expect(report.episodicMemory.removedMemoryIds).toContain(12);

      // 3. Detectó la contradicción entre decisión #11 (nueva) y #10 (antigua) y marcó #10 como DECISION_SUPERSEDED sin borrarla
      expect(report.episodicMemory.decisionsSuperseded.length).toBe(1);
      expect(report.episodicMemory.decisionsSuperseded[0].olderMemoryId).toBe(10);
      expect(report.episodicMemory.decisionsSuperseded[0].newerMemoryId).toBe(11);
      const supersededItem = inMemoryDb.find((m) => m.id === 10);
      expect(supersededItem).toBeDefined();
      expect(supersededItem.content).toContain('[DECISION_SUPERSEDED by #11');

      // 4. Aplicó decaimiento temporal al recuerdo antiguo #14
      expect(report.episodicMemory.staleDecayedCount).toBeGreaterThanOrEqual(1);

      // 5. Salvaguarda epistémica intacta: 0 hipótesis promovidas automáticamente a hechos
      expect(report.epistemicAudit.pendingHypothesesScanned).toBe(2);
      expect(report.epistemicAudit.hypothesesPreservedInQuarantine).toBe(2);
      expect(report.epistemicAudit.autoPromotedToFact).toBe(0);
    });
  });

  // ── FASE 5: Procedural Skills Estandarizadas (SOPs) ─────────────────────────
  describe('Phase 5 — Procedural Skills (SOPs) & Capability Verification', () => {
    it('loads the 3 standardized SOP skills with preconditions, steps, pitfalls, and verificationSteps', async () => {
      const capRegistry = new CapabilityRegistryService();
      await capRegistry.onModuleInit();

      const skillRegistry = new SkillRegistryService(capRegistry);
      const sopSkills = skillRegistry.getProceduralSkills();

      expect(sopSkills.length).toBeGreaterThanOrEqual(3);

      const engSop = sopSkills.find(
        (s) => s.name === 'mision-ingenieria-verificada',
      );
      expect(engSop).toBeDefined();
      expect(engSop?.isProceduralSop).toBe(true);
      expect(engSop?.preconditions).toContain('CODE_VERIFICATION_HARNESS');
      expect(engSop?.steps?.length).toBeGreaterThanOrEqual(4);
      expect(engSop?.pitfalls?.length).toBeGreaterThanOrEqual(2);
      expect(engSop?.verificationSteps?.length).toBeGreaterThanOrEqual(2);

      // Verificar que es ejecutable cuando las capacidades están operativas
      expect(skillRegistry.isSkillExecutable(engSop!).executable).toBe(true);

      // Si ISOLATED_TEST_RUNNER pasa a UNAVAILABLE, la skill indica qué capacidad falta
      capRegistry.notifyServiceChange(
        'ISOLATED_TEST_RUNNER',
        'UNAVAILABLE',
        'Runner deshabilitado por mantenimiento',
      );
      const execCheck = skillRegistry.isSkillExecutable(engSop!);
      expect(execCheck.executable).toBe(false);
      expect(execCheck.missingCapabilities).toContain('ISOLATED_TEST_RUNNER');
    });
  });
});

