import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Cargar variables de entorno
const envPath = join(__dirname, '../.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?/);
    if (match) process.env[match[1]] = match[2].trim();
  }
}

const prisma = new PrismaClient();
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3:latest';

async function generateEmbedding(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text })
  });
  if (!res.ok) throw new Error(`Ollama embedding error: ${res.statusText}`);
  const data = await res.json();
  return data.embedding;
}

const chunksContent = [
  {
    title: 'Visión General de la Colección Musical Personal (I:\\Musica)',
    content: `CATÁLOGO MUSICAL PERSONAL DE JARBEES (I:\\Musica)
Colección física y digital compuesta por 64 artistas principales, 220 álbumes y más de 2.360 pistas de audio en formatos MP3, WAV y FLAC.
La biblioteca abarca una rica diversidad que comprende:
1. Rock Nacional y Poesía Musical Argentina (Gustavo Cerati, Luis Alberto Spinetta, Soda Stereo, Virus, Los Espíritus).
2. Metal Progresivo, Djent y Virtuosismo Instrumental (Animals As Leaders, First Fragment, Necrophagist, Yngwie Malmsteen).
3. Rock Clásico y Psicodelia (Pink Floyd, Queen, The Beatles, The Doors, David Bowie).
4. Rock Alternativo, Grunge y Nu Metal de los 90 y 2000 (Radiohead, Nirvana, Deftones, Red Hot Chili Peppers, Linkin Park, Korn, Limp Bizkit).
5. Death Metal Técnico y Metal Extremo (Death, Decapitated, Cannibal Corpse, Dying Fetus, Carnifex, Thy Art Is Murder).
6. Hip Hop y Rap Urbano (Cypress Hill, The Psycho Realm, Hacktivist, Terrible & Dj CidTronyck).
7. Soul, Jazz, Música Clásica y Ópera (Amy Winehouse, Daniel Fernández Tenor, Ópera, Música Clásica).
8. Producción musical propia en DAWs (FL Studio 20, Studio One con proyectos .song).`
  },
  {
    title: 'Rock Nacional y Vanguardia Musical Argentina',
    content: `COLECCIÓN DE ROCK NACIONAL ARGENTINO (I:\\Musica)
- Gustavo Cerati: Discografía solista completa y obras cumbres (Amor Amarillo, Bocanada, Ahí Vamos, Fuerza Natural). Art rock, pop rock y vanguardia sonora.
- Luis Alberto Spinetta: Prócer de la música argentina. Complejidad armónica jazzera, letras surrealistas y profundidad filosófica.
- Soda Stereo: Discografía emblemática de la banda más trascendente de Iberoamérica. Desde new wave hasta rock alternativo y dream pop (Signos, Canción Animal, Dynamo, Sueño Stereo).
- Virus: Discografía con Federico Moura. New wave, synthpop sofisticado y letras irónicas y bailables de los 80.
- Los Espíritus: Blues psicodélico contemporáneo, trance rítmico nocturno y percusiones envolventes.
Recomendación para escuchar: Para introspección, poesía y profundidad reflexiva.`
  },
  {
    title: 'Metal Progresivo, Djent y Shred Instrumental',
    content: `METAL PROGRESIVO Y VIRTUOSISMO INSTRUMENTAL (I:\\Musica)
- Animals As Leaders: Trío instrumental formado por Tosin Abasi y Javier Reyes en guitarras de 8 cuerdas y Matt Garstka en batería. Álbumes disponibles: Animals As Leaders (2009), Wave Of Babies, Weightless (2011), The Joy Of Motion (2014) con temas como Physical Education, Ka$cade y The Woven Web, The Madness of Many (2016) y Arithmophobia. Estilo: compases amalgama, polirritmias complejas, thump technique y fusión jazz/electrónica.
- First Fragment: Álbum Dasein (2016). Death metal neoclásico técnico canadiense con influencias de guitarra flamenca y bajo fretless.
- Necrophagist: Death metal técnico quirúrgico y barroco creado por Muhammed Suiçmez.
- Yngwie Malmsteen: Padre del shred neoclásico en guitarra eléctrica, fusión de Bach y Paganini a máxima velocidad.
Recomendación para escuchar: Concentración mental, estudio técnico, energía analítica y virtuosismo puro.`
  },
  {
    title: 'Rock Clásico, Psicodelia y Progresivo Universal',
    content: `ROCK CLÁSICO Y PSICODELIA (I:\\Musica)
- Pink Floyd: Álbum Dark Side of the Moon y discografía. Obras conceptuales sobre el tiempo, el dinero, la alienación y la locura con Gilmour y Waters.
- The Beatles: Catálogo completo de la banda de Liverpool (Lennon, McCartney, Harrison, Starr). Innovación melódica y psicodelia pop.
- The Doors: Poesía chamánica y blues psicodélico de Jim Morrison con el teclado hipnótico de Ray Manzarek.
- Queen: Virtuosismo vocal de Freddie Mercury y composiciones operísticas y épicas de Brian May.
- David Bowie: Catálogo Legacy (2016) y clásicos de glam rock, art rock y elegancia vanguardista.
Recomendación para escuchar: Viajes conceptuales, momentos creativos y apreciación de hitos musicales históricos.`
  },
  {
    title: 'Rock Alternativo, Grunge y Nu Metal 90s/2000s',
    content: `ROCK ALTERNATIVO, GRUNGE Y NU METAL (I:\\Musica)
- Radiohead: Discografía de art rock y experimentación con Thom Yorke y Jonny Greenwood (OK Computer, Kid A, In Rainbows). Melancolía y vanguardia.
- Nirvana: Grunge crudo y visceral de Seattle liderado por Kurt Cobain (Nevermind, In Utero).
- Deftones: Metal alternativo etéreo y sensual con Chino Moreno y Stephen Carpenter. Contraste de afinaciones graves y texturas shoegaze.
- Red Hot Chili Peppers: Discografía completa 1984-2013 con el funk rock de Flea y Frusciante.
- Linkin Park: Hybrid Theory (2000) y clásicos que fusionan rap metal, electrónica y la desgarradora voz de Chester Bennington.
- Korn y Limp Bizkit: Nu metal de finales de los 90 con bajos slapeados y actitud agresiva.
- Rage Against The Machine: Fusión revolucionaria de hip hop y metal con Zack de la Rocha y Tom Morello.`
  },
  {
    title: 'Death Metal y Metal Extremo Técnico',
    content: `DEATH METAL Y METAL EXTREMO (I:\\Musica)
- Death: Banda fundamental fundada por Chuck Schuldiner ("el padre del death metal"). Evolución hacia el metal progresivo con letras existenciales.
- Decapitated: Precisión rítmica y riffs demoledores del guitarrista polaco Vogg.
- Cannibal Corpse: Pioneros indiscutidos del brutal death metal con Alex Webster y George Corpsegrinder Fisher.
- Dying Fetus: Álbum Reign Supreme (2012). Brutalidad técnica y groove demoledor.
- Carnifex y Thy Art Is Murder: Referentes de la escena deathcore mundial con blast beats y breakdowns masivos.
- Aversions Crown y Beneath the Massacre: Hipervelocidad técnica y temática de ciencia ficción cósmica y alienígena.`
  },
  {
    title: 'Hip Hop, Rap Urbano y Fusión de Calle',
    content: `HIP HOP Y RAP URBANO (I:\\Musica)
- Cypress Hill: Leyendas del hip hop chicano de la costa oeste con B-Real, Sen Dog y Muggs. Beats pesados y lírica urbana.
- The Psycho Realm: Sick Jacken y Big Duke con rap underground de supervivencia y crítica social en Los Ángeles.
- Hacktivist: Fusión innovadora de rap y djent metal británico.
- Terrible & Dj CidTronyck: Recuerdos del Futuro (2014) y hip hop en español.
- Hijos de las Hojas y DVSR: Rap alternativo y rimas de conciencia callejera.
Recomendación para escuchar: Groove, ritmo constante, entrenamiento y enfoque rítmico.`
  },
  {
    title: 'Soul, Jazz, Música Clásica y Canto Lírico',
    content: `SOUL, JAZZ Y CANTO LÍRICO (I:\\Musica)
- Amy Winehouse: Discografía completa incluyendo Back To Black (2006), Frank y The Rarities (2016). Voz contralto de soul clásico, jazz y R&B con emotividad cruda.
- Daniel Fernández Tenor: Repertorio lírico vocal de ópera y técnica de bel canto.
- Colección de Música Clásica y Ópera: Obras orquestales y piezas vocales clásicas.
Recomendación para escuchar: Momentos de relajación, sofisticación auditiva, lectura pausada y apreciación vocal.`
  }
];

async function ingestMusicDocument() {
  console.log('[MusicIngest] Iniciando ingesta del Catálogo Musical en PostgreSQL...');
  
  const docTitle = 'Catálogo Musical y Colección Personal (I:\\Musica)';
  
  // 1. Crear o actualizar documento en Document table
  let doc = await prisma.document.findFirst({
    where: { title: docTitle }
  });

  if (doc) {
    console.log(`[MusicIngest] Documento existente encontrado (ID ${doc.id}). Limpiando chunks previos...`);
    await prisma.chunk.deleteMany({ where: { documentId: doc.id } });
  } else {
    doc = await prisma.document.create({
      data: {
        title: docTitle,
        category: 'Música y Arte',
        source: 'I:\\Musica',
        status: 'ready',
        content: 'Catálogo estructurado de la biblioteca musical personal ubicada en I:\\Musica, cubriendo 64 artistas, 220 álbumes y 2.367 temas.',
      }
    });
    console.log(`[MusicIngest] Documento creado con ID: ${doc.id}`);
  }

  // 2. Vectorizar y guardar chunks
  for (let i = 0; i < chunksContent.length; i++) {
    const item = chunksContent[i];
    console.log(`[MusicIngest] Vectorizando chunk ${i + 1}/${chunksContent.length}: "${item.title}"...`);
    
    const vector = await generateEmbedding(`${item.title}\n\n${item.content}`);
    
    await prisma.chunk.create({
      data: {
        documentId: doc.id,
        content: `### ${item.title}\n\n${item.content}`,
        metadata: JSON.stringify({
          docTitle: docTitle,
          sectionTitle: item.title,
          index: i,
          vector: vector,
          source: 'I:\\Musica',
          category: 'Música y Arte'
        })
      }
    });
  }

  await prisma.document.update({
    where: { id: doc.id },
    data: { status: 'ready', updatedAt: new Date() }
  });

  console.log(`[MusicIngest] ✅ Catálogo Musical ingestado con éxito! (${chunksContent.length} chunks vectorizados).`);
}

ingestMusicDocument()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
