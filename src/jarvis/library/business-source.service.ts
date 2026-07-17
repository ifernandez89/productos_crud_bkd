/**
 * BusinessSourceService — Gestor de fuentes comerciales con keywords semánticas
 *
 * Esta clase carga las fuentes desde el archivo JSON de configuración y las
 * integra con el SourceRegistry para búsquedas semánticas sin scraping.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface BusinessSourceLocation {
  city: string;
  province: string;
  country: string;
}

export interface BusinessSourceEnrichment {
  description: boolean;
  phones: boolean;
  socials: boolean;
  emails: boolean;
}

export interface BusinessSource {
  name: string;
  domain: string;
  category: string;
  urlBase: string;
  sourceType: string;
  trustScore: number;
  scrapingStrategy: string;
  cms: string | null;
  sitemap: string | null;
  location: BusinessSourceLocation;
  enrichment: BusinessSourceEnrichment;
  tags: string[];
  priority: number;
  ttlHours: number;
  scrapeEnabled: boolean;
  embeddingEnabled: boolean;
  embeddingStatus: string;
  lastScraped?: string | null;
  lastEmbedding?: string | null;
  successRate: number;
  avgResponseTimeMs: number;
  cacheHits: number;
}

export interface BusinessSourcesConfig {
  version: string;
  generatedAt: string;
  description: string;
  sources: BusinessSource[];
}

@Injectable()
export class BusinessSourceService {
  private readonly logger = new Logger(BusinessSourceService.name);
  private sources: Map<string, BusinessSource> = new Map();
  private categories: Map<string, BusinessSource[]> = new Map();

  constructor() {
    this.loadSources();
  }

  /**
   * Carga las fuentes desde el archivo JSON de configuración
   */
  private loadSources(): void {
    const configPath = path.join(__dirname, 'business-sources.json');

    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config: BusinessSourcesConfig = JSON.parse(configContent);

      this.logger.log(
        `Cargando ${config.sources.length} fuentes comerciales...`,
      );

      // Indexar por URL y por categoría
      for (const source of config.sources) {
        this.sources.set(source.urlBase, source);

        if (!this.categories.has(source.category)) {
          this.categories.set(source.category, []);
        }
        this.categories.get(source.category)?.push(source);
      }

      this.logger.log(
        `✅ Cargadas ${this.sources.size} fuentes en ${this.categories.size} categorías`,
      );
    } catch (error) {
      this.logger.error(`❌ Error al cargar fuentes: ${error.message}`);
      throw new Error(
        `No se pudieron cargar las fuentes comerciales: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene todas las fuentes
   */
  getAll(): BusinessSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Obtiene una fuente por su URL base
   */
  getByUrl(urlBase: string): BusinessSource | undefined {
    return this.sources.get(urlBase);
  }

  /**
   * Obtiene todas las fuentes de una categoría
   */
  getByCategory(category: string): BusinessSource[] {
    return this.categories.get(category) || [];
  }

  /**
   * Busca fuentes por tags (búsqueda semántica)
   * Retorna las fuentes cuyas tags coincidan con la consulta
   */
  searchByKeywords(query: string): BusinessSource[] {
    const queryLower = query.toLowerCase();
    const queryTags = queryLower.split(' ').filter((k) => k.length > 2);

    return Array.from(this.sources.values()).filter((source) => {
      // Buscar si alguna tag de la fuente coincide con alguna de la consulta
      return source.tags.some((sourceTag) =>
        queryTags.some(
          (queryTag) =>
            sourceTag.toLowerCase().includes(queryTag) ||
            queryTag.includes(sourceTag.toLowerCase()),
        ),
      );
    });
  }

  /**
   * Obtiene todas las categorías disponibles
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Obtiene el resumen de una categoría
   */
  getCategorySummary(category: string): {
    category: string;
    count: number;
    tags: string[];
    topSources: { name: string; priority: number }[];
  } {
    const sources = this.getByCategory(category);
    const allTags = new Set<string>();

    sources.forEach((source) => {
      source.tags.forEach((tag) => allTags.add(tag));
    });

    return {
      category,
      count: sources.length,
      tags: Array.from(allTags).slice(0, 10), // Top 10 tags
      topSources: sources
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 5)
        .map((s) => ({ name: s.name, priority: s.priority })),
    };
  }

  /**
   * Verifica si una fuente tiene scraping habilitado
   */
  isScrapeEnabled(urlBase: string): boolean {
    return this.sources.get(urlBase)?.scrapeEnabled ?? false;
  }

  /**
   * Verifica si una fuente tiene embeddings habilitados
   */
  isEmbeddingEnabled(urlBase: string): boolean {
    return this.sources.get(urlBase)?.embeddingEnabled ?? false;
  }

  /**
   * Obtiene el TTL de una fuente en horas
   */
  getTTLHours(urlBase: string): number {
    return this.sources.get(urlBase)?.ttlHours ?? 24;
  }

  /**
   * Obtiene la prioridad de una fuente (1-10)
   */
  getPriority(urlBase: string): number {
    return this.sources.get(urlBase)?.priority ?? 5;
  }
}
