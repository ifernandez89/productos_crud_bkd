import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SportsResult {
  found: boolean;
  source: string;
  content: string;
  hasGoalDetail: boolean;   // true si tiene goleadores/minutos
}

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * Cascada de fuentes deportivas sin API key:
 * 1. TheSportsDB — resultado básico (score, fecha, estadio)
 * 2. Si no tiene goles detallados → DuckDuckGo para encontrar URL relevante
 * 3. Scrapear la primera URL con cheerio para obtener goleadores + minutos
 */
@Injectable()
export class SportsTool {
  private readonly logger = new Logger(SportsTool.name);
  private readonly TIMEOUT = 6_000;

  private readonly TEAM_IDS: Record<string, string> = {
    'argentina':         '134509',
    'brasil':            '134506',
    'brazil':            '134506',
    'uruguay':           '134511',
    'colombia':          '134510',
    'boca juniors':      '133703',
    'river plate':       '133704',
    'real madrid':       '133613',
    'barcelona':         '133600',
    'manchester united': '133616',
    'manchester city':   '133615',
    'liverpool':         '133602',
    'chelsea':           '133610',
    'inter':             '133738',
    'milan':             '133739',
    'juventus':          '133736',
  };

  private readonly LEAGUE_IDS: Record<string, string> = {
    'premier league':   '4328',
    'la liga':          '4335',
    'copa america':     '4499',
    'mundial':          '4429',
    'world cup':        '4429',
    'champions league': '4480',
    'superliga':        '4406',
    'serie a':          '4332',
    'bundesliga':       '4331',
  };

  // Sitios de deportes que tienen buenos detalles de goles en HTML
  private readonly SPORTS_SITES = [
    'ole.com.ar',
    'espn.com.ar',
    'espn.com',
    'infobae.com',
    'tycsports.com',
    'marca.com',
    'as.com',
    'livescore.com',
    'flashscore.com',
    'sofascore.com',
  ];

  // ── API pública ─────────────────────────────────────────────────────────────

  async search(query: string): Promise<SportsResult> {
    const n = query.toLowerCase();

    // Paso 1: TheSportsDB — datos básicos del partido
    const basicResult = await this.getFromTheSportsDB(n);

    // Paso 2: Siempre buscar detalles de goles via scraping
    // (TheSportsDB free no tiene goleadores, solo score)
    const detailResult = await this.getGoalDetails(query, basicResult);

    if (detailResult.found) return detailResult;
    if (basicResult.found) return basicResult;

    return { found: false, source: 'none', content: '', hasGoalDetail: false };
  }

  // ── TheSportsDB ──────────────────────────────────────────────────────────────

  private async getFromTheSportsDB(n: string): Promise<SportsResult> {
    const teamId   = this.detectTeamId(n);
    const leagueId = this.detectLeagueId(n);
    const teamName = this.extractTeamName(n);

    const promises: Promise<SportsResult>[] = [];
    if (teamId)              promises.push(this.getLastEventByTeam(teamId));
    if (leagueId)            promises.push(this.getLastEventsByLeague(leagueId));
    if (teamName && !teamId) promises.push(this.searchTeamByName(teamName));

    if (!promises.length) return { found: false, source: 'none', content: '', hasGoalDetail: false };

    try {
      const result = await Promise.race([
        this.firstFound(promises),
        new Promise<SportsResult>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5_000),
        ),
      ]);
      return result;
    } catch (e) {
      this.logger.warn(`[sports:api] ${e instanceof Error ? e.message : e}`);
      return { found: false, source: 'none', content: '', hasGoalDetail: false };
    }
  }

  private async firstFound(promises: Promise<SportsResult>[]): Promise<SportsResult> {
    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.found) return r.value;
    }
    return { found: false, source: 'none', content: '', hasGoalDetail: false };
  }

  private async getLastEventByTeam(teamId: string): Promise<SportsResult> {
    try {
      const resp = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${teamId}`,
        { timeout: this.TIMEOUT },
      );
      const events: any[] = resp.data?.results ?? [];
      if (!events.length) return { found: false, source: 'thesportsdb', content: '', hasGoalDetail: false };

      const lines = events.slice(0, 3).map((e) => this.formatEvent(e));
      return {
        found: true,
        source: 'TheSportsDB',
        content: `**Últimos partidos:**\n${lines.join('\n\n')}`,
        hasGoalDetail: false,
      };
    } catch {
      return { found: false, source: 'thesportsdb', content: '', hasGoalDetail: false };
    }
  }

  private async getLastEventsByLeague(leagueId: string): Promise<SportsResult> {
    try {
      const resp = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${leagueId}`,
        { timeout: this.TIMEOUT },
      );
      const events: any[] = resp.data?.events ?? [];
      if (!events.length) return { found: false, source: 'thesportsdb', content: '', hasGoalDetail: false };

      const lines = events.slice(0, 5).map((e) => this.formatEvent(e));
      return {
        found: true,
        source: 'TheSportsDB',
        content: `**Últimos resultados de la liga:**\n${lines.join('\n\n')}`,
        hasGoalDetail: false,
      };
    } catch {
      return { found: false, source: 'thesportsdb', content: '', hasGoalDetail: false };
    }
  }

  private async searchTeamByName(teamName: string): Promise<SportsResult> {
    try {
      const resp = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`,
        { timeout: this.TIMEOUT },
      );
      const teams: any[] = resp.data?.teams ?? [];
      if (!teams.length) return { found: false, source: 'thesportsdb', content: '', hasGoalDetail: false };
      return this.getLastEventByTeam(teams[0].idTeam);
    } catch {
      return { found: false, source: 'thesportsdb', content: '', hasGoalDetail: false };
    }
  }

  // ── Detalles de goles via scraping ───────────────────────────────────────────

  /**
   * Busca en DuckDuckGo "goles argentina austria minutos goleadores"
   * Luego scrapea la primera URL de un sitio deportivo conocido
   */
  private async getGoalDetails(query: string, basic: SportsResult): Promise<SportsResult> {
    // Construir query de búsqueda específica para goles
    const searchQuery = this.buildGoalSearchQuery(query);
    this.logger.log(`[sports:goals] buscando detalles: "${searchQuery}"`);

    // Buscar en DuckDuckGo
    const searchUrls = await this.searchDDG(searchQuery);
    if (!searchUrls.length) {
      this.logger.warn('[sports:goals] DuckDuckGo no devolvió URLs');
      return { found: false, source: 'none', content: '', hasGoalDetail: false };
    }

    // Scrapear las primeras 2 URLs en paralelo, tomar la que más contenido dé
    const scrapePromises = searchUrls.slice(0, 2).map((url) => this.scrapeGoals(url));
    const scrapeResults = await Promise.allSettled(scrapePromises);

    for (const r of scrapeResults) {
      if (r.status === 'fulfilled' && r.value) {
        // Combinar con datos básicos si los tenemos
        const combinedContent = basic.found
          ? `${basic.content}\n\n**Detalle de goles (web):**\n${r.value}`
          : `**Detalle de goles:**\n${r.value}`;

        return {
          found: true,
          source: 'Web scraping',
          content: combinedContent,
          hasGoalDetail: true,
        };
      }
    }

    return { found: false, source: 'none', content: '', hasGoalDetail: false };
  }

  /** Busca en DuckDuckGo y devuelve las URLs de resultados */
  private async searchDDG(query: string): Promise<string[]> {
    try {
      const encoded = encodeURIComponent(query);
      const resp = await axios.get(
        `https://html.duckduckgo.com/html/?q=${encoded}&kl=ar-es`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'es-AR,es;q=0.9',
          },
          timeout: 6_000,
        },
      );

      const $ = cheerioLoad(resp.data as string);
      const urls: string[] = [];

      $('.result__body').each((_, el) => {
        if (urls.length >= 4) return;
        const href = $(el).find('.result__url').text().trim();
        if (!href) return;
        const fullUrl = href.startsWith('http') ? href : `https://${href}`;
        // Priorizar sitios deportivos conocidos
        const isSportsSite = this.SPORTS_SITES.some((s) => fullUrl.includes(s));
        if (isSportsSite) urls.unshift(fullUrl); // prioridad al frente
        else urls.push(fullUrl);
      });

      return urls;
    } catch (err: unknown) {
      this.logger.warn(`[sports:ddg] ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  /** Scrapea una URL y extrae texto relevante sobre goles */
  private async scrapeGoals(url: string): Promise<string | null> {
    try {
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'es-AR,es;q=0.9',
        },
        timeout: 6_000,
        validateStatus: (s) => s < 400,
      });

      const $ = cheerioLoad(resp.data as string);

      // Remover basura
      $('script, style, nav, footer, header, aside, iframe, .ads, [aria-hidden="true"]').remove();

      // Buscar párrafos/secciones con info de goles
      const goalKeywords = ['gol', 'minuto', 'messi', 'goleador', 'score', 'tanto', 'anotó', 'marcó', 'min.', "'"];
      const relevantTexts: string[] = [];

      // Buscar en párrafos que mencionen goles
      $('p, li, td, .goal, [class*="goal"], [class*="scorer"], [class*="gol"]').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text.length < 10 || text.length > 500) return;
        const hasGoalInfo = goalKeywords.some((kw) => text.toLowerCase().includes(kw));
        if (hasGoalInfo && !relevantTexts.includes(text)) {
          relevantTexts.push(text);
        }
      });

      if (!relevantTexts.length) {
        // Fallback: tomar el primer bloque de texto del artículo
        const body = $('article, main, .article, .content').first().text()
          .replace(/\s+/g, ' ').trim().slice(0, 1500);
        if (body.length > 100) return `${body}\n_(Fuente: ${url})_`;
        return null;
      }

      return relevantTexts.slice(0, 8).join('\n') + `\n_(Fuente: ${url})_`;
    } catch (err: unknown) {
      this.logger.warn(`[sports:scrape] ${url}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private buildGoalSearchQuery(query: string): string {
    // Extraer equipos del query para hacer búsqueda específica
    const teams = this.extractTeamsFromQuery(query);
    const base  = teams.length >= 2
      ? `goles ${teams.join(' vs ')} partido hoy minutos goleadores`
      : `${query} goles minutos goleadores`;
    return base;
  }

  private extractTeamsFromQuery(query: string): string[] {
    const n = query.toLowerCase();
    const teams: string[] = [];
    const knownTeams = ['argentina', 'austria', 'brasil', 'uruguay', 'colombia', 'boca', 'river', 'barcelona', 'real madrid'];
    for (const t of knownTeams) {
      if (n.includes(t)) teams.push(t);
    }
    return teams;
  }

  private buildGoalSearchQueryFromEvent(event: any): string {
    const home = event.strHomeTeam ?? '';
    const away = event.strAwayTeam ?? '';
    const date = event.dateEvent   ?? '';
    return `goles ${home} vs ${away} ${date} minutos goleadores`;
  }

  private formatEvent(e: any): string {
    const home    = e.strHomeTeam  ?? '?';
    const away    = e.strAwayTeam  ?? '?';
    const scoreH  = e.intHomeScore ?? '-';
    const scoreA  = e.intAwayScore ?? '-';
    const date    = e.dateEvent    ?? '';
    const time    = e.strTimeLocal ?? e.strTime ?? '';
    const league  = e.strLeague    ?? '';
    const venue   = e.strVenue     ?? '';
    const status  = e.strStatus    ?? '';

    const statusLabel = status === 'FT' ? '✅ Finalizado' : status === 'NS' ? '⏳ No iniciado' : status || '';
    let line = `• **${home} ${scoreH} - ${scoreA} ${away}** ${statusLabel}`;
    if (date) line += `\n  📅 ${date}${time ? ' ' + time : ''}`;
    if (league) line += `  🏆 ${league}`;
    if (venue)  line += `\n  📍 ${venue}`;
    return line;
  }

  private detectTeamId(n: string): string | null {
    for (const [name, id] of Object.entries(this.TEAM_IDS)) {
      if (n.includes(name)) return id;
    }
    return null;
  }

  private detectLeagueId(n: string): string | null {
    for (const [name, id] of Object.entries(this.LEAGUE_IDS)) {
      if (n.includes(name)) return id;
    }
    return null;
  }

  private extractTeamName(n: string): string | null {
    if (n.includes('argentina') || n.includes('seleccion')) return 'Argentina';
    if (n.includes('boca'))  return 'Boca Juniors';
    if (n.includes('river')) return 'River Plate';
    if (n.includes('brasil') || n.includes('brazil')) return 'Brazil';

    const m = n.match(/(?:de|del|sobre|partido de)\s+([\w\s]{3,30?)(?:\s+hoy|\s+ayer|\s+el partido|$)/i);
    return m?.[1]?.trim() ?? null;
  }
}
