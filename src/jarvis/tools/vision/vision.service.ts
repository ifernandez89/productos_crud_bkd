import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { resolveVisionModel } from '../../../shared/ollama-config';

export interface VisionAnalysisResult {
  text: string;          // respuesta del modelo
  model: string;
  latencyMs: number;
  detectedLanguage?: string;  // TypeScript, SQL, Python, etc. si aplica
}

/**
 * VisionService — análisis de imágenes y OCR via Ollama + Qwen2.5-VL.
 *
 * Casos de uso:
 *   - OCR inteligente (capturas de error, fotos de cuaderno, PDFs escaneados)
 *   - Análisis de diagramas, ERDs, arquitecturas
 *   - Descripción y clasificación de imágenes
 *   - Extracción de texto estructurado (tablas, formularios)
 *
 * El modelo recibe la imagen como base64 directamente en el payload de Ollama.
 * No requiere GPU — Qwen2.5-VL 3B Q4_K_M corre en CPU.
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly OLLAMA_URL = 'http://localhost:11434/api/generate';
  private readonly model = resolveVisionModel();

  // ── Prompts especializados por caso de uso ──────────────────────────────────

  private readonly PROMPTS = {
    ocr: `Extraé todo el texto visible en esta imagen de forma exacta y ordenada.
Mantené la estructura original (listas, tablas, columnas si las hay).
Respondé SOLO con el texto extraído, sin comentarios ni explicaciones.`,

    error: `Analizá esta captura de error de programación.
1. Transcribí el mensaje de error completo.
2. Identificá el lenguaje/tecnología (TypeScript, SQL, Docker, etc.).
3. Explicá la causa probable en 1-2 oraciones.
4. Proponé una solución concreta.
Respondé en español argentino.`,

    diagram: `Analizá este diagrama técnico.
Describí: qué tipo de diagrama es, los componentes principales, las relaciones o flujos de datos.
Si ves cuellos de botella o problemas de arquitectura, mencionálos.
Respondé en español argentino.`,

    document: `Extraé el contenido de este documento.
Organizá la información en secciones lógicas.
Incluí títulos, listas, tablas y cualquier dato estructurado que veas.
Respondé en español argentino.`,

    general: `Describí el contenido de esta imagen de forma detallada y útil.
Si hay texto, transcribílo. Si hay código, identificá el lenguaje.
Respondé en español argentino.`,
  } as const;

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Analiza una imagen con un prompt libre o uno de los presets.
   * @param imageBase64  Imagen en base64 (sin el prefijo data:image/...)
   * @param question     Pregunta o instrucción del usuario (opcional)
   * @param mode         Preset de prompt: ocr | error | diagram | document | general
   */
  async analyze(
    imageBase64: string,
    question?: string,
    mode: keyof typeof this.PROMPTS = 'general',
  ): Promise<VisionAnalysisResult> {
    const startTime = Date.now();
    const prompt = question
      ? `${question}\n\nSi hay texto en la imagen, transcribílo también.`
      : this.PROMPTS[mode];

    this.logger.log(`[vision] analizando imagen con ${this.model} (modo: ${mode})`);

    try {
      const response = await axios.post(
        this.OLLAMA_URL,
        {
          model: this.model,
          prompt,
          images: [imageBase64],
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 800,
          },
        },
        { timeout: 60_000 }, // VL puede tardar más que los modelos de texto
      );

      const text: string = (response.data?.response ?? '').trim();
      const latencyMs = Date.now() - startTime;

      this.logger.log(`[vision] OK — ${text.length} chars en ${latencyMs}ms`);

      return {
        text,
        model: this.model,
        latencyMs,
        detectedLanguage: this.detectCodeLanguage(text),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        throw new Error('⚠️ Ollama no está disponible. Ejecutá "ollama serve" e intentá de nuevo.');
      }
      if (msg.includes('not found') || msg.includes('404')) {
        throw new Error(
          `⚠️ El modelo de visión "${this.model}" no está descargado. ` +
          `Ejecutá: ollama pull ${this.model}`,
        );
      }
      throw err;
    }
  }

  /**
   * OCR puro — extrae solo el texto de la imagen.
   */
  async extractText(imageBase64: string): Promise<string> {
    const result = await this.analyze(imageBase64, undefined, 'ocr');
    return result.text;
  }

  /**
   * Analiza un error de programación en una captura de pantalla.
   */
  async analyzeError(imageBase64: string): Promise<VisionAnalysisResult> {
    return this.analyze(imageBase64, undefined, 'error');
  }

  /**
   * Detecta si el texto extraído contiene código y qué lenguaje es.
   */
  private detectCodeLanguage(text: string): string | undefined {
    const patterns: [RegExp, string][] = [
      [/\bTypeScript\b|\bts\b|\.ts\b|interface\s+\w|: string|: number/i, 'TypeScript'],
      [/\bJavaScript\b|\bjs\b|\.js\b|const\s|let\s|=>\s*{/i, 'JavaScript'],
      [/\bPython\b|\.py\b|def\s+\w|import\s+\w|print\(/i, 'Python'],
      [/\bSQL\b|SELECT\s+|FROM\s+|WHERE\s+|INSERT\s+INTO/i, 'SQL'],
      [/\bDocker\b|FROM\s+\w+:|RUN\s+|COPY\s+|EXPOSE\s+/i, 'Docker'],
      [/\bJSON\b|^\s*{[\s\S]*":\s*/m, 'JSON'],
      [/\bRust\b|fn\s+main|let\s+mut\s|impl\s+\w/i, 'Rust'],
    ];

    for (const [regex, lang] of patterns) {
      if (regex.test(text)) return lang;
    }
    return undefined;
  }
}
