/**
 * RECOMENDACIONES DE MODELOS (Evaluación de Calidad):
 * 
 * 🥇 Qwen 3 4B (Puntaje: 9.8/10)
 *    Especialmente para:
 *    - RAG (Recuperación y Contexto)
 *    - Documentación
 *    - Programación y código
 *    - Seguir instrucciones estructuradas
 *    - Conocimiento técnico
 * 
 * 🥈 Gemma 3 4B (Puntaje: 9.6/10)
 *    Especialmente para:
 *    - Resúmenes y síntesis larga
 *    - Escritura y redacción
 *    - Conversación general y empatía
 */

/** Modelo general / conversacional — OLLAMA_MODEL_NAME o OLLAMA_MODEL */
export function resolveOllamaModelName(defaultModel = ''): string {
  const configuredModel = [
    process.env.OLLAMA_MODEL_NAME,
    process.env.OLLAMA_MODEL,
  ]
    .map((v) => v?.trim())
    .find(Boolean);

  return configuredModel || defaultModel;
}

/**
 * Modelo de clasificación / razonamiento rápido — OLLAMA_MODEL_TEST2_NAME
 * Caso de uso: IntentRouterService
 * ⚠️ Usar un modelo de instrucción sin thinking mode (ej: llama3.2:3b, phi4-mini).
 *    phi4-mini-reasoning NO es apto — siempre emite <think> y no puede dar 1 sola palabra.
 */
export function resolveIntentModel(defaultModel = 'llama3.2:3b'): string {
  const configured = process.env.OLLAMA_MODEL_TEST2_NAME?.trim();
  // Si el modelo configurado es un "reasoning" model, ignorarlo para intent classification
  if (configured && !configured.includes('reasoning')) return configured;
  return defaultModel;
}

/**
 * Modelo técnico / experto — OLLAMA_MODEL_TEST3_NAME
 * Caso de uso: OllamaQwenModelService, tareas de código y análisis (qwen3:4b)
 */
export function resolveTechModel(defaultModel = 'qwen3:4b'): string {
  return process.env.OLLAMA_MODEL_TEST3_NAME?.trim() || defaultModel;
}

/**
 * Modelo multimodal / visión — OLLAMA_MODEL_VL_NAME
 * Caso de uso: VisionService — OCR, análisis de imágenes, PDFs escaneados
 */
export function resolveVisionModel(
  defaultModel = 'yemifo/qwen25-vl-3b-q4km:latest',
): string {
  return process.env.OLLAMA_MODEL_VL_NAME?.trim() || defaultModel;
}
