import { CorpusMatch } from './corpus-selector.service';

export interface SelectedCorpusTargets {
  selectedMatches: CorpusMatch[];
  selectionMode: 'explicit_author' | 'multi_bibliography' | 'single_match';
  explicitAuthors: string[];
}

export interface ChunkDiversificationOptions {
  maxChunks: number;
  isMultiAuthorMode: boolean;
  maxSecondaryChunksPerSingleAuthor?: number;
}

/**
 * Elimina cláusulas de exclusión explícita ("dejemos afuera los arcanos mayores",
 * "sin incluir X", "excepto Y") SOLO al construir la consulta de búsqueda semántica/léxica,
 * evitando que el embedding o el reranker léxico traigan fragmentos precisamente del tema excluido.
 * La pregunta completa original se conserva intacta para el prompt del LLM.
 */
export function stripNegativeExclusionsForSearch(query: string): string {
  if (!query) return '';
  const cleaned = query
    .replace(
      /(?:[;,]\s*)?(?:dejemos\s+afuera|deja(?:ndo)?\s+afuera|sin\s+incluir|excluyendo|no\s+incluyas?|fuera\s+(?:los|las)|excepto|salvo)\s+[^.;?!]+/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 8 ? cleaned : query;
}

/**
 * Detecta consultas exhaustivas, de listado multi-ítem o comparativas entre tradiciones/obras
 * que requieren mayor cantidad de fragmentos RAG y mayor presupuesto de tokens de salida.
 */
export function isExhaustiveOrComparativeRagQuery(query: string): boolean {
  const norm = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return /(arcanos\s+menores|arcanos\s+mayores|56\s+arcanos|22\s+arcanos|78\s+cartas|significados?\s+de\s+(?:los|las)|lista\s+completa|todos\s+los\s+(?:arcanos|palos|significados|capitulos)|cada\s+un[ao]|cuatro\s+palos|bastos|copas|espadas|pentaculos|compar[aá]|diferencias?\s+entre|relacion\s+y\s+diferencia|perspectivas?|bibliografia)/i.test(
    norm,
  );
}

/**
 * Detecta si la consulta incluye una exclusión explícita de alcance que debe
 * reforzarse en las instrucciones de grounding del LLM.
 */
export function extractUserScopeExclusions(query: string): string[] {
  const matches: string[] = [];
  const regex =
    /(?:dejemos\s+afuera|deja(?:ndo)?\s+afuera|sin\s+incluir|excluyendo|no\s+incluyas?|fuera\s+(?:los|las)|excepto)\s+([^.;?!]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(query)) !== null) {
    const clause = m[1]?.trim();
    if (clause && clause.length >= 3) {
      matches.push(clause);
    }
  }
  return matches;
}

/**
 * Selecciona los documentos objetivo del corpus respetando dos reglas de oro:
 * 1. Si el usuario menciona explícitamente un autor (o varios autores), se aísla la búsqueda
 *    exclusivamente a TODAS las obras relevantes de ese/esos autor(es) (ej. Pamela Colman Smith).
 * 2. Si el usuario hace una pregunta temática general SIN nombrar autor (ej. "arcanos mayores
 *    y menores del tarot"), NO se aísla a 1 libro dominante: se prioriza la diversidad bibliográfica
 *    (1 obra principal por cada autor distinto primero, luego obras complementarias hasta maxDocs).
 */
export function selectCorpusTargets(
  libraryMatches: CorpusMatch[],
  maxDocs = 4,
): SelectedCorpusTargets {
  if (!libraryMatches || libraryMatches.length === 0) {
    return {
      selectedMatches: [],
      selectionMode: 'single_match',
      explicitAuthors: [],
    };
  }

  // Filtrar coincidencias explícitas de autor
  const explicitAuthorMatches = libraryMatches.filter((m) =>
    (m.matchedOn || []).some((tag) => tag.startsWith('autor:')),
  );

  if (explicitAuthorMatches.length > 0) {
    const deduped = deduplicateMatches(explicitAuthorMatches).slice(0, maxDocs);
    const seenAuthorKeys = new Set<string>();
    const explicitAuthors: string[] = [];
    for (const m of deduped) {
      const key = normalizeAuthorKey(m.document.autor);
      if (!seenAuthorKeys.has(key) && m.document.autor) {
        seenAuthorKeys.add(key);
        explicitAuthors.push(m.document.autor);
      }
    }
    return {
      selectedMatches: deduped,
      selectionMode: 'explicit_author',
      explicitAuthors,
    };
  }

  const dedupedAll = deduplicateMatches(libraryMatches);
  if (dedupedAll.length === 1) {
    return {
      selectedMatches: dedupedAll,
      selectionMode: 'single_match',
      explicitAuthors: [],
    };
  }

  // Filtrar ruido marginal cuando existen coincidencias fuertes (ej. score 5.5 vs top 71.5)
  const topScore = dedupedAll[0]?.score ?? 0;
  const relevantAll =
    topScore >= 20
      ? dedupedAll.filter((m) => m.score >= topScore * 0.25)
      : dedupedAll;

  // Modo multi-bibliografía: garantizar primero la mejor obra de CADA autor distinto
  const picked: CorpusMatch[] = [];
  const seenAuthorKeys = new Set<string>();
  const remaining: CorpusMatch[] = [];

  for (const match of relevantAll) {
    const authorKey = normalizeAuthorKey(match.document.autor);
    if (!seenAuthorKeys.has(authorKey)) {
      seenAuthorKeys.add(authorKey);
      picked.push(match);
      if (picked.length >= maxDocs) break;
    } else {
      remaining.push(match);
    }
  }

  for (const match of remaining) {
    if (picked.length >= maxDocs) break;
    picked.push(match);
  }

  return {
    selectedMatches: picked,
    selectionMode: picked.length > 1 ? 'multi_bibliography' : 'single_match',
    explicitAuthors: [],
  };
}

function deduplicateMatches(matches: CorpusMatch[]): CorpusMatch[] {
  const seen = new Set<string>();
  const out: CorpusMatch[] = [];
  for (const m of matches) {
    const key = m.document.dbId
      ? `db:${m.document.dbId}`
      : `title:${m.document.titulo.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function normalizeAuthorKey(autor?: string): string {
  if (!autor) return 'unknown';
  const norm = autor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  // Unificar "Pamela Colman Smith" y "Pamela Colman Smith & Arthur Edward Waite" bajo la misma tradición
  if (norm.includes('pamela') && norm.includes('smith')) {
    return 'pamela_colman_smith_rws';
  }
  return norm;
}

/**
 * Diversifica chunks re-rankeados para el contexto del LLM:
 * - En modo multi-autor / multi-bibliografía: intercala por documento (round-robin)
 *   para que libros extensos (ej. 887 chunks) no eclipsen a obras más concisas y todas
 *   las fuentes bibliográficas queden representadas.
 * - En modo autor único (ej. Pamela Colman Smith): ordena por relevancia híbrida pura
 *   para no desperdiciar slots en biografía cuando hay tablas estructuradas de mayor score.
 */
export function selectDiversifiedChunks<T extends { documentId?: number; document?: { id?: number } }>(
  rerankedChunks: T[],
  options: ChunkDiversificationOptions,
): T[] {
  const { maxChunks, isMultiAuthorMode } = options;
  if (!rerankedChunks || rerankedChunks.length === 0) return [];
  if (rerankedChunks.length <= maxChunks) return rerankedChunks;

  if (!isMultiAuthorMode) {
    return rerankedChunks.slice(0, maxChunks);
  }

  // Agrupar preservando el orden de relevancia dentro de cada documento
  const buckets = new Map<number, T[]>();
  const docOrder: number[] = [];
  for (const chunk of rerankedChunks) {
    const docId = chunk.document?.id ?? chunk.documentId ?? 0;
    if (!buckets.has(docId)) {
      buckets.set(docId, []);
      docOrder.push(docId);
    }
    buckets.get(docId)!.push(chunk);
  }

  if (docOrder.length <= 1) {
    return rerankedChunks.slice(0, maxChunks);
  }

  // Round-robin equilibrado entre todos los documentos presentes
  const selected: T[] = [];
  let round = 0;
  while (selected.length < maxChunks) {
    let addedInRound = false;
    for (const docId of docOrder) {
      if (selected.length >= maxChunks) break;
      const list = buckets.get(docId)!;
      if (round < list.length) {
        selected.push(list[round]);
        addedInRound = true;
      }
    }
    if (!addedInRound) break;
    round++;
  }

  return selected;
}

/**
 * Construye el encabezado de instrucciones RAG adaptado a consultas mono-autor o multi-bibliografía.
 */
export function buildRagContextHeader(params: {
  userMessage: string;
  distinctBooksCount: number;
  distinctAuthors: string[];
  selectionMode: 'explicit_author' | 'multi_bibliography' | 'single_match';
}): string {
  const exclusions = extractUserScopeExclusions(params.userMessage);
  const lines: string[] = [
    '### DOCUMENTOS DE LA BIBLIOTECA PERSONAL (RAG)',
    '⚠️ IDIOMA OBLIGATORIO: Respondé 100% EN ESPAÑOL. Traducí cualquier fragmento o término que esté en inglés.',
    '⚠️ RIGOR DOCUMENTAL ESTRICTO: Basate fielmente en los fragmentos provistos abajo. NUNCA inventes nombres de cartas, arcanos, autores ni clasificaciones inexistentes.',
  ];

  if (exclusions.length > 0) {
    lines.push(
      `🚫 EXCLUSIÓN EXPLÍCITA DEL USUARIO: El usuario pidió dejar afuera: [${exclusions.join('; ')}]. Respetá esa exclusión de forma ABSOLUTA y NO incluyas esos elementos en tu respuesta.`,
    );
  }

  if (params.distinctBooksCount >= 2 && params.selectionMode === 'multi_bibliography') {
    lines.push(
      `📚 SÍNTESIS MULTI-BIBLIOGRÁFICA (${params.distinctBooksCount} obras disponibles: ${params.distinctAuthors.join(' | ')}): ` +
        'Construí una respuesta rica, estructurada y comparativa que integre explícitamente los aportes y matices de CADA autor y obra presentes en los fragmentos, citando con claridad de qué libro/tradición proviene cada enfoque.',
    );
  } else {
    lines.push(
      'Utilizá el siguiente contenido documental para fundamentar tu respuesta con precisión y fidelidad. Si el usuario solicitó un formato específico (por ejemplo, 2 o 3 palabras por carta, listado por palos, etc.), cumplilo de manera completa y ordenada.',
    );
  }

  return lines.join('\n');
}
