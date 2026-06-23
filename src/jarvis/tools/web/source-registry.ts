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
    
    {
      name: 'Infobae',
      urlBase: 'https://www.infobae.com',
      category: 'noticias',
      priority: 9,
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
      name: 'Perfil',
      urlBase: 'https://www.perfil.com',
      category: 'noticias',
      priority: 8,
      ttlHours: 1,
      selectors: {
        title: ['h1', '.article-title'],
        content: ['article', '.article-content'],
      },
    },
    
    {
      name: 'Ámbito Financiero',
      urlBase: 'https://www.ambito.com',
      category: 'noticias',
      priority: 8,
      ttlHours: 1,
      selectors: {
        title: ['h1'],
        content: ['.article-body'],
      },
    },
    
    {
      name: 'El Once (Paraná)',
      urlBase: 'https://www.elonce.com',
      category: 'noticias',
      priority: 7,
      ttlHours: 2,
      selectors: {
        title: ['h1', '.titular'],
        content: ['.nota-cuerpo', 'article'],
      },
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 🌦️ CLIMA
    // ══════════════════════════════════════════════════════════════════════════
    
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
    
    {
      name: 'Windy',
      urlBase: 'https://www.windy.com',
      category: 'clima',
      priority: 9,
      ttlHours: 1,
    },
    
    {
      name: 'Ventusky',
      urlBase: 'https://www.ventusky.com',
      category: 'clima',
      priority: 8,
      ttlHours: 1,
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // ⚽ DEPORTES
    // ══════════════════════════════════════════════════════════════════════════
    
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
    
    {
      name: 'Promiedos',
      urlBase: 'https://www.promiedos.com.ar',
      category: 'deportes',
      priority: 9,
      ttlHours: 0.5,
      selectors: {
        content: ['table', '.partidos', '.resultados'],
      },
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 🔬 CIENCIA
    // ══════════════════════════════════════════════════════════════════════════
    
    {
      name: 'Agencia CyTA-Leloir',
      urlBase: 'https://www.agenciacyta.org.ar',
      category: 'ciencia',
      priority: 9,
      ttlHours: 24,
      selectors: {
        title: ['h1'],
        content: ['article', '.nota'],
      },
    },
    
    {
      name: 'CONICET',
      urlBase: 'https://www.conicet.gov.ar',
      category: 'ciencia',
      priority: 9,
      ttlHours: 24,
    },
    
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
    
    // ══════════════════════════════════════════════════════════════════════════
    // 🌌 FÍSICA
    // ══════════════════════════════════════════════════════════════════════════
    
    {
      name: 'arXiv Physics',
      urlBase: 'https://arxiv.org/list/physics/recent',
      category: 'fisica',
      priority: 10,
      ttlHours: 24,
    },
    
    {
      name: 'CERN',
      urlBase: 'https://home.cern',
      category: 'fisica',
      priority: 10,
      ttlHours: 24,
    },
    
    {
      name: 'Physics World',
      urlBase: 'https://physicsworld.com',
      category: 'fisica',
      priority: 9,
      ttlHours: 24,
    },
    
    {
      name: 'APS Physics',
      urlBase: 'https://physics.aps.org',
      category: 'fisica',
      priority: 9,
      ttlHours: 24,
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 🔢 MATEMÁTICAS
    // ══════════════════════════════════════════════════════════════════════════
    
    {
      name: 'arXiv Mathematics',
      urlBase: 'https://arxiv.org/list/math/recent',
      category: 'matematicas',
      priority: 10,
      ttlHours: 168, // 7 días
    },
    
    {
      name: 'Math StackExchange',
      urlBase: 'https://math.stackexchange.com',
      category: 'matematicas',
      priority: 9,
      ttlHours: 168,
    },
    
    {
      name: 'Quanta Magazine Mathematics',
      urlBase: 'https://www.quantamagazine.org/mathematics',
      category: 'matematicas',
      priority: 9,
      ttlHours: 168,
    },
    
    {
      name: 'American Mathematical Society',
      urlBase: 'https://www.ams.org',
      category: 'matematicas',
      priority: 10,
      ttlHours: 168,
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 🚀 INNOVACIÓN
    // ══════════════════════════════════════════════════════════════════════════
    
    {
      name: 'MIT Technology Review',
      urlBase: 'https://www.technologyreview.com',
      category: 'innovacion',
      priority: 10,
      ttlHours: 12,
    },
    
    {
      name: 'Fast Company',
      urlBase: 'https://www.fastcompany.com',
      category: 'innovacion',
      priority: 9,
      ttlHours: 12,
    },
    
    {
      name: 'World Economic Forum Technology',
      urlBase: 'https://www.weforum.org/agenda/technology',
      category: 'innovacion',
      priority: 9,
      ttlHours: 12,
    },
    
    {
      name: 'Singularity Hub',
      urlBase: 'https://singularityhub.com',
      category: 'innovacion',
      priority: 8,
      ttlHours: 12,
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 💻 TECNOLOGÍA & IA
    // ══════════════════════════════════════════════════════════════════════════
    
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
      name: 'The Verge',
      urlBase: 'https://www.theverge.com',
      category: 'tecnologia',
      priority: 9,
      ttlHours: 6,
    },
    
    {
      name: 'Hugging Face Blog',
      urlBase: 'https://huggingface.co/blog',
      category: 'tecnologia',
      priority: 10,
      ttlHours: 6,
    },
    
    {
      name: 'OpenAI News',
      urlBase: 'https://openai.com/news',
      category: 'tecnologia',
      priority: 10,
      ttlHours: 6,
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 🎬 PELÍCULAS & SERIES
    // ══════════════════════════════════════════════════════════════════════════
    
    {
      name: 'IMDb',
      urlBase: 'https://www.imdb.com',
      category: 'peliculas',
      priority: 10,
      ttlHours: 24,
    },
    
    {
      name: 'Rotten Tomatoes',
      urlBase: 'https://www.rottentomatoes.com',
      category: 'peliculas',
      priority: 10,
      ttlHours: 24,
    },
    
    {
      name: 'FilmAffinity Argentina',
      urlBase: 'https://www.filmaffinity.com/ar',
      category: 'peliculas',
      priority: 9,
      ttlHours: 24,
    },
    
    {
      name: 'Letterboxd',
      urlBase: 'https://letterboxd.com',
      category: 'peliculas',
      priority: 9,
      ttlHours: 24,
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 🎵 MÚSICA
    // ══════════════════════════════════════════════════════════════════════════
    
    {
      name: 'Rolling Stone Argentina',
      urlBase: 'https://www.rollingstone.com.ar',
      category: 'musica',
      priority: 9,
      ttlHours: 12,
    },
    
    {
      name: 'Billboard Argentina',
      urlBase: 'https://www.billboard.com/argentina',
      category: 'musica',
      priority: 10,
      ttlHours: 12,
    },
    
    {
      name: 'Pitchfork',
      urlBase: 'https://pitchfork.com',
      category: 'musica',
      priority: 9,
      ttlHours: 12,
    },
    
    {
      name: 'AllMusic',
      urlBase: 'https://www.allmusic.com',
      category: 'musica',
      priority: 9,
      ttlHours: 24,
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 📚 REFERENCIA & EDUCACIÓN
    // ══════════════════════════════════════════════════════════════════════════
    
    {
      name: 'Wikipedia ES',
      urlBase: 'https://es.wikipedia.org',
      category: 'referencia',
      priority: 8,
      ttlHours: 168, // 7 días
    },
    
    {
      name: 'Plantas Medicinales (Ignacio)',
      urlBase: 'https://ifernandez89.github.io/PlantasMedicinales',
      category: 'referencia',
      priority: 7,
      ttlHours: 168,
    },
    
    // ══════════════════════════════════════════════════════════════════════════
    // 🔮 OTROS ESPECIALIZADOS
    // ══════════════════════════════════════════════════════════════════════════
    
    {
      name: 'Mystery Planet',
      urlBase: 'https://mysteryplanet.com.ar/site',
      category: 'misterios',
      priority: 6,
      ttlHours: 48,
    },
    
    {
      name: 'Carta Natal',
      urlBase: 'https://carta-natal.es/carta.php',
      category: 'astrologia',
      priority: 5,
      ttlHours: 720, // 30 días
    },
    
    {
      name: 'When is the next MCU film',
      urlBase: 'https://whenisthenextmcufilm.com',
      category: 'entretenimiento',
      priority: 7,
      ttlHours: 24,
    },
    
    {
      name: 'JSONPlaceholder',
      urlBase: 'https://jsonplaceholder.typicode.com',
      category: 'desarrollo',
      priority: 10,
      ttlHours: 720, // 30 días (API estática)
    },
    
    {
      name: 'Mi Paraná (Municipalidad)',
      urlBase: 'https://mi.parana.gob.ar',
      category: 'gobierno',
      priority: 7,
      ttlHours: 24,
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
