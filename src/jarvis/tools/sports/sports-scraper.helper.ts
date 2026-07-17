import { Logger } from '@nestjs/common';
import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';

/**
 * Helper stateless — no es un provider NestJS, se usa directamente desde SportsTool.
 * Va a buscar datos crudos de un partido en sitios deportivos conocidos
 * cuando la API no tiene el detalle de goleadores.
 */
export class SportsScraperHelper {
  private static readonly logger = new Logger('SportsScraperHelper');

  private static readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  private static readonly TIMEOUT = 8_000;

  /**
   * Busca datos de goles para un partido dado.
   * Prueba múltiples URLs de sitios deportivos en paralelo y retorna
   * el primer texto con información relevante de goles.
   *
   * @param homeTeam  Equipo local  (ej: "Argentina")
   * @param awayTeam  Equipo visitante (ej: "Austria")
   * @param date      Fecha del partido (ej: "2026-06-22")
   */
  static async fetchGoalDetails(
    homeTeam: string,
    awayTeam: string,
    date?: string,
  ): Promise<string | null> {
    const home = homeTeam.toLowerCase();
    const away = awayTeam.toLowerCase();

    // Construir URLs directas a sitios deportivos
    const urls = SportsScraperHelper.buildUrls(home, away, date);
    SportsScraperHelper.logger.log(
      `[scraper] buscando goles ${homeTeam} vs ${awayTeam} en ${urls.length} fuentes`,
    );

    // Scrapear en paralelo, timeout individual por URL
    const results = await Promise.allSettled(
      urls.map((u) => SportsScraperHelper.scrapeUrl(u)),
    );

    // Tomar el primero que tenga texto útil
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.length > 100) {
        return r.value;
      }
    }

    return null;
  }

  // ── Construcción de URLs ────────────────────────────────────────────────────

  private static buildUrls(
    home: string,
    away: string,
    date?: string,
  ): string[] {
    const q = encodeURIComponent(`${home} ${away}`);
    const qGol = encodeURIComponent(
      `goles ${home} ${away} ${date ?? ''}`.trim(),
    );

    return [
      // Olé — portal deportivo argentino
      `https://www.ole.com.ar/search?q=${qGol}`,
      // TyC Sports
      `https://www.tycsports.com/buscar?q=${qGol}`,
      // ESPN Argentina
      `https://espndeportes.espn.com/futbol/buscar?q=${q}`,
      // Infobae deportes
      `https://www.infobae.com/deportes/?q=${qGol}`,
      // LiveScore — tiene detalles de goles en HTML
      `https://www.livescore.com/en/search/?q=${q}`,
      // FlashScore — excelente para minutos de goles
      `https://www.flashscore.com/search/?q=${q}`,
    ];
  }

  // ── Scraping individual ─────────────────────────────────────────────────────

  private static async scrapeUrl(url: string): Promise<string | null> {
    try {
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': SportsScraperHelper.USER_AGENT,
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: SportsScraperHelper.TIMEOUT,
        validateStatus: (s) => s < 400,
      });

      const $ = cheerioLoad(resp.data as string);

      // Remover ruido
      $(
        'script, style, nav, footer, header, aside, iframe, .ads, [aria-hidden="true"], .cookie',
      ).remove();

      // Palabras clave que indican info de goles
      const goalKeywords = [
        'gol',
        'minuto',
        'anotó',
        'marcó',
        'tanto',
        'min.',
        "'",
        'scorer',
        'goal',
        'scored',
        'penalty',
        'penal',
        'hat-trick',
      ];

      const relevant: string[] = [];

      // 1. Buscar en elementos estructurados de goles primero
      const goalSelectors = [
        '.goal',
        '.scorer',
        '.event-goal',
        '[class*="goal"]',
        '[class*="scorer"]',
        '[class*="gol"]',
        'table td',
        '.incident',
        '.match-event',
      ];

      for (const sel of goalSelectors) {
        $(sel).each((_, el) => {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text.length > 5 && text.length < 200) {
            const hasKw = goalKeywords.some((kw) =>
              text.toLowerCase().includes(kw),
            );
            if (hasKw && !relevant.includes(text)) relevant.push(text);
          }
        });
        if (relevant.length >= 5) break;
      }

      // 2. Fallback: buscar en párrafos del artículo principal
      if (relevant.length < 2) {
        $('p, li').each((_, el) => {
          if (relevant.length >= 10) return;
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text.length < 20 || text.length > 400) return;
          const hasKw = goalKeywords.some((kw) =>
            text.toLowerCase().includes(kw),
          );
          if (hasKw && !relevant.includes(text)) relevant.push(text);
        });
      }

      // 3. Fallback final: texto del artículo principal (máx 2000 chars)
      if (relevant.length === 0) {
        const article = $('article, main, .article-body, .content').first();
        if (article.length) {
          const text = article
            .text()
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2000);
          if (text.length > 100) {
            SportsScraperHelper.logger.log(
              `[scraper] artículo crudo de ${url} (${text.length} chars)`,
            );
            return `${text}\n\n_(Fuente: ${new URL(url).hostname})_`;
          }
        }
        return null;
      }

      SportsScraperHelper.logger.log(
        `[scraper] ${relevant.length} fragmentos de goles encontrados en ${url}`,
      );
      return `${relevant.slice(0, 8).join('\n')}\n\n_(Fuente: ${new URL(url).hostname})_`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // No loguear 404s como warning — son esperables
      if (!msg.includes('404') && !msg.includes('403')) {
        SportsScraperHelper.logger.warn(`[scraper] ${url}: ${msg}`);
      }
      return null;
    }
  }
}
