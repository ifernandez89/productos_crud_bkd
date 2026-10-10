import { readdirSync, statSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, basename, extname } from 'path';

const MUSIC_DIR = 'I:\\Musica';
const OUTPUT_INDEX_PATH = join(process.cwd(), 'src/jarvis/knowledge/music-index.json');

// Clasificador heurístico de géneros y estilo para los artistas conocidos de la biblioteca
const ARTIST_METADATA = {
  'Animals As Leaders': {
    generos: ['Metal Progresivo', 'Djent', 'Instrumental'],
    estilo: 'Trío instrumental liderado por Tosin Abasi y Javier Reyes con guitarras de 8 cuerdas y batería virtuosa de Matt Garstka. Destaca por polirritmias, compases amalgama, slap/thump en guitarra y fusión con jazz y electrónica.',
    moods: ['concentracion', 'estudio', 'virtuosismo', 'energia_mental']
  },
  'Amy Winehouse': {
    generos: ['Soul', 'R&B', 'Jazz', 'Ska'],
    estilo: 'Emblemática cantautora británica con voz contralto profunda y letras autobiográficas cargadas de emotividad, vulnerabilidad y estilo retro Motown/soul de los años 60.',
    moods: ['introspeccion', 'melancolia', 'clasico', 'relajacion']
  },
  'Cannibal Corpse': {
    generos: ['Brutal Death Metal', 'Death Metal'],
    estilo: 'Pioneros del death metal norteamericano con bajo virtuoso de Alex Webster, guturales icónicos de George Corpsegrinder Fisher y letras extremas.',
    moods: ['fuerza', 'entrenamiento', 'adrenalina', 'pesado']
  },
  'Gustavo Cerati': {
    generos: ['Rock Nacional', 'Art Rock', 'Pop Rock', 'Electronica'],
    estilo: 'Figura máxima del rock hispanoamericano y líder de Soda Stereo. Letras poéticas y vanguardia en guitarra y producción sonora (Amor Amarillo, Bocanada, Ahí Vamos, Fuerza Natural).',
    moods: ['introspeccion', 'viaje_musical', 'poesia', 'clasico_argentino']
  },
  'Luis Alberto Spinetta': {
    generos: ['Rock Nacional', 'Jazz Rock', 'Poesía Musical'],
    estilo: 'El "Flaco" Spinetta, prócer absoluto de la música argentina. Complejidad armónica jazzera, lírica surrealista y profundidad filosófica incomparable.',
    moods: ['filosofico', 'introspeccion', 'poesia', 'arte_puro']
  },
  'Soda Stereo': {
    generos: ['Rock Nacional', 'New Wave', 'Post-Punk', 'Pop Rock'],
    estilo: 'Banda argentina más influyente de América Latina liderada por Cerati, Zeta Bosio y Charly Alberti. Evolución desde new wave ochentoso hasta dream pop y rock alternativo.',
    moods: ['energia', 'nostalgia', 'clasico_argentino']
  },
  'Virus': {
    generos: ['Rock Nacional', 'Synthpop', 'New Wave'],
    estilo: 'Banda fundamental del pop/rock argentino de los 80 liderada por Federico Moura. Letras irónicas, bailables y sofisticación en sintetizadores.',
    moods: ['alegria', 'ritmo', 'nostalgia_80s']
  },
  'Pink Floyd': {
    generos: ['Rock Progresivo', 'Rock Psicodélico', 'Art Rock'],
    estilo: 'Monumentos conceptuales de la música moderna (Waters, Gilmour, Wright, Mason). Exploración de la locura, el tiempo, la codicia humana y atmósferas sonoras espaciales.',
    moods: ['viaje_mental', 'profundidad', 'filosofico', 'concentracion']
  },
  'Radiohead': {
    generos: ['Art Rock', 'Rock Alternativo', 'Electronica Experimental'],
    estilo: 'Innovadores británicos liderados por Thom Yorke y Jonny Greenwood. Melancolía, existencialismo, arreglos orquestales y experimentación sonora vanguardista.',
    moods: ['introspeccion', 'vanguardia', 'nostalgia', 'estudio']
  },
  'Nirvana': {
    generos: ['Grunge', 'Rock Alternativo', 'Punk Rock'],
    estilo: 'Trío de Seattle liderado por Kurt Cobain que definió los años 90. Rabia cruda, melodías pegadizas y angustia generacional.',
    moods: ['rebeldia', 'catarsis', 'energia_cruda']
  },
  'Deftones': {
    generos: ['Metal Alternativo', 'Shoegaze', 'Nu Metal'],
    estilo: 'Contraste único entre agresividad pesada y texturas etéreas sensuales creadas por Chino Moreno y Stephen Carpenter.',
    moods: ['atmosfera', 'energia_intensa', 'sueño']
  },
  'Depeche Mode': {
    generos: ['Synthpop', 'Darkwave', 'New Wave', 'Rock Electrónico'],
    estilo: 'Pioneros británicos del pop oscuro y sintetizadores industriales con la voz barítono de Dave Gahan y la composición de Martin Gore.',
    moods: ['nocturno', 'ritmo_oscuro', 'clasico']
  },
  'The Beatles': {
    generos: ['Rock Clásico', 'Pop Psicodélico', 'Merseybeat'],
    estilo: 'El cuarteto de Liverpool que revolucionó la música popular. Innovación compositiva y arreglos irrepetibles (Lennon, McCartney, Harrison, Starr).',
    moods: ['optimismo', 'clasico_universal', 'creatividad']
  },
  'The Doors': {
    generos: ['Rock Psicodélico', 'Blues Rock', 'Poesía'],
    estilo: 'Jim Morrison y su poesía chamánica, teclado hipnótico de Ray Manzarek y blues psicodélico de finales de los 60.',
    moods: ['misticismo', 'chamanico', 'nocturno']
  },
  'Queen': {
    generos: ['Rock Clásico', 'Glam Rock', 'Hard Rock', 'Ópera Rock'],
    estilo: 'La voz colosal de Freddie Mercury y la guitarra única de Brian May. Teatralidad operística, himnos mundiales y virtuosismo vocal.',
    moods: ['motivacion', 'himno', 'energia_positiva']
  },
  'Cypress Hill': {
    generos: ['Hip Hop', 'West Coast Rap', 'Hardcore Hip Hop'],
    estilo: 'Leyendas del rap chicano de California con B-Real, Sen Dog y Muggs. Beats pesados, percusiones latinas y estética urbana inconfundible.',
    moods: ['groove', 'urbano', 'calle']
  },
  'The Psycho Realm': {
    generos: ['Underground Hip Hop', 'Hardcore Rap'],
    estilo: 'Dúo de Los Ángeles (Sick Jacken y Big Duke). Crítica social cruda, filosofía de supervivencia urbana y beats sombríos.',
    moods: ['reflexion_urbana', 'crudo', 'nocturno']
  },
  'Decapitated': {
    generos: ['Technical Death Metal', 'Groove Metal'],
    estilo: 'Referentes polacos del death metal técnico con riffs hiper-precisos del guitarrista Vogg.',
    moods: ['precision', 'pesadez', 'tecnico']
  },
  'Death': {
    generos: ['Death Metal Progresivo', 'Pioneros del Death Metal'],
    estilo: 'Fundada por Chuck Schuldiner ("el padre del death metal"). Evolucionó hacia un virtuosismo progresivo con letras filosóficas sobre la mente y el destino.',
    moods: ['filosofico', 'virtuosismo_metal', 'tecnico']
  },
  'Necrophagist': {
    generos: ['Technical Death Metal', 'Neoclassical Metal'],
    estilo: 'Obra maestra de Muhammed Suiçmez. Fusión de música clásica barroca con el death metal más veloz y quirúrgico de la historia.',
    moods: ['virtuosismo_extremo', 'cirugia_musical']
  },
  'First Fragment': {
    generos: ['Neoclassical Technical Death Metal', 'Flamenco Metal'],
    estilo: 'Banda canadiense que fusiona flamenco, guitarra clásica española y death metal técnico deslumbrante con bajo fretless.',
    moods: ['virtuosismo', 'complejidad', 'epico']
  },
  'Red Hot Chili Peppers': {
    generos: ['Funk Rock', 'Rock Alternativo'],
    estilo: 'Fusión de funk y rock con las líneas de bajo de Flea, las guitarras emotivas de John Frusciante y la voz de Anthony Kiedis.',
    moods: ['groove', 'energia', 'buena_vibra']
  },
  'Korn': {
    generos: ['Nu Metal', 'Metal Alternativo'],
    estilo: 'Pioneros del nu metal con bajos de 5 cuerdas slapeados por Fieldy, guitarras de 7 cuerdas afinadas graves y la catarsis emocional de Jonathan Davis.',
    moods: ['catarsis', 'pesado', 'emocional']
  },
  'Linkin Park': {
    generos: ['Nu Metal', 'Rock Alternativo', 'Rock Electrónico'],
    estilo: 'Fusión de rap, electrónica y rock pesado con el contraste entre Mike Shinoda y la legendaria voz desgarradora de Chester Bennington.',
    moods: ['energia', 'nostalgia_2000s', 'motivacion']
  },
  'Yngwie Malmsteen': {
    generos: ['Neoclassical Metal', 'Power Metal', 'Shred'],
    estilo: 'Padre del shred neoclásico en guitarra eléctrica, llevando las influencias de Bach y Paganini a la velocidad de la luz en su Stratocaster.',
    moods: ['virtuosismo_guitarra', 'neoclasico', 'velocidad']
  },
  'Los Espiritus': {
    generos: ['Blues Rock', 'Rock Psicodélico', 'Ritmos Latinos'],
    estilo: 'Banda argentina contemporánea que combina blues nocturno, letras de trance citadino y percusiones envolventes.',
    moods: ['trance', 'nocturno', 'blues']
  },
  'David Bowie': {
    generos: ['Art Rock', 'Glam Rock', 'Pop Vanguardista'],
    estilo: 'El camaleón del rock. Reinventor de personajes (Ziggy Stardust, Thin White Duke) y explorador de géneros a lo largo de 5 décadas.',
    moods: ['creatividad', 'vanguardia', 'elegancia']
  }
};

function cleanName(str) {
  return str
    .replace(/\s*\[.*?\]/g, '')
    .replace(/\s*\(.*?\)/g, '')
    .replace(/\.mp3$|\.wav$|\.flac$/i, '')
    .replace(/^\d+[\.\-\s]+/, '')
    .trim();
}

function scanMusicCatalog() {
  console.log(`[MusicIndexer] Escaneando directorio: ${MUSIC_DIR}...`);
  if (!existsSync(MUSIC_DIR)) {
    console.error(`[MusicIndexer] No se encontró la ruta: ${MUSIC_DIR}`);
    process.exit(1);
  }

  const entries = readdirSync(MUSIC_DIR, { withFileTypes: true });
  const artists = [];
  let totalAlbums = 0;
  let totalTracks = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const artistName = entry.name.trim();

    // Omitir carpetas de herramientas/DAW que no son artistas musicales
    if (['FL Studio 20', 'Recording', 'Phone Card Recording', 'Audiolibros y mas', 'CONVERTS'].includes(artistName)) {
      continue;
    }

    const artistPath = join(MUSIC_DIR, artistName);
    const albums = [];

    // Inspeccionar si contiene álbumes como subcarpetas o canciones directas
    const subEntries = readdirSync(artistPath, { withFileTypes: true });
    const subDirs = subEntries.filter(e => e.isDirectory());
    const directAudioFiles = subEntries.filter(e => !e.isDirectory() && /\.(mp3|wav|flac|m4a)$/i.test(e.name));

    if (directAudioFiles.length > 0) {
      // Álbum o temas sueltos en raíz del artista
      const tracks = directAudioFiles.map(f => cleanName(f.name));
      albums.push({
        titulo: `${artistName} (Pistas Directas / Singles)`,
        año: 'Varios',
        totalPistas: tracks.length,
        pistasMuestra: tracks.slice(0, 10)
      });
      totalAlbums += 1;
      totalTracks += tracks.length;
    }

    for (const subDir of subDirs) {
      const albumTitle = subDir.name.trim();
      const albumPath = join(artistPath, albumTitle);
      
      let albumFiles = [];
      try {
        albumFiles = readdirSync(albumPath, { withFileTypes: true })
          .filter(f => !f.isDirectory() && /\.(mp3|wav|flac|m4a)$/i.test(f.name));
      } catch (e) {
        continue;
      }

      if (albumFiles.length === 0) continue;

      // Intentar extraer año del nombre de carpeta (ej: "2014 - The Joy Of Motion" o "Back To Black (2006)")
      let year = undefined;
      const yearMatch = albumTitle.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) year = yearMatch[1];

      const tracks = albumFiles.map(f => cleanName(f.name));
      albums.push({
        titulo: albumTitle,
        año: year || 'No especificado',
        totalPistas: tracks.length,
        pistasMuestra: tracks.slice(0, 8)
      });

      totalAlbums += 1;
      totalTracks += tracks.length;
    }

    if (albums.length > 0) {
      const meta = ARTIST_METADATA[artistName] || {
        generos: ['Música / Variado'],
        estilo: `Banda / Artista presente en la biblioteca personal (${albums.length} álbumes, ${albums.reduce((a, b) => a + b.totalPistas, 0)} temas).`,
        moods: ['general', 'escucha']
      };

      artists.push({
        nombre: artistName,
        totalAlbumes: albums.length,
        totalCanciones: albums.reduce((a, b) => a + b.totalPistas, 0),
        generos: meta.generos,
        estilo: meta.estilo,
        moods: meta.moods,
        albumes: albums
      });
    }
  }

  // Ordenar alfabéticamente
  artists.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const catalog = {
    metadata: {
      version: 1,
      origenRuta: MUSIC_DIR,
      descripcion: 'Índice y Catálogo de Conocimiento Musical Personal de JarBees',
      fechaActualizacion: new Date().toISOString(),
      totalArtistas: artists.length,
      totalAlbumes: totalAlbums,
      totalCancionesEstimadas: totalTracks
    },
    artistas: artists
  };

  writeFileSync(OUTPUT_INDEX_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`[MusicIndexer] ✅ Catálogo generado exitosamente:`);
  console.log(`- Artistas: ${artists.length}`);
  console.log(`- Álbumes: ${totalAlbums}`);
  console.log(`- Canciones: ${totalTracks}`);
  console.log(`- Guardado en: ${OUTPUT_INDEX_PATH}`);

  return catalog;
}

scanMusicCatalog();
