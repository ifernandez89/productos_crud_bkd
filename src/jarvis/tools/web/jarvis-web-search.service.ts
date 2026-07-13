import { Injectable, Logger } from '@nestjs/common';
import { BrowserToolService } from '../browser/browser-tool.service';
import { ContentCacheService } from './content-cache.service';
import { DomainRouterService } from '../intent/domain-router.service';
import { SportsTool } from '../sports/sports-tool.service';
import { SourceRegistry } from './source-registry';
import { WebHelper } from './web-helper';

@Injectable()
export class JarvisWebSearchService {
  private readonly logger = new Logger(JarvisWebSearchService.name);

  constructor(
    private readonly browserTool: BrowserToolService,
    private readonly contentCache: ContentCacheService,
    public readonly domainRouter: DomainRouterService,
    private readonly sportsTool: SportsTool,
  ) {}

  needsWebSearch(message: string): boolean {
    const n = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // 1. Si pide explícitamente buscar en internet/web
    if (/(busca(r)? en internet|busca(r)? en la web|busca(r)? en google|googlea(r)?|navega(r)?|chequea(r)? online|fijate en internet|investiga(r)? en la web|search on internet|search the web)/i.test(n)) {
      this.logger.log(`[needsWebSearch] pedido explícito de búsqueda web detectado.`);
      return true;
    }

    // 2. Forzar búsqueda web para gobierno local (las autoridades cambian)
    if (/(intendent|gobernador|concejal|concejo|municipalidad|quien gobierna|autoridades|gobierno de parana|gestion municipal)/i.test(n)) {
      this.logger.log(`[needsWebSearch] gobierno local detectado → buscando en internet`);
      return true;
    }

    return false;
  }

  async autoWebSearch(query: string, category?: string): Promise<string | null> {
    const enrichedQuery = this.enrichQueryForCategory(query, category);

    this.logger.log(
      `[jarvis:auto_search] buscando: "${enrichedQuery.slice(0, 80)}" ${category ? `[${category}]` : ''}`,
    );

    // 1. Si hay categoría, usar caché inteligente
    if (category) {
      try {
        const cachePromise = this.contentCache.fetchRelevantContent(enrichedQuery, category, 2);
        const cacheTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('cache timeout 15s')), 15_000),
        );
        const cached = await Promise.race([cachePromise, cacheTimeout]) as any[];

        if (cached && cached.length > 0) {
          const fromCacheCount = cached.filter((r) => r.fromCache).length;
          this.logger.log(
            `[jarvis:auto_search] ${cached.length} resultados (${fromCacheCount} desde caché)`,
          );

          return cached
            .map((r, i) => {
              const source = r.fromCache ? '💾 CACHÉ' : '🌐 WEB';
              const title = r.title ? `**${i + 1}. ${r.title}**` : `**${i + 1}. Resultado**`;
              return `${title} ${source}\n🔗 ${r.url}\n\n${r.content.slice(0, 2000)}`;
            })
            .join('\n\n---\n\n');
        }

        this.logger.log(`[jarvis:auto_search] caché vacío para "${category}" → WebHelper`);
      } catch (err: any) {
        this.logger.warn(`[jarvis:auto_search] error en caché: ${err.message} → fallback`);
      }
    }

    // 2. Fallback: WebHelper con fuentes priorizadas por categoría
    const webHelperTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000));
    const webHelperResult = WebHelper.search(enrichedQuery, category, true);
    const result = await Promise.race([webHelperResult, webHelperTimeout]);

    if (result) {
      this.logger.log(`[jarvis:auto_search] OK WebHelper (${result.length} chars)`);
      return result;
    }

    this.logger.log(`[jarvis:auto_search] WebHelper vacío → sin resultados`);
    return null;
  }

  domainToCategory(domain: string): string | undefined {
    const map: Record<string, string> = {
      SPORTS: 'deportes',
      LOCAL_NEWS: 'noticias',
      NATIONAL_NEWS: 'noticias',
      POLITICS: 'noticias',
      AI: 'ia',
      AI_PAPERS: 'academic_ai',
      PROGRAMMING: 'tecnologia',
      DEVELOPMENT: 'desarrollo',
      SCIENCE: 'ciencia',
      TECHNOLOGY: 'tecnologia',
      MUSIC: 'musica',
      MOVIES_TV: 'entretenimiento',
      MYSTERY: 'misterios',
      ECONOMY: 'noticias',
      GOVERNMENT_LOCAL: 'gobierno',
      REFERENCE: 'referencia',
      PLANTS: 'referencia',
      MATH: 'academic_math',
      PHYSICS: 'academic_physics',
      ASTRONOMY: 'academic_astronomy',
      WEB_DOCS: 'academic_dev',
    };
    return map[domain];
  }

  async autoWebSearchWithSources(
    query: string,
    category?: string,
    suggestedSources?: string[],
  ): Promise<string | null> {
    if (suggestedSources && suggestedSources.length > 0) {
      this.logger.log(
        `[domain_search] usando ${suggestedSources.length} fuentes dirigidas para "${query.slice(0, 60)}"`,
      );

      const sourceDefs = suggestedSources
        .map((urlBase) => SourceRegistry.findByUrl(urlBase))
        .filter(Boolean);

      if (sourceDefs.length > 0) {
        const scrapeResults = await Promise.allSettled(
          sourceDefs.slice(0, 3).map((src) => {
            const searchUrl = SourceRegistry.buildSearchUrl(src!, query);
            const targetUrl = searchUrl || src!.urlBase;
            return WebHelper.scrapeUrlWithSelectors(targetUrl, query, src!);
          }),
        );

        const useful: string[] = [];
        for (const r of scrapeResults) {
          if (r.status === 'fulfilled' && r.value && r.value.length > 150) {
            useful.push(r.value);
            if (useful.length >= 2) break;
          }
        }

        if (useful.length > 0) {
          this.logger.log(`[domain_search] ${useful.length} resultados de fuentes dirigidas`);
          return useful.join('\n\n---\n\n');
        }
        this.logger.log(`[domain_search] fuentes dirigidas vacías → fallback autoWebSearch`);
      }
    }

    return this.autoWebSearch(query, category);
  }

  enrichQueryForCategory(query: string, category?: string): string {
    if (!category) return query;

    const n = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mentionsParana = /parana|entre rios|litoral/.test(n);
    const mentionsArgentina = /argentin/.test(n);

    if (category === 'noticias') {
      const isGeneric = /^(noticias?|novedades?|actualidad|que paso|que hay de nuevo|noticias de hoy|ultimas noticias)[\s?¿!¡.]*$/i.test(n.trim());
      if (isGeneric) {
        const localidad = mentionsParana ? 'Paraná Entre Ríos'
          : mentionsArgentina ? 'Argentina'
            : '';
        return `noticias ${localidad} hoy`.replace(/\s+/g, ' ').trim();
      }
      let enriched = query;
      if (!/noticia/i.test(n)) enriched = `noticias ${enriched}`;
      if (!/hoy|actual|reciente/i.test(n)) enriched = `${enriched} hoy`;
      return enriched;
    }

    if (category === 'gobierno') {
      const isGeneric = /^(gobierno|autoridades|quien gobierna|gestion municipal)[\s?¿!¡.]*$/i.test(n.trim());
      if (isGeneric) {
        const localidad = mentionsParana ? 'Paraná Entre Ríos' : 'Argentina';
        return `noticias gobierno ${localidad} hoy`.trim();
      }
      return query;
    }

    const now = new Date();
    const today = `${now.getDate()} de ${now.toLocaleDateString('es-AR', { month: 'long' })} de ${now.getFullYear()}`;
    if (/\bhoy\b/i.test(query)) return query.replace(/\bhoy\b/gi, today);
    return `${query} ${today}`;
  }

  detectCategory(message: string): string | undefined {
    const n = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (/(intendent|gobernador|concejal|concejo|municipalidad|quien gobierna|autoridades|gobierno de parana|gestion municipal)/i.test(n)) {
      return 'gobierno';
    }

    if (/(noticia|novedades|actualidad|resumen|breaking|informa|titulo|tapa|diario|periodico|prensa)/i.test(n) && n.length > 10) {
      return 'noticias';
    }

    if (/(parana\b|ciudad de parana|parque urquiza|costanera|puerto viejo)/i.test(n)) {
      if (/(rio|caudal|nivel|afluente)/i.test(n)) return 'noticias';
      return 'noticias';
    }

    if (/(futbol|gol|partido|seleccion|equipo|jugador|campeon|copa|liga|torneo|clasifico|gano|perdio|empato)/i.test(n)) {
      return 'deportes';
    }

    if (/(clima|temperatura|lluvia|calor|frio|pronostico|meteorolog|tiempo \(clima\)|despejado|nublado)/i.test(n)) {
      return 'clima';
    }

    if (/(ultimo|ultima|hoy|reciente)/i.test(n) && n.length > 15) {
      return 'noticias';
    }

    if (/(\bia\b|inteligencia artificial|machine learning|deep learning|llm\b|openai|chatgpt|gemini\b|claude\b|llama\b|gpt-|gpt4|gpt3|copilot|midjourney|stable diffusion|diffusion model|modelo de lenguaje|red neuronal|transformer\b|hugging face|huggingface)/i.test(n)) {
      return 'ia';
    }

    if (/(nestjs|nodejs|node\.js|typescript|javascript|react\b|next\.js|nextjs|vue\b|angular\b|svelte|python\b|rust\b|golang|deno\b|bun\b|npm\b|yarn\b|pnpm|webpack|vite\b|rollup|esbuild|prisma\b|docker\b|kubernetes|k8s|github\b|gitlab|git\b|api rest|graphql|websocket|backend|frontend|framework|libreria|biblioteca|sdk\b|cli\b|dev\.to|medium\.com)/i.test(n)) {
      return 'desarrollo';
    }

    if (/(tecnologia|software|hardware|gadget|smartphone|celular|tablet|laptop|procesador|chip\b|apple\b|google\b|microsoft\b|meta\b|amazon\b|app\b|aplicacion)/i.test(n)) {
      return 'tecnologia';
    }

    if (/(ciencia|investigacion|estudio|descubr|scientist|paper|journal|nature|conicet)/i.test(n)) {
      return 'ciencia';
    }

    if (/(matematica|ecuacion|teorema|demostrac|calculo|algebra|geometria|topologia)/i.test(n)) {
      return 'matematicas';
    }

    if (/(fisica|cuantic|particula|cern|relatividad|energia|cosmos|astrofisica)/i.test(n)) {
      return 'fisica';
    }

    if (/(musica|cancion|album|artista|concierto|festival|spotify|billboard)/i.test(n)) {
      return 'musica';
    }

    if (/(pelicula|film|cine|actor|actriz|director|oscar|estreno|imdb|marvel|mcu|serie)/i.test(n)) {
      return 'entretenimiento';
    }

    return undefined;
  }

  async executeSiteSearch(site: string, query: string): Promise<string | null> {
    this.logger.log(`[jarvis:site_search] buscando en ${site}: "${query.slice(0, 60)}"`);

    const isHeadlinesQuery = /\b(noticias|titulares|novedades|que paso|que hay|actualidad|portada|principales|importantes|recientes|hoy)\b/i.test(query);

    if (isHeadlinesQuery) {
      const source = SourceRegistry.getAll().find(s => s.urlBase.includes(site));
      const targetUrl = source?.urlBase ?? `https://${site}`;
      const limit = this.extractNumberFromQuery(query) ?? 8;

      const headlines = await WebHelper.scrapeHeadlines(targetUrl, limit, source);
      if (headlines) {
        this.logger.log(`[jarvis:site_search] titulares OK de ${site}`);
        return headlines;
      }
      this.logger.warn(`[jarvis:site_search] sin titulares de ${site}, intentando scraping general`);
    }

    try {
      const source = SourceRegistry.getAll().find(s => s.urlBase.includes(site));
      const category = source?.category ?? 'noticias';
      const siteQuery = `site:${site} ${query}`;

      const cachePromise = this.contentCache.fetchRelevantContent(siteQuery, category, 2);
      const cacheTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('cache timeout 15s')), 15_000),
      );
      const cached = await Promise.race([cachePromise, cacheTimeout]) as any[];

      if (cached && cached.length > 0) {
        return cached
          .map((r, i) => {
            const sourceLabel = r.fromCache ? '💾 CACHÉ' : '🌐 WEB';
            const title = r.title ? `**${i + 1}. ${r.title}**` : `**${i + 1}. Resultado**`;
            return `${title} ${sourceLabel}\n🔗 ${r.url}\n\n${r.content.slice(0, 2000)}`;
          })
          .join('\n\n---\n\n');
      }
    } catch (err: any) {
      this.logger.warn(`[jarvis:site_search] error en caché: ${err.message}`);
    }

    const webHelperTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000));
    const result = await Promise.race([
      WebHelper.search(`site:${site} ${query}`, undefined, true),
      webHelperTimeout,
    ]);

    return result ?? null;
  }

  extractNumberFromQuery(query: string): number | null {
    const match = query.match(/\b(\d+)\b/);
    return match ? Math.min(parseInt(match[1], 10), 15) : null;
  }

  isCurrentEventQuery(message: string): boolean {
    const n = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /(hoy|ayer|esta semana|esta noche|ahora|actualmente|reciente|noticias|novedad|ultimo|ultima|ocurrio|paso hoy|que hay|resultado|partido|gol|marcador|score|precio actual|cotizacion|dolar hoy|quedo|gano|perdio|empato|clasifico|quien gano|como salio|que paso con|revisa|dame las noticias|titulares)/.test(n);
  }

  buildNoEvidenceMessage(query: string, site?: string): string {
    const now = new Date();
    const hora = now.toLocaleTimeString('es-AR', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });

    const siteHint = site
      ? `Intenté buscar en **${site}** pero no pude obtener contenido en este momento.`
      : `Intenté buscar en las fuentes disponibles pero no obtuve resultados verificados.`;

    return [
      `⚠️ No tengo datos verificados para responder esto (${hora} hs).`,
      ``,
      siteHint,
      ``,
      `No voy a inventar información sobre eventos actuales. Podés:`,
      site ? `- Consultar directamente: https://${site}` : `- Reformular la pregunta o intentar en un momento`,
      `- Volver a preguntarme en unos segundos`,
    ].join('\n');
  }
}
