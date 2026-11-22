import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeEntityType, KnowledgeRelationType } from '@prisma/client';
import { DocumentIngestService } from './document-ingest.service';
import { DocumentRepository } from '../repositories/document.repository';
import {
  CorpusSelectorService,
  LibraryDocument,
} from '../knowledge/corpus-selector.service';
import { EntityGraphService } from '../knowledge/entity-graph.service';
import { EntityGraphRepository } from '../repositories/entity-graph.repository';
import { PrismaService } from '../../prisma/prisma.service';

// ── Interfaces públicas ───────────────────────────────────────────────────────

export interface CharacterAcquisitionOptions {
  /** Si es true, aprueba e indexa el dossier inmediatamente tras ingestarlo (uso explícito de operador/chat). Por defecto false (cuarentena Zero-Trust). */
  autoApprove?: boolean;
  /** Ignora el caché en disco y re-descarga fuentes abiertas actualizadas. */
  forceRefresh?: boolean;
  /** Intenta descargar hasta maxPublicDomainBooks textos en dominio público (Project Gutenberg) si coinciden con el autor. */
  downloadPublicDomainBooks?: boolean;
  /** Máximo de libros completos de dominio público a descargar por ejecución (tope de seguridad: 2). */
  maxPublicDomainBooks?: number;
  /** Categoría explícita opcional; si se omite se infiere automáticamente. */
  category?: string;
}

export interface PublicDomainWork {
  title: string;
  source: 'wikisource' | 'gutenberg' | 'openlibrary' | 'archive';
  url: string;
  language?: string;
  year?: string;
  plainTextUrl?: string;
  downloadedFile?: string;
  documentId?: number;
}

export interface WikipediaArticleData {
  lang: 'es' | 'en';
  title: string;
  url: string;
  summary: string;
  extract: string;
  categories: string[];
  wikidataId?: string;
  englishTitle?: string;
}

export interface OpenLibraryAuthorData {
  key: string;
  name: string;
  birthDate?: string;
  deathDate?: string;
  alternateNames: string[];
  topSubjects: string[];
  topWork?: string;
  works: PublicDomainWork[];
}

export interface CachedCharacterResearch {
  queriedName: string;
  canonicalName: string;
  slug: string;
  fetchedAt: string;
  wikipediaEs: WikipediaArticleData | null;
  wikipediaEn: WikipediaArticleData | null;
  wikisourceWorks: PublicDomainWork[];
  openLibrary: OpenLibraryAuthorData | null;
  gutenbergWorks: PublicDomainWork[];
}

export interface CharacterAcquisitionResult {
  success: boolean;
  canonicalName: string;
  slug: string;
  documentId: number;
  status: 'ready' | 'indexing' | 'quarantined';
  alreadyExists: boolean;
  category: string;
  filePath: string;
  cachePath: string;
  sourcesUsed: string[];
  publicDomainWorks: PublicDomainWork[];
  downloadedBooks: Array<{
    title: string;
    documentId: number;
    filePath: string;
    sourceUrl: string;
  }>;
  graphEntitiesCount: number;
  graphRelationsCount: number;
  summaryExcerpt: string;
  wordCount: number;
  chaptersCount: number;
}

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * CharacterAcquisitionService — Motor autónomo de adquisición bibliográfica de personajes históricos.
 *
 * Dado el nombre de un personaje o autor (ej. "Hildegarda de Bingen", "Paracelso", "Hipatia"):
 * 1. Consulta exclusivamente fuentes abiertas verificadas y en lista blanca (SSRF-safe):
 *    - Wikipedia API (ES + EN vía langlinks)
 *    - Wikisource API (ES + EN)
 *    - OpenLibrary Authors & Works API
 *    - Gutendex / Project Gutenberg (textos de dominio público)
 * 2. Persiste el caché crudo incremental en `storage/character-acquisition/<slug>.json`.
 * 3. Sintetiza un dossier Markdown jerárquico (`#` Capítulos / `##` Secciones) en `docs/books/characters/<slug>.md`.
 * 4. Ingesta el dossier en PostgreSQL vía `DocumentIngestService.ingestText()` (respetando cuarentena F-B1-06).
 * 5. Opcionalmente (cuando `autoApprove: true` bajo orden explícita del operador) dispara la indexación
 *    jerárquica (`approveDocument`), actualiza `library-index.json` en `CorpusSelectorService` y siembra
 *    entidades y relaciones respaldadas con evidencia en el Grafo de Conocimiento (`KnowledgeEntity` / `KnowledgeRelation`).
 */
@Injectable()
export class CharacterAcquisitionService {
  private readonly logger = new Logger(CharacterAcquisitionService.name);

  private static readonly USER_AGENT =
    'JarBeesLibraryBot/1.0 (+https://github.com/ifernandez89/productos_crud_bkd)';
  private static readonly HTTP_TIMEOUT_MS = 12_000;
  private static readonly MAX_BOOK_BYTES = 600_000; // 600 KB por obra de dominio público

  private static readonly ALLOWED_HOSTS = new Set([
    'es.wikipedia.org',
    'en.wikipedia.org',
    'es.wikisource.org',
    'en.wikisource.org',
    'gutendex.com',
    'www.gutenberg.org',
    'gutenberg.org',
    'openlibrary.org',
  ]);

  private readonly charactersDocsDir: string;
  private readonly cacheDir: string;

  constructor(
    private readonly ingestService: DocumentIngestService,
    private readonly documentRepo: DocumentRepository,
    private readonly corpusSelector: CorpusSelectorService,
    @Optional() private readonly entityGraphService?: EntityGraphService,
    @Optional() private readonly entityGraphRepo?: EntityGraphRepository,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.charactersDocsDir = path.resolve(
      process.cwd(),
      'docs',
      'books',
      'characters',
    );
    this.cacheDir = path.resolve(
      process.cwd(),
      'storage',
      'character-acquisition',
    );
  }

  // ── Validación de entrada y seguridad (Zero-Trust) ──────────────────────────

  sanitizeCharacterName(rawName: string): string {
    if (!rawName || typeof rawName !== 'string') {
      throw new BadRequestException(
        'Se requiere el nombre del personaje o autor histórico.',
      );
    }

    const cleaned = rawName
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/^["'“‘«\s]+|["'”’»\s.,;:!?]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length < 2 || cleaned.length > 120) {
      throw new BadRequestException(
        'El nombre del personaje debe tener entre 2 y 120 caracteres.',
      );
    }

    if (/(?:^|[\\/])\.\.(?:[\\/]|$)|https?:\/\//i.test(cleaned)) {
      throw new ForbiddenException(
        'SecurityKernel: nombre de personaje inválido o con patrones prohibidos.',
      );
    }

    return cleaned;
  }

  toSafeSlug(name: string): string {
    const slug = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    if (!slug) {
      throw new BadRequestException(
        'No se pudo derivar un identificador válido a partir del nombre provisto.',
      );
    }
    return slug;
  }

  assertAllowedUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new ForbiddenException(
        `SecurityKernel: URL malformada rechazada: "${rawUrl}"`,
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new ForbiddenException(
        `SecurityKernel: solo se permiten conexiones HTTPS verificadas (recibido: ${parsed.protocol}).`,
      );
    }

    if (!CharacterAcquisitionService.ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new ForbiddenException(
        `SecurityKernel: dominio "${parsed.hostname}" no autorizado en la lista blanca de fuentes abiertas.`,
      );
    }

    return parsed;
  }

  resolveConfinedFilePath(baseDir: string, fileName: string): string {
    if (
      !fileName ||
      fileName.includes('\0') ||
      fileName.includes('..') ||
      /[\\/]/.test(fileName)
    ) {
      throw new ForbiddenException(
        'SecurityKernel: nombre de archivo inválido o con intento de traversal.',
      );
    }

    const canonicalBase = path.resolve(baseDir);
    const resolved = path.resolve(canonicalBase, fileName);
    const rel = path.relative(canonicalBase, resolved);

    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ForbiddenException(
        'SecurityKernel: ruta de archivo fuera del directorio confinado.',
      );
    }

    return resolved;
  }

  // ── Flujo principal de adquisición ──────────────────────────────────────────

  async acquireCharacter(
    rawName: string,
    options: CharacterAcquisitionOptions = {},
  ): Promise<CharacterAcquisitionResult> {
    const cleanQuery = this.sanitizeCharacterName(rawName);
    const querySlug = this.toSafeSlug(cleanQuery);
    const autoApprove = options.autoApprove === true;
    const forceRefresh = options.forceRefresh === true;
    const downloadBooks = options.downloadPublicDomainBooks !== false;
    const maxBooks = Math.min(Math.max(options.maxPublicDomainBooks ?? 1, 0), 2);

    this.logger.log(
      `[character-acq] Iniciando adquisición para "${cleanQuery}" (autoApprove=${autoApprove}, forceRefresh=${forceRefresh})`,
    );

    // 1. Reunir o reutilizar investigación desde caché incremental en disco
    const research = await this.collectOrLoadResearch(
      cleanQuery,
      querySlug,
      forceRefresh,
    );

    if (!research.wikipediaEs && !research.wikipediaEn && !research.openLibrary) {
      throw new BadRequestException(
        `No encontré fuentes abiertas verificadas (Wikipedia/OpenLibrary) para "${cleanQuery}". Verificá la ortografía del personaje.`,
      );
    }

    const canonicalName = research.canonicalName;
    const slug = research.slug;
    const docTitle = `${canonicalName} — Dossier Biográfico y Obra`;
    const category = options.category || this.inferCategory(research);

    // 2. Comprobar deduplicación en BD (si ya existe y no es forceRefresh)
    if (!forceRefresh) {
      const existing = await this.documentRepo.findDocumentByExactTitle(docTitle);
      if (existing) {
        this.logger.log(
          `[character-acq] Dossier "${docTitle}" ya existe en BD (ID=${existing.id}, status=${existing.status}).`,
        );

        const dossierFilePath = this.resolveConfinedFilePath(
          this.charactersDocsDir,
          `${slug}.md`,
        );
        const cachePath = this.resolveConfinedFilePath(
          this.cacheDir,
          `${slug}.json`,
        );

        // Si estaba en cuarentena y el operador pidió autoApprove, aprobarlo ahora
        let finalStatus = existing.status as 'ready' | 'indexing' | 'quarantined';
        if (autoApprove && existing.status === 'quarantined') {
          await this.approveAndAwaitStructuralIndex(existing.id);
          finalStatus = 'ready';
        }

        const sourcesUsed = this.collectSourceUrls(research);
        const allWorks = this.mergePublicDomainWorks(research);

        return {
          success: true,
          canonicalName,
          slug,
          documentId: existing.id,
          status: finalStatus,
          alreadyExists: true,
          category: existing.category || category,
          filePath: dossierFilePath,
          cachePath,
          sourcesUsed,
          publicDomainWorks: allWorks,
          downloadedBooks: [],
          graphEntitiesCount: 0,
          graphRelationsCount: 0,
          summaryExcerpt: this.buildExecutiveSummary(research),
          wordCount: existing.content.split(/\s+/).filter(Boolean).length,
          chaptersCount: (existing.content.match(/^# /gm) || []).length,
        };
      }
    }

    // 3. Construir Markdown jerárquico y persistirlo en docs/books/characters/<slug>.md
    const markdown = this.buildStructuredDossierMarkdown(research, category);
    this.ensureDir(this.charactersDocsDir);
    const dossierFilePath = this.resolveConfinedFilePath(
      this.charactersDocsDir,
      `${slug}.md`,
    );
    fs.writeFileSync(dossierFilePath, markdown, 'utf8');

    const cachePath = this.resolveConfinedFilePath(this.cacheDir, `${slug}.json`);
    const sourcesUsed = this.collectSourceUrls(research);
    const primarySourceUrl = sourcesUsed[0] || dossierFilePath;

    // 4. Ingestar en PostgreSQL vía DocumentIngestService (siempre entra en cuarentena F-B1-06)
    const ingestRes = await this.ingestService.ingestText(
      docTitle,
      markdown,
      category,
      primarySourceUrl,
    );

    let status: 'ready' | 'indexing' | 'quarantined' = 'quarantined';
    let graphEntitiesCount = 0;
    let graphRelationsCount = 0;

    // 5. Descargar opcionalmente obras en dominio público (Project Gutenberg plain text)
    const downloadedBooks: Array<{
      title: string;
      documentId: number;
      filePath: string;
      sourceUrl: string;
    }> = [];

    if (downloadBooks && maxBooks > 0 && research.gutenbergWorks.length > 0) {
      const candidates = research.gutenbergWorks
        .filter((w) => Boolean(w.plainTextUrl))
        .slice(0, maxBooks);

      for (const work of candidates) {
        try {
          const downloaded = await this.downloadAndIngestPublicDomainWork(
            canonicalName,
            slug,
            work,
            category,
            autoApprove,
          );
          if (downloaded) {
            work.downloadedFile = downloaded.filePath;
            work.documentId = downloaded.documentId;
            downloadedBooks.push(downloaded);
          }
        } catch (err: any) {
          this.logger.warn(
            `[character-acq] No se pudo descargar obra "${work.title}": ${err?.message ?? err}`,
          );
        }
      }
    }

    // 6. Registrar en library-index.json para CorpusSelectorService
    const indexEntry = this.buildLibraryIndexEntry(
      research,
      docTitle,
      category,
      ingestRes.documentId,
      autoApprove ? 'ready' : 'pending',
    );
    this.corpusSelector.upsertDocumentEntry(indexEntry);

    // 7. Si autoApprove=true (orden explícita del operador), indexar jerárquicamente y poblar Knowledge Graph
    if (autoApprove) {
      await this.approveAndAwaitStructuralIndex(ingestRes.documentId);
      status = 'ready';

      const graphStats = await this.seedKnowledgeGraph(
        research,
        ingestRes.documentId,
        markdown,
      );
      graphEntitiesCount = graphStats.entitiesCount;
      graphRelationsCount = graphStats.relationsCount;
    }

    const allWorks = this.mergePublicDomainWorks(research);
    const wordCount = markdown.split(/\s+/).filter(Boolean).length;
    const chaptersCount = (markdown.match(/^# /gm) || []).length;

    this.logger.log(
      `[character-acq] Completado "${canonicalName}" → docId=${ingestRes.documentId}, status=${status}, words=${wordCount}, works=${allWorks.length}, downloaded=${downloadedBooks.length}, graphEntities=${graphEntitiesCount}`,
    );

    return {
      success: true,
      canonicalName,
      slug,
      documentId: ingestRes.documentId,
      status,
      alreadyExists: false,
      category,
      filePath: dossierFilePath,
      cachePath,
      sourcesUsed,
      publicDomainWorks: allWorks,
      downloadedBooks,
      graphEntitiesCount,
      graphRelationsCount,
      summaryExcerpt: this.buildExecutiveSummary(research),
      wordCount,
      chaptersCount,
    };
  }

  // ── Recolección multi-fuente con caché incremental en disco ─────────────────

  private async collectOrLoadResearch(
    cleanQuery: string,
    querySlug: string,
    forceRefresh: boolean,
  ): Promise<CachedCharacterResearch> {
    this.ensureDir(this.cacheDir);
    const queryCachePath = this.resolveConfinedFilePath(
      this.cacheDir,
      `${querySlug}.json`,
    );

    if (!forceRefresh && fs.existsSync(queryCachePath)) {
      try {
        const cached = JSON.parse(
          fs.readFileSync(queryCachePath, 'utf8'),
        ) as CachedCharacterResearch;
        if (cached && cached.canonicalName && (cached.wikipediaEs || cached.wikipediaEn)) {
          this.logger.log(
            `[character-acq] Reutilizando caché incremental en disco: ${queryCachePath}`,
          );
          return cached;
        }
      } catch (err: any) {
        this.logger.warn(
          `[character-acq] Caché corrupto en ${queryCachePath}, re-descargando: ${err?.message}`,
        );
      }
    }

    // 1. Wikipedia ES primero (nos da título canónico y langlink exacto a EN)
    const wikiEs = await this.fetchWikipediaArticle('es', cleanQuery).catch((err) => {
      this.logger.warn(`[character-acq] Wikipedia ES falló: ${err?.message}`);
      return null;
    });

    const englishTarget = wikiEs?.englishTitle || cleanQuery;

    // 2. En paralelo: Wikipedia EN, Wikisource ES/EN, OpenLibrary y Gutendex
    const [wikiEnRes, wikisourceEsRes, wikisourceEnRes, openLibRes, gutenbergRes] =
      await Promise.allSettled([
        this.fetchWikipediaArticle('en', englishTarget),
        this.fetchWikisourceWorks('es', wikiEs?.title || cleanQuery),
        this.fetchWikisourceWorks('en', englishTarget),
        this.fetchOpenLibraryAuthor(englishTarget, wikiEs?.title || cleanQuery),
        this.fetchGutenbergWorks(englishTarget, wikiEs?.title || cleanQuery),
      ]);

    const wikiEn = wikiEnRes.status === 'fulfilled' ? wikiEnRes.value : null;
    const wikisourceWorks = [
      ...(wikisourceEsRes.status === 'fulfilled' ? wikisourceEsRes.value : []),
      ...(wikisourceEnRes.status === 'fulfilled' ? wikisourceEnRes.value : []),
    ];
    const openLibrary = openLibRes.status === 'fulfilled' ? openLibRes.value : null;
    const gutenbergWorks =
      gutenbergRes.status === 'fulfilled' ? gutenbergRes.value : [];

    const canonicalName =
      wikiEs?.title || wikiEn?.title || openLibrary?.name || cleanQuery;
    const canonicalSlug = this.toSafeSlug(canonicalName);

    const research: CachedCharacterResearch = {
      queriedName: cleanQuery,
      canonicalName,
      slug: canonicalSlug,
      fetchedAt: new Date().toISOString(),
      wikipediaEs: wikiEs,
      wikipediaEn: wikiEn,
      wikisourceWorks,
      openLibrary,
      gutenbergWorks,
    };

    // Persistir caché bajo el slug canónico (y bajo el querySlug si difiere)
    const canonicalCachePath = this.resolveConfinedFilePath(
      this.cacheDir,
      `${canonicalSlug}.json`,
    );
    fs.writeFileSync(canonicalCachePath, JSON.stringify(research, null, 2), 'utf8');
    if (canonicalSlug !== querySlug) {
      fs.writeFileSync(queryCachePath, JSON.stringify(research, null, 2), 'utf8');
    }

    return research;
  }

  // ── Conectores de fuentes abiertas (Allowlisted HTTPS) ──────────────────────

  private async safeGet<T = any>(
    rawUrl: string,
    params?: Record<string, any>,
    responseType: 'json' | 'text' = 'json',
  ): Promise<T> {
    const parsed = this.assertAllowedUrl(rawUrl);
    const response = await axios.get<T>(parsed.toString(), {
      params,
      timeout: CharacterAcquisitionService.HTTP_TIMEOUT_MS,
      responseType,
      maxContentLength: CharacterAcquisitionService.MAX_BOOK_BYTES * 2,
      headers: {
        'User-Agent': CharacterAcquisitionService.USER_AGENT,
        Accept:
          responseType === 'json'
            ? 'application/json'
            : 'text/plain; charset=utf-8',
      },
    });
    return response.data;
  }

  private async fetchWikipediaArticle(
    lang: 'es' | 'en',
    query: string,
  ): Promise<WikipediaArticleData | null> {
    const apiUrl = `https://${lang}.wikipedia.org/w/api.php`;

    // 1. Resolver título canónico con list=search
    const searchData = await this.safeGet<any>(apiUrl, {
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: 3,
      format: 'json',
    });

    const hits: Array<{ title: string; snippet?: string }> =
      searchData?.query?.search || [];
    if (hits.length === 0) return null;

    const chosenTitle = this.pickBestWikipediaHit(query, hits);

    // 2. Traer extracto completo en texto plano, categorías, URL y langlink a inglés
    const props =
      lang === 'es'
        ? 'extracts|info|categories|pageprops|langlinks'
        : 'extracts|info|categories|pageprops';

    const pageParams: Record<string, any> = {
      action: 'query',
      titles: chosenTitle,
      prop: props,
      explaintext: 1,
      exsectionformat: 'wiki',
      inprop: 'url',
      cllimit: 30,
      redirects: 1,
      format: 'json',
    };
    if (lang === 'es') {
      pageParams.lllang = 'en';
      pageParams.lllimit = 5;
    }

    const pageData = await this.safeGet<any>(apiUrl, pageParams);
    const pages = pageData?.query?.pages || {};
    const pageObj = Object.values(pages)[0] as any;
    if (!pageObj || pageObj.missing !== undefined || !pageObj.extract) {
      return null;
    }

    const extract = String(pageObj.extract || '').trim();
    if (extract.length < 120) return null;

    const summary =
      extract
        .split(/\n==\s*/)
        .shift()
        ?.trim()
        .slice(0, 1500) || extract.slice(0, 800);

    const categories: string[] = Array.isArray(pageObj.categories)
      ? pageObj.categories
          .map((c: any) =>
            String(c.title || '')
              .replace(/^(?:Categoría|Category):/i, '')
              .trim(),
          )
          .filter(
            (c: string) =>
              c.length > 0 &&
              !/^(?:Wikipedia|Articles|CS1|All articles|Webarchive|Commons)/i.test(c),
          )
      : [];

    const englishTitle: string | undefined = Array.isArray(pageObj.langlinks)
      ? pageObj.langlinks[0]?.['*'] || pageObj.langlinks[0]?.title
      : undefined;

    return {
      lang,
      title: String(pageObj.title || chosenTitle),
      url:
        String(pageObj.fullurl || '') ||
        `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(chosenTitle.replace(/\s+/g, '_'))}`,
      summary,
      extract,
      categories,
      wikidataId: pageObj.pageprops?.wikibase_item,
      englishTitle,
    };
  }

  private pickBestWikipediaHit(
    query: string,
    hits: Array<{ title: string }>,
  ): string {
    const normQuery = this.normalizeSimple(query);
    const exact = hits.find((h) => this.normalizeSimple(h.title) === normQuery);
    if (exact) return exact.title;

    // Preferir resultados que no sean listas ni desambiguaciones
    const nonDisambig = hits.find(
      (h) => !/\((?:desambiguaci[oó]n|disambiguation)\)/i.test(h.title),
    );
    return nonDisambig?.title || hits[0].title;
  }

  private async fetchWikisourceWorks(
    lang: 'es' | 'en',
    authorQuery: string,
  ): Promise<PublicDomainWork[]> {
    const apiUrl = `https://${lang}.wikisource.org/w/api.php`;
    const data = await this.safeGet<any>(apiUrl, {
      action: 'query',
      list: 'search',
      srsearch: authorQuery,
      srlimit: 6,
      format: 'json',
    });

    const hits: Array<{ title: string }> = data?.query?.search || [];
    const authorTokens = this.normalizeSimple(authorQuery)
      .split(/\s+/)
      .filter((t) => t.length >= 4);

    return hits
      .filter((h) => {
        const nt = this.normalizeSimple(h.title);
        return authorTokens.some((tok) => nt.includes(tok));
      })
      .slice(0, 5)
      .map((h) => ({
        title: h.title,
        source: 'wikisource' as const,
        language: lang,
        url: `https://${lang}.wikisource.org/wiki/${encodeURIComponent(h.title.replace(/\s+/g, '_'))}`,
      }));
  }

  private async fetchOpenLibraryAuthor(
    englishName: string,
    spanishName: string,
  ): Promise<OpenLibraryAuthorData | null> {
    const queries = Array.from(new Set([englishName, spanishName].filter(Boolean)));
    let bestAuthor: any = null;

    for (const q of queries) {
      const search = await this.safeGet<any>(
        'https://openlibrary.org/search/authors.json',
        { q, limit: 5 },
      );
      const docs: any[] = search?.docs || [];
      if (docs.length > 0) {
        bestAuthor =
          docs.sort((a, b) => (b.work_count || 0) - (a.work_count || 0))[0] ||
          docs[0];
        break;
      }
    }

    if (!bestAuthor?.key) return null;

    const authorKey = String(bestAuthor.key).replace(/^\/authors\//, '');
    let works: PublicDomainWork[] = [];

    try {
      const worksData = await this.safeGet<any>(
        `https://openlibrary.org/authors/${encodeURIComponent(authorKey)}/works.json`,
        { limit: 15 },
      );
      const entries: any[] = worksData?.entries || [];
      const seenTitles = new Set<string>();
      works = entries
        .filter((e) => e?.title && !seenTitles.has(String(e.title).toLowerCase()))
        .map((e) => {
          seenTitles.add(String(e.title).toLowerCase());
          return {
            title: String(e.title).trim(),
            source: 'openlibrary' as const,
            url: `https://openlibrary.org${e.key}`,
            year: e.first_publish_date ? String(e.first_publish_date) : undefined,
          };
        })
        .slice(0, 12);
    } catch {
      works = [];
    }

    return {
      key: authorKey,
      name: String(bestAuthor.name || englishName),
      birthDate: bestAuthor.birth_date ? String(bestAuthor.birth_date) : undefined,
      deathDate: bestAuthor.death_date ? String(bestAuthor.death_date) : undefined,
      alternateNames: Array.isArray(bestAuthor.alternate_names)
        ? bestAuthor.alternate_names.map(String).slice(0, 10)
        : [],
      topSubjects: Array.isArray(bestAuthor.top_subjects)
        ? bestAuthor.top_subjects.map(String).slice(0, 12)
        : [],
      topWork: bestAuthor.top_work ? String(bestAuthor.top_work) : undefined,
      works,
    };
  }

  private async fetchGutenbergWorks(
    englishName: string,
    spanishName: string,
  ): Promise<PublicDomainWork[]> {
    const query = englishName || spanishName;
    const data = await this.safeGet<any>('https://gutendex.com/books/', {
      search: query,
    });

    const results: any[] = data?.results || [];
    const nameTokens = this.normalizeSimple(`${englishName} ${spanishName}`)
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !['saint', 'santa', 'santo', 'von', 'del'].includes(t));

    const matched: PublicDomainWork[] = [];
    for (const book of results) {
      const authors: string[] = (book.authors || []).map((a: any) =>
        this.normalizeSimple(String(a.name || '')),
      );
      const titleNorm = this.normalizeSimple(String(book.title || ''));
      const isAuthorMatch =
        authors.some((a) => nameTokens.some((tok) => a.includes(tok))) ||
        nameTokens.some((tok) => titleNorm.includes(tok));
      if (!isAuthorMatch) continue;

      const formats: Record<string, string> = book.formats || {};
      const plainTextUrl =
        formats['text/plain; charset=utf-8'] ||
        formats['text/plain; charset=us-ascii'] ||
        formats['text/plain'];

      const safePlainUrl =
        plainTextUrl && plainTextUrl.startsWith('https://')
          ? plainTextUrl
          : plainTextUrl?.startsWith('http://www.gutenberg.org')
            ? plainTextUrl.replace(/^http:\/\//, 'https://')
            : undefined;

      matched.push({
        title: String(book.title || 'Obra sin título').trim(),
        source: 'gutenberg',
        language: Array.isArray(book.languages) ? book.languages.join(', ') : undefined,
        url: `https://www.gutenberg.org/ebooks/${book.id}`,
        plainTextUrl: safePlainUrl,
      });

      if (matched.length >= 5) break;
    }

    return matched;
  }

  private async downloadAndIngestPublicDomainWork(
    canonicalName: string,
    characterSlug: string,
    work: PublicDomainWork,
    category: string,
    autoApprove: boolean,
  ): Promise<{
    title: string;
    documentId: number;
    filePath: string;
    sourceUrl: string;
  } | null> {
    if (!work.plainTextUrl) return null;
    this.assertAllowedUrl(work.plainTextUrl);

    const rawText = await this.safeGet<string>(work.plainTextUrl, undefined, 'text');
    if (typeof rawText !== 'string' || rawText.trim().length < 500) {
      return null;
    }

    const boundedText =
      rawText.length > CharacterAcquisitionService.MAX_BOOK_BYTES
        ? rawText.slice(0, CharacterAcquisitionService.MAX_BOOK_BYTES)
        : rawText;

    const bookSlug = this.toSafeSlug(`${characterSlug}-${work.title}`).slice(0, 80);
    this.ensureDir(this.charactersDocsDir);
    const filePath = this.resolveConfinedFilePath(
      this.charactersDocsDir,
      `${bookSlug}.txt`,
    );
    fs.writeFileSync(filePath, boundedText, 'utf8');

    const bookTitle = `${canonicalName} — ${work.title}`;
    const existing = await this.documentRepo.findDocumentByExactTitle(bookTitle);
    if (existing) {
      return {
        title: bookTitle,
        documentId: existing.id,
        filePath,
        sourceUrl: work.url,
      };
    }

    const ingested = await this.ingestService.ingestText(
      bookTitle,
      boundedText,
      category,
      work.url,
    );

    if (autoApprove) {
      await this.approveAndAwaitStructuralIndex(ingested.documentId);
    }

    this.corpusSelector.upsertDocumentEntry({
      id: `char-book-${bookSlug}`,
      titulo: bookTitle,
      archivo: `characters/${bookSlug}.txt`,
      tipo: 'libro',
      formato: 'txt',
      autor: canonicalName,
      idioma: work.language?.split(',')[0]?.trim() || 'en',
      categorias: [category, 'dominio público'],
      conceptosClave: [canonicalName, work.title],
      capitulos: [],
      embeddings: autoApprove ? 'ready' : 'pending',
      descripcionBreve: `Texto de dominio público de ${canonicalName} obtenido desde Project Gutenberg (${work.url}).`,
      tags: ['personajes-historicos', 'dominio-publico', 'gutenberg', characterSlug],
      dbId: ingested.documentId,
    });

    return {
      title: bookTitle,
      documentId: ingested.documentId,
      filePath,
      sourceUrl: work.url,
    };
  }

  // ── Construcción del Dossier Markdown Jerárquico ────────────────────────────

  buildStructuredDossierMarkdown(
    research: CachedCharacterResearch,
    category: string,
  ): string {
    const lines: string[] = [];
    const { canonicalName, wikipediaEs, wikipediaEn, openLibrary } = research;

    const aliases = this.collectAliases(research);
    const allWorks = this.mergePublicDomainWorks(research);
    const sources = this.collectSourceUrls(research);

    lines.push(`# ${canonicalName} — Dossier Biográfico y Obra`);
    lines.push('');
    lines.push('## Ficha Enciclopédica y Síntesis');
    lines.push(`- **Nombre canónico:** ${canonicalName}`);
    if (aliases.length > 0) {
      lines.push(`- **También conocido/a como:** ${aliases.join(', ')}`);
    }
    if (openLibrary?.birthDate || openLibrary?.deathDate) {
      lines.push(
        `- **Fechas registradas:** ${openLibrary.birthDate || '?'} – ${openLibrary.deathDate || '?'}`,
      );
    }
    lines.push(`- **Categoría JarBees:** ${category}`);
    if (wikipediaEs?.wikidataId || wikipediaEn?.wikidataId) {
      lines.push(
        `- **Identificador Wikidata:** ${wikipediaEs?.wikidataId || wikipediaEn?.wikidataId}`,
      );
    }
    if (openLibrary?.topSubjects?.length) {
      lines.push(
        `- **Áreas temáticas:** ${openLibrary.topSubjects.slice(0, 8).join(', ')}`,
      );
    }
    lines.push(
      `- **Fecha de adquisición automática:** ${research.fetchedAt.split('T')[0]}`,
    );
    lines.push('');

    const leadSummary = this.buildExecutiveSummary(research);
    if (leadSummary) {
      lines.push(leadSummary);
      lines.push('');
    }

    // Secciones de Wikipedia en español
    if (wikipediaEs?.extract) {
      const esSections = this.parseWikipediaSections(wikipediaEs.extract);
      if (esSections.length > 0) {
        lines.push(`# Biografía, Contexto Histórico y Obra (${canonicalName})`);
        lines.push('');
        for (const sec of esSections) {
          lines.push(`## ${sec.title}`);
          lines.push(sec.body);
          lines.push('');
        }
      }
    }

    // Cobertura complementaria de Wikipedia en inglés (aporta mayor detalle historiográfico/filosófico)
    if (wikipediaEn?.extract) {
      const enSections = this.parseWikipediaSections(wikipediaEn.extract);
      if (enSections.length > 0) {
        lines.push(
          `# Cobertura Historiográfica Complementaria (Fuentes Internacionales)`,
        );
        lines.push('');
        // Incluir introducción EN si no hubo artículo ES
        if (!wikipediaEs && wikipediaEn.summary) {
          lines.push('## Introducción General');
          lines.push(wikipediaEn.summary);
          lines.push('');
        }
        for (const sec of enSections.slice(0, 14)) {
          lines.push(`## ${sec.title}`);
          lines.push(sec.body);
          lines.push('');
        }
      }
    }

    // Catálogo de obras y textos de dominio público
    if (allWorks.length > 0) {
      lines.push('# Catálogo de Obras y Textos de Dominio Público');
      lines.push('');
      lines.push('## Obras Principales y Repositorios Abiertos');
      for (const w of allWorks) {
        const meta = [
          w.source.toUpperCase(),
          w.language ? `idioma: ${w.language}` : null,
          w.year ? `año: ${w.year}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        lines.push(`- **${w.title}** (${meta}) — ${w.url}`);
      }
      lines.push('');
    }

    // Trazabilidad (nombrada evitando NOISE_SECTION_PATTERNS de HierarchicalParserService)
    lines.push('# Fuentes Verificadas y Trazabilidad');
    lines.push('');
    lines.push('## Procedencia Documental');
    lines.push(
      'Este dossier fue compilado automáticamente por el módulo de adquisición bibliográfica de JarBees a partir de fuentes abiertas verificadas (CC BY-SA 4.0 / Dominio Público):',
    );
    for (const url of sources) {
      lines.push(`- ${url}`);
    }
    lines.push('');

    return lines.join('\n').trim() + '\n';
  }

  private parseWikipediaSections(
    extract: string,
  ): Array<{ title: string; body: string }> {
    const NOISE_HEADINGS =
      /^(?:véase también|see also|referencias|references|bibliografía|bibliography|enlaces externos|external links|notas|notes|further reading|lecturas adicionales|fuentes|sources|galería|gallery)$/i;

    const parts = extract.split(/\n(={2,4})\s*([^=\n]+?)\s*\1\n/);
    const sections: Array<{ title: string; body: string }> = [];

    // parts[0] es la introducción (ya incluida en Ficha Enciclopédica), luego triples [level, heading, content]
    for (let i = 1; i + 2 < parts.length; i += 3) {
      const heading = parts[i + 1].trim();
      const body = parts[i + 2].trim();

      if (!heading || NOISE_HEADINGS.test(heading)) continue;
      if (body.length < 60) continue;

      sections.push({
        title: heading,
        body: body.replace(/\n{3,}/g, '\n\n'),
      });
    }

    return sections;
  }

  // ── Indexación estructural controlada + Knowledge Graph ─────────────────────

  private async approveAndAwaitStructuralIndex(
    documentId: number,
  ): Promise<void> {
    await this.ingestService.approveDocument(documentId);

    // Esperar brevemente a que la fase estructural (Capítulos/Secciones/Chunks + status='ready') termine
    if (!this.prisma) return;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const doc = await this.prisma.document.findUnique({
        where: { id: documentId },
        select: { status: true, progressIndex: true },
      });
      if (doc && (doc.status === 'ready' || (doc.progressIndex ?? 0) >= 100)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  private async seedKnowledgeGraph(
    research: CachedCharacterResearch,
    documentId: number,
    markdown: string,
  ): Promise<{ entitiesCount: number; relationsCount: number }> {
    if (!this.entityGraphService || !this.entityGraphRepo) {
      return { entitiesCount: 0, relationsCount: 0 };
    }

    let entitiesCount = 0;
    let relationsCount = 0;

    try {
      const aliases = this.collectAliases(research);
      const description = this.buildExecutiveSummary(research).slice(0, 400);

      // 1. Upsert entidad PERSON
      const personEntity = await this.entityGraphService.mergeEntity(
        research.canonicalName,
        KnowledgeEntityType.PERSON,
        description,
        aliases,
      );
      entitiesCount++;

      // Vincular procedencia M:N con el documento recién ingestado
      if (this.prisma) {
        await this.prisma.knowledgeEntitySource
          .upsert({
            where: {
              entityId_documentId: {
                entityId: personEntity.id,
                documentId,
              },
            },
            update: { confidence: 1.0 },
            create: {
              entityId: personEntity.id,
              documentId,
              confidence: 1.0,
            },
          })
          .catch(() => undefined);
      }

      // 2. Upsert hasta 6 obras principales (WORK) con relación CREATED o RELATED_TO según procedencia
      const isSecondaryReference = (w: PublicDomainWork) =>
        w.source === 'wikisource' &&
        /(?:encyclop[aæ]dia|encyclopedia|biography|acts and monuments|author:)/i.test(
          w.title,
        );

      const topWorks = this.mergePublicDomainWorks(research).slice(0, 6);
      for (const work of topWorks) {
        const workTitle = work.title.slice(0, 120);
        const secondary = isSecondaryReference(work);
        const workEntity = await this.entityGraphService.mergeEntity(
          workTitle,
          KnowledgeEntityType.WORK,
          secondary
            ? `Artículo enciclopédico o referencia histórica sobre ${research.canonicalName} (${work.source}).`
            : `Obra documentada de ${research.canonicalName} (${work.source}).`,
          [],
        );
        entitiesCount++;

        const quoteLine =
          markdown
            .split('\n')
            .find((l) => l.includes(workTitle))
            ?.slice(0, 220) ||
          `${research.canonicalName} — obra registrada: ${workTitle}`;

        await this.entityGraphRepo.upsertRelation(
          personEntity.id,
          workEntity.id,
          secondary ? KnowledgeRelationType.RELATED_TO : KnowledgeRelationType.CREATED,
          {
            label: secondary
              ? 'referenciado/a en el texto histórico'
              : 'escribió / creó la obra',
            confidence: secondary ? 0.9 : 0.95,
            sourceDocId: documentId,
            quote: quoteLine,
          },
        );
        relationsCount++;
      }

      // 3. Upsert hasta 5 temas/conceptos principales (CONCEPT) de OpenLibrary/Wikipedia
      const topConcepts = (research.openLibrary?.topSubjects || [])
        .filter((s) => s.length >= 3 && s.length <= 60)
        .slice(0, 5);

      for (const concept of topConcepts) {
        const conceptEntity = await this.entityGraphService.mergeEntity(
          concept,
          KnowledgeEntityType.CONCEPT,
          `Área temática asociada a ${research.canonicalName}.`,
          [],
        );
        entitiesCount++;

        await this.entityGraphRepo.upsertRelation(
          personEntity.id,
          conceptEntity.id,
          KnowledgeRelationType.RELATED_TO,
          {
            label: 'aportó en el campo de',
            confidence: 0.88,
            sourceDocId: documentId,
            quote: `Áreas temáticas: ${topConcepts.join(', ')}`,
          },
        );
        relationsCount++;
      }
    } catch (err: any) {
      this.logger.warn(
        `[character-acq] Error sembrando Knowledge Graph para "${research.canonicalName}": ${err?.message ?? err}`,
      );
    }

    return { entitiesCount, relationsCount };
  }

  // ── Utilidades de metadatos y formateo ──────────────────────────────────────

  private buildLibraryIndexEntry(
    research: CachedCharacterResearch,
    docTitle: string,
    category: string,
    dbId: number,
    embeddings: 'ready' | 'pending',
  ): LibraryDocument {
    const aliases = this.collectAliases(research);
    const subjects = research.openLibrary?.topSubjects?.slice(0, 8) || [];
    const wikiCats = (research.wikipediaEs?.categories || []).slice(0, 6);
    const workTitles = this.mergePublicDomainWorks(research)
      .slice(0, 6)
      .map((w) => w.title);

    const concepts = Array.from(
      new Set([research.canonicalName, ...aliases.slice(0, 4), ...workTitles, ...subjects]),
    ).slice(0, 15);

    const tags = Array.from(
      new Set([
        'personajes-historicos',
        'biografia',
        research.slug,
        ...wikiCats.map((c) => c.toLowerCase()).slice(0, 4),
      ]),
    );

    return {
      id: `char-${research.slug}`,
      titulo: docTitle,
      tituloAlternativo: aliases[0],
      archivo: `characters/${research.slug}.md`,
      tipo: 'dossier',
      formato: 'markdown',
      autor: research.canonicalName,
      idioma: research.wikipediaEs ? 'es' : 'en',
      categorias: [category, 'Personajes Históricos', ...wikiCats.slice(0, 2)],
      conceptosClave: concepts,
      capitulos: [],
      embeddings,
      descripcionBreve: this.buildExecutiveSummary(research).slice(0, 320),
      tags,
      dbId,
    };
  }

  private inferCategory(research: CachedCharacterResearch): string {
    const blob = this.normalizeSimple(
      [
        research.wikipediaEs?.summary || '',
        research.wikipediaEn?.summary || '',
        ...(research.wikipediaEs?.categories || []),
        ...(research.openLibrary?.topSubjects || []),
      ].join(' '),
    );

    if (/(medicina|botanic|herbol|farmac|fitoterap|naturalista|viriditas)/.test(blob)) {
      return 'Personajes Históricos';
    }
    if (/(fisic|matemat|astronom|inventor|ingenier|cientific|quimic)/.test(blob)) {
      return 'Personajes Históricos';
    }
    if (/(filosof|mistic|teolog|antroposof|alquimi|compositor|escritor)/.test(blob)) {
      return 'Personajes Históricos';
    }
    return 'Personajes Históricos';
  }

  private buildExecutiveSummary(research: CachedCharacterResearch): string {
    return (
      research.wikipediaEs?.summary ||
      research.wikipediaEn?.summary ||
      `Dossier biográfico y bibliográfico de ${research.canonicalName}.`
    );
  }

  private collectAliases(research: CachedCharacterResearch): string[] {
    const set = new Set<string>();
    const add = (val?: string) => {
      if (!val) return;
      const clean = val.trim();
      if (
        clean.length >= 3 &&
        clean.toLowerCase() !== research.canonicalName.toLowerCase()
      ) {
        set.add(clean);
      }
    };

    add(research.queriedName);
    add(research.wikipediaEn?.title);
    add(research.openLibrary?.name);
    for (const alt of research.openLibrary?.alternateNames || []) {
      add(alt);
    }

    return Array.from(set).slice(0, 10);
  }

  private collectSourceUrls(research: CachedCharacterResearch): string[] {
    const urls: string[] = [];
    if (research.wikipediaEs?.url) urls.push(research.wikipediaEs.url);
    if (research.wikipediaEn?.url) urls.push(research.wikipediaEn.url);
    if (research.openLibrary?.key) {
      urls.push(`https://openlibrary.org/authors/${research.openLibrary.key}`);
    }
    for (const w of research.wikisourceWorks.slice(0, 3)) {
      urls.push(w.url);
    }
    for (const g of research.gutenbergWorks.slice(0, 3)) {
      urls.push(g.url);
    }
    return Array.from(new Set(urls));
  }

  private mergePublicDomainWorks(
    research: CachedCharacterResearch,
  ): PublicDomainWork[] {
    const seen = new Set<string>();
    const merged: PublicDomainWork[] = [];

    for (const work of [
      ...research.gutenbergWorks,
      ...research.wikisourceWorks,
      ...(research.openLibrary?.works || []),
    ]) {
      const key = `${work.source}:${this.normalizeSimple(work.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(work);
    }

    return merged.slice(0, 20);
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private normalizeSimple(text: string): string {
    return (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Formatea un reporte limpio para responder al usuario en el chat de JarBees.
   */
  formatChatReport(res: CharacterAcquisitionResult): string {
    const statusBadge =
      res.status === 'ready'
        ? '✅ Indexado y listo para RAG (`ready`)'
        : res.status === 'indexing'
          ? '⏳ Indexando en segundo plano (`indexing`)'
          : '🔒 En cuarentena (`quarantined` — pendiente de aprobación)';

    const lines: string[] = [
      res.alreadyExists
        ? `📚 **${res.canonicalName}** ya figuraba en la biblioteca de JarBees.`
        : `🏛️ **Adquisición completada: ${res.canonicalName}**`,
      ``,
      `- **Documento en BD:** ID \`#${res.documentId}\` — ${statusBadge}`,
      `- **Categoría:** ${res.category}`,
      `- **Extensión:** ~${res.wordCount.toLocaleString('es-AR')} palabras · ${res.chaptersCount} capítulos estructurados`,
      `- **Archivo local:** \`docs/books/characters/${res.slug}.md\``,
    ];

    if (res.graphEntitiesCount > 0) {
      lines.push(
        `- **Grafo de Conocimiento:** +${res.graphEntitiesCount} entidades · +${res.graphRelationsCount} relaciones verificadas`,
      );
    }

    if (res.downloadedBooks.length > 0) {
      lines.push(``);
      lines.push(`📖 **Obras de dominio público descargadas e ingestadas:**`);
      for (const b of res.downloadedBooks) {
        lines.push(`  • **${b.title}** (docId \`#${b.documentId}\`) — ${b.sourceUrl}`);
      }
    }

    if (res.publicDomainWorks.length > 0) {
      lines.push(``);
      lines.push(
        `📜 **Obras y textos catalogados (${res.publicDomainWorks.length}):**`,
      );
      for (const w of res.publicDomainWorks.slice(0, 6)) {
        lines.push(`  • **${w.title}** *(${w.source})*`);
      }
    }

    lines.push(``);
    lines.push(`🔗 **Fuentes abiertas consultadas:**`);
    for (const s of res.sourcesUsed.slice(0, 5)) {
      lines.push(`  • ${s}`);
    }

    lines.push(``);
    lines.push(
      `💡 Ya podés preguntarme cualquier cosa sobre **${res.canonicalName}** (por ejemplo: *"según mis documentos, ¿quién fue ${res.canonicalName} y cuáles son sus obras?"*).`,
    );

    return lines.join('\n');
  }
}
