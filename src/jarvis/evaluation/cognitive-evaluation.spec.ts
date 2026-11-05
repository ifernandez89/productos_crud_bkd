import { CognitiveEvaluationService } from './cognitive-evaluation.service';

describe('CognitiveEvaluationService — Validación JCA Fase 5 (Evaluación Cognitiva)', () => {
  let service: CognitiveEvaluationService;

  beforeEach(() => {
    service = new CognitiveEvaluationService();
  });

  it('E1: Calcula alta fidelidad a la intención cuando la respuesta aborda el objetivo directamente', () => {
    const metrics = service.evaluateInteraction({
      conversationId: 'conv-eval-1',
      userObjective: 'Restaurar y procesar video histórico Jung 1959 sin subtítulos',
      promptInjectedContext: '',
      responseContent: 'Procediendo a restaurar y procesar el video histórico Jung 1959 con perfil limpio sin subtítulos.',
    });

    expect(metrics.intentionFidelity).toBeGreaterThanOrEqual(0.8);
    expect(metrics.passedQualityGate).toBe(true);
    expect(metrics.alerts).toHaveLength(0);
  });

  it('E2: Dispara alerta CRÍTICA por baja fidelidad cuando ocurre secuestro léxico (Caso #002)', () => {
    const metrics = service.evaluateInteraction({
      conversationId: 'conv-eval-2',
      userObjective: 'Acelera el renderizado en la GPU RTX 5070 con CUDA y fp16',
      promptInjectedContext: 'Resumen del libro El hombre y sus simbolos por Carl Gustav Jung...',
      responseContent: 'El hombre y sus símbolos es una obra fundamental de Carl Gustav Jung que aborda el inconsciente colectivo y los arquetipos psicológicos.',
    });

    expect(metrics.intentionFidelity).toBeLessThan(0.4);
    expect(metrics.passedQualityGate).toBe(false);
    expect(metrics.alerts.some((a) => a.code === 'LOW_INTENTION_FIDELITY')).toBe(true);
  });

  it('E3: Detecta y alerta sobre ruido contextual elevado cuando el contexto inyectado no se aprovecha', () => {
    const metrics = service.evaluateInteraction({
      conversationId: 'conv-eval-3',
      userObjective: 'Confirmar estado de la tarea',
      promptInjectedContext: 'Cientos de tokens con metadatos irrelevantes, tablas de precios, bibliografías obsoletas y manuales no solicitados',
      responseContent: 'La tarea ha finalizado con éxito.',
    });

    expect(metrics.contextNoiseRatio).toBeGreaterThan(0.85);
    expect(metrics.alerts.some((a) => a.code === 'HIGH_CONTEXT_NOISE')).toBe(true);
  });

  it('E4: Mide precisión de invocación de herramientas (P_TOOL)', () => {
    const metrics = service.evaluateInteraction({
      conversationId: 'conv-eval-4',
      userObjective: 'Consultar base de datos y generar reporte',
      promptInjectedContext: '',
      responseContent: 'Reporte generado con los datos consultados.',
      toolInvocations: [
        { toolName: 'db_query', outputUsedInResponse: true },
        { toolName: 'unused_calc', outputUsedInResponse: false },
      ],
    });

    expect(metrics.toolPrecision).toBe(0.5);
  });

  it('E5: Rechaza conclusiones de misión sin evidencia verificada (T_VERIF)', () => {
    const metrics = service.evaluateInteraction({
      conversationId: 'conv-eval-5',
      userObjective: 'Ejecutar misión de prueba de estrés',
      promptInjectedContext: '',
      responseContent: 'Prueba completada sin novedades.',
      missionEvidence: [
        { claim: 'Test unitario 1', verified: true, evidenceHash: 'abc' },
        { claim: 'Test unitario 2', verified: false }, // Falta evidencia
      ],
    });

    expect(metrics.evidenceVerificationRate).toBe(0.5);
    expect(metrics.passedQualityGate).toBe(false);
    expect(metrics.alerts.some((a) => a.code === 'UNVERIFIED_EVIDENCE')).toBe(true);
  });

  it('E6: Mide deriva cognitiva mediante distancia coseno entre embeddings (D_COG)', () => {
    // Vectores ortogonales: sim = 0, dist = 1.0 -> Deriva Crítica
    const vecObjective = [1, 0, 0];
    const vecState = [0, 1, 0];

    const metrics = service.evaluateInteraction({
      conversationId: 'conv-eval-6',
      userObjective: 'Compilar backend',
      promptInjectedContext: '',
      responseContent: 'Listo.',
      objectiveEmbedding: vecObjective,
      stateEmbedding: vecState,
    });

    expect(metrics.cognitiveDriftIndex).toBe(1.0);
    expect(metrics.passedQualityGate).toBe(false);
    expect(metrics.alerts.some((a) => a.code === 'COGNITIVE_DRIFT_DETECTED')).toBe(true);
  });

  it('E7: Deriva cognitiva mínima cuando los embeddings están alineados', () => {
    const vecA = [0.6, 0.8, 0];
    const vecB = [0.6, 0.8, 0];

    const metrics = service.evaluateInteraction({
      conversationId: 'conv-eval-7',
      userObjective: 'Probar paridad de vectores',
      promptInjectedContext: '',
      responseContent: 'Procediendo a probar la paridad de vectores con éxito.',
      objectiveEmbedding: vecA,
      stateEmbedding: vecB,
    });

    expect(metrics.cognitiveDriftIndex).toBe(0.0);
    expect(metrics.passedQualityGate).toBe(true);
  });
});
