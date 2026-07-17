import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  // Usamos nomic-embed-text o llama3.2 como default.
  private readonly OLLAMA_URL = 'http://localhost:11434/api/embeddings';
  private readonly EMBEDDING_MODEL =
    process.env.OLLAMA_EMBEDDING_MODEL ?? 'bge-m3:latest';
  private readonly EMBEDDING_DIMS = 1024; // bge-m3 genera 1024 dimensiones

  private getEmbeddingModelFallbacks(): string[] {
    const configured = process.env.OLLAMA_EMBEDDING_MODEL_FALLBACKS;
    const defaults = [
      'mxbai-embed-large',
      'all-minilm',
      'nomic-embed-text:latest',
    ];

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
    try {
      const response = await axios.post(
        this.OLLAMA_URL,
        {
          model: this.EMBEDDING_MODEL,
          prompt: text,
        },
        { timeout: 20000 },
      );

      if (response.data?.embedding) {
        return response.data.embedding;
      }
      throw new Error('Respuesta inválida de Ollama embeddings');
    } catch (error: any) {
      this.logger.error(
        `[EmbeddingsService] Error con modelo ${this.EMBEDDING_MODEL}: ${error.message}`,
      );
      throw new Error(`Fallo al generar embedding: ${error.message}`);
    }
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
