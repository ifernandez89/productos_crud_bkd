import { AdaptiveMemoryOrchestratorService } from './adaptive-memory-orchestrator.service';
import { MemoryAttentionPolicyService } from './memory-attention-policy.service';
import { MemoryDecisionLoggerService } from './memory-decision-logger.service';
import { RetrievalPlannerService } from './retrieval-planner.service';
import { DialecticHitlBridgeService } from './dialectic-hitl-bridge.service';
import { RetrievalDecision } from './mae2.types';

describe('AdaptiveMemoryOrchestratorService (Rollout Gradual & Fallback)', () => {
  let orchestrator: AdaptiveMemoryOrchestratorService;
  let policyService: MemoryAttentionPolicyService;
  let loggerService: MemoryDecisionLoggerService;
  let plannerService: RetrievalPlannerService;
  let hitlBridge: DialecticHitlBridgeService;

  beforeEach(() => {
    policyService = new MemoryAttentionPolicyService();
    loggerService = new MemoryDecisionLoggerService();
    loggerService.clear();
    plannerService = new RetrievalPlannerService(policyService, loggerService);
    hitlBridge = new DialecticHitlBridgeService();
    hitlBridge.clearInMemory();

    orchestrator = new AdaptiveMemoryOrchestratorService(
      policyService,
      loggerService,
      plannerService,
      hitlBridge,
    );
  });

  describe('Etapa 1: Shadow Mode', () => {
    it('debe responder con MAE 1.0 y registrar divergencias en segundo plano sin alterar producción', async () => {
      orchestrator.setMode('SHADOW');

      const result = await orchestrator.orchestrateDecision(
        'session_shadow_1',
        'Calcula la complejidad asintótica de quicksort',
      );

      expect(result.activeMode).toBe('SHADOW');
      expect(result.engineUsed).toBe('MAE_1');
      expect(result.shadowDivergenceLogged).toBe(true);

      const stats = orchestrator.getRolloutStats();
      expect(stats.shadowDivergencesCount).toBe(1);
      expect(stats.tokenSavingsEstimate).toBeGreaterThan(0); // Ahorro potencial detectado
    });
  });

  describe('Etapa 2: Canary Mode', () => {
    it('debe enrutar proporcionalmente las sesiones según el porcentaje de canario', async () => {
      orchestrator.setMode('CANARY');
      orchestrator.setCanaryPercentage(50); // 50% de tráfico

      let mae1Count = 0;
      let mae2Count = 0;

      for (let i = 0; i < 20; i++) {
        const res = await orchestrator.orchestrateDecision(
          `session_canary_rand_${i}`,
          '¿Cuál es la relación entre Cauac y Oxlahun?',
        );
        if (res.engineUsed === 'MAE_1') mae1Count++;
        if (res.engineUsed === 'MAE_2') mae2Count++;
      }

      expect(mae1Count).toBeGreaterThan(0);
      expect(mae2Count).toBeGreaterThan(0);
      expect(mae1Count + mae2Count).toBe(20);
    });
  });

  describe('Etapa 3: Default Mode y Fallback Seguro', () => {
    it('debe ejecutar directamente MAE 2.0 en modo predeterminado', async () => {
      orchestrator.setMode('DEFAULT');

      const result = await orchestrator.orchestrateDecision(
        'session_default_1',
        'Calcula el invariante de un árbol rojo-negro',
      );

      expect(result.activeMode).toBe('DEFAULT');
      expect(result.engineUsed).toBe('MAE_2');
      expect(result.decision).toBe(RetrievalDecision.NO_RETRIEVAL);
      expect(result.fallbackTriggered).toBe(false);
    });

    it('debe activar fallback limpio a MAE 1.0 si ocurre un fallo en MAE 2.0', async () => {
      orchestrator.setMode('DEFAULT');

      // Simular fallo en plannerService
      jest.spyOn(plannerService, 'createPlan').mockImplementationOnce(() => {
        throw new Error('Fallo simulado en evaluador MAE 2.0');
      });

      const result = await orchestrator.orchestrateDecision(
        'session_fallback_1',
        'Consulta sobre Archeoscope',
      );

      expect(result.engineUsed).toBe('MAE_1');
      expect(result.fallbackTriggered).toBe(true);
      expect(result.plan.shouldExecuteMemoryQuery).toBe(true);

      const stats = orchestrator.getRolloutStats();
      expect(stats.fallbackCount).toBe(1);
    });
  });

  describe('Detección del Caso Trampa (Anti-Falso NO_RETRIEVAL)', () => {
    it('debe detectar preguntas aparentemente de CS pero con anclaje en decisiones históricas del proyecto', async () => {
      orchestrator.setMode('DEFAULT');

      const result = await orchestrator.orchestrateDecision(
        'session_trap_1',
        '¿Por qué habíamos descartado esa estrategia de persistencia en el proyecto?',
      );

      // NO debe ser NO_RETRIEVAL porque refiere a una decisión histórica de equipo
      expect(result.decision).toBe(RetrievalDecision.SELECTIVE_SNAPSHOT);
      expect(result.plan.shouldExecuteMemoryQuery).toBe(true);
      expect(result.plan.allowedTools).toContain('fetch_topic_snapshot');
    });
  });
});

