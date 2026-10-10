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
    title: 'Visión General de la Biblioteca Gamer y Videojuegos (I:\\Juegos)',
    content: `CATÁLOGO DE VIDEOJUEGOS Y BIBLIOTECA GAMER DE JARBEES (I:\\Juegos)
Colección personal de videojuegos clásicos e históricos instalados y funcionales en la unidad local I:\\Juegos.
La biblioteca abarca los siguientes géneros y pilares fundamentales:
1. Estrategia en Tiempo Real (RTS): Age of Empires II: The Age of Kings y The Conquerors Expansion (18 civilizaciones, 4 edades, campañas completas).
2. Action RPG & Hack and Slash: Diablo I (Tristram, 16 niveles de mazmorras góticas) y Diablo II: Lord of Destruction (5 actos, 7 clases, árboles de habilidades, palabras rúnicas).
3. Survival Horror Cooperativo FPS: Left 4 Dead (Valve, 4 supervivientes vs AI Director y hordas de zombis con infectados especiales).
4. FPS Táctico y Competitivo: Counter-Strike 1.6 (terroristas vs antiterroristas, mapas icónicos de_dust2, de_inferno, cs_assault, economía de rondas).
5. Estrategia por Turnos y Artillería 2D: Saga Worms (Worms Reloaded, Worms Armageddon, Worms World Party con armamento legendario como la Granada Santa).
6. Beat 'em Up y Aventura de Acción: Mortal Kombat: Shaolin Monks (ISO de PS2 protagonizada por Liu Kang y Kung Lao).
7. Ajedrez Clásico: Chess Titans (ajedrez tridimensional con 10 niveles de IA).
8. Emulación y Retro Gaming: Suite Hours of Fun (Redream para Sega Dreamcast, ROMs retro y juegos arcade en Flash).`
  },
  {
    title: 'Age of Empires II: The Conquerors — Estrategia Histórica Medieval',
    content: `AGE OF EMPIRES II: THE CONQUERORS (I:\\Juegos\\Ae2+C)
- Desarrollador: Ensemble Studios / Microsoft (2000).
- Género: Estrategia en Tiempo Real (RTS).
- Mecánicas Principales:
  * 4 recursos clave: Alimento, Madera, Oro y Piedra.
  * 4 edades evolutivas: Alta Edad Media (Dark Age), Edad Feudal, Edad de los Castillos y Edad Imperial.
  * 18 civilizaciones con bonificaciones únicas: Francos (caballería pesada y castillos baratos), Bizantinos (defensa y piqueros/camellos baratos), Hunos (sin necesidad de casas), Mayas (arqueros de plumas), Ingleses (arqueros de tiro largo), Teutones (armadura cuerpo a cuerpo y resistencia a conversiones).
- Campañas Históricas: Juana de Arco, Federico Barbarroja, Saladino, Atila el Huno, El Cid y las batallas de los Conquistadores (Azincourt, Hastings, Tours).
- Tácticas: Fast Castle (subir rápido a castillos), Rush feudal de exploradores o arqueros, control de mapa y uso de asedio (catapultas, arietes, trebuchets).`
  },
  {
    title: 'Diablo II: Lord of Destruction — La Cumbre del Action RPG',
    content: `DIABLO II: LORD OF DESTRUCTION (I:\\Juegos\\DIABLO 2)
- Desarrollador: Blizzard North (2001).
- Género: Action RPG / Hack & Slash Isométrico.
- Clases Jugables (7):
  * Nigromante: Invocación de esqueletos/gólems, veneno y maleficios de maldición.
  * Paladín: Auras defensivas/ofensivas, Martillo Bendito (Hammerdin), Fanatismo y Celo (Zealot).
  * Hechicera: Magia elemental de Hielo (Orbe Helado, Ventisca), Fuego (Meteoro) y Rayo (Teletransporte).
  * Bárbaro: Torbellino (Whirlwind), gritos de guerra y doble empuñadura.
  * Amazona: Jabalinas relámpago (Javazon) y arcos elementales/físicos.
  * Druida: Transformación en lobo/oso e invocación elemental y animal.
  * Asesina: Artes marciales y trampas de rayos (Trapsin).
- 5 Actos Épicos: Desde el Campamento de las Arpías en Khanduras, Lut Gholein, las junglas de Kurast, el Pandemónium y la cima del Monte Arreat contra Baal.
- Palabras Rúnicas Notables: Enigma (Teletransporte universal), Heart of the Oak (HOTO), Call to Arms (CTA), Infinity, Grief.`
  },
  {
    title: 'Diablo I — Terror Gótico y Mazmorras Subterráneas',
    content: `DIABLO I (I:\\Juegos\\DIABLO 1)
- Desarrollador: Blizzard North (1996).
- Género: Action RPG / Roguelike de Fantasía Oscura.
- Ambientación: El pueblo maldito de Tristram, con personajes memorables como Deckard Cain ('Stay awhile and listen'), Griswold el herrero, Pepin el curandero, Adria la bruja y Wirt el muchacho de la pierna de palo.
- Estructura: Descenso de 16 niveles por debajo de la Catedral:
  * Niveles 1-4: La Iglesia / Catedral (encuentro con El Carnicero / The Butcher y el Rey Leoric).
  * Niveles 5-8: Las Catacumbas subterráneas.
  * Niveles 9-12: Las Cuevas volcánicas.
  * Niveles 13-16: El propio Infierno, culminando con la batalla contra el Arzobispo Lazarus y Diablo.
- Clases: Guerrero (combate cuerpo a cuerpo), Pícara (arco y destreza) y Hechicero (magia destructiva).`
  },
  {
    title: 'Left 4 Dead — Survival Horror Cooperativo Definitivo',
    content: `LEFT 4 DEAD (I:\\Juegos\\Program Files (x86)\\VALVE\\Left 4 Dead)
- Desarrollador: Valve Corporation / Turtle Rock Studios (2008).
- Género: FPS Cooperativo para 4 jugadores / Survival Horror.
- Protagonistas: Bill (veterano de guerra), Zoey (estudiante universitaria), Francis (motero hosco) y Louis (oficinista optimista).
- El AI Director: Sistema algorítmico patentado de Valve que monitorea el estrés fisiológico virtual del equipo para alterar en tiempo real la cantidad de zombis, la colocación de armas/botiquines y el timing de los infectados especiales.
- Infectados Especiales:
  * Tank: Masa muscular descomunal capaz de lanzar autos y piedras gigantes.
  * Witch: Criatura que llora en la oscuridad; si es alumbrada con linterna o atacada, persigue y derriba de un solo golpe.
  * Hunter: Zombi ágil que salta desde techos y azoteas para inmovilizar supervivientes.
  * Smoker: Aferra con su lengua elástica a larga distancia y libera humo asfixiante al morir.
  * Boomer: Vomita bilis que ciega a los jugadores y atrae hordas furiosas.`
  },
  {
    title: 'Counter-Strike 1.6 — El Shooter Táctico Competitivo Clásico',
    content: `COUNTER-STRIKE 1.6 (I:\\Juegos\\Chonter)
- Desarrollador: Valve Corporation (2003).
- Género: FPS Táctico Multijugador por Rondas.
- Dinámica de Juego: Terroristas (T) vs Antiterroristas (CT).
- Modos Clásicos:
  * Desactivación de Explosivos (Mapas 'de_'): Terroristas intentan plantar el C4 en el punto A o B; CT deben impedirlo o desactivar el artefacto (de_dust2, de_inferno, de_nuke, de_aztec, de_train).
  * Rescate de Rehenes (Mapas 'cs_'): CT intentan escoltar a los rehenes hasta la zona de extracción; Terroristas defienden la posición (cs_assault, cs_office, cs_italy, cs_mansion).
- Armamento Emblemático: AK-47 (letal al primer disparo a la cabeza), M4A1 (precisa y con silenciador), AWP (rifle de francotirador de cerrojo de un solo disparo letal), Desert Eagle y MP5.
- Habilidades: Control del retroceso (spray pattern), contra-movimiento (counter-strafing), bunny hopping y comunicación en equipo.`
  },
  {
    title: 'Worms: Saga de Estrategia Balística y Artillería por Turnos',
    content: `SAGA WORMS (I:\\Juegos\\Program Files (x86)\\Team17\\Worms Reloaded & Armageddon)
- Desarrollador: Team17 Digital Ltd.
- Género: Estrategia táctica por turnos en escenarios destructibles 2D.
- Títulos en Biblioteca: Worms Reloaded (2010), Worms Armageddon (1999) y Worms World Party.
- Jugabilidad: Equipos de gusanos armados con armamento extravagante deben eliminarse en escenarios flotantes con física balística, influencia del viento y riesgo constante de caer al agua.
- Armamento Icónico:
  * Granada Santa (Holy Hand Grenade): Cuenta regresiva con coro 'Aleluya' y explosión masiva.
  * Super Banana Bomb: Granada de racimo con rebote caótico y destrucción masiva del terreno.
  * Burro de Cemento (Concrete Donkey): Arma devastadora que aplasta verticalmente todo a su paso.
  * Soga Ninja: Herramienta de movilidad aérea acrobática para recorrer el mapa en segundos.
  * Bate de Béisbol y Oveja Explosiva.`
  },
  {
    title: 'Mortal Kombat Shaolin Monks, Emulación Retro y Juegos Flash',
    content: `AVENTURA BEAT EM UP, RETRO GAMING Y FLASH (I:\\Juegos)
- Mortal Kombat: Shaolin Monks (ISO PS2):
  * Aventura canónica cooperativa de Midway protagonizada por Liu Kang y Kung Lao que reimagina el torneo del Outworld de MK2.
  * Combate 360 grados, combos aéreos colaborativos y 'Multalities' e interactividad ambiental.
- Suite Hours of Fun (Emulación y ROMs):
  * Incluye el emulador Redream para Sega Dreamcast (60 FPS en resolución 4K) y colección de ROMs retro de consolas clásicas.
- Colección Flash Web Arcade:
  * Juegos de la era dorada de Newgrounds y ArmorGames preservados localmente (Boxhead 2Play y Gunblood Reborn) con launchers directos.
- Chess Titans:
  * Ajedrez clásico de Microsoft con 10 niveles de dificultad y tablero tridimensional.`
  }
];

async function main() {
  console.log('🎮 Iniciando ingesta del Catálogo Gamer en PostgreSQL...');

  const category = 'Videojuegos y Ocio Digital';
  const title = 'Catálogo de Videojuegos y Biblioteca Gamer (I:\\Juegos)';
  const author = 'JarBees Knowledge Base';

  // Buscar si ya existe el documento para actualizarlo
  const existingDoc = await prisma.document.findFirst({
    where: { title }
  });

  let documentId;
  if (existingDoc) {
    documentId = existingDoc.id;
    console.log(`ℹ️ Documento existente encontrado (ID #${documentId}). Actualizando chunks...`);
    await prisma.chunk.deleteMany({ where: { documentId } });
  } else {
    const newDoc = await prisma.document.create({
      data: {
        title,
        category,
        source: 'I:\\Juegos',
        status: 'ready',
        content: 'Catálogo exhaustivo e indexación de la biblioteca de videojuegos de JarBees en I:\\Juegos, incluyendo guías de estrategia, clases, mecánicas y lore.'
      }
    });
    documentId = newDoc.id;
    console.log(`✅ Documento creado en PostgreSQL con ID #${documentId}`);
  }

  console.log(`\n⚡ Vectorizando ${chunksContent.length} chunks temáticos con ${EMBEDDING_MODEL} (1024D)...`);

  for (let i = 0; i < chunksContent.length; i++) {
    const item = chunksContent[i];
    console.log(`  [Chunk ${i + 1}/${chunksContent.length}] Vectorizando: "${item.title}"...`);
    const embedding = await generateEmbedding(`${item.title}\n\n${item.content}`);

    await prisma.chunk.create({
      data: {
        documentId,
        content: `### ${item.title}\n\n${item.content}`,
        metadata: JSON.stringify({
          docTitle: title,
          sectionTitle: item.title,
          index: i,
          vector: embedding,
          source: 'I:\\Juegos',
          category: category
        })
      }
    });
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'ready', updatedAt: new Date() }
  });

  console.log(`\n🎉 ¡Catálogo Gamer ingestado con éxito en PostgreSQL! Total: ${chunksContent.length} chunks vectorizados.`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌ Error en ingesta gamer:', err);
  process.exit(1);
});
