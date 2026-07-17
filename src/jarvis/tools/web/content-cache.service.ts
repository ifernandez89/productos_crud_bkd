import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SourceRegistry, SourceDefinition } from './source-registry';
import { WebHelper } from './web-helper';
import { createHash } from 'crypto';

export interface CacheResult {
  url: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  fromCache: boolean;
  scrapedAt: Date;
  expiresAt: Date;
}

/**
 * ContentCacheService — Caché inteligente con TTL por categoría.
 *
 * Flujo:
 * 1. Usuario pregunta algo
 * 2. Se clasifica la categoría (deportes, clima, noticias...)
 * 3. Se consulta caché: ¿hay contenido fresco?
 *    - SI → servir desde BD (milisegundos)
 *    - NO → scrapear → guardar → servir
 * 4. Registrar analytics (cache hit/miss, fuente usada, latencia)
 */
@Injectable()
export class ContentCacheService {
  private readonly logger = new Logger(ContentCacheService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene contenido relevante para una pregunta.
   * Primero busca en caché válido, si no existe o expiró, scrapea.
   *
   * @param query     La pregunta del usuario
   * @param category  Categoría detectada (deportes, clima, noticias...)
   * @param limit     Máximo de fuentes a consultar
   */
  async fetchRelevantContent(
    query: string,
    category: string,
    limit = 2, // reducido de 3 a 2: menos fuentes = más rápido
  ): Promise<CacheResult[]> {
    const startTime = Date.now();
    const sources = SourceRegistry.getByCategory(category).slice(0, limit);

    if (!sources.length) {
      this.logger.warn(`[cache] no hay fuentes para categoría "${category}"`);
      return [];
    }

    this.logger.log(
      `[cache] buscando en ${sources.length} fuentes de "${category}" para: "${query.slice(0, 60)}"`,
    );

    const results = await Promise.allSettled(
      sources.map((src) => this.fetchFromSourceWithCache(src, query)),
    );

    const successful = results
      .filter((r) => r.status === 'fulfilled' && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<CacheResult>).value);

    const cacheHits = successful.filter((r) => r.fromCache).length;
    const elapsed = Date.now() - startTime;

    this.logger.log(
      `[cache] ${successful.length} resultados (${cacheHits} desde caché) en ${elapsed}ms`,
    );

    // Registrar analytics
    await this.trackQuery(query, category, successful, elapsed);

    return successful;
  }

  /**
   * Obtiene contenido de una fuente específica, usando caché si está fresco.
   */
  private async fetchFromSourceWithCache(
    source: SourceDefinition,
    query: string,
  ): Promise<CacheResult | null> {
    try {
      // 1. Buscar URL de búsqueda o usar URL base
      const searchUrl = SourceRegistry.buildSearchUrl(source, query);
      const targetUrl = searchUrl || source.urlBase;

      // 2. Buscar en caché válido
      const cached = await this.findValidCache(targetUrl);

      if (cached) {
        // Cache HIT → incrementar contador y servir
        await this.prisma.scrapedPage.update({
          where: { id: cached.pageId },
          data: {
            cacheHits: { increment: 1 },
            lastAccessedAt: new Date(),
          },
        });

        this.logger.log(
          `[cache:HIT] ${source.name} (${cached.ageMinutes}min old, expires in ${cached.expiresInMinutes}min)`,
        );

        return {
          url: targetUrl,
          title: cached.title,
          content: cached.content,
          metadata: cached.metadata,
          fromCache: true,
          scrapedAt: cached.scrapedAt,
          expiresAt: cached.expiresAt,
        };
      }

      // 3. Cache MISS → scrapear con timeout individual de 8s por fuente
      this.logger.log(`[cache:MISS] scrapeando ${source.name}`);

      const scrapeWithTimeout = Promise.race([
        WebHelper.scrapeUrlWithSelectors(targetUrl, query, source).catch(() =>
          WebHelper.scrapeUrl(targetUrl, query),
        ),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
      ]);

      const scraped = await scrapeWithTimeout;

      if (!scraped || scraped.length < 100) {
        this.logger.warn(`[cache] scraping falló o timeout en ${source.name}`);
        return null;
      }

      // 4. Guardar en caché
      const expiresAt = new Date(Date.now() + source.ttlHours * 60 * 60 * 1000);
      const contentHash = this.hashContent(scraped);

      // Buscar o crear fuente en BD
      const dbSource = await this.prisma.source.upsert({
        where: { urlBase: source.urlBase },
        create: {
          name: source.name,
          urlBase: source.urlBase,
          category: source.category,
          priority: source.priority,
          ttlHours: source.ttlHours,
          lastScraped: new Date(),
        },
        update: {
          lastScraped: new Date(),
        },
      });

      // Crear o actualizar página
      const page = await this.prisma.scrapedPage.upsert({
        where: { url: targetUrl },
        create: {
          sourceId: dbSource.id,
          url: targetUrl,
          contentHash,
          expiresAt,
          status: 'valid',
        },
        update: {
          contentHash,
          scrapedAt: new Date(),
          expiresAt,
          status: 'valid',
        },
      });

      // Crear o actualizar contenido
      await this.prisma.scrapedContent.upsert({
        where: { pageId: page.id },
        create: {
          pageId: page.id,
          textExtracted: scraped,
          metadata: null,
        },
        update: {
          textExtracted: scraped,
        },
      });

      this.logger.log(
        `[cache] guardado ${source.name} (expira en ${source.ttlHours}h)`,
      );

      return {
        url: targetUrl,
        content: scraped,
        fromCache: false,
        scrapedAt: new Date(),
        expiresAt,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[cache] error en ${source.name}: ${msg}`);
      return null;
    }
  }

  /**
   * Busca contenido válido en caché (no expirado).
   */
  private async findValidCache(url: string): Promise<{
    pageId: number;
    title?: string;
    content: string;
    metadata?: Record<string, unknown>;
    scrapedAt: Date;
    expiresAt: Date;
    ageMinutes: number;
    expiresInMinutes: number;
  } | null> {
    const page = await this.prisma.scrapedPage.findUnique({
      where: { url },
      include: { content: true },
    });

    if (!page || !page.content) return null;

    const now = new Date();
    const isExpired = now >= page.expiresAt;

    if (isExpired) {
      // Marcar como expirado
      await this.prisma.scrapedPage.update({
        where: { id: page.id },
        data: { status: 'expired' },
      });
      return null;
    }

    const ageMinutes = Math.floor(
      (now.getTime() - page.scrapedAt.getTime()) / 60000,
    );
    const expiresInMinutes = Math.floor(
      (page.expiresAt.getTime() - now.getTime()) / 60000,
    );

    return {
      pageId: page.id,
      title: page.title ?? undefined,
      content: page.content.textExtracted,
      metadata: page.content.metadata
        ? (JSON.parse(page.content.metadata as string) as Record<
            string,
            unknown
          >)
        : undefined,
      scrapedAt: page.scrapedAt,
      expiresAt: page.expiresAt,
      ageMinutes,
      expiresInMinutes,
    };
  }

  /**
   * Registra analytics de la consulta.
   */
  private async trackQuery(
    question: string,
    category: string,
    results: CacheResult[],
    responseTimeMs: number,
  ): Promise<void> {
    try {
      const sourcesUsed = results.map((r) => r.url);
      const cacheHit = results.some((r) => r.fromCache);

      await this.prisma.query.create({
        data: {
          question,
          category,
          sourcesUsed: JSON.stringify(sourcesUsed),
          cacheHit,
          responseTimeMs,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[cache] error tracking query: ${msg}`);
    }
  }

  /**
   * Limpia caché expirado (se puede ejecutar periódicamente con cron).
   */
  async cleanExpiredCache(): Promise<number> {
    const result = await this.prisma.scrapedPage.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        status: 'expired',
      },
    });

    this.logger.log(
      `[cache:cleanup] ${result.count} páginas expiradas eliminadas`,
    );
    return result.count;
  }

  /**
   * Obtiene estadísticas de caché.
   */
  async getCacheStats() {
    const [
      total,
      valid,
      expired,
      topSources,
      topCategories,
      totalQueries,
      cacheHits,
    ] = await Promise.all([
      this.prisma.scrapedPage.count(),
      this.prisma.scrapedPage.count({ where: { status: 'valid' } }),
      this.prisma.scrapedPage.count({ where: { status: 'expired' } }),
      this.prisma.source.findMany({
        orderBy: { lastScraped: 'desc' },
        take: 10,
        select: { name: true, category: true, lastScraped: true },
      }),
      this.prisma.query.groupBy({
        by: ['category'],
        _count: { category: true },
        orderBy: { _count: { category: 'desc' } },
        take: 10,
      }),
      this.prisma.query.count(),
      this.prisma.query.count({ where: { cacheHit: true } }),
    ]);

    const cacheHitRate = totalQueries > 0 ? cacheHits / totalQueries : 0;

    return {
      totalPages: total,
      validPages: valid,
      expiredPages: expired,
      topSources,
      topCategories: topCategories.map((c) => ({
        category: c.category,
        count: c._count.category,
      })),
      cacheHitRate,
      totalQueries,
      cacheHits,
    };
  }

  /**
   * Genera hash SHA-256 del contenido para detectar cambios.
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
