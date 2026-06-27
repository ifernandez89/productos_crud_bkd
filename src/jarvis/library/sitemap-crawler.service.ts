import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { BusinessSource } from './business-source.service';

@Injectable()
export class SitemapCrawlerService {
  private readonly logger = new Logger(SitemapCrawlerService.name);

  /**
   * Fetches the sitemap for a given BusinessSource and returns a prioritized list of URLs.
   */
  async crawlSource(source: BusinessSource, limit: number = 20): Promise<string[]> {
    if (!source.sitemap) {
      this.logger.warn(`Source ${source.name} does not have a sitemap configured.`);
      return [];
    }

    try {
      this.logger.log(`Fetching sitemap for ${source.name} at ${source.sitemap}`);
      const response = await axios.get(source.sitemap, { timeout: 10000 });
      const xml = response.data;

      // Extract URLs from <loc> tags
      const urls = this.extractUrlsFromXml(xml);
      
      // Filter and prioritize based on strategy
      const prioritized = this.prioritizeUrls(urls, source.scrapingStrategy);

      this.logger.log(`Found ${urls.length} URLs for ${source.name}, prioritized top ${limit}.`);
      return prioritized.slice(0, limit);
    } catch (error: any) {
      this.logger.error(`Failed to fetch sitemap for ${source.name}: ${error.message}`);
      // Fallback: try common sitemap locations if the current one failed, but for now just return empty
      return [];
    }
  }

  private extractUrlsFromXml(xml: string): string[] {
    const urls: string[] = [];
    const regex = /<loc>(.*?)<\/loc>/gi;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      urls.push(match[1].trim());
    }
    return urls;
  }

  private prioritizeUrls(urls: string[], strategy: string): string[] {
    // Basic deduplication
    const uniqueUrls = Array.from(new Set(urls));

    return uniqueUrls.sort((a, b) => {
      return this.getScore(b, strategy) - this.getScore(a, strategy);
    });
  }

  private getScore(url: string, strategy: string): number {
    const lowerUrl = url.toLowerCase();
    let score = 0;

    // Penalize common useless pages
    if (lowerUrl.includes('tag') || lowerUrl.includes('category') || lowerUrl.includes('author') || lowerUrl.includes('page/')) {
      score -= 50;
    }
    if (lowerUrl.includes('terminos') || lowerUrl.includes('privacidad')) {
      score -= 100;
    }

    // Reward based on strategy
    switch (strategy) {
      case 'catalog':
        if (lowerUrl.includes('producto') || lowerUrl.includes('item') || lowerUrl.includes('p-')) score += 100;
        if (lowerUrl.includes('oferta') || lowerUrl.includes('promocion')) score += 80;
        break;
      case 'healthcare':
        if (lowerUrl.includes('especialidad') || lowerUrl.includes('servicio') || lowerUrl.includes('profesional') || lowerUrl.includes('medico')) score += 100;
        if (lowerUrl.includes('guardia') || lowerUrl.includes('emergencia') || lowerUrl.includes('turno')) score += 120;
        break;
      case 'education':
        if (lowerUrl.includes('carrera') || lowerUrl.includes('curso') || lowerUrl.includes('facultad')) score += 100;
        if (lowerUrl.includes('inscripcion') || lowerUrl.includes('academico')) score += 80;
        break;
      case 'corporate':
      default:
        if (lowerUrl.includes('nosotros') || lowerUrl.includes('about') || lowerUrl.includes('contacto')) score += 50;
        if (lowerUrl.includes('servicio') || lowerUrl.includes('solucion')) score += 80;
        break;
    }

    // Prefer shorter URLs (often hub pages or main products)
    score -= (url.length * 0.1);

    return score;
  }
}
