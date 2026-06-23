/**
 * SourceRegistry — Catálogo de fuentes confiables priorizadas por categoría.
 * 
 * Cada categoría tiene sus propias fuentes con:
 * - priority: 1-10 (mayor = más confiable)
 * - ttlHours: tiempo de vida del contenido en caché
 * - selectors: selectores específicos para extracción de contenido
 */

export interface SourceDefinition {
  name: string;
  urlBase: string;
  category: string;
  priority: number;
  ttlHours: number;
  searchPattern?: string; // patrón de URL para búsquedas, ej: "/search?q={query}"
  selectors?: {
    title?: string[];
    content?: string[];
    date?: string[];
    author?: string[];
  };
}

export class SourceRegistry {

  private static readonly sources: SourceDefinition[] = [

    // ══════════════════════════════════════════════════════════════════════════
    // 📰 NOTICIAS GENERALES — Argentina
    // ══════════════════════════════════════════════════════════════════════════
    // NOTA: Empezamos con 3 fuentes confiables. Agregar más basado en analytics.

    {
      name: 'Infobae',
      urlBase: 'https://www.infobae.com',
      category: 'noticias',
      priority: 10,
      ttlHours: 1,
      searchPattern: '/buscar?q={query}',
      selectors: {
        title: ['.headline', 'h1', '.article-title'],
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

    {
      name: 'El Once (Paraná)',
      urlBase: 'https://www.elonce.com',
      category: 'noticias',
      priority: 9, // sube de 8 a 9 — fuente local principal
      ttlHours: 1,  // baja de 2h a 1h — noticias cambian rápido
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
      priority: 8,
      ttlHours: 1,
      searchPattern: '/search?q={query}',
      selectors: {
        title: ['h1', '.article-title', '.nota-titulo'],
        content: ['article', '.article-body', '.nota-cuerpo', 'main'],
        date: ['time', '.date', '[datetime]'],
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

    {
      name: 'Mi Paraná (Municipalidad)',
      urlBase: 'https://mi.parana.gob.ar',
      category: 'gobierno',
      priority: 9,
      ttlHours: 6,
      selectors: {
        title: ['h1', '.page-title'],
        content: ['main', '.content', 'article'],
      },
    },

    // COMENTADO — Agregar si se detecta demanda en analytics:
    // {
    //   name: 'Perfil',
    //   urlBase: 'https://www.perfil.com',
    //   category: 'noticias',
    //   priority: 8,
    //   ttlHours: 1,
    // },
    // {
    //   name: 'Ámbito Financiero',
    //   urlBase: 'https://www.ambito.com',
    //   category: 'noticias',
    //   priority: 8,
    //   ttlHours: 1,
    // },

    // ══════════════════════════════════════════════════════════════════════════
    // 🌦️ CLIMA
    // ══════════════════════════════════════════════════════════════════════════
    // NOTA: 2 fuentes confiables oficiales. Más no suele ser necesario.

    {
      name: 'Meteored Argentina',
      urlBase: 'https://www.meteored.com.ar',
      category: 'clima',
      priority: 10,
      ttlHours: 1,
      selectors: {
        content: ['.weather-info', '.forecast', '.clima-actual'],
      },
    },

    {
      name: 'SMN (Servicio Meteorológico Nacional)',
      urlBase: 'https://www.smn.gob.ar',
      category: 'clima',
      priority: 10,
      ttlHours: 1,
      selectors: {
        content: ['.pronostico', '.clima'],
      },
    },

    // COMENTADO — Agregar si se necesita mayor cobertura:
    // {
    //   name: 'Windy',
    //   urlBase: 'https://www.windy.com',
    //   category: 'clima',
    //   priority: 9,
    //   ttlHours: 1,
    // },
    // {
    //   name: 'Ventusky',
    //   urlBase: 'https://www.ventusky.com',
    //   category: 'clima',
    //   priority: 8,
    //   ttlHours: 1,
    // },

    // ══════════════════════════════════════════════════════════════════════════
    // ⚽ DEPORTES
    // ══════════════════════════════════════════════════════════════════════════
    // NOTA: Top 3 fuentes deportivas argentinas más confiables.

    {
      name: 'TyC Sports',
      urlBase: 'https://www.tycsports.com',
      category: 'deportes',
      priority: 10,
      ttlHours: 0.5, // 30 minutos
      searchPattern: '/buscar?q={query}',
      selectors: {
        title: ['h1', '.article-title'],
        content: ['.article-body', '.nota-body'],
        date: ['time', '.date'],
      },
    },

    {
      name: 'ESPN Argentina',
      urlBase: 'https://espndeportes.espn.com',
      category: 'deportes',
      priority: 10,
      ttlHours: 0.5,
      selectors: {
        title: ['h1'],
        content: ['article', '.article-body'],
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
        content: ['.nota-texto'],
      },
    },

    // COMENTADO — Promiedos es útil pero estructura de tabla compleja:
    // {
    //   name: 'Promiedos',
    //   urlBase: 'https://www.promiedos.com.ar',
    //   category: 'deportes',
    //   priority: 9,
    //   ttlHours: 0.5,
    //   selectors: {
    //     content: ['table', '.partidos', '.resultados'],
    //   },
    // },

    // ══════════════════════════════════════════════════════════════════════════
    // 🔬 CIENCIA & TECNOLOGÍA
    // ══════════════════════════════════════════════════════════════════════════
    // NOTA: Top 3 más confiables por categoría.

    // Ciencia general
    {
      name: 'Nature News',
      urlBase: 'https://www.nature.com/news',
      category: 'ciencia',
      priority: 10,
      ttlHours: 24,
    },

    {
      name: 'Science News',
      urlBase: 'https://www.sciencenews.org',
      category: 'ciencia',
      priority: 10,
      ttlHours: 24,
    },

    {
      name: 'CONICET',
      urlBase: 'https://www.conicet.gov.ar',
      category: 'ciencia',
      priority: 9,
      ttlHours: 24,
    },

    // Tecnología & IA
    {
      name: 'TechCrunch',
      urlBase: 'https://techcrunch.com',
      category: 'tecnologia',
      priority: 10,
      ttlHours: 6,
    },

    {
      name: 'Ars Technica',
      urlBase: 'https://arstechnica.com',
      category: 'tecnologia',
      priority: 10,
      ttlHours: 6,
    },

    {
      name: 'Hugging Face Blog',
      urlBase: 'https://huggingface.co/blog',
      category: 'tecnologia',
      priority: 10,
      ttlHours: 6,
    },

    // ══════════════════════════════════════════════════════════════════════════
    // 📚 REFERENCIA & ESPECIALIZADOS
    // ══════════════════════════════════════════════════════════════════════════

    {
      name: 'Wikipedia ES',
      urlBase: 'https://es.wikipedia.org',
      category: 'referencia',
      priority: 9,
      ttlHours: 168, // 7 días
    },

    {
      name: 'Plantas Medicinales (Ignacio)',
      urlBase: 'https://ifernandez89.github.io/PlantasMedicinales',
      category: 'referencia',
      priority: 8,
      ttlHours: 168,
    },

    // COMENTADO — Agregar cuando haya demanda específica:

    // Ciencia local Argentina
    // {
    //   name: 'Agencia CyTA-Leloir',
    //   urlBase: 'https://www.agenciacyta.org.ar',
    //   category: 'ciencia',
    //   priority: 9,
    //   ttlHours: 24,
    // },

    // Física especializada
    // {
    //   name: 'arXiv Physics',
    //   urlBase: 'https://arxiv.org/list/physics/recent',
    //   category: 'fisica',
    //   priority: 10,
    //   ttlHours: 24,
    // },
    // {
    //   name: 'CERN',
    //   urlBase: 'https://home.cern',
    //   category: 'fisica',
    //   priority: 10,
    //   ttlHours: 24,
    // },

    // Matemáticas
    // {
    //   name: 'arXiv Mathematics',
    //   urlBase: 'https://arxiv.org/list/math/recent',
    //   category: 'matematicas',
    //   priority: 10,
    //   ttlHours: 168,
    // },
    // {
    //   name: 'Math StackExchange',
    //   urlBase: 'https://math.stackexchange.com',
    //   category: 'matematicas',
    //   priority: 9,
    //   ttlHours: 168,
    // },

    // Innovación
    // {
    //   name: 'MIT Technology Review',
    //   urlBase: 'https://www.technologyreview.com',
    //   category: 'innovacion',
    //   priority: 10,
    //   ttlHours: 12,
    // },

    // Más tecnología
    // {
    //   name: 'The Verge',
    //   urlBase: 'https://www.theverge.com',
    //   category: 'tecnologia',
    //   priority: 9,
    //   ttlHours: 6,
    // },
    // {
    //   name: 'OpenAI News',
    //   urlBase: 'https://openai.com/news',
    //   category: 'tecnologia',
    //   priority: 10,
    //   ttlHours: 6,
    // },

    // Entretenimiento
    // {
    //   name: 'IMDb',
    //   urlBase: 'https://www.imdb.com',
    //   category: 'peliculas',
    //   priority: 10,
    //   ttlHours: 24,
    // },
    // {
    //   name: 'Rotten Tomatoes',
    //   urlBase: 'https://www.rottentomatoes.com',
    //   category: 'peliculas',
    //   priority: 10,
    //   ttlHours: 24,
    // },
    // {
    //   name: 'Billboard Argentina',
    //   urlBase: 'https://www.billboard.com/argentina',
    //   category: 'musica',
    //   priority: 10,
    //   ttlHours: 12,
    // },

    // Otros especializados
    // {
    //   name: 'Mystery Planet',
    //   urlBase: 'https://mysteryplanet.com.ar/site',
    //   category: 'misterios',
    //   priority: 6,
    //   ttlHours: 48,
    // },
    // {
    //   name: 'When is the next MCU film',
    //   urlBase: 'https://whenisthenextmcufilm.com',
    //   category: 'entretenimiento',
    //   priority: 7,
    //   ttlHours: 24,
    // },
    // {
    //   name: 'Mi Paraná (Municipalidad)',
    //   urlBase: 'https://mi.parana.gob.ar',
    //   category: 'gobierno',
    //   priority: 7,
    //   ttlHours: 24,
    // },
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

    if (filter?.category) {
      result = result.filter((s) => s.category === filter.category);
    }

    if (filter?.minPriority !== undefined) {
      result = result.filter((s) => s.priority >= filter.minPriority);
    }

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
}
