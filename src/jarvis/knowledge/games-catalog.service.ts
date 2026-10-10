import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface GameEntry {
  id: string;
  titulo: string;
  saga: string;
  desarrollador: string;
  año: number;
  genero: string[];
  estilo: string;
  modos: string[];
  moods: string[];
  estado: string;
  carpeta: string;
  ejecutables?: string[];
  civilizacionesDestacadas?: string[];
  mapasLegendarios?: string[];
  armasIconicas?: string[];
  clases?: string[];
  supervivientes?: string[];
  infectadosEspeciales?: string[];
  campañas?: string[];
  armasMiticas?: string[];
  protagonistas?: string[];
  emuladores?: string[];
  juegosDestacados?: string[];
  caracteristicas?: string[];
  descripcion: string;
}

export interface GamesCatalogData {
  metadata: {
    version: number;
    origenRuta: string;
    descripcion: string;
    fechaActualizacion: string;
    totalJuegos: number;
    totalFuncionalesDirectos: number;
  };
  juegos: GameEntry[];
}

export interface GamesReferencesData {
  version: number;
  totalJuegos: number;
  totalFuncionalesDirectos: number;
  rutaColeccion: string;
  generosDisponibles: Record<string, string[]>;
  recomendacionesPorMood: Record<string, string[]>;
  juegos: Array<{
    id: string;
    titulo: string;
    saga: string;
    genero: string[];
    estado: string;
    moods: string[];
    carpeta: string;
  }>;
}

@Injectable()
export class GamesCatalogService {
  private readonly logger = new Logger(GamesCatalogService.name);
  private catalog: GamesCatalogData | null = null;
  private references: GamesReferencesData | null = null;

  private readonly indexPath = path.join(
    process.cwd(),
    'src',
    'jarvis',
    'knowledge',
    'games-index.json',
  );

  private readonly referencesPath = path.join(
    process.cwd(),
    'src',
    'jarvis',
    'knowledge',
    'games-references.json',
  );

  constructor() {
    this.loadCatalog();
    this.loadReferences();
  }

  private loadCatalog(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw = fs.readFileSync(this.indexPath, 'utf-8');
        this.catalog = JSON.parse(raw);
        this.logger.log(
          `[GamesCatalog] Catálogo cargado: ${this.catalog?.juegos.length || 0} juegos`,
        );
      }
    } catch (err: any) {
      this.logger.error(`[GamesCatalog] Error cargando games-index.json: ${err.message}`);
    }
  }

  private loadReferences(): void {
    try {
      if (fs.existsSync(this.referencesPath)) {
        const raw = fs.readFileSync(this.referencesPath, 'utf-8');
        this.references = JSON.parse(raw);
      }
    } catch (err: any) {
      this.logger.error(`[GamesCatalog] Error cargando games-references.json: ${err.message}`);
    }
  }

  public isAvailable(): boolean {
    return this.catalog !== null && (this.catalog.juegos.length || 0) > 0;
  }

  public getSummary(): string {
    if (!this.catalog) return 'Catálogo de videojuegos no disponible.';
    const { totalJuegos, totalFuncionalesDirectos } = this.catalog.metadata;
    return `🎮 **Biblioteca Gamer (I:\\Juegos)**: ${totalJuegos} títulos catalogados (${totalFuncionalesDirectos} funcionales y listos para jugar). Incluye sagas míticas como Age of Empires II, Diablo I & II, Left 4 Dead, Counter-Strike 1.6, Worms, Mortal Kombat y suites de emulación retro.`;
  }

  public getSummaryText(): string {
    if (!this.catalog) return 'No se encontró el índice de videojuegos cargado.';

    return [
      `🎮 **Biblioteca de Videojuegos de JarBees** (\`${this.catalog.metadata.origenRuta}\`)`,
      `- **Títulos catalogados:** \`${this.catalog.metadata.totalJuegos}\``,
      `- **Juegos 100% funcionales directos:** \`${this.catalog.metadata.totalFuncionalesDirectos}\``,
      '',
      `🕹️ **Juegos Destacados Listos para Jugar:**`,
      `• **Age of Empires II: The Conquerors** — Estrategia histórica en tiempo real (18 civilizaciones, 4 edades, campañas completas).`,
      `• **Diablo II: Lord of Destruction** — Action RPG Hack & Slash (5 actos, 7 clases, palabras rúnicas, looteo legendario).`,
      `• **Left 4 Dead** — Survival Horror cooperativo de zombis con AI Director (Bill, Zoey, Francis, Louis vs Tank, Witch, etc.).`,
      `• **Counter-Strike 1.6** — FPS táctico competitivo (partidas LAN/Online y bots, de_dust2, de_inferno, cs_assault).`,
      `• **Diablo I** — Clásico gótico oscuro (Tristram, 16 niveles de mazmorras subterráneas hasta el infierno).`,
      `• **Worms Reloaded / Armageddon / WWP** — Estrategia de artillería por turnos (Granada Santa, Super Banana, Burro de Cemento).`,
      `• **Chess Titans** — Ajedrez 3D clásico con 10 niveles de IA.`,
      `• **Mortal Kombat: Shaolin Monks** — Aventura beat 'em up cooperativa de PS2 (Liu Kang y Kung Lao).`,
      `• **Hours of Fun & Emulación** — Emulador Redream (Sega Dreamcast a 60 FPS) y colección de ROMs retro.`,
      `• **Flashes & Arcade** — Colección de clásicos Flash autónomos (Boxhead 2Play, Gunblood Reborn).`,
    ].join('\n');
  }

  public search(query: string): GameEntry[] {
    if (!this.catalog) return [];
    const q = query.toLowerCase().trim();
    return this.catalog.juegos.filter(
      (j) =>
        j.titulo.toLowerCase().includes(q) ||
        j.saga.toLowerCase().includes(q) ||
        j.genero.some((g) => g.toLowerCase().includes(q)) ||
        j.moods.some((m) => m.toLowerCase().includes(q)) ||
        j.descripcion.toLowerCase().includes(q),
    );
  }

  public getByMood(mood: string): GameEntry[] {
    if (!this.catalog) return [];
    const m = mood.toLowerCase().trim();
    return this.catalog.juegos.filter((j) =>
      j.moods.some((moodItem) => moodItem.toLowerCase().includes(m)),
    );
  }

  public getByGenre(genre: string): GameEntry[] {
    if (!this.catalog) return [];
    const g = genre.toLowerCase().trim();
    return this.catalog.juegos.filter((j) =>
      j.genero.some((gen) => gen.toLowerCase().includes(g)),
    );
  }

  public getAllGames(): GameEntry[] {
    return this.catalog ? this.catalog.juegos : [];
  }

  public getPlayableGames(): GameEntry[] {
    if (!this.catalog) return [];
    return this.catalog.juegos.filter((j) => j.estado.includes('100% Funcional'));
  }

  public formatPromptContext(): string {
    if (!this.catalog) return '';
    const playable = this.getPlayableGames();
    const lineas = playable.map(
      (j) =>
        `- **${j.titulo}** (${j.genero.join(', ')}): ${j.estilo}. Modos: ${j.modos.join(' | ')}. Carpeta: ${j.carpeta}`,
    );

    return [
      `### [CONTEXTO LOCAL - BIBLIOTECA DE VIDEOJUEGOS DISPONIBLE EN I:\\Juegos]`,
      `El usuario tiene instalada y lista para jugar la siguiente colección personal:`,
      ...lineas,
      `Usa este conocimiento con entusiasmo si el usuario pregunta qué jugar, consejos para partidas, lore, estrategias o recomendaciones según su estado de ánimo.`,
    ].join('\n');
  }

  public formatContextForQuery(query: string): string | null {
    if (!this.catalog) return null;
    const q = query.toLowerCase();

    const isGamingQuery =
      /(juego|juegos|videojuego|videojuegos|gaming|gamer|viciar|partida|jugar|emulador|aoe|age of empires|diablo|counter|cs\s*1\.6|left 4 dead|l4d|worms|mortal kombat|chess|ajedrez)/i.test(
        query,
      );
    if (!isGamingQuery) return null;

    const matched = this.catalog.juegos.filter(
      (j) =>
        q.includes(j.titulo.toLowerCase()) ||
        q.includes(j.saga.toLowerCase()) ||
        (j.id === 'aoe2' && /(age|aoe)/i.test(q)) ||
        (j.id === 'cs16' && /(counter|cs|cstrike)/i.test(q)) ||
        (j.id === 'l4d' && /(left 4 dead|l4d)/i.test(q)) ||
        (j.id === 'diablo2' && /diablo/i.test(q)) ||
        (j.id === 'worms_reloaded' && /worms/i.test(q)) ||
        (j.id === 'mk_shaolin_monks' && /(mortal kombat|shaolin)/i.test(q)),
    );

    if (matched.length > 0) {
      const details = matched.map((j) => {
        const extra: string[] = [];
        if (j.clases?.length) extra.push(`  Clases: ${j.clases.join(', ')}`);
        if (j.civilizacionesDestacadas?.length)
          extra.push(`  Civilizaciones: ${j.civilizacionesDestacadas.join(', ')}`);
        if (j.supervivientes?.length)
          extra.push(`  Supervivientes: ${j.supervivientes.join(', ')}`);
        if (j.infectadosEspeciales?.length)
          extra.push(
            `  Infectados especiales: ${j.infectadosEspeciales.join(', ')}`,
          );
        if (j.armasMiticas?.length)
          extra.push(`  Armas míticas: ${j.armasMiticas.join(', ')}`);
        if (j.mapasLegendarios?.length)
          extra.push(`  Mapas clásicos: ${j.mapasLegendarios.join(', ')}`);

        return [
          `• **${j.titulo}** [${j.genero.join(', ')}] - Estado: ${j.estado}`,
          `  Estilo: ${j.estilo}`,
          `  Modos: ${j.modos.join(' | ')}`,
          `  Moods: ${j.moods.join(', ')}`,
          ...extra,
          `  Resumen: ${j.descripcion}`,
        ].join('\n');
      });

      return [
        `### INFORMACIÓN DE VIDEOJUEGOS DISPONIBLES EN LA BIBLIOTECA (I:\\Juegos):`,
        ...details,
      ].join('\n\n');
    }

    return this.formatPromptContext();
  }
}
