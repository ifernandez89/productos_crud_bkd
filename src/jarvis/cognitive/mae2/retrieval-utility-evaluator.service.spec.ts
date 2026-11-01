import { RetrievalUtilityEvaluatorService } from './retrieval-utility-evaluator.service';
import { RetrievalDecision } from './mae2.types';

describe('RetrievalUtilityEvaluatorService (MAE 2.0)', () => {
  let service: RetrievalUtilityEvaluatorService;

  beforeEach(() => {
    service = new RetrievalUtilityEvaluatorService();
  });

  describe('Ganancia Neta de Utilidad (ΔU)', () => {
    it('debe clasificar como UTILE cuando la memoria incrementa el score en más de 2 puntos', () => {
      const res = service.evaluateDeltaUtility(85, 75, 500);
      expect(res.deltaUtility).toBe(10);
      expect(res.classification).toBe('UTILE');
      expect(res.contextCostTokens).toBe(500);
    });

    it('debe clasificar como DETRIMENTAL cuando la memoria introduce interferencia y penaliza el score', () => {
      const res = service.evaluateDeltaUtility(70, 78, 650);
      expect(res.deltaUtility).toBe(-8);
      expect(res.classification).toBe('DETRIMENTAL');
    });

    it('debe clasificar como NEUTRAL cuando la diferencia de score es marginal (-2 <= ΔU <= 2)', () => {
      const res = service.evaluateDeltaUtility(77.5, 77.0, 300);
      expect(res.deltaUtility).toBe(0.5);
      expect(res.classification).toBe('NEUTRAL');
    });
  });

  describe('Matriz de Confusión y Métricas de Error', () => {
    it('debe calcular métricas perfectas (100% accuracy, 0% FP, 0% FN) ante decisiones ideales', () => {
      const evaluations = [
        { predictedDecision: RetrievalDecision.SELECTIVE_RAG, requiresMemory: true }, // TP
        { predictedDecision: RetrievalDecision.SELECTIVE_GRAPH, requiresMemory: true }, // TP
        { predictedDecision: RetrievalDecision.NO_RETRIEVAL, requiresMemory: false }, // TN
        { predictedDecision: RetrievalDecision.NO_RETRIEVAL, requiresMemory: false }, // TN
      ];

      const matrix = service.computeConfusionMatrix(evaluations);
      expect(matrix.truePositives).toBe(2);
      expect(matrix.trueNegatives).toBe(2);
      expect(matrix.falsePositives).toBe(0);
      expect(matrix.falseNegatives).toBe(0);
      expect(matrix.accuracy).toBe(100);
      expect(matrix.unnecessaryRetrievalRate).toBe(0);
      expect(matrix.omittedMemoryRate).toBe(0);
    });

    it('debe calcular la tasa de recuperación innecesaria cuando ocurre sobre-recuperación (FP)', () => {
      const evaluations = [
        { predictedDecision: RetrievalDecision.SELECTIVE_RAG, requiresMemory: false }, // FP
        { predictedDecision: RetrievalDecision.NO_RETRIEVAL, requiresMemory: false },  // TN
        { predictedDecision: RetrievalDecision.NO_RETRIEVAL, requiresMemory: false },  // TN
        { predictedDecision: RetrievalDecision.NO_RETRIEVAL, requiresMemory: false },  // TN
      ];

      const matrix = service.computeConfusionMatrix(evaluations);
      expect(matrix.falsePositives).toBe(1);
      expect(matrix.trueNegatives).toBe(3);
      // FP / (FP + TN) = 1 / 4 = 25%
      expect(matrix.unnecessaryRetrievalRate).toBe(25);
      expect(matrix.omittedMemoryRate).toBe(0);
    });

    it('debe calcular la tasa de omisión de memoria cuando ocurre sub-recuperación (FN)', () => {
      const evaluations = [
        { predictedDecision: RetrievalDecision.NO_RETRIEVAL, requiresMemory: true },    // FN
        { predictedDecision: RetrievalDecision.SELECTIVE_RAG, requiresMemory: true }, // TP
        { predictedDecision: RetrievalDecision.SELECTIVE_GRAPH, requiresMemory: true }, // TP
      ];

      const matrix = service.computeConfusionMatrix(evaluations);
      expect(matrix.falseNegatives).toBe(1);
      expect(matrix.truePositives).toBe(2);
      // FN / (FN + TP) = 1 / 3 = 33.33%
      expect(matrix.omittedMemoryRate).toBe(33.33);
    });
  });

  describe('Penalización por Interferencia (I)', () => {
    it('debe cuantificar la penalización cuando la inyección de memoria reduce el rendimiento', () => {
      const baseScores = [80, 85, 90]; // Promedio 85
      const memoryScores = [70, 75, 80]; // Promedio 75
      const penalty = service.computeInterferencePenalty(baseScores, memoryScores);
      expect(penalty).toBe(10);
    });

    it('debe retornar 0 si no hay penalización por interferencia', () => {
      const baseScores = [80, 85, 90];
      const memoryScores = [80, 85, 90];
      const penalty = service.computeInterferencePenalty(baseScores, memoryScores);
      expect(penalty).toBe(0);
    });
  });
});

