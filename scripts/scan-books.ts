import * as fs from 'fs';
import * as path from 'path';

// ── Mapeos de Metadatos para Libros Conocidos ──────────────────────────────────
interface BookMetadata {
  titulo: string;
  autor: string;
  categorias: string[];
  conceptosClave: string[];
  tags: string[];
}

const META_MAP: Record<string, BookMetadata> = {
  '00 ESPACIO SAGRADO version nov2017.pdf': {
    titulo: 'Espacio Sagrado (Versión Nov 2017)',
    autor: 'Tradición Chamánica',
    categorias: ['chamanismo', 'espiritualidad', 'ritos'],
    conceptosClave: ['espacio sagrado', 'direcciones', 'vientos', 'apus', 'madre tierra', 'pachamama'],
    tags: ['chamán', 'energía', 'iniciación', 'ritos', 'medicina', 'sagrado']
  },
  '12_tintes_naturales_maya_mesoamerica_etnobotanica_codice_artesania_prehispanico_colonial_tzutujil_mam.pdf': {
    titulo: 'Tintes Naturales Maya y Mesoamérica: Etnobotánica, Códices y Artesanía',
    autor: 'Etnobotánica Maya',
    categorias: ['etnobotánica', 'códices', 'artesanía', 'cultura maya', 'mesoamérica'],
    conceptosClave: ['tintes naturales', 'plantas tintóreas', 'prehispánico', 'colonial', 'tzutujil', 'mam'],
    tags: ['maya', 'plantas', 'tintes', 'colores', 'códice', 'historia']
  },
  'Arthur-E-Powell-The-Etheric-Double-The-Health-Aura-of-Man.pdf': {
    titulo: 'The Etheric Double: The Health Aura of Man',
    autor: 'Arthur E. Powell',
    categorias: ['teosofía', 'cuerpo etérico', 'esoterismo', 'aura'],
    conceptosClave: ['etheric double', 'prana', 'chakras', 'health aura', 'teosofía', 'cuerpo sutil'],
    tags: ['teosofía', 'energía', 'aura', 'prana', 'espíritu', 'sutil']
  },
  'Cuarenta_dos_secciones_Sutra.pdf': {
    titulo: 'El Sutra de las Cuarenta y Dos Secciones',
    autor: 'Buda Gautama (Traducción)',
    categorias: ['budismo', 'sutras', 'espiritualidad', 'filosofía oriental'],
    conceptosClave: ['sutra', 'dharma', 'desapego', 'iluminación', 'buda', 'deseo'],
    tags: ['budismo', 'buda', 'meditación', 'filosofía', 'iluminación', 'sutra']
  },
  'DICCIONARIO de Biodescodificacion.pdf': {
    titulo: 'Diccionario de Biodescodificación',
    autor: 'Joan Marc Vilanova Pujó',
    categorias: ['biodescodificación', 'bioneuroemoción', 'salud holística', 'psicosomática'],
    conceptosClave: ['síntoma', 'conflicto biológico', 'emociones ocultas', 'descodificación', 'inconsciente'],
    tags: ['salud', 'biodescodificación', 'emociones', 'enfermedad', 'síntomas', 'diccionario']
  },
  'La vía del tarot, Alejandro Jodorowsky.pdf': {
    titulo: 'La Vía del Tarot',
    autor: 'Alejandro Jodorowsky & Marianne Costa',
    categorias: ['tarot', 'arcanos', 'simbolismo', 'psicomagia'],
    conceptosClave: ['arcanos mayores', 'arcanos menores', 'tiradas', 'lectura de tarot', 'simbología'],
    tags: ['tarot', 'esoterismo', 'jodorowsky', 'símbolos', 'arcanos', 'cartas']
  },
  'Libro - Teoamoxtli (Libro de Esencia Divina).pdf': {
    titulo: 'Teoamoxtli: Libro de Esencia Divina',
    autor: 'Tradición Tolteca',
    categorias: ['toltequidad', 'espiritualidad ancestral', 'méxico prehispánico'],
    conceptosClave: ['teoamoxtli', 'esencia divina', 'nahuatl', 'toltecas', 'sabiduría'],
    tags: ['tolteca', 'méxico', 'prehispánico', 'sagrado', 'esencia', 'dioses']
  },
  'Tesla, Energia libre.pdf': {
    titulo: 'Nikola Tesla: Energía Libre y Antigravedad',
    autor: 'Nikola Tesla / Recopilación',
    categorias: ['física', 'energía libre', 'electromagnetismo', 'patentes'],
    conceptosClave: ['energía libre', 'bobina de tesla', 'corriente alterna', 'antigravedad', 'patentes'],
    tags: ['tesla', 'electricidad', 'energía', 'física', 'inventos', 'ciencia']
  },
  'Un ensueño entre serpientes y jaguares (parte 1).pdf': {
    titulo: 'Un Ensueño entre Serpientes y Jaguares (Parte 1)',
    autor: 'Tradición Chamánica / Relatos',
    categorias: ['chamanismo', 'ensueño', 'plantas maestras', 'relatos'],
    conceptosClave: ['ensueño', 'serpiente', 'jaguar', 'curanderismo', 'viaje astral', 'plantas sagradas'],
    tags: ['ensueño', 'chamanismo', 'jaguar', 'serpiente', 'relatos', 'astral']
  },
  'Un ensueño entre serpientes y jaguares (parte 2).pdf': {
    titulo: 'Un Ensueño entre Serpientes y Jaguares (Parte 2)',
    autor: 'Tradición Chamánica / Relatos',
    categorias: ['chamanismo', 'ensueño', 'plantas maestras', 'relatos'],
    conceptosClave: ['ensueño', 'serpiente', 'jaguar', 'viaje chamánico', 'curación'],
    tags: ['ensueño', 'chamanismo', 'jaguar', 'serpiente', 'relatos', 'ayahuasca']
  },
  '[AFR] Curso Básico AutoDefensa Psíquica (1 de 2).pdf': {
    titulo: 'Curso Básico de Autodefensa Psíquica (Parte 1)',
    autor: 'Al Filo de la Realidad',
    categorias: ['autodefensa psíquica', 'esoterismo', 'protección energética'],
    conceptosClave: ['ataque psíquico', 'larvas astrales', 'protección', 'visualización', 'campo áurico'],
    tags: ['protección', 'energía', 'autodefensa', 'larvas', 'aura', 'psíquico']
  },
  '[AFR] Curso Básico AutoDefensa Psíquica (2 de 2).pdf': {
    titulo: 'Curso Básico de Autodefensa Psíquica (Parte 2)',
    autor: 'Al Filo de la Realidad',
    categorias: ['autodefensa psíquica', 'esoterismo', 'protección energética'],
    conceptosClave: ['formas de pensamiento', 'limpieza energética', 'amuletos', 'rituales', 'protección'],
    tags: ['protección', 'energía', 'limpieza', 'amuletos', 'rituales', 'defensa']
  },
  '[AFR] Existen los Hechizos y Maleficios.pdf': {
    titulo: 'Existen los Hechizos y Maleficios',
    autor: 'Al Filo de la Realidad',
    categorias: ['esoterismo', 'hechicería', 'creencias populares'],
    conceptosClave: ['hechizos', 'maleficios', 'magia negra', 'supersticiones', 'creencias'],
    tags: ['hechizos', 'magia', 'superstición', 'creencia', 'esoterismo']
  },
  '[AFR] Fundamentos Racionales de la Astrología.pdf': {
    titulo: 'Fundamentos Racionales de la Astrología',
    autor: 'Al Filo de la Realidad',
    categorias: ['astrología', 'ciencia', 'cosmobiología'],
    conceptosClave: ['influencia astral', 'cartas natales', 'astrología racional', 'efectos cósmicos', 'horóscopo'],
    tags: ['astrología', 'planetas', 'ciencia', 'astros', 'racional', 'estrellas']
  },
  'cromoterapia.pdf': {
    titulo: 'Cromoterapia: Curación por los Colores',
    autor: 'Medicina Alternativa',
    categorias: ['cromoterapia', 'terapia de color', 'salud holística', 'vibraciones'],
    conceptosClave: ['chakras', 'colores', 'espectro luminoso', 'sanación energética', 'vibración'],
    tags: ['cromoterapia', 'colores', 'sanación', 'salud', 'chakras', 'terapia']
  },
  'doctrina_secreta.pdf': {
    titulo: 'La Doctrina Secreta',
    autor: 'Helena Petrovna Blavatsky',
    categorias: ['teosofía', 'esoterismo', 'ocultismo', 'origen del cosmos'],
    conceptosClave: ['teosofía', 'blavatsky', 'estancias de dzyan', 'evolución cósmica', 'razas raíz'],
    tags: ['teosofía', 'blavatsky', 'ocultismo', 'esoterismo', 'cosmos', 'filosofía']
  },
  'icaros.pdf': {
    titulo: 'Ícaros: Cantos Sagrados del Amazonas',
    autor: 'Tradición Amazónica',
    categorias: ['chamanismo', 'ícaros', 'medicina amazónica', 'ayahuasca'],
    conceptosClave: ['ícaros', 'shipibo-conibo', 'cantos medicinales', 'plantas maestras', 'curanderismo', 'ceremonias'],
    tags: ['ícaros', 'chamanismo', 'shipibo', 'cantos', 'ayahuasca', 'medicina']
  },
  'inta_libro_tintes_naturales_de_plantas_nativas_colores_de_la_patagonia.pdf': {
    titulo: 'Tintes Naturales de Plantas Nativas: Colores de la Patagonia',
    autor: 'INTA',
    categorias: ['etnobotánica', 'tintes naturales', 'plantas nativas', 'patagonia', 'artesanía'],
    conceptosClave: ['lana', 'mordiente', 'plantas tintóreas', 'recetas de teñido', 'patagonia', 'tinción'],
    tags: ['patagonia', 'plantas', 'tintes', 'artesanía', 'inta', 'lana']
  },
  'la-cocina-vegetariana-de-hare-krisna 1984.pdf': {
    titulo: 'La Cocina Vegetariana de Hare Krishna',
    autor: 'Adiraja Dasa',
    categorias: ['cocina vegetariana', 'hare krishna', 'alimentación consciente', 'ayurveda'],
    conceptosClave: ['recetas vegetarianas', 'prashadam', 'especias', 'cocina védica', 'ghee', 'krishna'],
    tags: ['cocina', 'vegetariana', 'krishna', 'recetas', 'ayurveda', 'consciente']
  },
  'popol_vuh.pdf': {
    titulo: 'Popol Vuh: El Libro Sagrado de los Mayas',
    autor: "Tradición K'iche'",
    categorias: ['mitología', 'cultura maya', 'cosmovisión', 'literatura clásica'],
    conceptosClave: ['popol vuh', 'quiché', 'creación', 'hunahpú', 'ixbalanqué', 'inframundo', 'xibalbá', 'dioses'],
    tags: ['maya', 'mitología', 'quiché', 'historia', 'sagrado', 'literatura']
  }
};

// ── Rutas ──────────────────────────────────────────────────────────────────────
const workspaceRoot = process.cwd();
const librosDir = path.join(workspaceRoot, 'docs', 'libros');
const indexFile = path.join(workspaceRoot, 'src', 'jarvis', 'knowledge', 'library-index.json');

// ── Función para listar recursivamente ──────────────────────────────────────────
function getFilesRecursively(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath, baseDir));
    } else {
      // Registrar ruta relativa al directorio baseDir
      results.push(path.relative(baseDir, filePath));
    }
  }
  return results;
}

// ── Ejecución del Scanner ─────────────────────────────────────────────────────
function run() {
  console.log(`[scanner] Escaneando biblioteca en: ${librosDir}`);
  const relativeFiles = getFilesRecursively(librosDir);
  console.log(`[scanner] Encontrados ${relativeFiles.length} archivos en total.`);

  // Cargar índice actual
  let indexData: any = {
    metadata: {
      version: 1,
      descripcion: "Índice de biblioteca personal de JarBees. Contiene metadatos de todos los documentos disponibles. Los embeddings se generan bajo demanda (lazy loading) solo cuando el usuario consulta un tema relacionado.",
      nota: "Agregar manualmente cada entrada cuando se incorpore un nuevo PDF o documento. NO incluir el contenido — solo metadatos para el Corpus Selector."
    },
    documentos: [],
    pendientesPorAgregar: []
  };

  if (fs.existsSync(indexFile)) {
    try {
      indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      console.log(`[scanner] Cargado índice existente con ${indexData.documentos.length} documentos.`);
    } catch (e: any) {
      console.error(`[scanner] Error leyendo índice existente: ${e.message}. Se creará uno nuevo.`);
    }
  }

  const existingDocsMap = new Map<string, any>();
  for (const doc of indexData.documentos) {
    existingDocsMap.set(doc.archivo, doc);
  }

  const updatedDocumentos: any[] = [];

  // Agregar los documentos base no-físicos (ej. herbario y sanaciones populares) que ya estuvieran en el índice
  for (const doc of indexData.documentos) {
    // Si no es un archivo físico en docs/libros (o son bases JSON virtuales de src/jarvis/knowledge/)
    if (doc.archivo === 'munay_ki_completo.md' || doc.archivo === 'plantas_medicinales.json' || doc.archivo === 'sanaciones_populares.json') {
      updatedDocumentos.push(doc);
    }
  }

  // Procesar archivos físicos escaneados
  for (const relFile of relativeFiles) {
    // Ignorar archivos del sistema como Thumbs.db
    if (relFile.endsWith('Thumbs.db')) continue;
    
    // Normalizar separadores de ruta a barras diagonales
    const normFile = relFile.replace(/\\/g, '/');

    // Verificar si ya existe en el mapa
    let docEntry = existingDocsMap.get(normFile);

    if (docEntry) {
      // Conservar el existente pero agregarlo a los actualizados
      updatedDocumentos.push(docEntry);
      console.log(`[scanner] Manteniendo existente: ${normFile} (${docEntry.titulo})`);
    } else {
      // Generar una nueva entrada
      const fileNameOnly = path.basename(normFile);
      let metadata: BookMetadata = {
        titulo: '',
        autor: '',
        categorias: [],
        conceptosClave: [],
        tags: []
      };

      // Heurística de detección según carpetas o mapeo estático
      if (META_MAP[fileNameOnly]) {
        metadata = META_MAP[fileNameOnly];
      } else if (normFile.includes('Carl Gustav Jung Libros/')) {
        // Autocompletar libros de Jung
        const cleanTitle = fileNameOnly
          .replace(/^\d+_/, '') // quitar "1_", "2_"
          .replace('.pdf', '')
          .replace('.PDF', '')
          .replace(/([A-Z])/g, ' $1')
          .trim();
        metadata = {
          titulo: cleanTitle,
          autor: 'Carl Gustav Jung',
          categorias: ['psicología analítica', 'arquetipos', 'inconsciente'],
          conceptosClave: ['arquetipos', 'sombra', 'ánima', 'ánimus', 'inconsciente colectivo', 'sí-mismo', 'persona'],
          tags: ['Jung', 'psicología', 'inconsciente', 'arquetipo']
        };
      } else if (normFile.includes('esoterismo practico/')) {
        // Autocompletar curso esoterismo
        const matchLeccion = fileNameOnly.match(/Lección Nº\s*(\d+)/i);
        const leccionNum = matchLeccion ? parseInt(matchLeccion[1], 10) : '';
        const title = `Curso de Esoterismo Práctico - Lección ${leccionNum}`;
        metadata = {
          titulo: title,
          autor: 'Al Filo de la Realidad',
          categorias: ['esoterismo', 'magia práctica', 'ocultismo'],
          conceptosClave: ['esoterismo', 'magia', 'astral', 'autodefensa', 'lección ' + leccionNum],
          tags: ['esoterismo', 'curso', 'lección', 'magia', 'ocultismo']
        };
      } else {
        // Fallback genérico
        const cleanTitle = fileNameOnly
          .replace(/\.pdf$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim();
        metadata = {
          titulo: cleanTitle,
          autor: 'Desconocido',
          categorias: ['Otros'],
          conceptosClave: [cleanTitle.toLowerCase()],
          tags: ['biblioteca']
        };
      }

      // Crear el ID
      const safeId = normFile
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);

      docEntry = {
        id: `lib-${safeId}`,
        titulo: metadata.titulo,
        archivo: normFile,
        tipo: 'libro',
        formato: path.extname(fileNameOnly).replace('.', '').toLowerCase(),
        autor: metadata.autor,
        idioma: 'es',
        categorias: metadata.categorias,
        conceptosClave: metadata.conceptosClave,
        capitulos: [],
        embeddings: 'pending',
        descripcionBreve: `Libro "${metadata.titulo}" de ${metadata.autor} registrado en la biblioteca local.`,
        tags: metadata.tags
      };

      updatedDocumentos.push(docEntry);
      console.log(`[scanner] Agregado nuevo: ${normFile} → ${docEntry.titulo}`);
    }
  }

  // Guardar en índice
  indexData.documentos = updatedDocumentos;
  fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2), 'utf-8');
  console.log(`[scanner] Sincronización terminada. Guardado en: ${indexFile}. Total documentos en índice: ${indexData.documentos.length}`);
}

run();
