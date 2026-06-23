import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  
  // Usamos nomic-embed-text o llama3.2 como default.
  private readonly OLLAMA_URL = 'http://localhost:11434/api/embeddings';
  private readonly EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text';

  /**
   * Genera un embedding vectorial a partir de un texto.
   * Retorna un array de números (floats).
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(this.OLLAMA_URL, {
        model: this.EMBEDDING_MODEL,
        prompt: text,
      });
      
      if (response.data && response.data.embedding) {
        return response.data.embedding;
      }
      throw new Error('Respuesta inválida de Ollama');
    } catch (error) {
      this.logger.error(`Error generando embedding con modelo ${this.EMBEDDING_MODEL}: ${error.message}`);
      // Fallback: retornamos un array vacío o tiramos error según prefieras
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
