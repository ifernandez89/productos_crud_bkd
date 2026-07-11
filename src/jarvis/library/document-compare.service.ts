import { Injectable, Logger } from '@nestjs/common';
import { DocumentSummaryService } from './document-summary.service';
import { OllamaProvider } from '../llm/ollama.provider';

export interface DocumentCompareResult {
  titleA: string;
  titleB: string;
  summaryA: string;
  summaryB: string;
  comparison: string;
}

/**
 * Genera un análisis comparativo entre dos documentos:
 * - Qué tienen en común
 * - En qué difieren
 * - Cómo se complementan
 */
@Injectable()
export class DocumentCompareService {
  private readonly logger = new Logger(DocumentCompareService.name);

  constructor(
    private readonly documentSummaryService: DocumentSummaryService,
    private readonly ollamaProvider: OllamaProvider,
  ) {}

  async compare(titleA: string, titleB: string): Promise<DocumentCompareResult> {
    this.logger.log(`[compare] "${titleA}" ↔ "${titleB}"`);

    // Obtener resúmenes de ambos documentos en paralelo
    const [resultA, resultB] = await Promise.all([
      this.documentSummaryService.generateDocumentSummary(titleA, 8),
      this.documentSummaryService.generateDocumentSummary(titleB, 8),
    ]);

    const contentA = `Título: ${resultA.title}\nCategoría: ${resultA.category ?? 'N/A'}\n\nResumen:\n${resultA.summary}\n\nPuntos clave:\n${resultA.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
    const contentB = `Título: ${resultB.title}\nCategoría: ${resultB.category ?? 'N/A'}\n\nResumen:\n${resultB.summary}\n\nPuntos clave:\n${resultB.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;

    const comparison = await this.generateComparison(
      resultA.title, contentA,
      resultB.title, contentB,
    );

    return {
      titleA: resultA.title,
      titleB: resultB.title,
      summaryA: resultA.summary,
      summaryB: resultB.summary,
      comparison,
    };
  }

  private async generateComparison(
    titleA: string, contentA: string,
    titleB: string, contentB: string,
  ): Promise<string> {
    const systemPrompt = `Sos un analista experto en comparación de textos y documentos.
Tu tarea es analizar dos documentos y generar un análisis comparativo estructurado.

FORMATO DE RESPUESTA (ESTRICTO):

SIMILITUDES:
[Lista de conceptos, ideas o temas que ambos documentos comparten]

DIFERENCIAS:
[En qué se diferencian en enfoque, contenido o perspectiva]

COMPLEMENTARIEDAD:
[Cómo se complementan — qué aporta cada uno que el otro no tiene]

CONCLUSION:
[Una síntesis de 2-3 oraciones sobre la relación entre ambos textos]

Respondé en español argentino. Sé específico, citá contenido concreto de cada documento.`;

    const userPrompt = `DOCUMENTO A: "${titleA}"\n${contentA}\n\n---\n\nDOCUMENTO B: "${titleB}"\n${contentB}`;

    try {
      const response = await this.ollamaProvider.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        maxTokens: 1200,
      });
      return response.content;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[compare:llm] error: ${msg}`);
      return `⚠️ No se pudo generar el análisis comparativo. El modelo no estaba disponible.\n\n**Documento A:** ${titleA}\n**Documento B:** ${titleB}`;
    }
  }
}
