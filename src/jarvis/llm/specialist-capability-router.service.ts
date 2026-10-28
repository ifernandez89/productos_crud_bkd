import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { LLMGenerateOptions } from './llm-provider.interface';

export type SpecialistTaskType =
  | 'coding'
  | 'technical_rag'
  | 'synthesis'
  | 'creative_summary'
  | 'dialectic_reasoning'
  | 'vision_multimodal'
  | 'general';

export interface RouteDecision {
  taskType: SpecialistTaskType;
  selectedModel: string;
  provider: 'llamacpp' | 'ollama' | 'openrouter';
  hardwareSuitability: 'optimal' | 'fallback' | 'rejected';
  reason: string;
}

@Injectable()
export class SpecialistCapabilityRouterService {
  private readonly logger = new Logger(SpecialistCapabilityRouterService.name);

  // Modelos preferidos definidos según las reglas de AGENTS.md
  // 🥇 Qwen 3 4B: RAG, documentación, programación, seguimiento estricto de instrucciones
  // 🥈 Gemma 3 4B: Resúmenes, síntesis larga, flujos conversacionales, creatividad
  private readonly MODEL_PREFERENCES = {
    coding: 'qwen2.5-coder:7b',
    technical_rag: 'qwen3:4b',
    dialectic_reasoning: 'deepseek-r1:8b',
    synthesis: 'gemma3:4b',
    creative_summary: 'gemma3:4b',
    general: 'qwen3:4b',
  };

  /**
   * Enruta la consulta al especialista idóneo según sus capacidades y verifica
   * que los requerimientos de hardware (ej. VRAM para visión) se cumplan rigurosamente.
   */
  routeRequest(options: LLMGenerateOptions, hasVisionModelLoaded = false): RouteDecision {
    const taskType = this.classifyTaskType(options);

    // Verificación de capacidad multimodal (visión)
    if (taskType === 'vision_multimodal') {
      if (!hasVisionModelLoaded) {
        this.logger.warn(
          'Rechazo de ruta: Se intentó procesar payload multimodal pero no hay modelo de visión cargado en VRAM.',
        );
        throw new BadRequestException(
          'La solicitud requiere capacidades multimodales (visión), pero no hay ningún modelo vision (ej. LLaVA / MiniCPM-V) activo en la VRAM de la GPU. Active el modelo de visión antes de procesar imágenes.',
        );
      }

      return {
        taskType,
        selectedModel: 'llava:latest',
        provider: 'ollama',
        hardwareSuitability: 'optimal',
        reason: 'Modelo de visión activo en VRAM para procesamiento multimodal.',
      };
    }

    // Enrutamiento cognitivo especializado
    const selectedModel = this.MODEL_PREFERENCES[taskType] || this.MODEL_PREFERENCES.general;

    return {
      taskType,
      selectedModel,
      provider: 'llamacpp',
      hardwareSuitability: 'optimal',
      reason: `Especialista seleccionado según heurística de AGENTS.md para tarea '${taskType}': ${selectedModel}`,
    };
  }

  /**
   * Clasifica el tipo de tarea basado en las opciones y el contenido de los mensajes.
   */
  classifyTaskType(options: LLMGenerateOptions): SpecialistTaskType {
    // Si contiene imágenes en los mensajes o attachments
    const hasImages =
      (options as any).images?.length > 0 ||
      options.messages?.some(
        (m: any) =>
          Array.isArray(m.content) &&
          m.content.some((c: any) => c.type === 'image' || c.type === 'image_url'),
      );

    if (hasImages) {
      return 'vision_multimodal';
    }

    const fullText = (options.messages || [])
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n')
      .toLowerCase();

    if (
      /(código|typescript|javascript|nest|prisma|sql|función|bug|refactor|test|jest|clase|compilar)/i.test(
        fullText,
      )
    ) {
      return 'coding';
    }

    if (
      /(contraste|dialéctica|auditoría de premisas|tensión|antítesis|epistémic|falacia|refut)/i.test(
        fullText,
      )
    ) {
      return 'dialectic_reasoning';
    }

    if (
      /(resumen|sintetizar|condensar|capítulo|meta-resumen|libro completo|extraer historias)/i.test(
        fullText,
      )
    ) {
      return 'synthesis';
    }

    if (/(documentación|rag|chunk|biblioteca|buscar en documentos)/i.test(fullText)) {
      return 'technical_rag';
    }

    return 'general';
  }
}
