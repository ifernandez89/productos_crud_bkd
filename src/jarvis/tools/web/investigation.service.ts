import { Injectable, Logger } from '@nestjs/common';
import { BrowserToolService } from '../browser/browser-tool.service';
import { DocumentIngestService } from '../../library/document-ingest.service';
import { extractInvestigationCommand } from './investigation.utils';

export interface InvestigationResult {
  title: string;
  topics: string[];
  apisDetected: Array<{ url: string; method: string; status: number }>;
  embeddingsCreated: number;
  documentId?: number;
  sourceUrl: string;
}

@Injectable()
export class InvestigationService {
  private readonly logger = new Logger(InvestigationService.name);

  constructor(
    private readonly browserTool: BrowserToolService,
    private readonly ingestService: DocumentIngestService,
  ) {}

  extractUrl(message: string): string | null {
    return extractInvestigationCommand(message);
  }

  async investigateUrl(
    url: string,
    sessionId?: string,
  ): Promise<InvestigationResult> {
    this.logger.log(`[investigation] start ${url}`);

    const browserResult = await this.browserTool.fetch(url);
    if ('error' in browserResult) {
      throw new Error(`No pude abrir la URL: ${browserResult.error}`);
    }

    const content =
      browserResult.text || browserResult.excerpt || browserResult.title;
    const title = browserResult.title || new URL(url).hostname;
    const topics = await this.extractTopics(
      title,
      content,
      browserResult.apis || [],
    );

    const ingested = await this.ingestService.ingestText(
      title,
      content,
      'web-intelligence',
      url,
    );

    return {
      title,
      topics,
      apisDetected: (browserResult.apis || []).slice(0, 10).map((api) => ({
        url: api.url,
        method: api.method,
        status: api.status,
      })),
      embeddingsCreated: ingested.chunks,
      documentId: ingested.documentId,
      sourceUrl: url,
    };
  }

  private async extractTopics(
    title: string,
    content: string,
    apis: Array<{ url: string; method: string; status: number }>,
  ): Promise<string[]> {
    const prompt = `Extrae hasta 8 temas o conceptos clave en español a partir de este contenido web. Responde SOLO con una lista JSON válida de strings.\n\nTitulo: ${title}\n\nContenido: ${content.slice(0, 5000)}\n\nAPIs detectadas: ${JSON.stringify(apis.slice(0, 5))}`;

    try {
      const { OllamaProvider } = await import('../../llm/ollama.provider');
      const provider = new OllamaProvider();
      const response = await provider.generate({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        maxTokens: 250,
      });
      const parsed = JSON.parse(
        response.content.replace(/```json|```/g, '').trim(),
      );
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 8);
      }
    } catch (error) {
      this.logger.warn(
        `[investigation] fallback topics: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return [title].filter(Boolean);
  }
}
