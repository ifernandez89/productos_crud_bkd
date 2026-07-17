import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SportsScraperHelper } from './sports-scraper.helper';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SportsResult {
  found: boolean;
  source: string;
  content: string;
  hasGoalDetail: boolean;
}

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * Cascada:
 * 1. TheSportsDB  → score, fecha, estadio (~200ms, sin key)
 * 2. Si no tiene goleadores → SportsScraperHelper → scrapea sitios deportivos directamente
 */
@Injectable()
export class SportsTool {
  private readonly logger = new Logger(SportsTool.name);
  private readonly TIMEOUT = 6_000;

  private readonly TEAM_IDS: Record<string, string> = {
    argentina: '134509',
    brasil: '134506',
    brazil: '134506',
    uruguay: '134511',
    colombia: '134510',
    'boca juniors': '133703',
    'river plate': '133704',
    'real madrid': '133613',
    barcelona: '133600',
    'manchester united': '133616',
    'manchester city': '133615',
    liverpool: '133602',
    chelsea: '133610',
    inter: '133738',
    milan: '133739',
    juventus: '133736',
  };

  private readonly LEAGUE_IDS: Record<string, string> = {
    'premier league': '4328',
    'la liga': '4335',
    'copa america': '4499',
    mundial: '4429',
    'world cup': '4429',
    'champions league': '4480',
    superliga: '4406',
    'serie a': '4332',
    bundesliga: '4331',
  };

  // ── API pública ─────────────────────────────────────────────────────────────

  async search(query: string): Promise<SportsResult> {
    const n = query.toLowerCase();

    // 1. Obtener datos básicos de TheSportsDB (score, fecha, equipos)
    const basicResult = await this.getFromTheSportsDB(n);

    // 2. Extraer equipos para el scraper
    const { home, away, date } = this.extractMatchInfo(basicResult, n);

    // 3. Buscar goleadores/minutos via scraper (en paralelo con paso 1)
    const scrapeText = await SportsScraperHelper.fetchGoalDetails(
      home,
      away,
      date,
    );

    if (scrapeText) {
      const baseInfo = basicResult.found ? `${basicResult.content}\n\n` : '';
      return {
        found: true,
        source: 'TheSportsDB + Web',
        content: `${baseInfo}**Detalle de goles:**\n${scrapeText}`,
        hasGoalDetail: true,
      };
    }

    // 4. Sin detalle de scraper → devolver solo lo básico
    if (basicResult.found) return basicResult;

    return { found: false, source: 'none', content: '', hasGoalDetail: false };
  }

  // ── TheSportsDB ──────────────────────────────────────────────────────────────

  private async getFromTheSportsDB(n: string): Promise<SportsResult> {
    const teamId = this.detectTeamId(n);
    const leagueId = this.detectLeagueId(n);
    const teamName = this.extractTeamName(n);

    const promises: Promise<SportsResult>[] = [];
    if (teamId) promises.push(this.getLastEventByTeam(teamId));
    if (leagueId) promises.push(this.getLastEventsByLeague(leagueId));
    if (teamName && !teamId) promises.push(this.searchTeamByName(teamName));

    if (!promises.length)
      return {
        found: false,
        source: 'none',
        content: '',
        hasGoalDetail: false,
      };

    try {
      const result = await Promise.race([
        this.firstFound(promises),
        new Promise<SportsResult>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5_000),
        ),
      ]);
      return result;
    } catch {
      return {
        found: false,
        source: 'none',
        content: '',
        hasGoalDetail: false,
      };
    }
  }

  private async firstFound(
    promises: Promise<SportsResult>[],
  ): Promise<SportsResult> {
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
      if (!events.length)
        return {
          found: false,
          source: 'thesportsdb',
          content: '',
          hasGoalDetail: false,
        };

      // Guardar metadata del evento en el contenido para que el scraper lo use
      this._lastEvents = events.slice(0, 3);
      const lines = events.slice(0, 3).map((e) => this.formatEvent(e));
      return {
        found: true,
        source: 'TheSportsDB',
        content: `**Últimos partidos:**\n${lines.join('\n\n')}`,
        hasGoalDetail: false,
      };
    } catch {
      return {
        found: false,
        source: 'thesportsdb',
        content: '',
        hasGoalDetail: false,
      };
    }
  }

  private async getLastEventsByLeague(leagueId: string): Promise<SportsResult> {
    try {
      const resp = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${leagueId}`,
        { timeout: this.TIMEOUT },
      );
      const events: any[] = resp.data?.events ?? [];
      if (!events.length)
        return {
          found: false,
          source: 'thesportsdb',
          content: '',
          hasGoalDetail: false,
        };

      this._lastEvents = events.slice(0, 5);
      const lines = events.slice(0, 5).map((e) => this.formatEvent(e));
      return {
        found: true,
        source: 'TheSportsDB',
        content: `**Últimos resultados:**\n${lines.join('\n\n')}`,
        hasGoalDetail: false,
      };
    } catch {
      return {
        found: false,
        source: 'thesportsdb',
        content: '',
        hasGoalDetail: false,
      };
    }
  }

  private async searchTeamByName(teamName: string): Promise<SportsResult> {
    try {
      const resp = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`,
        { timeout: this.TIMEOUT },
      );
      const teams: any[] = resp.data?.teams ?? [];
      if (!teams.length)
        return {
          found: false,
          source: 'thesportsdb',
          content: '',
          hasGoalDetail: false,
        };
      return this.getLastEventByTeam(teams[0].idTeam);
    } catch {
      return {
        found: false,
        source: 'thesportsdb',
        content: '',
        hasGoalDetail: false,
      };
    }
  }

  // Cache liviano del último evento para extraer equipos/fecha
  private _lastEvents: any[] = [];

  // ── Extracción de info del partido ───────────────────────────────────────────

  private extractMatchInfo(
    basic: SportsResult,
    query: string,
  ): { home: string; away: string; date?: string } {
    // Si tenemos datos de TheSportsDB, usar el evento más reciente
    if (basic.found && this._lastEvents.length > 0) {
      const e = this._lastEvents[0];
      return {
        home: e.strHomeTeam ?? '',
        away: e.strAwayTeam ?? '',
        date: e.dateEvent,
      };
    }

    // Fallback: extraer del texto del query
    const teams = this.extractTeamsFromQuery(query);
    return {
      home: teams[0] ?? '',
      away: teams[1] ?? '',
    };
  }

  private extractTeamsFromQuery(query: string): string[] {
    const n = query.toLowerCase();
    const known = [
      'argentina',
      'austria',
      'brasil',
      'brazil',
      'uruguay',
      'colombia',
      'boca',
      'river',
      'barcelona',
      'real madrid',
      'manchester',
    ];
    return known.filter((t) => n.includes(t));
  }

  // ── Formateo ─────────────────────────────────────────────────────────────────

  private formatEvent(e: any): string {
    const home = e.strHomeTeam ?? '?';
    const away = e.strAwayTeam ?? '?';
    const scoreH = e.intHomeScore ?? '-';
    const scoreA = e.intAwayScore ?? '-';
    const date = e.dateEvent ?? '';
    const time = e.strTimeLocal ?? e.strTime ?? '';
    const league = e.strLeague ?? '';
    const venue = e.strVenue ?? '';
    const status = e.strStatus ?? '';

    const statusLabel =
      status === 'FT'
        ? '✅ Finalizado'
        : status === 'NS'
          ? '⏳ No iniciado'
          : status || '';
    let line = `• **${home} ${scoreH} - ${scoreA} ${away}** ${statusLabel}`;
    if (date) line += `\n  📅 ${date}${time ? ' ' + time : ''}`;
    if (league) line += `  🏆 ${league}`;
    if (venue) line += `\n  📍 ${venue}`;
    return line;
  }

  // ── Detección ─────────────────────────────────────────────────────────────────

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
    if (n.includes('boca')) return 'Boca Juniors';
    if (n.includes('river')) return 'River Plate';
    if (n.includes('brasil') || n.includes('brazil')) return 'Brazil';
    const m = n.match(
      /(?:de|del|sobre|partido de)\s+([\w\s]{3,30})(?:\s+hoy|\s+ayer|\s+el partido|$)/i,
    );
    return m?.[1]?.trim() ?? null;
  }
}
