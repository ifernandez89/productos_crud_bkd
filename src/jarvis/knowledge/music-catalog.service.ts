import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface MusicAlbum {
  titulo: string;
  año?: string;
  totalPistas: number;
  pistasMuestra?: string[];
}

export interface MusicArtist {
  nombre: string;
  totalAlbumes: number;
  totalCanciones: number;
  generos: string[];
  estilo: string;
  moods: string[];
  albumes: MusicAlbum[];
}

export interface MusicCatalogData {
  metadata: {
    version: number;
    origenRuta: string;
    descripcion: string;
    fechaActualizacion: string;
    totalArtistas: number;
    totalAlbumes: number;
    totalCancionesEstimadas: number;
  };
  artistas: MusicArtist[];
}

export interface MusicReferencesData {
  version: number;
  totalArtistas: number;
  totalAlbumes: number;
  rutaColeccion: string;
  generosDisponibles: Record<string, string[]>;
  recomendacionesPorMood: Record<string, string[]>;
  artistas: Array<{
    nombre: string;
    generos: string[];
    totalAlbumes: number;
    albumesDestacados: string[];
    moods: string[];
  }>;
}

@Injectable()
export class MusicCatalogService {
  private readonly logger = new Logger(MusicCatalogService.name);
  private catalog: MusicCatalogData | null = null;
  private references: MusicReferencesData | null = null;

  private readonly indexPath = path.join(
    process.cwd(),
    'src',
    'jarvis',
    'knowledge',
    'music-index.json',
  );

  private readonly referencesPath = path.join(
    process.cwd(),
    'src',
    'jarvis',
    'knowledge',
    'music-references.json',
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
          `[MusicCatalog] Catálogo cargado: ${this.catalog?.artistas.length || 0} artistas`,
        );
      }
    } catch (err: any) {
      this.logger.error(`[MusicCatalog] Error cargando music-index.json: ${err.message}`);
    }
  }

  private loadReferences(): void {
    try {
      if (fs.existsSync(this.referencesPath)) {
        const raw = fs.readFileSync(this.referencesPath, 'utf-8');
        this.references = JSON.parse(raw);
      }
    } catch (err: any) {
      this.logger.error(`[MusicCatalog] Error cargando music-references.json: ${err.message}`);
    }
  }

  getCatalog(): MusicCatalogData | null {
    if (!this.catalog) this.loadCatalog();
    return this.catalog;
  }

  getReferences(): MusicReferencesData | null {
    if (!this.references) this.loadReferences();
    return this.references;
  }

  getSummaryText(): string {
    const cat = this.getCatalog();
    if (!cat) return 'No se encontró el índice de música cargado.';

    return [
      `🎵 **Colección de Música Personal de JarBees** (\`${cat.metadata.origenRuta}\`)`,
      `- **Artistas registrados:** \`${cat.metadata.totalArtistas}\``,
      `- **Álbumes / Discografías:** \`${cat.metadata.totalAlbumes}\``,
      `- **Canciones indexadas:** \`${cat.metadata.totalCancionesEstimadas}\``,
      '',
      `🎸 **Géneros y Ejes Destacados:**`,
      `• **Rock Nacional:** Gustavo Cerati, Luis Alberto Spinetta, Soda Stereo, Virus, Los Espíritus.`,
      `• **Metal Progresivo & Virtuoso:** Animals As Leaders, First Fragment, Necrophagist, Decapitated, Death, Yngwie Malmsteen.`,
      `• **Rock Clásico & Psicodélico:** Pink Floyd, Queen, The Beatles, The Doors, David Bowie.`,
      `• **Rock Alternativo, 90s & Nu Metal:** Radiohead, Nirvana, Deftones, Red Hot Chili Peppers, Linkin Park, Korn, Limp Bizkit.`,
      `• **Death Metal & Brutal:** Cannibal Corpse, Dying Fetus, Carnifex, Thy Art Is Murder, Aversions Crown.`,
      `• **Soul, Jazz & Vocal:** Amy Winehouse, Daniel Fernández Tenor, Ópera, Música Clásica.`,
      `• **Hip Hop & Urbano:** Cypress Hill, The Psycho Realm, Hacktivist, Terrible & Dj CidTronyck.`,
    ].join('\n');
  }

  findArtist(query: string): MusicArtist | null {
    const cat = this.getCatalog();
    if (!cat) return null;

    const q = query.toLowerCase().trim();
    return (
      cat.artistas.find((a) => a.nombre.toLowerCase().includes(q) || q.includes(a.nombre.toLowerCase())) ||
      null
    );
  }

  recommendByMood(mood: string): string[] {
    const refs = this.getReferences();
    if (!refs) return [];

    const norm = mood.toLowerCase().trim();
    for (const [m, artists] of Object.entries(refs.recomendacionesPorMood)) {
      if (m.includes(norm) || norm.includes(m)) {
        return artists;
      }
    }
    return [];
  }

  formatContextForQuery(query: string): string | null {
    const q = query.toLowerCase();
    const isMusicQuery = /(musica|cancion|canciones|disco|album|banda|temas|playlist|discografia|escuchar|guitarra|cantante|cantautor)/i.test(
      query,
    );
    if (!isMusicQuery) return null;

    const cat = this.getCatalog();
    if (!cat) return null;

    // Buscar si nombra a un artista específico
    const matchedArtists = cat.artistas.filter((a) => q.includes(a.nombre.toLowerCase()));

    if (matchedArtists.length > 0) {
      const details = matchedArtists.map((a) => {
        const albumsList = a.albumes
          .slice(0, 4)
          .map((alb) => `    * "${alb.titulo}" (${alb.año}) - ${alb.totalPistas} pistas`)
          .join('\n');
        return [
          `• Artista: ${a.nombre} [${a.generos.join(', ')}]`,
          `  Estilo: ${a.estilo}`,
          `  Álbumes disponibles en biblioteca (${a.totalAlbumes}):`,
          albumsList,
        ].join('\n');
      });

      return [
        `### INFORMACIÓN MUSICAL DE LA BIBLIOTECA PERSONAL (I:\\Musica):`,
        ...details,
      ].join('\n\n');
    }

    // Si es una consulta general de recomendación o catálogo musical
    return [
      `### COLECCIÓN MUSICAL PERSONAL DISPONIBLE (I:\\Musica):`,
      `Disponés de 64 artistas, 220 álbumes y más de 2.300 temas en el disco local I:\\Musica.`,
      `Principales pilares musicales del usuario:`,
      `- Prog Metal & Instrumental: Animals As Leaders, First Fragment, Necrophagist, Death.`,
      `- Rock Argentino: Gustavo Cerati, Spinetta, Soda Stereo, Virus, Los Espíritus.`,
      `- Rock Clásico & 70s/80s: Pink Floyd, Queen, The Beatles, The Doors, David Bowie.`,
      `- Alternativo & 90s/2000s: Radiohead, Nirvana, Deftones, Red Hot Chili Peppers, Linkin Park, Korn.`,
      `- Soul & Jazz: Amy Winehouse.`,
      `- Hip Hop: Cypress Hill, The Psycho Realm.`,
      `- Death Metal Extremo: Cannibal Corpse, Dying Fetus, Carnifex.`,
      `Podés sugerir o referenciar estos artistas cuando el usuario pida música o hable de canciones.`,
    ].join('\n');
  }
}
