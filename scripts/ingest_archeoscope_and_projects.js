/**
 * Ingesta e indexación oficial de ArcheoScope y proyectos de @ifernandez89 en JarBees
 * Inserta en:
 * 1. prisma.memory (Memoria a largo plazo con importance 10)
 * 2. prisma.knowledgeEntity (Grafo de conocimiento KGRAPH v1)
 * 3. prisma.document y prisma.chunk (RAG documental con embeddings bge-m3 de 1024 dimensiones)
 * 4. src/jarvis/knowledge/library-index.json (Corpus Selector)
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3:latest';

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });
  if (!res.ok) {
    throw new Error(`Error en embeddings Ollama [${res.status}]: ${await res.text()}`);
  }
  const data = await res.json();
  return data.embedding;
}

async function main() {
  console.log('🚀 Iniciando indexación de ArcheoScope y proyectos de @ifernandez89...');

  // ── 1. INYECTAR EN TABLA MEMORY ─────────────────────────────────────────────
  console.log('🧠 1. Inyectando hechos en la tabla Memory...');

  const memoryItems = [
    {
      category: 'project',
      importance: 10,
      content: 'ArcheoScope (The Forgotten Relics) es un proyecto insignia de Ignacio Fernández (@ifernandez89). Combina exploración 3D arqueológica en primera persona (Three.js r165, Next.js 14) de 6 civilizaciones ancestrales (Giza, Puma Punku, Teotihuacán, Isla de Pascua, Tres Zapotes y Göbekli Tepe) con audio Harmonia Mundi (frecuencias orbitales planetarias basadas en Kepler) y un observatorio astronómico móvil en tiempo real.'
    },
    {
      category: 'project',
      importance: 10,
      content: 'Tecnologías y arquitectura de ArcheoScope: Desarrollado con Next.js 14, Three.js, TypeScript y la librería astronomy-engine (efemérides planetarias de alta precisión VSOP87). Utiliza Open-Meteo para meteorología sin API keys y síntesis procedural Harmonia Mundi. Todas las operaciones de efemérides y astronomía son cálculos matemáticos puros locales sin dependencias de scraping web.'
    },
    {
      category: 'project',
      importance: 10,
      content: 'ArcheoScope en JarBees - Hechos confirmados vs decisiones pendientes: En JarBees están CONFIRMADOS E IMPLEMENTADOS los módulos "HOY" (cielo actual, fases lunares y planetas visibles calculados con astronomy-engine), "ASTROLOGÍA" (carta zodiacal y tránsitos locales) y "CLIMA" (Open-Meteo). Están PENDIENTES o son ideas conceptuales no expuestas en el chat: Calendarios antiguos (Tzolk\'in Maya de 260 días, Haab y Cuenta Larga), cálculo de aspectos planetarios angulares con orbes, nodos lunares, búsqueda de eclipses y brújula física (que requiere sensores de hardware móvil).'
    },
    {
      category: 'project',
      importance: 10,
      content: 'Ecosistema de proyectos de Ignacio Fernández (@ifernandez89): ArcheoScope (arqueología 3D y observatorio astronómico), JarBees Mobile (asistente on-device Android con LLM local delegando al Core), productos_crud_bkd (backend NestJS con RAG PostgreSQL/pgvector y modelos de razonamiento), productos_crud_frd (frontend Next.js de productos y chat IA), Contactos-Eventos (planificación musical en Entre Ríos), PlantasMedicinales (registro terapéutico), Radar-Dev (relevamiento tecnológico e IA) y mergeador (fusión de PDFs).'
    }
  ];

  // Limpiar memorias previas de archeoscope para evitar duplicados
  const existingMemories = await prisma.memory.findMany({
    where: { content: { contains: 'ArcheoScope', mode: 'insensitive' } }
  });
  if (existingMemories.length > 0) {
    await prisma.memory.deleteMany({
      where: { id: { in: existingMemories.map(m => m.id) } }
    });
    console.log(`   🧹 Eliminadas ${existingMemories.length} memorias previas para refrescar.`);
  }

  for (const m of memoryItems) {
    await prisma.memory.create({ data: m });
  }
  console.log(`   ✅ Guardadas ${memoryItems.length} memorias en PostgreSQL.`);

  // ── 2. INYECTAR EN TABLA KNOWLEDGE ENTITY (KGRAPH v1) ──────────────────────
  console.log('🕸️  2. Inyectando entidades en KnowledgeEntity (KGRAPH v1)...');

  const entities = [
    {
      name: 'ArcheoScope',
      type: 'PROJECT',
      description: 'Proyecto de exploración 3D arqueológica (Three.js/Next.js) y observatorio astronómico móvil de ifernandez89.',
      aliases: JSON.stringify(['Archeoscope', 'The Forgotten Relics', 'ArcheoScope 3D']),
      tags: JSON.stringify(['astronomía', 'arqueología', '3d', 'threejs', 'kepler', 'proyectos', 'ifernandez89'])
    },
    {
      name: 'Jarbees Mobile',
      type: 'PROJECT',
      description: 'Asistente IA on-device para Android con LLM local que delega tareas complejas a JarBees Core.',
      aliases: JSON.stringify(['JarBees Android', 'Jarbees App']),
      tags: JSON.stringify(['mobile', 'android', 'llm', 'ia', 'ifernandez89'])
    },
    {
      name: 'astronomy-engine',
      type: 'TECHNOLOGY',
      description: 'Motor de cálculo astronómico de alta precisión basado en efemérides VSOP87 usado en ArcheoScope y JarBees.',
      aliases: JSON.stringify(['VSOP87', 'AstronomyEngine']),
      tags: JSON.stringify(['astronomía', 'efemérides', 'cálculo local', 'typescript'])
    }
  ];

  for (const ent of entities) {
    await prisma.knowledgeEntity.upsert({
      where: { name_type: { name: ent.name, type: ent.type } },
      update: ent,
      create: ent
    });
  }
  console.log(`   ✅ Guardadas ${entities.length} entidades de conocimiento.`);

  // ── 3. INYECTAR DOCUMENTO Y CHUNKS RAG EN POSTGRESQL ────────────────────────
  console.log('📚 3. Inyectando Documento y Chunks vectorizados en PostgreSQL...');

  const docTitle = 'ArcheoScope: The Forgotten Relics & Observatorio Astronómico';
  const docPath = path.join(__dirname, '../docs/ARCHEOSCOPE_REFERENCE.md');
  const docContent = fs.readFileSync(docPath, 'utf-8');

  // Upsert Document
  let doc = await prisma.document.findFirst({
    where: { title: { contains: 'ArcheoScope', mode: 'insensitive' } }
  });

  if (doc) {
    doc = await prisma.document.update({
      where: { id: doc.id },
      data: {
        title: docTitle,
        content: docContent,
        category: 'PROJECT',
        source: 'https://github.com/ifernandez89/ArcheoScope',
        status: 'approved',
        updatedAt: new Date()
      }
    });
    // Eliminar chunks anteriores para re-indexar limpios
    await prisma.chunk.deleteMany({ where: { documentId: doc.id } });
    console.log(`   🔄 Documento ${doc.id} actualizado.`);
  } else {
    doc = await prisma.document.create({
      data: {
        title: docTitle,
        content: docContent,
        category: 'PROJECT',
        source: 'https://github.com/ifernandez89/ArcheoScope',
        status: 'approved'
      }
    });
    console.log(`   ✨ Documento creado con ID: ${doc.id}`);
  }

  // Segmentar en 4 Chunks estructurados
  const rawChunks = [
    `ArcheoScope: The Forgotten Relics es una aplicación web inmersiva creada por Ignacio Fernández (@ifernandez89). Combina exploración 3D arqueológica en primera persona de 6 sitios ancestrales (Giza en Egipto, Puma Punku y Tiwanaku en Bolivia, Teotihuacán en México, Isla de Pascua/Rapa Nui en Chile, Tres Zapotes de la cultura Olmeca en México y Göbekli Tepe en Turquía) con el sistema de audio Harmonia Mundi (frecuencias orbitales de Kepler) y un observatorio astronómico móvil en tiempo real sin dependencias externas ni APIs pagas.`,
    
    `Tecnologías y arquitectura de ArcheoScope: Desarrollado en el frontend con Next.js 14, Three.js (r165), TypeScript y Tailwind CSS. El motor de efemérides astronómicas de alta precisión es astronomy-engine, implementando las efemérides VSOP87 puras. Para la meteorología local utiliza Open-Meteo sin necesidad de API keys. En PC ofrece un juego 3D con Sistema Solar kepleriano interactivo y catálogo estelar de 83.148 estrellas. En Mobile ofrece observatorio astronómico con carta celeste, fases lunares, calendarios antiguos (Maya y babilónico) y brújula.`,
    
    `ArcheoScope en JarBees - Hechos confirmados vs decisiones pendientes: JarBees adoptó la arquitectura de cálculo astronómico local de ArcheoScope para reemplazar el scraping web. Hechos confirmados e implementados en JarBees: Módulo HOY (fases lunares, posición solar y planetas visibles calculados con astronomy-engine), Módulo ASTROLOGÍA (carta celeste y tránsitos zodiacales calculados localmente) y Módulo CLIMA (Open-Meteo). Decisiones pendientes o teóricas: Calendarios antiguos (Tzolk'in Maya de 260 días, Haab y Cuenta Larga cuyos algoritmos están documentados pero no expuestos en la API), aspectos planetarios angulares con orbes, nodos lunares, predicción de eclipses y brújula física (que requiere sensores móviles).`,
    
    `Ecosistema completo de proyectos de Ignacio Fernández (@ifernandez89): 1. ArcheoScope (arqueología 3D y observatorio astronómico móvil). 2. Jarbees Mobile (asistente IA on-device para Android con LLM local y delegación al Core). 3. productos_crud_bkd (backend NestJS con RAG PostgreSQL/pgvector, observabilidad y modelos dialécticos). 4. productos_crud_frd (frontend Next.js de gestión de productos y chat inteligente con JarBees). 5. Contactos-Eventos (planificación anual de actuaciones musicales en Entre Ríos). 6. PlantasMedicinales (registro de plantas por acción terapéutica). 7. Radar-Dev (ecosistema de oportunidades de automatización e IA). 8. mergeador (utilidad para fusionar PDFs de libros).`
  ];

  // Comprobar soporte de columna nativa embedding para evitar error 42703
  let hasNativeVector = false;
  try {
    const colCheck = await prisma.$queryRawUnsafe(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'Chunk' AND column_name = 'embedding' LIMIT 1
    `);
    hasNativeVector = Array.isArray(colCheck) && colCheck.length > 0;
  } catch {}

  console.log(`   ⚡ Generando embeddings bge-m3 para ${rawChunks.length} chunks...`);
  for (let i = 0; i < rawChunks.length; i++) {
    const chunkText = rawChunks[i];
    const vector = await getEmbedding(chunkText);
    const meta = {
      chunkIndex: i + 1,
      totalChunks: rawChunks.length,
      docTitle: docTitle,
      category: 'PROJECT',
      vector: vector
    };

    const chunk = await prisma.chunk.create({
      data: {
        documentId: doc.id,
        content: chunkText,
        embeddingId: `archeoscope-chunk-${i + 1}`,
        metadata: JSON.stringify(meta)
      }
    });

    // Guardar en pgvector nativo si la columna nativa existe
    if (hasNativeVector) {
      try {
        const vectorSql = `[${vector.join(',')}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "Chunk" SET embedding = $1::vector WHERE id = $2`,
          vectorSql,
          chunk.id
        );
      } catch (pgErr) {
        // Ignorar si pgvector falla
      }
    }
  }
  console.log(`   ✅ Chunks indexados con vectores en PostgreSQL.`);

  // ── 4. ACTUALIZAR LIBRARY-INDEX.JSON (CORPUS SELECTOR) ──────────────────────
  console.log('📑 4. Actualizando library-index.json para el Corpus Selector...');
  const indexPath = path.join(__dirname, '../src/jarvis/knowledge/library-index.json');
  if (fs.existsSync(indexPath)) {
    const rawIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const docEntry = {
      id: 'archeoscope-001',
      titulo: 'ArcheoScope: The Forgotten Relics & Observatorio Astronómico',
      archivo: 'archeoscope_architecture.md',
      tipo: 'proyecto',
      formato: 'markdown',
      autor: 'Ignacio Fernández / ifernandez89',
      idioma: 'es',
      categorias: ['astronomía', 'arqueología', 'proyectos', 'software'],
      conceptosClave: [
        'ArcheoScope',
        'astronomy-engine',
        'VSOP87',
        'Open-Meteo',
        'Harmonia Mundi',
        'Kepler',
        'Three.js',
        'Next.js',
        'calendario maya',
        'Tzolk\'in',
        'observatorio astronómico'
      ],
      capitulos: [],
      embeddings: 'ready',
      descripcionBreve: 'Proyecto insignia de Ignacio Fernández (ifernandez89) que combina exploración 3D arqueológica en primera persona (Three.js/Next.js) con audio Harmonia Mundi y observatorio astronómico móvil. Fuente de los módulos "HOY", "ASTROLOGÍA" y "CLIMA" incorporados a JarBees.',
      tags: ['ArcheoScope', 'astronomía', 'arqueología', '3d', 'proyectos', 'ifernandez89'],
      dbId: doc.id
    };

    const existingIdx = rawIndex.documentos.findIndex(d => d.id === 'archeoscope-001');
    if (existingIdx >= 0) {
      rawIndex.documentos[existingIdx] = docEntry;
    } else {
      rawIndex.documentos.unshift(docEntry);
    }

    fs.writeFileSync(indexPath, JSON.stringify(rawIndex, null, 2), 'utf-8');
    console.log('   ✅ library-index.json actualizado con la entrada de ArcheoScope.');
  }

  console.log('\n🎉 ¡INDEXACIÓN COMPLETADA CON ÉXITO!');
  console.log('JarBees ahora posee conocimiento completo de ArcheoScope y tus proyectos.');
}

main()
  .catch(err => {
    console.error('❌ Error en indexación:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
