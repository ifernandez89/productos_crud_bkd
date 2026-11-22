import { Injectable, Logger, Optional } from '@nestjs/common';
import axios from 'axios';
import { OllamaRecoveryService } from '../llm/ollama.recovery.service';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  // Usamos bge-m3 como default (1024 dims).
  private readonly OLLAMA_URL = 'http://localhost:11434/api/embeddings';
  private readonly EMBEDDING_MODEL =
    process.env.OLLAMA_EMBEDDING_MODEL ?? 'bge-m3:latest';
  private readonly EMBEDDING_DIMS = 1024; // bge-m3 genera 1024 dimensiones

  constructor(
    @Optional()
    private readonly recoveryService?: OllamaRecoveryService,
  ) {}

  private isConnectionError(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || error?.cause?.code || '');
    const msg = String(error.message || '');
    if (
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      /ECONNREFUSED|ECONNRESET|socket hang up|connect/i.test(msg)
    ) {
      return true;
    }
    if (Array.isArray(error.errors)) {
      return error.errors.some((sub: any) => this.isConnectionError(sub));
    }
    return false;
  }

  private describeError(error: any): string {
    if (!error) return 'error desconocido';
    if (error.message && String(error.message).trim().length > 0) {
      return String(error.message);
    }
    if (error.code) return String(error.code);
    if (Array.isArray(error.errors) && error.errors.length > 0) {
      return error.errors
        .map((e: any) => e?.code || e?.message || String(e))
        .filter(Boolean)
        .join(', ');
    }
    return String(error);
  }

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
   * Si Ollama está apagado (ECONNREFUSED), dispara recuperación automática una vez y reintenta bge-m3.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const modelsToTry = [
      this.EMBEDDING_MODEL,
      ...this.getEmbeddingModelFallbacks().filter(
        (m) => m !== this.EMBEDDING_MODEL,
      ),
    ];
    let lastError: any;
    let recoveryAttempted = false;

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      try {
        const response = await axios.post(
          this.OLLAMA_URL,
          {
            model,
            prompt: text,
          },
          { timeout: 20000 },
        );

        if (response.data?.embedding) {
          return response.data.embedding;
        }
        throw new Error('Respuesta inválida de Ollama embeddings');
      } catch (error: any) {
        lastError = error;
        const errDesc = this.describeError(error);

        if (
          !recoveryAttempted &&
          this.recoveryService &&
          this.isConnectionError(error)
        ) {
          recoveryAttempted = true;
          this.logger.warn(
            `[EmbeddingsService] Conexión rechazada con Ollama (${errDesc}) — intentando recuperación automática para ${model}...`,
          );
          try {
            await this.recoveryService.recover();
            // Reintentar el mismo modelo principal inmediatamente tras levantar Ollama
            i--;
            continue;
          } catch (recoveryErr: any) {
            this.logger.error(
              `[EmbeddingsService] Falló la recuperación automática de Ollama: ${this.describeError(recoveryErr)}`,
            );
            lastError = recoveryErr;
            break;
          }
        }

        this.logger.warn(
          `[EmbeddingsService] Falló modelo ${model} (${errDesc}). Probando alternativo...`,
        );
      }
    }

    const finalMsg = this.describeError(lastError);
    this.logger.error(
      `[EmbeddingsService] Error con modelo ${this.EMBEDDING_MODEL}: ${finalMsg}`,
    );
    throw new Error(`Fallo al generar embedding: ${finalMsg}`);
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
