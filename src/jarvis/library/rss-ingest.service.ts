import { Injectable, Logger } from '@nestjs/common';
import * as Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { DocumentIngestService } from './document-ingest.service';

@Injectable()
export class RssIngestService {
  private readonly logger = new Logger(RssIngestService.name);
  private parser: Parser;

  constructor(private readonly documentIngest: DocumentIngestService) {
    this.parser = new Parser({
      customFields: {
        item: ['description', 'content:encoded', 'pubDate'],
      },
    });
  }

  /**
   * Lee un feed RSS, extrae los artículos nuevos y los manda al pipeline de ingesta.
   */
  async processFeed(url: string, category: string = 'rss'): Promise<number> {
    this.logger.log(`📥 Procesando feed RSS: ${url}`);
    try {
      const feed = await this.parser.parseURL(url);
      let ingestedCount = 0;

      for (const item of feed.items) {
        // En un caso real, verificaríamos si item.link ya fue ingestado en la BD.
        // Aquí vamos a procesarlos.
        
        const title = item.title || 'Sin Título';
        let rawContent = item['content:encoded'] || item.content || item.description || '';
        
        // Limpiamos el HTML para quedarnos solo con el texto plano
        const $ = cheerio.load(rawContent);
        const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
        
        if (cleanText.length > 50) {
          await this.documentIngest.ingestText(title, cleanText, category, item.link || url);
          ingestedCount++;
        }
      }

      this.logger.log(`✅ Se ingestaron ${ingestedCount} artículos del feed ${feed.title}`);
      return ingestedCount;
    } catch (error) {
      this.logger.error(`❌ Error procesando feed ${url}: ${error.message}`);
      return 0;
    }
  }
}
