/**
 * RECOMENDACIONES DE MODELOS (Evaluación de Calidad):
 * 
 * 🥇 Qwen 3 1.7B (Configuración recomendada para JarBees)
 *    Objetivo:
 *    - Reducir alucinaciones y respuestas deterministas
 *    - Priorizar RAG y herramientas como fuente de verdad
 *    - Menor consumo de RAM y menor tiempo de respuesta (latencia ultra baja)
 */

export interface OllamaGenerationOptions {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  presencePenalty: number;
  frequencyPenalty: number;
  numCtx: number;
  numPredict: number;
  seed?: number;
  think: boolean;
}

/** Configuración base general JarBees + Qwen3:1.7B */
export const QWEN3_17B_BASE_PROFILE: OllamaGenerationOptions = {
  model: 'qwen3:1.7b',
  think: false, // OFF por defecto
  temperature: 0.10, // Respuestas deterministas, menor alucinación
  topP: 0.85,
  topK: 20,
  repeatPenalty: 1.10,
  presencePenalty: 0,
  frequencyPenalty: 0,
  numCtx: 8192,
  numPredict: 512,
  seed: 42,
};

/** Perfil Chat simple 💬 (conversación normal, preguntas simples) */
export const QWEN3_17B_CHAT_PROFILE: OllamaGenerationOptions = {
  model: 'qwen3:1.7b',
  think: false,
  temperature: 0.25,
  topP: 0.90,
  topK: 30,
  repeatPenalty: 1.10,
  presencePenalty: 0,
  frequencyPenalty: 0,
  numCtx: 8192,
  numPredict: 300,
};

/** Perfil RAG / Conocimiento 📚 (documentos, precisión absoluta) */
export const QWEN3_17B_RAG_PROFILE: OllamaGenerationOptions = {
  model: 'qwen3:1.7b',
  think: false,
  temperature: 0.05,
  topP: 0.80,
  topK: 10,
  repeatPenalty: 1.10,
  presencePenalty: 0,
  frequencyPenalty: 0,
  numCtx: 8192,
  numPredict: 700,
};

/** Modelo general / conversacional — OLLAMA_MODEL_NAME o OLLAMA_MODEL */
export function resolveOllamaModelName(defaultModel = 'qwen3:1.7b'): string {
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
 * Caso de uso: OllamaQwenModelService, tareas de código y análisis (qwen3:1.7b)
 */
export function resolveTechModel(defaultModel = 'qwen3:1.7b'): string {
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

