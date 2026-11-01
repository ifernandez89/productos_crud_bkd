import { MemoryAttentionPolicyService } from './memory-attention-policy.service';
import { RetrievalDecision } from './mae2.types';

describe('MemoryAttentionPolicyService (MAE 2.0)', () => {
  let service: MemoryAttentionPolicyService;

  beforeEach(() => {
    service = new MemoryAttentionPolicyService();
  });

  describe('Evaluación de Desempeño y Latencia', () => {
    it('debe evaluar la política en menos de 5ms por decisión (promedio)', () => {
      const iterations = 50;
      const t0 = Date.now();
      for (let i = 0; i < iterations; i++) {
        service.evaluatePolicy({
          userMessage: 'Calcula la complejidad O(n) del algoritmo quicksort',
          sessionId: 'test_session',
        });
      }
      const totalTime = Date.now() - t0;
      const avgTime = totalTime / iterations;
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('Casos de Decisión Adaptativa', () => {
    it('debe decidir NO_RETRIEVAL en tareas de lógica y algoritmos autosuficientes', () => {
      const record = service.evaluatePolicy({
        userMessage: 'Calcula el invariante de este array y escribe una función typescript para ordenarlo',
        sessionId: 'session_algo',
      });

      expect(record.decision).toBe(RetrievalDecision.NO_RETRIEVAL);
      expect(record.dimensions.necessity).toBeLessThan(0.2);
      expect(record.dimensions.interferenceRisk).toBeGreaterThan(0.7);
      expect(record.toolsEnabled.length).toBe(0);
      expect(record.reason).toContain('Suficiencia operativa');
    });

    it('debe decidir DEFERRED_RETRIEVAL ante ambigüedad en referencias previas', () => {
      const record = service.evaluatePolicy({
        userMessage: 'Apliquemos el mecanismo que dijimos como habíamos quedado en la otra opción',
        sessionId: 'session_ambiguous',
      });

      expect(record.decision).toBe(RetrievalDecision.DEFERRED_RETRIEVAL);
      expect(record.confidenceScore).toBeLessThan(0.6);
      expect(record.toolsEnabled).toContain('bounded_context_search');
      expect(record.reason).toContain('Ambigüedad');
    });

    it('debe decidir SELECTIVE_RAG cuando se consulta conocimiento fáctico de proyectos JarBees', () => {
      const record = service.evaluatePolicy({
        userMessage: '¿Cuál es el valor del balance de energía registrado en Archeoscope?',
        sessionId: 'session_factual',
      });

      expect(record.decision).toBe(RetrievalDecision.SELECTIVE_RAG);
      expect(record.dimensions.necessity).toBeGreaterThan(0.8);
      expect(record.dimensions.relevance).toBeGreaterThan(0.8);
      expect(record.dimensions.interferenceRisk).toBeLessThan(0.3);
    });

    it('debe decidir SELECTIVE_GRAPH cuando se consulta relaciones ontológicas o dependencias', () => {
      const record = service.evaluatePolicy({
        userMessage: '¿Cuál es la relación entre el componente Cauac y Oxlahun en JarBees?',
        sessionId: 'session_graph',
      });

      expect(record.decision).toBe(RetrievalDecision.SELECTIVE_GRAPH);
      expect(record.toolsEnabled).toContain('query_knowledge_graph');
      expect(record.dimensions.expectedUtility).toBeGreaterThan(0.8);
    });

    it('debe decidir SELECTIVE_SNAPSHOT cuando se consulta la evolución histórica o consensos', () => {
      const record = service.evaluatePolicy({
        userMessage: '¿Cómo evolucionó el balance energetico de JarBees según el snapshot previo?',
        sessionId: 'session_snap',
      });

      expect(record.decision).toBe(RetrievalDecision.SELECTIVE_SNAPSHOT);
      expect(record.toolsEnabled).toContain('fetch_topic_snapshot');
    });

    it('debe decidir DIALECTIC_AUDIT cuando el usuario plantea una contradicción o desafío epistémico', () => {
      const record = service.evaluatePolicy({
        userMessage: 'Eso es incorrecto, la documentación oficial dice lo opuesto sobre Tiwanaku',
        sessionId: 'session_dialectic',
      });

      expect(record.decision).toBe(RetrievalDecision.DIALECTIC_AUDIT);
      expect(record.dimensions.contradictionDetected).toBe(true);
      expect(record.toolsEnabled).toContain('audit_dialectic_conflict');
      expect(record.toolsEnabled).toContain('query_knowledge_graph');
      expect(record.toolsEnabled).toContain('fetch_topic_snapshot');
    });
  });

  describe('Integridad del Registro de Decisión', () => {
    it('debe generar identificadores, hash y metadatos válidos en cada decisión', () => {
      const record = service.evaluatePolicy({
        userMessage: 'Demuestra que la suma de ángulos internos de un triángulo es 180',
        sessionId: 'session_hash_test',
      });

      expect(record.decisionId).toMatch(/^dec_[a-f0-9]{8}$/);
      expect(record.sessionId).toBe('session_hash_test');
      expect(record.userPromptHash.length).toBe(16);
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.decisionLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});

