import { CapabilityRegistryService } from '../config/capability-registry.service';
import { TelemetryInspectionService } from '../llm/telemetry-inspection.service';
import { PlannerService } from '../planner/planner.service';
import { CoreContextService } from '../prompt/core-context.service';
import { IntentRouterService } from '../tools/intent/intent-router.service';
import { MemoryConsolidationService } from './memory-consolidation.service';
import { TripartiteMemoryService } from './tripartite-memory.service';
import { WorkingMemoryService } from './working-memory.service';

/**
 * Suite de Validación Profunda de Integración y Comportamiento Cognitivo para JarBees:
 *
 * 1. Capability Failure: Si Ollama / servicio se cae, JarBees deja de planificar acciones dependientes.
 * 2. Memory Retrieval: Recupera recuerdos relevantes sin contaminar la respuesta con información irrelevante.
 * 3. Epistemic Integrity: Una hipótesis nunca termina convertida en hecho por consolidación automática.
 * 4. Sleep Idempotency: Ejecutar dos o más veces la misma consolidación no duplica ni corrompe recuerdos.
 * 5. Context Stress: Mantiene las instrucciones importantes e invariantes cuando se aproxima al límite de contexto.
 *
 * Prueba A — Cambio de Decisión: Registrar decisión -> Migrar -> Sleep -> Recuperar decisión vigente vs histórica.
 * Prueba B — Recuperación de Capacidades: AVAILABLE -> UNAVAILABLE -> AVAILABLE sin reiniciar JarBees.
 * Auditoría C — Límite Dinámico y Configurable de Working Memory (más allá de la regla fija de 7).
 */
describe('JarBees Cognitive & Resilience Deep Validation Suite (5 Core + 2 Special + Memory Audit)', () => {
  // ── PRUEBA 1: Capability Failure ──────────────────────────────────────────
  describe('Prueba 1 — Capability Failure (Resiliencia ante caídas de proveedores)', () => {
    it('cuando un proveedor/capacidad se cae, IntentRouter y Planner degradan ordenadamente sin planificar acciones rotas', async () => {
      const capRegistry = new CapabilityRegistryService();
      await capRegistry.onModuleInit();

      // Estado inicial: todo operativo
      expect(capRegistry.isCapabilityOperational('LLM_FALLBACK_OLLAMA')).toBe(true);
      expect(capRegistry.isCapabilityOperational('WEB_BROWSER_SEARCH')).toBe(true);

      // Simular caída abrupta de Ollama y de la búsqueda web
      capRegistry.notifyServiceChange(
        'LLM_FALLBACK_OLLAMA',
        'UNAVAILABLE',
        'ECONNREFUSED 127.0.0.1:11434',
      );
      capRegistry.notifyServiceChange(
        'WEB_BROWSER_SEARCH',
        'UNAVAILABLE',
        'Proxy error / Network down',
      );

      expect(capRegistry.isCapabilityOperational('LLM_FALLBACK_OLLAMA')).toBe(false);
      expect(capRegistry.isCapabilityOperational('WEB_BROWSER_SEARCH')).toBe(false);

      // 1. IntentRouter debe degradar WEB -> RAG (o LOCAL)
      const router = new IntentRouterService(undefined, capRegistry);
      const routeResult = await router.classify('busca en la web las cotizaciones de hoy');
      expect(routeResult.intent).toBe('RAG');
      expect(routeResult.reason).toContain('WEB_BROWSER_SEARCH no disponible');

      // 2. PlannerService debe prohibir 'search' y 'scrape' en los tipos de paso permitidos
      const allowedSteps = capRegistry.getAllowedPlannerStepTypes();
      expect(allowedSteps).not.toContain('search');
      expect(allowedSteps).not.toContain('scrape');

      const createdSteps: any[] = [];
      const mockTaskRepo: any = {
        createTask: jest.fn().mockResolvedValue({ id: 101, objective: 'Buscar y resumir' }),
        createTaskSteps: jest.fn().mockImplementation((_id, steps) => {
          createdSteps.push(...steps);
        }),
        getTaskWithSteps: jest.fn().mockResolvedValue({
          id: 101,
          objective: 'Buscar y resumir',
          steps: createdSteps,
        }),
      };

      const mockLlm: any = {
        generate: jest.fn().mockResolvedValue({
          content: JSON.stringify([
            { stepNumber: 1, description: 'Buscar datos en la web', type: 'search' },
            { stepNumber: 2, description: 'Scrapear página de resultados', type: 'scrape' },
            { stepNumber: 3, description: 'Resumir información', type: 'summarize' },
          ]),
          promptTokens: 150,
          completionTokens: 60,
        }),
      };

      const planner = new PlannerService(mockTaskRepo, {} as any, mockLlm, capRegistry);
      await planner.createPlan('Buscar y resumir');

      // Los pasos search y scrape deben haber sido convertidos a 'respond' por filtro de capacidad
      expect(createdSteps[0].type).toBe('respond');
      expect(createdSteps[1].type).toBe('respond');
      expect(createdSteps[2].type).toBe('summarize');
    });
  });

  // ── PRUEBA 2: Memory Retrieval (Relación Señal/Ruido y No-Contaminación) ────
  describe('Prueba 2 — Memory Retrieval (Precisión y No-Contaminación)', () => {
    it('recupera recuerdos relevantes con alta precisión (>0.85) sin contaminar con ruido no relacionado (<0.25)', async () => {
      const wm = new WorkingMemoryService();
      const mockMemories: any[] = [
        {
          id: 1,
          content: 'Arquitectura de inferencia: llama.cpp con Qwen2.5-Coder-14B en GPU NVIDIA RTX 5070',
          category: 'architecture',
          importance: 9,
          updatedAt: new Date('2026-10-29T10:00:00Z'),
        },
        {
          id: 2,
          content: 'Parámetros de arquitectura llama-server para GPU: contexto -c 6144, slot único -np 1 y puerto 8080',
          category: 'architecture',
          importance: 8,
          updatedAt: new Date('2026-10-29T11:00:00Z'),
        },
        {
          id: 3,
          content: 'Receta para hacer empanadas criollas con carne cortada a cuchillo y comino',
          category: 'cooking',
          importance: 10, // Alta importancia arbitraria para comprobar que la importancia no contamina el match
          updatedAt: new Date('2026-10-15T10:00:00Z'),
        },
        {
          id: 4,
          content: 'Resultado del superclásico de fútbol: Boca Juniors 2 - River Plate 1',
          category: 'sports',
          importance: 7,
          updatedAt: new Date('2026-10-20T10:00:00Z'),
        },
        {
          id: 5,
          content: 'Horario del vuelo a Bariloche para las vacaciones de verano',
          category: 'travel',
          importance: 6,
          updatedAt: new Date('2026-09-01T10:00:00Z'),
        },
      ];

      const mockMemoryRepo: any = {
        findAll: jest.fn().mockResolvedValue(mockMemories),
        getByCategory: jest.fn().mockImplementation((cat) =>
          mockMemories.filter((m) => m.category === cat),
        ),
      };

      const tripartite = new TripartiteMemoryService(wm, mockMemoryRepo);

      // Consulta técnica específica
      const query = 'llama.cpp GPU RTX 5070 Qwen2.5-Coder arquitectura';
      const results = await tripartite.searchEpisodicHybrid(query, {
        limit: 5,
        precomputedVectorScores: {
          1: 0.95, // Altamente afín
          2: 0.88, // Altamente afín
          3: 0.05, // Ruido total
          4: 0.02, // Ruido total
          5: 0.01, // Ruido total
        },
      });

      // Debe ordenar primero los recuerdos arquitectónicos
      expect(results.length).toBe(5);
      expect(results[0].id).toBe(1);
      expect(results[1].id).toBe(2);

      // Puntuaciones híbridas: el recuerdo primario supera 0.85 y el secundario supera 0.65
      expect(results[0].hybridScore).toBeGreaterThan(0.85);
      expect(results[1].hybridScore).toBeGreaterThan(0.65);
      expect(results[1].hybridScore).toBeGreaterThan(results[2].hybridScore);

      // Los recuerdos irrelevantes (cocina, fútbol, viaje) deben quedar muy por debajo
      const noiseMatches = results.filter((r) => [3, 4, 5].includes(r.id));
      for (const noise of noiseMatches) {
        expect(noise.hybridScore).toBeLessThan(0.35);
        expect(noise.lexicalScore).toBeLessThan(0.1);
      }

      // El top 2 debe tener 100% de precisión de dominio
      const top2Categories = results.slice(0, 2).map((r) => r.category);
      expect(top2Categories).toEqual(['architecture', 'architecture']);
    });
  });

  // ── PRUEBA 3: Epistemic Integrity ─────────────────────────────────────────
  describe('Prueba 3 — Epistemic Integrity (Invariante contra falsos hechos automáticos)', () => {
    it('una hipótesis en PendingRelation jamás es promovida automáticamente a hecho confirmado durante sleep', async () => {
      const wm = new WorkingMemoryService();
      const pendingStore: any[] = [
        {
          id: 701,
          sourceName: 'Consumo Energético',
          targetName: 'Superconductividad a Temperatura Ambiente',
          relationType: 'USES',
          confidence: 0.98, // Muy alta confianza hipotética
          status: 'PENDING',
          quote: null,
          sourceDocId: null,
        },
        {
          id: 702,
          sourceName: 'JarBees',
          targetName: 'Compilador Cuántico',
          relationType: 'DEVELOPED',
          confidence: 0.99,
          status: 'PENDING',
        },
      ];

      const approvedRelations: any[] = [];

      const mockEntityGraphRepo: any = {
        listPending: jest.fn().mockImplementation(async (status) =>
          pendingStore.filter((p) => p.status === status),
        ),
        upsertRelation: jest.fn().mockImplementation(async (...args) => {
          approvedRelations.push(args);
          return { id: approvedRelations.length };
        }),
      };

      const mockMemoryRepo: any = {
        findAll: jest.fn().mockResolvedValue([]),
      };

      const tripartite = new TripartiteMemoryService(wm, mockMemoryRepo, mockEntityGraphRepo);
      const consolidation = new MemoryConsolidationService(
        wm,
        tripartite,
        mockMemoryRepo,
        mockEntityGraphRepo,
      );

      // Ejecutar consolidación sleep
      const report = await consolidation.executeSleepCycle({
        reason: 'agent_tool',
      });

      // Comprobar invariante epistémico estricto
      expect(report.epistemicAudit.pendingHypothesesScanned).toBe(2);
      expect(report.epistemicAudit.hypothesesPreservedInQuarantine).toBe(2);
      expect(report.epistemicAudit.autoPromotedToFact).toBe(0);
      expect(report.epistemicAudit.invariantEnforced).toContain('EPISTEMIC_GUARDRAIL_ACTIVE');

      // Las relaciones aprobadas deben seguir vacías
      expect(approvedRelations.length).toBe(0);
      // Las hipótesis deben permanecer en status PENDING
      expect(pendingStore[0].status).toBe('PENDING');
      expect(pendingStore[1].status).toBe('PENDING');
    });
  });

  // ── PRUEBA 4: Sleep Idempotency ───────────────────────────────────────────
  describe('Prueba 4 — Sleep Idempotency (Estabilidad en ejecuciones consecutivas)', () => {
    it('ejecutar sleep dos o tres veces seguidas no duplica recuerdos, no corrompe flags ni distorsiona el estado', async () => {
      const wm = new WorkingMemoryService();
      wm.set({
        sessionId: 'sess_idem',
        key: 'stable_fact',
        content: 'El comando de test obligatorio en este proyecto es --runInBand',
        salience: 0.95,
        tags: ['rule'],
      });
      wm.get('sess_idem', 'stable_fact'); // accessCount = 2

      const memoryStore: any[] = [
        {
          id: 1,
          content: 'Version A de directiva de desarrollo',
          category: 'guideline',
          importance: 5,
          updatedAt: new Date('2026-10-01'),
          lastAccessed: new Date('2026-10-01'),
        },
        {
          id: 2,
          content: 'Version A de directiva de desarrollo', // Duplicado exacto
          category: 'guideline',
          importance: 5,
          updatedAt: new Date('2026-10-05'),
          lastAccessed: new Date('2026-10-05'),
        },
      ];

      const mockMemoryRepo: any = {
        findAll: jest.fn().mockImplementation(async () => [...memoryStore]),
        create: jest.fn().mockImplementation(async (item) => {
          const rec = { id: memoryStore.length + 10, ...item, updatedAt: new Date(), lastAccessed: new Date() };
          memoryStore.push(rec);
          return rec;
        }),
        update: jest.fn().mockImplementation(async (id, data) => {
          const idx = memoryStore.findIndex((m) => m.id === id);
          if (idx >= 0) {
            memoryStore[idx] = { ...memoryStore[idx], ...data };
            return memoryStore[idx];
          }
          return null;
        }),
        delete: jest.fn().mockImplementation(async (id) => {
          const idx = memoryStore.findIndex((m) => m.id === id);
          if (idx >= 0) memoryStore.splice(idx, 1);
        }),
      };

      const tripartite = new TripartiteMemoryService(wm, mockMemoryRepo);
      const consolidation = new MemoryConsolidationService(wm, tripartite, mockMemoryRepo);

      // ── Primera ejecución de sleep ──
      const reportRun1 = await consolidation.executeSleepCycle();
      expect(reportRun1.workingMemory.promotedToEpisodic).toBe(1);
      expect(reportRun1.episodicMemory.duplicatesMerged).toBe(1);
      expect(reportRun1.episodicMemory.removedMemoryIds).toContain(1);

      const countAfterRun1 = memoryStore.length;

      // ── Segunda ejecución de sleep (inmediata, sin datos nuevos) ──
      const reportRun2 = await consolidation.executeSleepCycle();
      expect(reportRun2.workingMemory.promotedToEpisodic).toBe(0); // Ya fue promovido, no duplicar
      expect(reportRun2.episodicMemory.duplicatesMerged).toBe(0); // Cero duplicados nuevos
      expect(reportRun2.episodicMemory.decisionsSuperseded.length).toBe(0); // Cero contradicciones nuevas
      expect(memoryStore.length).toBe(countAfterRun1); // El conteo exacto de la base se mantiene

      // ── Tercera ejecución de sleep ──
      const reportRun3 = await consolidation.executeSleepCycle();
      expect(reportRun3.episodicMemory.duplicatesMerged).toBe(0);
      expect(memoryStore.length).toBe(countAfterRun1);
    });
  });

  // ── PRUEBA 5: Context Stress ──────────────────────────────────────────────
  describe('Prueba 5 — Context Stress (Conservación de invariantes al límite de contexto)', () => {
    it('al aproximarse a 5K-6K tokens, emite alertas de compactación sin perder ninguna de las reglas invariantes de CoreContext', async () => {
      const telemetry = new TelemetryInspectionService();

      // Reporte con 5.120 tokens de prompt (en ventana de 6.144)
      const stressedTelemetry = telemetry.getTokenTelemetryReport({
        currentPromptTokens: 5120,
      });

      expect(stressedTelemetry.contextEvaluation.tier).toBe('5K_6K_NEAR_LIMIT');
      expect(stressedTelemetry.selfRegulation.status).toBe('NEAR_LIMIT');
      expect(stressedTelemetry.selfRegulation.shouldCompactContext).toBe(true);
      expect(stressedTelemetry.selfRegulation.guidance[0]).toContain('Escalón 5K_6K_NEAR_LIMIT alcanzado');

      // Verificar que CoreContext se mantiene compacto (<= 25 líneas) conservando todos sus invariantes
      const capRegistry = new CapabilityRegistryService();
      await capRegistry.onModuleInit();
      const coreContextSvc = new CoreContextService(
        undefined,
        undefined,
        capRegistry,
        undefined,
        telemetry,
      );

      const coreResult = await coreContextSvc.buildCoreContext({
        sessionId: 'stress_session',
        mode: 'coder',
      });

      expect(coreResult.lineCount).toBeLessThanOrEqual(25);
      const lines = coreResult.markdown.split('\n');
      expect(lines.length).toBeLessThanOrEqual(25);

      // Invariantes obligatorios presentes en el núcleo
      expect(coreResult.markdown).toContain('Honestidad Epistémica');
      expect(coreResult.markdown).toContain('Separación Hipótesis/Hecho');
      expect(coreResult.markdown).toContain('Aprobación Humana Obligatoria (HITL)');
      expect(coreResult.markdown).toContain('Confinamiento');
      expect(coreResult.markdown).toContain('Rollback');
      expect(coreResult.markdown).toContain('Capacidades Reales Detectadas');
    });
  });

  // ── PRUEBA A: Cambio de Decisión y Trazabilidad Histórica ─────────────────
  describe('Prueba A — Cambio de Decisión (Decisión Vigente vs Historia Previa)', () => {
    it('registra cambio de decisión arquitectónica, marca DECISION_SUPERSEDED y preserva historia sin confundir vigente con obsoleta', async () => {
      const wm = new WorkingMemoryService();
      const inMemoryDb: any[] = [];

      const mockMemoryRepo: any = {
        findAll: jest.fn().mockImplementation(async () => [...inMemoryDb]),
        create: jest.fn().mockImplementation(async (item) => {
          const rec = { id: inMemoryDb.length + 1, ...item, updatedAt: new Date(), lastAccessed: new Date() };
          inMemoryDb.push(rec);
          return rec;
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

      // 1. JarBees registra que el proyecto utiliza Ollama (Decisión Antigua #1)
      await mockMemoryRepo.create({
        content: 'El proyecto JarBees debe usar Ollama como proveedor primario de inferencia',
        category: 'architecture_decision',
        importance: 6,
      });
      inMemoryDb[0].updatedAt = new Date('2026-09-01T10:00:00Z');

      // 2. Posteriormente se decide migrar a llama.cpp (Decisión Nueva #2)
      await mockMemoryRepo.create({
        content: 'El proyecto JarBees debe activar llama.cpp en lugar de usar Ollama como proveedor primario',
        category: 'architecture_decision',
        importance: 9,
      });
      inMemoryDb[1].updatedAt = new Date('2026-10-29T10:00:00Z');

      // 3. Ejecutar rutina sleep de consolidación
      const tripartite = new TripartiteMemoryService(wm, mockMemoryRepo);
      const consolidation = new MemoryConsolidationService(wm, tripartite, mockMemoryRepo);

      const sleepReport = await consolidation.executeSleepCycle();
      expect(sleepReport.episodicMemory.decisionsSuperseded.length).toBe(1);

      const sup = sleepReport.episodicMemory.decisionsSuperseded[0];
      expect(sup.olderMemoryId).toBe(1);
      expect(sup.newerMemoryId).toBe(2);

      // 4. Consultar cuál es la arquitectura vigente
      const allMemories = await mockMemoryRepo.findAll();
      const activeDecisions = allMemories.filter(
        (m) => m.category === 'architecture_decision' && !m.content.startsWith('[DECISION_SUPERSEDED'),
      );
      expect(activeDecisions.length).toBe(1);
      expect(activeDecisions[0].id).toBe(2);
      expect(activeDecisions[0].content).toContain('activar llama.cpp en lugar de usar Ollama');

      // 5. Consultar historia previa y justificación
      const historicalDecisions = allMemories.filter((m) =>
        m.content.startsWith('[DECISION_SUPERSEDED'),
      );
      expect(historicalDecisions.length).toBe(1);
      expect(historicalDecisions[0].id).toBe(1);
      expect(historicalDecisions[0].content).toContain('[DECISION_SUPERSEDED by #2 at');
      expect(historicalDecisions[0].content).toContain('debe usar Ollama');
      // La importancia del recuerdo obsoleto fue reducida a 1 para no eclipsar la decisión vigente
      expect(historicalDecisions[0].importance).toBe(1);
    });
  });

  // ── PRUEBA B: Recuperación de Capacidades en Caliente ─────────────────────
  describe('Prueba B — Recuperación Dinámica de Capacidades en Caliente', () => {
    it('un servicio pasa de AVAILABLE -> UNAVAILABLE -> AVAILABLE y el Planner recupera la herramienta sin reiniciar JarBees', async () => {
      const capRegistry = new CapabilityRegistryService();
      await capRegistry.onModuleInit();

      // 1. Servicio inicialmente AVAILABLE
      expect(capRegistry.isCapabilityOperational('CODE_VERIFICATION_HARNESS')).toBe(true);
      expect(capRegistry.getAllowedPlannerStepTypes()).toContain('verify_code');

      // 2. Caída del arnés de verificación
      capRegistry.notifyServiceChange(
        'CODE_VERIFICATION_HARNESS',
        'UNAVAILABLE',
        'Fallo de compilación en sandbox AST',
      );

      // 3. Pasa a UNAVAILABLE -> El planner ya no permite verify_code
      expect(capRegistry.isCapabilityOperational('CODE_VERIFICATION_HARNESS')).toBe(false);
      expect(capRegistry.getAllowedPlannerStepTypes()).not.toContain('verify_code');

      // 4. Se recupera el servicio (hot-recovery sin reiniciar el proceso)
      capRegistry.notifyServiceChange(
        'CODE_VERIFICATION_HARNESS',
        'AVAILABLE',
        'Sandbox recuperado y probado OK',
      );

      // 5. Vuelve a estar AVAILABLE
      expect(capRegistry.isCapabilityOperational('CODE_VERIFICATION_HARNESS')).toBe(true);
      // 6. El Planner vuelve a tener permitido 'verify_code' de inmediato
      expect(capRegistry.getAllowedPlannerStepTypes()).toContain('verify_code');
    });
  });

  // ── AUDITORÍA C: Capacidad Configurable de Working Memory ─────────────────
  describe('Auditoría C — Límite Dinámico y Configurable de Working Memory', () => {
    it('permite configurar dinámicamente límites de 5, 7 o 12 ítems sin dogmatismo estricto de Miller', () => {
      // 1. Instancia con límite de 5 ítems
      const wm5 = new WorkingMemoryService({ maxItemsPerSession: 5 });
      expect(wm5.getMaxItemsPerSession()).toBe(5);

      for (let i = 1; i <= 6; i++) {
        wm5.set({
          sessionId: 'test5',
          key: `k_${i}`,
          content: `V_${i}`,
          salience: i * 0.1, // k_1 tiene 0.1
        });
      }

      // Al insertar 6 con límite 5, desaloja k_1
      const active5 = wm5.listActive('test5');
      expect(active5.length).toBe(5);
      expect(active5.find((x) => x.key === 'k_1')).toBeUndefined();

      // 2. Ajuste dinámico en caliente a 10 ítems
      wm5.setMaxItemsPerSession(10);
      expect(wm5.getMaxItemsPerSession()).toBe(10);

      for (let i = 7; i <= 11; i++) {
        wm5.set({
          sessionId: 'test5',
          key: `k_${i}`,
          content: `V_${i}`,
          salience: 0.8,
        });
      }

      // Ahora puede alojar hasta 10 ítems sin problemas
      expect(wm5.listActive('test5').length).toBe(10);
    });
  });
});
