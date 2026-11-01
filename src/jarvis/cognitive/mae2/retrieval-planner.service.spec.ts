import { RetrievalPlannerService } from './retrieval-planner.service';
import { MemoryAttentionPolicyService } from './memory-attention-policy.service';
import { MemoryDecisionLoggerService } from './memory-decision-logger.service';
import { RetrievalDecision } from './mae2.types';

describe('RetrievalPlannerService (MAE 2.0)', () => {
  let policyService: MemoryAttentionPolicyService;
  let loggerService: MemoryDecisionLoggerService;
  let plannerService: RetrievalPlannerService;

  beforeEach(() => {
    policyService = new MemoryAttentionPolicyService();
    loggerService = new MemoryDecisionLoggerService();
    loggerService.clear();
    plannerService = new RetrievalPlannerService(policyService, loggerService);
  });

  it('debe planificar NO_RETRIEVAL con 0 herramientas y budget 0 para tareas autosuficientes', () => {
    const { record, plan } = plannerService.createPlan({
      userMessage: 'Calcula la complejidad O(n) del algoritmo quicksort',
      sessionId: 'session_plan_test',
    });

    expect(record.decision).toBe(RetrievalDecision.NO_RETRIEVAL);
    expect(plan.decision).toBe(RetrievalDecision.NO_RETRIEVAL);
    expect(plan.allowedTools).toEqual([]);
    expect(plan.maxTokensBudget).toBe(0);
    expect(plan.shouldExecuteMemoryQuery).toBe(false);
    expect(plan.instructions).toContain('SUFICIENCIA OPERATIVA');

    // Debe registrar en el logger
    expect(loggerService.count()).toBe(1);
    expect(loggerService.getDecisions('session_plan_test').length).toBe(1);
  });

  it('debe planificar SELECTIVE_GRAPH con herramienta query_knowledge_graph para relaciones ontológicas', () => {
    const { record, plan } = plannerService.createPlan({
      userMessage: '¿Cuál es la relación entre el componente Cauac y Oxlahun?',
      sessionId: 'session_graph_plan',
    });

    expect(record.decision).toBe(RetrievalDecision.SELECTIVE_GRAPH);
    expect(plan.allowedTools).toContain('query_knowledge_graph');
    expect(plan.maxTokensBudget).toBeGreaterThan(0);
    expect(plan.shouldExecuteMemoryQuery).toBe(true);
  });

  it('debe planificar DIALECTIC_AUDIT con herramientas de auditoría ante contradicciones', () => {
    const { record, plan } = plannerService.createPlan({
      userMessage: 'Eso es incorrecto, en realidad ya no usamos Tiwanaku en JarBees',
      sessionId: 'session_dialectic_plan',
    });

    expect(record.decision).toBe(RetrievalDecision.DIALECTIC_AUDIT);
    expect(plan.allowedTools).toContain('audit_dialectic_conflict');
    expect(plan.allowedTools).toContain('query_knowledge_graph');
    expect(plan.allowedTools).toContain('fetch_topic_snapshot');
    expect(plan.shouldExecuteMemoryQuery).toBe(true);
  });
});

