import { Logger } from '@nestjs/common';
import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';
import { SourceRegistry, SourceDefinition } from './source-registry';

/**
 * WebHelper — helper estático genérico con estrategia de fuentes priorizadas.
 * 
 * ESTRATEGIA DE BÚSQUEDA:
 * 1. Si detecta una categoría conocida (deportes, clima, noticias...)
 *    → busca en fuentes confiables priorizadas primero
 * 2. Si no encuentra o es categoría genérica → DuckDuckGo + scraping
 * 
 * OPTIMIZACIÓN DE VELOCIDAD:
 * - Timeout global: 60s máximo total
 * - Scraping paralelo de top 3 fuentes
 * - Fallback a DuckDuckGo si fuentes fallan
 * 
 * Uso:
 *   const text = await WebHelper.search("goles argentina austria", "deportes");
 *   const text = await WebHelper.search("clima hoy paraná", "clima");
 *   const text = await WebHelper.search("últimas noticias", "noticias");
 */
export class WebHelper {
  private static readonly logger = new Logger('WebHelper');

  private static readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  private static readonly SEARCH_TIMEOUT  = 5_000;  // DuckDuckGo
  private static readonly SCRAPE_TIMEOUT  = 6_000;  // por URL individual
  private static readonly MAX_TEXT_CHARS  = 4_000;  // aumentado de 3000 para noticias
  private static readonly MAX_URLS        = 3;

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Busca contenido relevante con estrategia priorizada por categoría.
   * 
   * FLUJO:
   * 1. Si hay categoría → buscar en fuentes confiables primero
   * 2. Si no hay resultados → fallback a DuckDuckGo
   * 3. Scrapear las mejores URLs en paralelo
   * 
   * @param query     Pregunta o término de búsqueda
   * @param category  Categoría opcional (deportes, clima, noticias, tecnologia...)
   * @param scrape    Si true (default), scrapea contenido completo
   */
  static async search(
    query: string,
    category?: string,
    scrape = true,
  ): Promise<string | null> {
    const startTime = Date.now();

    // 1. Si hay categoría, buscar en fuentes priorizadas PRIMERO
    if (category) {
      const sources = SourceRegistry.getByCategory(category).slice(0, 3);

      if (sources.length > 0) {
        WebHelper.logger.log(
          `[WebHelper] buscando en ${sources.length} fuentes de "${category}" para: "${query.slice(0, 60)}"`,
        );

        const sourceResults = await Promise.allSettled(
          sources.map((src) => {
            const searchUrl = SourceRegistry.buildSearchUrl(src, query);
            const targetUrl = searchUrl || src.urlBase;
            return WebHelper.scrapeUrlWithSelectors(targetUrl, query, src);
          }),
        );

        // Tomar el primer resultado útil de fuentes confiables
        for (const r of sourceResults) {
          if (r.status === 'fulfilled' && r.value && r.value.length > 150) {
            const elapsed = Date.now() - startTime;
            WebHelper.logger.log(
              `[WebHelper] resultado de fuente confiable en ${elapsed}ms (${r.value.length} chars)`,
            );
            return r.value;
          }
        }

        WebHelper.logger.warn(
          `[WebHelper] fuentes de "${category}" no dieron resultados útiles → fallback a DuckDuckGo`,
        );
      }
    }

    // 2. Fallback: búsqueda en DuckDuckGo (flujo original)
    const searchResults = await WebHelper.ddgSearch(query);

    if (!searchResults.length) {
      WebHelper.logger.warn(`[WebHelper] sin resultados DuckDuckGo para: "${query.slice(0, 60)}"`);
      return null;
    }

    // Armar el bloque de snippets de búsqueda
    const snippetBlock = searchResults
      .map((r, i) => `**${i + 1}. ${r.title}**\n🔗 ${r.url}\n${r.snippet}`)
      .join('\n\n');

    if (!scrape) return snippetBlock;

    // 3. Scrapear las primeras URLs en paralelo
    const urls = searchResults.map((r) => r.url).slice(0, WebHelper.MAX_URLS);
    WebHelper.logger.log(`[WebHelper] scrapeando ${urls.length} URLs de DuckDuckGo`);

    const scrapeResults = await Promise.allSettled(
      urls.map((u) => WebHelper.scrapeUrl(u, query)),
    );

    // Recolectar TODOS los resultados útiles (no solo el primero)
    const usefulScraped: string[] = [];
    for (const r of scrapeResults) {
      if (r.status === 'fulfilled' && r.value && r.value.length > 150) {
        usefulScraped.push(r.value);
        if (usefulScraped.length >= 3) break; // máximo 3 artículos
      }
    }

    const elapsed = Date.now() - startTime;
    WebHelper.logger.log(`[WebHelper] resultado final en ${elapsed}ms (${usefulScraped.length} artículos)`);

    if (usefulScraped.length > 0) {
      return `${snippetBlock}\n\n---\n**Contenido extraído:**\n${usefulScraped.join('\n\n---\n')}`;
    }

    // Si el scraping no dio nada útil, devolver solo los snippets
    return snippetBlock;
  }

  /**
   * Solo busca en DuckDuckGo, sin scrapear.
   * Más rápido (~1-2s), útil para preguntas donde los snippets son suficientes.
   */
  static async quickSearch(query: string, category?: string): Promise<string | null> {
    return WebHelper.search(query, category, false);
  }

  /**
   * Scrapea una URL espec\u00edfica con selectores optimizados si se proporciona la fuente.
   * P\u00fablico para que ContentCacheService pueda usarlo con los selectores correctos.
   */
  static async scrapeUrlWithSelectors(
    url: string,
    contextQuery: string,
    source?: SourceDefinition,
  ): Promise<string | null> {
    try {
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': WebHelper.USER_AGENT,
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: WebHelper.SCRAPE_TIMEOUT,
        validateStatus: (s) => s < 400,
      });

      const $ = cheerioLoad(resp.data as string);

      // Remover ruido
      $('script, style, nav, footer, header, aside, iframe, form, ' +
        '.ads, .advertisement, [aria-hidden="true"], .cookie, .popup, ' +
        '.social-share, .related-articles, .sidebar').remove();

      let text = '';

      // Si tenemos selectores específicos de la fuente, usarlos primero
      if (source?.selectors?.content) {
        for (const sel of source.selectors.content) {
          const candidate = $(sel).first().text().replace(/\s+/g, ' ').trim();
          if (candidate.length > text.length) {
            text = candidate;
            if (candidate.length > 500) break; // Ya tenemos suficiente
          }
        }
      }

      // Fallback a selectores genéricos
      if (text.length < 200) {
        const mainSelectors = [
          'article', 'main', '[role="main"]', '.article-body',
          '.article-content', '.post-content', '.entry-content',
          '.content', '#content', '.nota-body', '.cuerpo',
        ];

        for (const sel of mainSelectors) {
          const candidate = $(sel).first().text().replace(/\s+/g, ' ').trim();
          if (candidate.length > text.length) {
            text = candidate;
            if (sel !== '.content' && sel !== '#content') break;
          }
        }
      }

      // Fallback final al body
      if (text.length < 200) {
        text = $('body').text().replace(/\s+/g, ' ').trim();
      }

      if (text.length < 100) return null;

      // Extraer texto relevante usando keywords del query
      if (contextQuery) {
        text = WebHelper.extractRelevantText(text, contextQuery);
      }

      const truncated = text.slice(0, WebHelper.MAX_TEXT_CHARS);
      const hostname  = (() => { try { return new URL(url).hostname; } catch { return url; } })();

      WebHelper.logger.log(`[WebHelper] scraped ${truncated.length} chars de ${hostname}`);
      return `${truncated}\n\n_(Fuente: ${hostname})_`;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404') && !msg.includes('403') && !msg.includes('ENOTFOUND')) {
        WebHelper.logger.warn(`[WebHelper] scrape ${url}: ${msg}`);
      }
      return null;
    }
  }

  /**
   * Scrapea una URL específica y extrae el contenido relevante.
   * Útil cuando ya sabés la URL que querés leer.
   */
  static async scrapeUrl(url: string, contextQuery?: string): Promise<string | null> {
    try {
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': WebHelper.USER_AGENT,
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: WebHelper.SCRAPE_TIMEOUT,
        validateStatus: (s) => s < 400,
      });

      const $ = cheerioLoad(resp.data as string);

      // Remover ruido
      $('script, style, nav, footer, header, aside, iframe, form, ' +
        '.ads, .advertisement, [aria-hidden="true"], .cookie, .popup, ' +
        '.social-share, .related-articles, .sidebar').remove();

      // Intentar extraer texto del bloque principal del artículo
      const mainSelectors = [
        'article', 'main', '[role="main"]', '.article-body',
        '.article-content', '.post-content', '.entry-content',
        '.content', '#content', '.nota-body', '.cuerpo',
      ];

      let text = '';
      for (const sel of mainSelectors) {
        const candidate = $(sel).first().text().replace(/\s+/g, ' ').trim();
        if (candidate.length > text.length) {
          text = candidate;
          if (sel !== '.content' && sel !== '#content') break;
        }
      }

      // Fallback al body completo
      if (text.length < 200) {
        text = $('body').text().replace(/\s+/g, ' ').trim();
      }

      if (text.length < 100) return null;

      // Si hay un query de contexto, priorizar párrafos relevantes
      if (contextQuery) {
        text = WebHelper.extractRelevantText(text, contextQuery);
      }

      const truncated = text.slice(0, WebHelper.MAX_TEXT_CHARS);
      const hostname  = (() => { try { return new URL(url).hostname; } catch { return url; } })();

      WebHelper.logger.log(`[WebHelper] scraped ${truncated.length} chars de ${hostname}`);
      return `${truncated}\n\n_(Fuente: ${hostname})_`;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404') && !msg.includes('403') && !msg.includes('ENOTFOUND')) {
        WebHelper.logger.warn(`[WebHelper] scrape ${url}: ${msg}`);
      }
      return null;
    }
  }

  // ── DuckDuckGo ───────────────────────────────────────────────────────────────

  private static async ddgSearch(
    query: string,
  ): Promise<Array<{ title: string; url: string; snippet: string }>> {
    try {
      const encoded = encodeURIComponent(query);
      const resp = await axios.get(
        `https://html.duckduckgo.com/html/?q=${encoded}&kl=ar-es`,
        {
          headers: {
            'User-Agent': WebHelper.USER_AGENT,
            'Accept-Language': 'es-AR,es;q=0.9',
          },
          timeout: WebHelper.SEARCH_TIMEOUT,
          validateStatus: (s) => s < 400,
        },
      );

      const $       = cheerioLoad(resp.data as string);
      const results: Array<{ title: string; url: string; snippet: string }> = [];

      $('.result__body').each((_, el) => {
        if (results.length >= 5) return;
        const title   = $(el).find('.result__title a').text().trim();
        // ✅ FIX: leer el href real del enlace, no el display text de .result__url
        const rawHref = $(el).find('.result__title a').attr('href') ?? '';
        const snippet = $(el).find('.result__snippet').text().trim();
        if (!title || !rawHref) return;

        // DuckDuckGo usa redirects internos: //duckduckgo.com/l/?uddg=<encoded-url>
        let url: string;
        try {
          const parsed = new URL(rawHref.startsWith('//') ? `https:${rawHref}` : rawHref);
          const uddg   = parsed.searchParams.get('uddg');
          url = uddg ? decodeURIComponent(uddg) : rawHref;
        } catch {
          url = rawHref.startsWith('http') ? rawHref : `https://${rawHref}`;
        }

        results.push({ title, url, snippet });
      });

      WebHelper.logger.log(`[WebHelper] DuckDuckGo: ${results.length} resultados`);
      return results;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      WebHelper.logger.warn(`[WebHelper] DuckDuckGo error: ${msg}`);
      return [];
    }
  }

  // ── Extracción de texto relevante ────────────────────────────────────────────

  /**
   * Dado un texto largo, extrae los fragmentos más relevantes
   * para el query dado (por keywords).
   */
  private static extractRelevantText(text: string, query: string): string {
    const keywords = query
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Dividir en oraciones
    const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 20);

    // Puntuar cada oración por keywords
    const scored = sentences.map((s) => {
      const sn = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const score = keywords.reduce((acc, kw) => acc + (sn.includes(kw) ? 1 : 0), 0);
      return { s, score };
    });

    // Top oraciones relevantes primero, luego el resto
    const sorted = scored.sort((a, b) => b.score - a.score);
    const topRelevant = sorted.filter((x) => x.score > 0).slice(0, 15).map((x) => x.s);
    const rest        = sorted.filter((x) => x.score === 0).slice(0, 5).map((x) => x.s);

    return [...topRelevant, ...rest].join('. ');
  }
}
