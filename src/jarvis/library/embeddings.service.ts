import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  // Usamos nomic-embed-text o llama3.2 como default.
  private readonly OLLAMA_URL = 'http://localhost:11434/api/embeddings';
  private readonly EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text';
  private readonly EMBEDDING_MODEL_FALLBACKS = this.getEmbeddingModelFallbacks();

  private getEmbeddingModelFallbacks(): string[] {
    const configured = process.env.OLLAMA_EMBEDDING_MODEL_FALLBACKS;
    const defaults = ['mxbai-embed-large', 'all-minilm', 'nomic-embed-text:latest'];

    if (!configured) {
      return defaults;
    }

    return configured
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  /**
   * Genera un embedding vectorial a partir de un texto.
   * Retorna un array de números (floats).
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const modelsToTry = [this.EMBEDDING_MODEL, ...this.EMBEDDING_MODEL_FALLBACKS].filter(
      (model, index, arr) => model && arr.indexOf(model) === index,
    );

    let lastError: any;

    for (const model of modelsToTry) {
      try {
        const response = await axios.post(this.OLLAMA_URL, {
          model,
          prompt: text,
        });

        if (response.data && response.data.embedding) {
          if (model !== this.EMBEDDING_MODEL) {
            this.logger.warn(`[EmbeddingsService] Usando modelo alternativo de embeddings: ${model}`);
          }
          return response.data.embedding;
        }

        throw new Error('Respuesta inválida de Ollama');
      } catch (error: any) {
        const status = error?.response?.status;
        const message = error?.message || String(error);
        const isMissingModel = status === 404 || status === 400 || /not found|model/i.test(message);

        lastError = error;

        if (isMissingModel) {
          this.logger.warn(`[EmbeddingsService] Modelo de embeddings no disponible: ${model}. Probando siguiente candidato...`);
          continue;
        }

        this.logger.error(`[EmbeddingsService] Error generando embedding con modelo ${model}: ${message}`);
        break;
      }
    }

    const reason = lastError?.message || String(lastError || 'Error desconocido');
    this.logger.error(`[EmbeddingsService] No fue posible generar embedding con los modelos probados: ${reason}`);
    throw new Error(`Fallo al generar embedding: ${reason}`);
  }

  /**
   * Calcula la similitud de cosenos entre dos vectores (para búsquedas en memoria)
   * Útil si no tenemos pgvector habilitado aún.
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] ** 2;
      normB += vecB[i] ** 2;
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
