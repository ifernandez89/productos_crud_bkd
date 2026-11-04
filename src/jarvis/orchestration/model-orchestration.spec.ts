import { ModelSelectionEngineService } from './model-selection-engine.service';

describe('ModelSelectionEngineService — Validación JCA Fase 4 (Orquestación RTX 5070)', () => {
  let engine: ModelSelectionEngineService;

  beforeEach(() => {
    engine = new ModelSelectionEngineService();
  });

  it('O1: Selecciona Tier 0 (Llama 3.2 3B) para charla reflexiva de baja latencia sin offload', () => {
    const decision = engine.selectModel({
      conversationId: 'conv-1',
      turnType: 'REFLECTIVE_CHAT',
      userMessage: 'Hola JarBees, ¿cómo estás hoy?',
      estimatedTokens: 200,
    });

    expect(decision.tier).toBe('TIER_0_FAST');
    expect(decision.selectedModel.id).toBe('llama-3.2-3b');
    expect(decision.modelsToOffload).toHaveLength(0);
    expect(decision.fitsInGpu).toBe(true);
    expect(decision.estimatedLatencyMs).toBeLessThanOrEqual(500);
  });

  it('O2: Enruta consultas de programación a Tier 2 (Qwen 2.5 Coder 14B)', () => {
    const decision = engine.selectModel({
      conversationId: 'conv-2',
      taskIntent: 'CODE_EXECUTION',
      userMessage: 'Refactoriza esta función de TypeScript y agrega pruebas Jest con mocks',
      estimatedTokens: 1500,
      requiresCodeExpertise: true,
    });

    expect(decision.tier).toBe('TIER_2_DEEP');
    expect(decision.selectedModel.id).toBe('qwen2.5-coder-14b');
    expect(decision.fitsInGpu).toBe(true);
    expect(decision.reason).toContain('Programación profunda');
  });

  it('O3: Calcula offloading automático para no exceder los 12 GB de la RTX 5070 al cargar 14B', () => {
    // Simular que tanto 3B como 7B ya están cargados en la GPU
    engine.setLoadedModels(['llama-3.2-3b', 'qwen2.5-7b']);

    const decision = engine.selectModel({
      conversationId: 'conv-3',
      requiresCodeExpertise: true,
      userMessage: 'Corrige un bug de stacktrace en Prisma',
      estimatedTokens: 2000,
    });

    expect(decision.selectedModel.id).toBe('qwen2.5-coder-14b');
    // Para cargar 14B (~9.2 GB) teniendo 3B (~2.0 GB) y 7B (~4.8 GB), 7B DEBE ser descargado
    expect(decision.modelsToOffload).toContain('qwen2.5-7b');
    expect(decision.fitsInGpu).toBe(true);
  });

  it('O4: Selecciona Tier 1 (Qwen 2.5 7B) para tareas de investigación y síntesis', () => {
    const decision = engine.selectModel({
      conversationId: 'conv-4',
      taskIntent: 'RESEARCH',
      userMessage: 'Analiza los patrones de sincronización de audio en archivos históricos',
      estimatedTokens: 3500,
    });

    expect(decision.tier).toBe('TIER_1_BALANCED');
    expect(decision.selectedModel.id).toBe('qwen2.5-7b');
    expect(decision.fitsInGpu).toBe(true);
  });

  it('O5: Anti-OOM Safety Guard — Redirige a Cloud Gateway si el contexto KV excede la VRAM física', () => {
    // 14B con 25k tokens requiere: 9200 MB + (25 * 160) = 9200 + 4000 = 13,200 MB > 11,827 MB usable
    const decision = engine.selectModel({
      conversationId: 'conv-5',
      requiresCodeExpertise: true,
      userMessage: 'Analiza este log masivo de 25k tokens y reescribe la arquitectura',
      estimatedTokens: 25000,
    });

    expect(decision.tier).toBe('TIER_3_HEAVY');
    expect(decision.selectedModel.id).toBe('cloud-fallback-heavy');
    expect(decision.fitsInGpu).toBe(true);
    expect(decision.reason).toContain('Exceso de presupuesto VRAM');
  });
});
