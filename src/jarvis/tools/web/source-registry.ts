/**
 * SourceRegistry — Catálogo de fuentes confiables priorizadas por categoría.
 *
 * ✅ TODAS las fuentes activas fueron verificadas con axios+cheerio (sin browser headless).
 * ❌ Las fuentes que fallaron (403, ENOTFOUND, SPA vacío) están COMENTADAS con motivo.
 *
 * Cada categoría tiene sus propias fuentes con:
 * - priority: 1-10 (mayor = más confiable/útil)
 * - ttlHours: tiempo de vida del contenido en caché
 * - selectors: selectores CSS específicos para extracción
 */

export interface SourceDefinition {
  name: string;
  urlBase: string;
  category: string;
  priority: number;
  ttlHours: number;
  searchPattern?: string; // patrón para búsquedas: "/search?q={query}"
  selectors?: {
    title?: string[];
    content?: string[];
    date?: string[];
  };
}

export class SourceRegistry {

  private static readonly sources: SourceDefinition[] = [

    // ══════════════════════════════════════════════════════════════════════════
    // 📰 NOTICIAS — Argentina general
    // ✅ Verificado: todos funcionan con scraping estático
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'Infobae',
      urlBase: 'https://www.infobae.com',
      category: 'noticias',
      priority: 10,
      ttlHours: 1,
      searchPattern: '/buscar?q={query}',
      selectors: {
        title: ['h1', '.headline', '.article-title'],
        content: ['article', '.article-body', '.cuerpo'],
        date: ['time', '.date', '[datetime]'],
      },
    },

    {
      name: 'La Nación',
      urlBase: 'https://www.lanacion.com.ar',
      category: 'noticias',
      priority: 9,
      ttlHours: 1,
      searchPattern: '/buscar/{query}',
      selectors: {
        title: ['h1', '.com-title'],
        content: ['article', '.nota'],
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // 📰 NOTICIAS LOCALES — Paraná y Entre Ríos
    // ✅ Verificado: los 5 funcionan perfectamente — mejor categoría para scraping
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'El Once (Paraná)',
      urlBase: 'https://www.elonce.com',
      category: 'noticias',
      priority: 10, // fuente local principal
      ttlHours: 1,
      searchPattern: '/noticias?s={query}',
      selectors: {
        title: ['h1', '.titular', '.article-title', '.title'],
        content: ['.nota-cuerpo', '.article-body', '.contenido', 'article', 'main'],
        date: ['time', '.fecha', '.date', '[datetime]'],
      },
    },

    {
      name: 'UNO Entre Ríos',
      urlBase: 'https://www.unoentrerios.com.ar',
      category: 'noticias',
      priority: 9,
      ttlHours: 1,
      searchPattern: '/search?q={query}',
      selectors: {
        title: ['h1', '.article-title', '.nota-titulo'],
        content: ['article', '.article-body', '.nota-cuerpo', 'main'],
        date: ['time', '.date', '[datetime]'],
      },
    },

    {
      name: 'APF Digital',
      urlBase: 'https://apfdigital.com.ar',
      category: 'noticias',
      priority: 8,
      ttlHours: 1,
      selectors: {
        title: ['h1', '.entry-title'],
        content: ['article', '.entry-content', 'main'],
        date: ['time', '.date'],
      },
    },

    {
      name: 'Análisis Digital',
      urlBase: 'https://www.analisisdigital.com.ar',
      category: 'noticias',
      priority: 8,
      ttlHours: 1,
      selectors: {
        title: ['h1', '.title', '.nota-titulo'],
        content: ['article', '.nota', '.article-body', 'main'],
      },
    },

    {
      name: 'El Entre Ríos',
      urlBase: 'https://www.elentrerios.com',
      category: 'noticias',
      priority: 7,
      ttlHours: 1,
      searchPattern: '/buscar?q={query}',
      selectors: {
        title: ['h1', '.title', '.nota-titulo'],
        content: ['article', '.nota', '.article-body', 'main'],
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // 🏛️ GOBIERNO LOCAL — Paraná
    // ✅ mi.parana.gob.ar funciona | ❌ entrerios.gov.ar SPA (9 palabras)
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'Mi Paraná (Municipalidad)',
      urlBase: 'https://mi.parana.gob.ar',
      category: 'gobierno',
      priority: 10,
      ttlHours: 6,
      selectors: {
        title: ['h1', '.page-title'],
        content: ['main', '.content', 'article'],
      },
    },

    {
      name: 'Parana.gob.ar',
      urlBase: 'https://www.parana.gob.ar',
      category: 'gobierno',
      priority: 9,
      ttlHours: 6,
      selectors: {
        title: ['h1', '.page-title'],
        content: ['main', '.content', 'article', '.entry-content'],
      },
    },

    // ❌ entrerios.gov.ar → SPA Angular: 200 OK pero solo 9 palabras de contenido
    // Necesitaría Playwright para renderizar. Pendiente.

    // ══════════════════════════════════════════════════════════════════════════
    // 🌦️ CLIMA — ⚠️ TODOS los sitios de clima bloquean scraping estático
    // meteored → 404 en rutas específicas | SMN → 403 | weather.com → 404
    // tutiempo → ECONNABORTED | SOLUCIÓN: usar la API de Open-Meteo (ya integrada)
    // ══════════════════════════════════════════════════════════════════════════
    // Sin fuentes aquí — el AssistantToolsService ya usa Open-Meteo API directo

    // ══════════════════════════════════════════════════════════════════════════
    // ⚽ DEPORTES
    // ✅ TyC, Olé, Promiedos, Infobae/deportes funcionan | ❌ ESPN SPA (0 palabras)
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'TyC Sports',
      urlBase: 'https://www.tycsports.com',
      category: 'deportes',
      priority: 10,
      ttlHours: 0.5,
      searchPattern: '/buscar?q={query}',
      selectors: {
        title: ['h1', '.article-title'],
        content: ['.article-body', '.nota-body', 'article'],
        date: ['time', '.date'],
      },
    },

    {
      name: 'Olé',
      urlBase: 'https://www.ole.com.ar',
      category: 'deportes',
      priority: 9,
      ttlHours: 0.5,
      searchPattern: '/search?q={query}',
      selectors: {
        title: ['h1'],
        content: ['.nota-texto', 'article', '.article-body'],
      },
    },

    {
      name: 'Promiedos',
      urlBase: 'https://www.promiedos.com.ar',
      category: 'deportes',
      priority: 9,
      ttlHours: 0.5,
      selectors: {
        content: ['table', '.partidos', '.resultados', 'main'],
      },
    },

    {
      name: 'Infobae Deportes',
      urlBase: 'https://www.infobae.com/deportes',
      category: 'deportes',
      priority: 8,
      ttlHours: 0.5,
      selectors: {
        title: ['h1', '.headline'],
        content: ['article', '.article-body'],
      },
    },

    // ❌ ESPN Deportes → SPA puro: 200 OK pero 0 palabras (React sin SSR)
    // Necesitaría Playwright. Si se activa Playwright, agregar:
    // { name: 'ESPN Argentina', urlBase: 'https://espndeportes.espn.com', ... }

    // ══════════════════════════════════════════════════════════════════════════
    // 🔬 CIENCIA
    // ✅ agenciacyta.org.ar funciona | ❌ BBC 404, NatGeo ENOTFOUND, InfoCielo 403
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'Agencia CyTA-Leloir',
      urlBase: 'https://www.agenciacyta.org.ar',
      category: 'ciencia',
      priority: 10,
      ttlHours: 24,
      selectors: {
        title: ['h1', '.entry-title'],
        content: ['article', '.nota', '.entry-content', 'main'],
        date: ['time', '.date'],
      },
    },

    {
      name: 'CONICET',
      urlBase: 'https://www.conicet.gov.ar',
      category: 'ciencia',
      priority: 9,
      ttlHours: 24,
      selectors: {
        title: ['h1'],
        content: ['article', 'main', '.field-items'],
      },
    },

    {
      name: 'Science News',
      urlBase: 'https://www.sciencenews.org',
      category: 'ciencia',
      priority: 9,
      ttlHours: 24,
      selectors: {
        title: ['h1'],
        content: ['article', '.entry-content', 'main'],
      },
    },

    // ❌ BBC Ciencia → 404 en /mundo/topics/ciencia
    // ❌ NatGeo Argentina → ENOTFOUND (dominio no existe)
    // ❌ InfoCielo → 403 Forbidden

    // ══════════════════════════════════════════════════════════════════════════
    // 💻 TECNOLOGÍA & IA
    // ✅ Fayerwayer, Xataka, MuyComputer funcionan | ❌ OpenAI 403
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'FayerWayer',
      urlBase: 'https://www.fayerwayer.com',
      category: 'tecnologia',
      priority: 10,
      ttlHours: 6,
      selectors: {
        title: ['h1', '.entry-title'],
        content: ['article', '.entry-content', 'main'],
        date: ['time', '.date'],
      },
    },

    {
      name: 'Xataka',
      urlBase: 'https://www.xataka.com',
      category: 'tecnologia',
      priority: 10,
      ttlHours: 6,
      selectors: {
        title: ['h1', '.article-title'],
        content: ['article', '.article-body', 'main'],
        date: ['time', '[datetime]'],
      },
    },

    {
      name: 'MuyComputer',
      urlBase: 'https://www.muycomputer.com',
      category: 'tecnologia',
      priority: 8,
      ttlHours: 6,
      selectors: {
        title: ['h1', '.entry-title'],
        content: ['article', '.entry-content', 'main'],
      },
    },

    {
      name: 'TechCrunch',
      urlBase: 'https://techcrunch.com',
      category: 'tecnologia',
      priority: 9,
      ttlHours: 6,
      selectors: {
        title: ['h1'],
        content: ['article', '.article-content', 'main'],
      },
    },

    {
      name: 'Ars Technica',
      urlBase: 'https://arstechnica.com',
      category: 'tecnologia',
      priority: 9,
      ttlHours: 6,
      selectors: {
        title: ['h1'],
        content: ['article', '.article-content', 'main'],
      },
    },

    {
      name: 'Hugging Face Blog',
      urlBase: 'https://huggingface.co/blog',
      category: 'tecnologia',
      priority: 9,
      ttlHours: 6,
      selectors: {
        title: ['h1'],
        content: ['article', 'main', '.prose'],
      },
    },

    // ❌ OpenAI News → 403 Forbidden

    // ══════════════════════════════════════════════════════════════════════════
    // 🔮 MISTERIO
    // ✅ Mystery Planet funciona | ❌ los 3 alternativos tienen ENOTFOUND
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'Mystery Planet',
      urlBase: 'https://mysteryplanet.com.ar/site',
      category: 'misterios',
      priority: 10, // única fuente funcional verificada en esta categoría
      ttlHours: 24,
      selectors: {
        title: ['h1', '.entry-title'],
        content: ['article', '.entry-content', 'main'],
        date: ['time', '.date', '[datetime]'],
      },
    },

    // ❌ misteriosyverdades.com → ENOTFOUND
    // ❌ sobrenatural.org → ENOTFOUND
    // ❌ urbania.com.ar → ENOTFOUND

    // ══════════════════════════════════════════════════════════════════════════
    // 🎵 MÚSICA
    // ✅ Rolling Stone AR, La Nación espectáculos, Los40 funcionan | ❌ Infobae/musica 404
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'Rolling Stone Argentina',
      urlBase: 'https://www.rollingstone.com.ar',
      category: 'musica',
      priority: 10,
      ttlHours: 12,
      selectors: {
        title: ['h1', '.entry-title', '.article-title'],
        content: ['article', '.entry-content', '.article-body', 'main'],
        date: ['time', '.date'],
      },
    },

    {
      name: 'Los 40 Argentina',
      urlBase: 'https://los40.com.ar',
      category: 'musica',
      priority: 9,
      ttlHours: 12,
      selectors: {
        title: ['h1', '.article-title'],
        content: ['article', '.article-body', 'main'],
        date: ['time', '[datetime]'],
      },
    },

    {
      name: 'La Nación Espectáculos',
      urlBase: 'https://www.lanacion.com.ar/espectaculos/musica',
      category: 'musica',
      priority: 8,
      ttlHours: 12,
      selectors: {
        title: ['h1', '.com-title'],
        content: ['article', '.nota', 'main'],
      },
    },

    // ❌ Infobae/cultura/musica → 404

    // ══════════════════════════════════════════════════════════════════════════
    // 🔮 ASTROLOGÍA
    // ⚠️ DEPRECADO (2026-06-23): Ya NO se scrapean sitios astrológicos.
    // Ahora se usa AstrologyTool con astronomy-engine para cálculos instantáneos.
    // Estas fuentes quedan comentadas para referencia histórica.
    // ══════════════════════════════════════════════════════════════════════════

    // ❌ DEPRECADO: scraping reemplazado por AstrologyTool
    // {
    //   name: 'Astro.com Horoscope',
    //   urlBase: 'https://www.astro.com',
    //   category: 'astrologia',
    //   priority: 10,
    //   ttlHours: 12,
    //   searchPattern: '/horoscope',
    //   selectors: {
    //     title: ['h1', 'h2'],
    //     content: ['main', 'article', '.forecast', '.horoscope-text', 'p'],
    //   },
    // },

    // ❌ DEPRECADO: scraping reemplazado por AstrologyTool
    // {
    //   name: 'Lunarium',
    //   urlBase: 'https://www.lunarium.co.uk',
    //   category: 'astrologia',
    //   priority: 10,
    //   ttlHours: 12,
    //   selectors: {
    //     title: ['h1', 'h2'],
    //     content: ['p', 'main', 'article', '.content'],
    //   },
    // },

    // ❌ DEPRECADO: scraping reemplazado por AstrologyTool
    // {
    //   name: 'MiAstral',
    //   urlBase: 'https://www.miastral.com',
    //   category: 'astrologia',
    //   priority: 8,
    //   ttlHours: 12,
    //   selectors: {
    //     title: ['h1', 'h2', '.titulo'],
    //     content: ['main', 'article', '.contenido', '.entry-content', 'p'],
    //   },
    // },

    // ❌ DEPRECADO: scraping reemplazado por AstrologyTool
    // {
    //   name: 'Zodiacal',
    //   urlBase: 'https://www.zodiacal.com',
    //   category: 'astrologia',
    //   priority: 7,
    //   ttlHours: 12,
    //   selectors: {
    //     title: ['h1', 'h2'],
    //     content: ['article', 'main', '.content', 'p'],
    //   },
    // },

    // ══════════════════════════════════════════════════════════════════════════
    // 📚 REFERENCIA
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'Wikipedia ES',
      urlBase: 'https://es.wikipedia.org',
      category: 'referencia',
      priority: 9,
      ttlHours: 168,
      searchPattern: '/wiki/{query}',
      selectors: {
        title: ['h1', '#firstHeading'],
        content: ['#mw-content-text', '.mw-parser-output'],
      },
    },

    {
      name: 'Plantas Medicinales (Ignacio)',
      urlBase: 'https://ifernandez89.github.io/PlantasMedicinales',
      category: 'referencia',
      priority: 8,
      ttlHours: 168,
      selectors: {
        title: ['h1', 'h2'],
        content: ['main', 'article', '.content'],
      },
    },

    // ══════════════════════════════════════════════════════════════════════════
    // 🎬 ENTRETENIMIENTO
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'When is the next MCU film',
      urlBase: 'https://whenisthenextmcufilm.com',
      category: 'entretenimiento',
      priority: 8,
      ttlHours: 24,
      selectors: {
        content: ['main', 'body', '.container'],
      },
    },

  ];

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Obtiene todas las fuentes de una categoría, ordenadas por prioridad.
   */
  static getByCategory(category: string): SourceDefinition[] {
    return this.sources
      .filter((s) => s.category === category && s.priority >= 5)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Obtiene todas las categorías disponibles.
   */
  static getCategories(): string[] {
    const cats = new Set(this.sources.map((s) => s.category));
    return Array.from(cats).sort();
  }

  /**
   * Obtiene todas las fuentes, opcionalmente filtradas.
   */
  static getAll(filter?: { category?: string; minPriority?: number }): SourceDefinition[] {
    let result = this.sources;
    if (filter?.category) result = result.filter((s) => s.category === filter.category);
    if (filter?.minPriority !== undefined) result = result.filter((s) => s.priority >= filter.minPriority);
    return result.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Busca una fuente por URL base.
   */
  static findByUrl(urlBase: string): SourceDefinition | undefined {
    return this.sources.find((s) => s.urlBase === urlBase);
  }

  /**
   * Construye una URL de búsqueda para una fuente específica.
   */
  static buildSearchUrl(source: SourceDefinition, query: string): string | null {
    if (!source.searchPattern) return null;
    const encoded = encodeURIComponent(query);
    return source.urlBase + source.searchPattern.replace('{query}', encoded);
  }

  /**
   * Retorna un resumen del estado de las fuentes por categoría.
   */
  static getSummary(): Record<string, { count: number; sources: string[] }> {
    const summary: Record<string, { count: number; sources: string[] }> = {};
    for (const s of this.sources) {
      if (!summary[s.category]) summary[s.category] = { count: 0, sources: [] };
      summary[s.category].count++;
      summary[s.category].sources.push(s.name);
    }
    return summary;
  }
}
