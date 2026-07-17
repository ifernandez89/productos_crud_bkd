import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DocumentIngestService } from '../library/document-ingest.service';
import { DocumentRepository } from '../repositories/document.repository';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface LibraryDocument {
  id: string;
  titulo: string;
  archivo: string;
  tipo: string;
  formato: string;
  autor: string;
  idioma: string;
  categorias: string[];
  conceptosClave: string[];
  capitulos: Array<{ numero: number; titulo: string; paginas: string }>;
  embeddings: 'ready' | 'pending' | 'processing';
  descripcionBreve: string;
  tags: string[];
}

export interface LibraryIndex {
  metadata: { version: number; descripcion: string; nota: string };
  documentos: LibraryDocument[];
}

export interface CorpusMatch {
  document: LibraryDocument;
  score: number;
  matchedOn: string[]; // qué términos matchearon
  needsEmbedding: boolean;
}

// ── Escuelas de Pensamiento ───────────────────────────────────────────────────
export const SCHOOLS_OF_THOUGHT: Record<
  string,
  { authors: string[]; keywords: string[] }
> = {
  psicoanalisis: {
    authors: [
      'sigmund freud',
      'carl gustav jung',
      'jacques lacan',
      'freud',
      'jung',
      'lacan',
    ],
    keywords: [
      'inconsciente',
      'sueños',
      'represión',
      'complejo de edipo',
      'pulsión',
      'ego',
      'ello',
      'superyó',
      'transferencia',
      'neurosis',
      'histeria',
      'psicoanalisis',
    ],
  },
  teosofia: {
    authors: [
      'helena blavatsky',
      'arthur e. powell',
      'annie besant',
      'charles leadbeater',
      'arthur powell',
      'blavatsky',
      'powell',
      'besant',
      'leadbeater',
    ],
    keywords: [
      'cuerpo astral',
      'cuerpo mental',
      'chakras',
      'karma',
      'reencarnación',
      'devachan',
      'planos astrales',
      'vehículos de conciencia',
      'teosofía',
      'doctrina secreta',
      'teosofica',
      'esoterismo',
    ],
  },
  hermetismo: {
    authors: [
      'hermes trismegisto',
      'tres iniciados',
      'heinrich cornelius agrippa',
      'agrippa',
    ],
    keywords: [
      'kybalion',
      'hermetismo',
      'hermético',
      'tabla de esmeralda',
      'correspondencia',
      'vibración',
      'polaridad',
      'ritmo',
      'causa y efecto',
      'generación',
      'alquimia',
    ],
  },
  psicomagia: {
    authors: ['alejandro jodorowsky', 'jodorowsky'],
    keywords: [
      'psicomagia',
      'arbol genealogico',
      'actos psicomagicos',
      'tarot',
      'jodorowsky',
      'psicomagico',
    ],
  },
  chamanismo: {
    authors: ['alberto villoldo', 'angeles arrien', 'villoldo', 'arrien'],
    keywords: [
      'chamanismo',
      'chaman',
      'munay-ki',
      'ritos de iniciación',
      'campo energetico luminoso',
      'sendas del chaman',
      'chamanico',
    ],
  },
};

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * CorpusSelectorService — El "bibliotecario inteligente" de JarBees.
 *
 * Antes de buscar embeddings o procesar PDFs, consulta el índice liviano
 * de la biblioteca para encontrar los documentos más relevantes.
 *
 * Flujo:
 * 1. Usuario pregunta "¿Qué dice Jung sobre la Sombra?"
 * 2. CorpusSelector busca en library-index.json: Jung → Psicología → Sombra
 * 3. Devuelve: [{ document: Aion.pdf, score: 0.9, needsEmbedding: true }]
 * 4. Si needsEmbedding: procesar solo ese libro/capítulo (lazy loading)
 * 5. Si ya tiene embeddings: buscar directo
 */
@Injectable()
export class CorpusSelectorService {
  private readonly logger = new Logger(CorpusSelectorService.name);
  private index: LibraryIndex | null = null;
  private readonly indexPath = path.join(
    process.cwd(),
    'src',
    'jarvis',
    'knowledge',
    'library-index.json',
  );

  // ── Carga del índice ────────────────────────────────────────────────────────

  getIndex(): LibraryIndex {
    if (!this.index) {
      this.loadIndex();
    }
    return this.index!;
  }

  private loadIndex(): void {
    try {
      const raw = fs.readFileSync(this.indexPath, 'utf-8');
      this.index = JSON.parse(raw);
      this.logger.log(
        `[corpus] índice cargado: ${this.index!.documentos.length} documentos`,
      );
    } catch (err) {
      this.logger.error(
        `[corpus] error leyendo library-index.json: ${err.message}`,
      );
      this.index = {
        metadata: { version: 0, descripcion: '', nota: '' },
        documentos: [],
      };
    }
  }

  /** Recarga el índice desde disco (útil tras agregar documentos nuevos) */
  reloadIndex(): void {
    this.index = null;
    this.loadIndex();
  }

  // ── Selección de corpus relevante ──────────────────────────────────────────

  /**
   * Dado un query del usuario, devuelve los documentos más relevantes
   * de la biblioteca ordenados por score de relevancia.
   *
   * @param query   Pregunta del usuario
   * @param topK    Máximo de documentos a devolver (default 3)
   */
  findRelevantDocuments(query: string, topK = 3): CorpusMatch[] {
    const index = this.getIndex();
    if (index.documentos.length === 0) return [];

    const queryTerms = this.tokenize(query);
    const scored: CorpusMatch[] = [];

    for (const doc of index.documentos) {
      const result = this.scoreDocument(doc, queryTerms, query);
      if (result.score > 0) {
        scored.push(result);
      }
    }

    const top = scored.sort((a, b) => b.score - a.score).slice(0, topK);

    if (top.length > 0) {
      this.logger.log(
        `[corpus] query: "${query.slice(0, 60)}" → ${top.length} documentos relevantes`,
      );
      top.forEach((m) =>
        this.logger.debug(
          `  score=${m.score.toFixed(2)} "${m.document.titulo}" (matched: ${m.matchedOn.join(', ')})`,
        ),
      );
    } else {
      this.logger.log(
        `[corpus] sin documentos relevantes para: "${query.slice(0, 60)}"`,
      );
    }

    return top;
  }

  /**
   * Genera el bloque de contexto de biblioteca para inyectar al LLM.
   * Indica EXACTAMENTE qué documentos tiene disponibles y cuáles son relevantes.
   */
  buildLibraryContext(query: string): string | null {
    const matches = this.findRelevantDocuments(query, 3);
    if (matches.length === 0) return null;

    const lines: string[] = ['### BIBLIOTECA PERSONAL — DOCUMENTOS RELEVANTES'];

    for (const match of matches) {
      const doc = match.document;
      const embeddingStatus =
        doc.embeddings === 'ready'
          ? '✅ indexado'
          : doc.embeddings === 'processing'
            ? '⏳ procesando'
            : '📋 disponible (sin indexar)';

      lines.push('');
      lines.push(`**${doc.titulo}** — ${doc.autor}`);
      lines.push(`Categorías: ${doc.categorias.join(', ')}`);
      lines.push(`Descripción: ${doc.descripcionBreve}`);
      lines.push(`Conceptos: ${doc.conceptosClave.slice(0, 6).join(', ')}`);
      lines.push(`Estado: ${embeddingStatus}`);
      if (doc.capitulos.length > 0) {
        lines.push(
          `Capítulos relevantes: ${doc.capitulos
            .map((c) => `${c.numero}. ${c.titulo}`)
            .join(' | ')}`,
        );
      }
    }

    return lines.join('\n');
  }

  // ── Scoring de relevancia ────────────────────────────────────────────────────

  private scoreDocument(
    doc: LibraryDocument,
    queryTerms: string[],
    originalQuery: string,
  ): CorpusMatch {
    let score = 0;
    const matchedOn: string[] = [];
    const queryLower = originalQuery.toLowerCase();

    // 1. Coincidencia en título (peso alto)
    const titleLower = doc.titulo.toLowerCase();
    for (const term of queryTerms) {
      if (titleLower.includes(term)) {
        score += 3;
        matchedOn.push(`título:${term}`);
      }
    }

    // 2. Coincidencia en autor (peso muy alto — "Jung" → todos los libros de Jung)
    const autorLower = doc.autor.toLowerCase();
    for (const term of queryTerms) {
      if (autorLower.includes(term)) {
        score += 4;
        matchedOn.push(`autor:${term}`);
      }
    }

    // 3. Coincidencia en conceptos clave (peso alto)
    for (const concepto of doc.conceptosClave) {
      const conceptoLower = concepto.toLowerCase();
      for (const term of queryTerms) {
        if (conceptoLower.includes(term) || term.includes(conceptoLower)) {
          score += 2.5;
          matchedOn.push(`concepto:${concepto}`);
          break;
        }
      }
      // Búsqueda inversa: el concepto completo aparece en la query
      if (queryLower.includes(conceptoLower) && conceptoLower.length >= 4) {
        score += 3;
        matchedOn.push(`concepto_exacto:${concepto}`);
      }
    }

    // 4. Coincidencia en categorías (peso medio)
    for (const cat of doc.categorias) {
      const catLower = cat.toLowerCase();
      for (const term of queryTerms) {
        if (catLower.includes(term) || term.includes(catLower)) {
          score += 2;
          matchedOn.push(`categoría:${cat}`);
          break;
        }
      }
    }

    // 5. Coincidencia en tags (peso bajo)
    for (const tag of doc.tags) {
      const tagLower = tag.toLowerCase();
      for (const term of queryTerms) {
        if (tagLower === term || queryLower.includes(tagLower)) {
          score += 1.5;
          matchedOn.push(`tag:${tag}`);
          break;
        }
      }
    }

    // 6. Coincidencia en títulos de capítulos (peso alto — "Sombra" → Cap 2)
    for (const cap of doc.capitulos) {
      const capTitulo = cap.titulo.toLowerCase();
      for (const term of queryTerms) {
        if (capTitulo.includes(term)) {
          score += 3;
          matchedOn.push(`capítulo:${cap.titulo}`);
          break;
        }
      }
    }

    // 7. Coincidencia por Escuela de Pensamiento (peso muy alto para recuperar el corpus completo de la corriente)
    for (const [school, data] of Object.entries(SCHOOLS_OF_THOUGHT)) {
      const isQueryAboutSchool =
        queryLower.includes(school) ||
        data.keywords.some((kw) => queryLower.includes(kw));

      if (isQueryAboutSchool) {
        const isDocInSchool = data.authors.some((auth) =>
          doc.autor.toLowerCase().includes(auth),
        );
        if (isDocInSchool) {
          score += 6; // Boost fuerte para priorizar autores de la misma escuela
          matchedOn.push(`escuela:${school}`);
        }
      }
    }

    // Deduplicar matchedOn
    const uniqueMatches = [...new Set(matchedOn)];

    return {
      document: doc,
      score: Math.round(score * 100) / 100,
      matchedOn: uniqueMatches,
      needsEmbedding: doc.embeddings !== 'ready',
    };
  }

  /**
   * Obtiene el autor y la escuela de pensamiento de un documento por su título exacto.
   */
  getAuthorAndSchoolByTitle(title: string): { author: string; school: string } {
    const doc = this.getIndex().documentos.find(
      (d) => d.titulo.toLowerCase() === title.toLowerCase(),
    );
    if (!doc) {
      return { author: 'Autor Desconocido', school: 'OTRO' };
    }
    const author = doc.autor;
    const authorLower = author.toLowerCase();

    let school = 'OTRO';
    for (const [schoolName, data] of Object.entries(SCHOOLS_OF_THOUGHT)) {
      if (data.authors.some((auth) => authorLower.includes(auth))) {
        school = schoolName.toUpperCase();
        break;
      }
    }
    return { author, school };
  }

  // ── Utilidades ───────────────────────────────────────────────────────────────

  private tokenize(text: string): string[] {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quitar tildes
      .toLowerCase()
      .split(/[^a-z0-9áéíóúüñ]+/)
      .filter((t) => t.length >= 3 || /^\d+$/.test(t))
      .filter((t) => !STOPWORDS.has(t));
  }

  // ── Consultas de gestión ─────────────────────────────────────────────────────

  getAllDocuments(): LibraryDocument[] {
    return this.getIndex().documentos;
  }

  getDocumentById(id: string): LibraryDocument | undefined {
    return this.getIndex().documentos.find((d) => d.id === id);
  }

  getDocumentsByCategory(category: string): LibraryDocument[] {
    const cat = category.toLowerCase();
    return this.getIndex().documentos.filter((d) =>
      d.categorias.some((c) => c.toLowerCase().includes(cat)),
    );
  }

  getPendingEmbeddings(): LibraryDocument[] {
    return this.getIndex().documentos.filter((d) => d.embeddings === 'pending');
  }

  markEmbeddingReady(id: string): void {
    const doc = this.getDocumentById(id);
    if (doc) {
      doc.embeddings = 'ready';
      this.saveIndexToDisk();
      this.logger.log(
        `[corpus] embeddings marcados como ready: "${doc.titulo}"`,
      );
    }
  }

  /**
   * Guarda el índice de la biblioteca en disco (library-index.json).
   */
  private saveIndexToDisk(): void {
    try {
      fs.writeFileSync(
        this.indexPath,
        JSON.stringify(this.index, null, 2),
        'utf-8',
      );
      this.logger.log(
        `[corpus] Índice de biblioteca guardado en disco: ${this.indexPath}`,
      );
    } catch (err: any) {
      this.logger.error(
        `[corpus] Error guardando library-index.json: ${err.message}`,
      );
    }
  }

  /**
   * Obtiene una lista única de todos los autores presentes en el índice de la biblioteca.
   */
  getAllAuthors(): string[] {
    const authors = this.getIndex().documentos.map((d) => d.autor);
    return Array.from(new Set(authors)).filter(Boolean);
  }

  /**
   * Obtiene una lista única de todos los conceptos clave definidos en el índice de la biblioteca.
   */
  getAllConcepts(): string[] {
    const concepts = this.getIndex().documentos.flatMap((d) => d.conceptosClave);
    return Array.from(new Set(concepts)).filter(Boolean);
  }

  /**
   * Realiza la carga perezosa de un documento (ingesta de PDF o archivo y generación de embeddings).
   */
  async lazyLoadDocument(
    doc: LibraryDocument,
    ingestService: DocumentIngestService,
    documentRepo: DocumentRepository,
  ): Promise<number> {
    this.logger.log(
      `[lazy-load] Iniciando carga perezosa para: "${doc.titulo}" (${doc.archivo})`,
    );

    // 1. Verificar si ya existe en la base de datos (por título exacto)
    const existing = await documentRepo.findDocumentByExactTitle(doc.titulo);
    if (existing) {
      this.logger.log(
        `[lazy-load] El documento "${doc.titulo}" ya existe en la base de datos con ID ${existing.id} (Status: ${existing.status}).`,
      );

      if (
        existing.status === 'quarantined' ||
        existing.status === 'not_indexed'
      ) {
        this.logger.log(
          `[lazy-load] Aprobando e iniciando indexación para el documento existente en cuarentena...`,
        );
        await ingestService.approveDocument(existing.id);
      }

      // Actualizar el índice JSON
      doc.embeddings = 'ready';
      this.saveIndexToDisk();
      return existing.id;
    }

    // 2. Localizar el archivo en el sistema de archivos
    let fullPath = path.join(process.cwd(), 'docs', 'libros', doc.archivo);
    if (!fs.existsSync(fullPath)) {
      // Intentar sin la carpeta libros
      fullPath = path.join(process.cwd(), 'docs', doc.archivo);
      if (!fs.existsSync(fullPath)) {
        throw new Error(
          `Archivo no encontrado en docs/ o docs/libros/: ${doc.archivo}`,
        );
      }
    }

    // 3. Leer e Ingerir el archivo según su tipo/extensión
    const fileExtension = path.extname(doc.archivo).toLowerCase();
    let dbDocId: number;

    if (fileExtension === '.pdf') {
      const buffer = fs.readFileSync(fullPath);
      const result = await ingestService.ingestPdf(
        buffer,
        doc.titulo,
        doc.categorias[0] ?? 'libros',
        fullPath,
      );
      dbDocId = result.documentId;
    } else {
      // markdown, txt, json, etc.
      const content = fs.readFileSync(fullPath, 'utf8');
      const result = await ingestService.ingestText(
        doc.titulo,
        content,
        doc.categorias[0] ?? 'libros',
        fullPath,
      );
      dbDocId = result.documentId;
    }

    // Auto-aprobar el documento recién ingestado para que comience el pipeline
    this.logger.log(
      `[lazy-load] Auto-aprobando nuevo documento ID ${dbDocId} para indexación jerárquica...`,
    );
    await ingestService.approveDocument(dbDocId);

    // 4. Actualizar el índice en memoria y disco
    doc.embeddings = 'ready';
    this.saveIndexToDisk();

    this.logger.log(
      `[lazy-load] Carga perezosa finalizada con éxito. Documento ID en BD: ${dbDocId}`,
    );
    return dbDocId;
  }
}

// ── Stopwords en español ──────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'que',
  'qué',
  'como',
  'cómo',
  'cual',
  'cuál',
  'cuando',
  'cuándo',
  'donde',
  'dónde',
  'quien',
  'quién',
  'por',
  'para',
  'con',
  'sin',
  'sobre',
  'entre',
  'desde',
  'hasta',
  'hacia',
  'ante',
  'bajo',
  'tras',
  'una',
  'uno',
  'unos',
  'unas',
  'los',
  'las',
  'del',
  'los',
  'sus',
  'este',
  'esta',
  'estos',
  'estas',
  'ese',
  'esa',
  'esos',
  'esas',
  'hay',
  'ser',
  'estar',
  'tiene',
  'tienen',
  'puedo',
  'puede',
  'pueden',
  'decir',
  'dice',
  'dices',
  'habla',
  'hablan',
  'sabe',
  'saben',
  'más',
  'muy',
  'tan',
  'todo',
  'toda',
  'todos',
  'todas',
  'algo',
  'alguien',
  'algún',
  'alguna',
  'ningún',
  'ninguna',
  'me',
  'te',
  'se',
  'nos',
  'les',
  'him',
  'her',
  'them',
  'the',
  'and',
  'for',
  'with',
  'about',
  'what',
  'how',
  'who',
]);
