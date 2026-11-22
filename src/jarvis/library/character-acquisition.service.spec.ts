import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CharacterAcquisitionService } from './character-acquisition.service';
import { JarvisCommandService } from '../commands/jarvis-command.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CharacterAcquisitionService', () => {
  let service: CharacterAcquisitionService;
  let mockIngestService: any;
  let mockDocRepo: any;
  let mockCorpusSelector: any;
  let mockEntityGraphService: any;
  let mockEntityGraphRepo: any;
  let mockPrisma: any;
  let tempRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    jest.clearAllMocks();
    originalCwd = process.cwd();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jarbees-char-acq-'));
    jest.spyOn(process, 'cwd').mockReturnValue(tempRoot);

    mockIngestService = {
      ingestText: jest.fn().mockResolvedValue({
        documentId: 777,
        title: 'Hildegarda de Bingen — Dossier Biográfico y Obra',
        chunks: 0,
        category: 'Personajes Históricos',
      }),
      approveDocument: jest.fn().mockResolvedValue(undefined),
    };

    mockDocRepo = {
      findDocumentByExactTitle: jest.fn().mockResolvedValue(null),
    };

    mockCorpusSelector = {
      upsertDocumentEntry: jest.fn(),
    };

    mockEntityGraphService = {
      mergeEntity: jest
        .fn()
        .mockImplementation(async (name: string, type: string) => ({
          id: Math.floor(Math.random() * 10000) + 1,
          name,
          type,
        })),
    };

    mockEntityGraphRepo = {
      upsertRelation: jest.fn().mockResolvedValue({ id: 1 }),
    };

    mockPrisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ready',
          progressIndex: 100,
        }),
      },
      knowledgeEntitySource: {
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };

    service = new CharacterAcquisitionService(
      mockIngestService,
      mockDocRepo,
      mockCorpusSelector,
      mockEntityGraphService,
      mockEntityGraphRepo,
      mockPrisma,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    expect(process.cwd()).toBe(originalCwd);
  });

  describe('Seguridad y Confinamiento (Zero-Trust)', () => {
    it('rechaza nombres vacíos, muy cortos o con intentos de traversal/URLs', () => {
      expect(() => service.sanitizeCharacterName('')).toThrow(BadRequestException);
      expect(() => service.sanitizeCharacterName('a')).toThrow(BadRequestException);
      expect(() => service.sanitizeCharacterName('../../etc/passwd')).toThrow(
        ForbiddenException,
      );
      expect(() =>
        service.sanitizeCharacterName('https://evil.example/payload'),
      ).toThrow(ForbiddenException);
    });

    it('permite únicamente orígenes HTTPS en lista blanca y bloquea dominios externos o HTTP', () => {
      expect(
        service.assertAllowedUrl('https://es.wikipedia.org/w/api.php').hostname,
      ).toBe('es.wikipedia.org');
      expect(
        service.assertAllowedUrl('https://openlibrary.org/search/authors.json')
          .hostname,
      ).toBe('openlibrary.org');

      expect(() =>
        service.assertAllowedUrl('http://es.wikipedia.org/w/api.php'),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertAllowedUrl('https://169.254.169.254/latest/meta-data/'),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertAllowedUrl('https://evil-attacker.com/scrape'),
      ).toThrow(ForbiddenException);
    });

    it('rechaza nombres de archivo con traversal o separadores de ruta', () => {
      const base = path.join(tempRoot, 'docs', 'books', 'characters');
      expect(() =>
        service.resolveConfinedFilePath(base, '../secret.md'),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.resolveConfinedFilePath(base, 'sub/file.md'),
      ).toThrow(ForbiddenException);
      expect(service.resolveConfinedFilePath(base, 'hildegarda.md')).toBe(
        path.resolve(base, 'hildegarda.md'),
      );
    });
  });

  describe('Adquisición multi-fuente, persistencia en disco, BD y Grafo', () => {
    function setupMockOpenKnowledgeApis() {
      mockedAxios.get.mockImplementation(async (url: string, config?: any) => {
        if (url.startsWith('https://es.wikipedia.org/w/api.php')) {
          if (config?.params?.list === 'search') {
            return {
              data: {
                query: { search: [{ title: 'Hildegarda de Bingen' }] },
              },
            } as any;
          }
          return {
            data: {
              query: {
                pages: {
                  '101': {
                    title: 'Hildegarda de Bingen',
                    fullurl: 'https://es.wikipedia.org/wiki/Hildegarda_de_Bingen',
                    pageprops: { wikibase_item: 'Q70991' },
                    langlinks: [{ lang: 'en', '*': 'Hildegard of Bingen' }],
                    categories: [
                      { title: 'Categoría:Médicas de Alemania' },
                      { title: 'Categoría:Compositoras de la Edad Media' },
                    ],
                    extract: [
                      'Hildegarda de Bingen (1098-1179) fue una abadesa benedictina, polímata, filósofa, naturalista, compositora, médica y escritora alemana.',
                      '',
                      '== Biografía ==',
                      'Nacida en Bermersheim vor der Höhe, fundó los monasterios de Rupertsberg y Eibingen, escribiendo extensamente sobre historia natural, medicina y música sacra medieval.',
                      '',
                      '== Obra científica y médica ==',
                      'Sus tratados Physica y Causae et Curae compilan el saber botánico y médico medieval articulado alrededor del concepto de viriditas (verdor o fuerza vital de la naturaleza).',
                    ].join('\n'),
                  },
                },
              },
            },
          } as any;
        }

        if (url.startsWith('https://en.wikipedia.org/w/api.php')) {
          if (config?.params?.list === 'search') {
            return {
              data: {
                query: { search: [{ title: 'Hildegard of Bingen' }] },
              },
            } as any;
          }
          return {
            data: {
              query: {
                pages: {
                  '202': {
                    title: 'Hildegard of Bingen',
                    fullurl: 'https://en.wikipedia.org/wiki/Hildegard_of_Bingen',
                    categories: [{ title: 'Category:Medieval herbalists' }],
                    extract: [
                      'Hildegard of Bingen OSB (c. 1098 – 17 September 1179) was a German Benedictine abbess and polymath active as a writer, composer, philosopher, mystic, visionary, and medical practitioner.',
                      '',
                      '== Viriditas and Natural History ==',
                      'Hildegard coined and developed the concept of viriditas ("greenness" or vital greening power) to describe the life-giving vitality uniting plants, medicine, cosmology, and human health.',
                    ].join('\n'),
                  },
                },
              },
            },
          } as any;
        }

        if (url.includes('wikisource.org')) {
          return {
            data: {
              query: {
                search: [{ title: 'Author:Hildegard of Bingen' }],
              },
            },
          } as any;
        }

        if (url.startsWith('https://openlibrary.org/search/authors.json')) {
          return {
            data: {
              docs: [
                {
                  key: 'OL12345A',
                  name: 'Hildegard of Bingen',
                  birth_date: '1098',
                  death_date: '1179',
                  work_count: 42,
                  alternate_names: ['Hildegard von Bingen', 'Sibila del Rin'],
                  top_subjects: ['Botánica medieval', 'Medicina medieval', 'Música sacra'],
                },
              ],
            },
          } as any;
        }

        if (url.startsWith('https://openlibrary.org/authors/OL12345A/works.json')) {
          return {
            data: {
              entries: [
                { key: '/works/OL1W', title: 'Scivias', first_publish_date: '1151' },
                { key: '/works/OL2W', title: 'Physica', first_publish_date: '1158' },
                { key: '/works/OL3W', title: 'Causae et Curae', first_publish_date: '1158' },
              ],
            },
          } as any;
        }

        if (url.startsWith('https://gutendex.com/books/')) {
          return { data: { results: [] } } as any;
        }

        throw new Error(`Unexpected URL in test: ${url}`);
      });
    }

    it('adquiere el dossier en modo cuarentena por defecto (Zero-Trust HTTP)', async () => {
      setupMockOpenKnowledgeApis();

      const result = await service.acquireCharacter('Hildegarda de Bingen');

      expect(result.success).toBe(true);
      expect(result.canonicalName).toBe('Hildegarda de Bingen');
      expect(result.status).toBe('quarantined');
      expect(result.documentId).toBe(777);
      expect(fs.existsSync(result.filePath)).toBe(true);
      expect(fs.existsSync(result.cachePath)).toBe(true);

      const savedMd = fs.readFileSync(result.filePath, 'utf8');
      expect(savedMd).toContain('# Hildegarda de Bingen — Dossier Biográfico y Obra');
      expect(savedMd).toContain('viriditas');
      expect(savedMd).toContain('Scivias');

      expect(mockIngestService.ingestText).toHaveBeenCalledTimes(1);
      expect(mockIngestService.approveDocument).not.toHaveBeenCalled();
      expect(mockCorpusSelector.upsertDocumentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'char-hildegarda-de-bingen',
          autor: 'Hildegarda de Bingen',
          embeddings: 'pending',
        }),
      );
    });

    it('indexa inmediatamente y siembra el Grafo de Conocimiento cuando autoApprove=true', async () => {
      setupMockOpenKnowledgeApis();

      const result = await service.acquireCharacter('Hildegarda de Bingen', {
        autoApprove: true,
      });

      expect(result.status).toBe('ready');
      expect(mockIngestService.approveDocument).toHaveBeenCalledWith(777);
      expect(result.graphEntitiesCount).toBeGreaterThanOrEqual(4);
      expect(result.graphRelationsCount).toBeGreaterThanOrEqual(3);
      expect(mockEntityGraphService.mergeEntity).toHaveBeenCalledWith(
        'Hildegarda de Bingen',
        'PERSON',
        expect.any(String),
        expect.arrayContaining(['Hildegard of Bingen', 'Hildegard von Bingen']),
      );
      expect(mockEntityGraphRepo.upsertRelation).toHaveBeenCalled();
    });

    it('es idempotente: si el dossier ya existe en BD no crea duplicados', async () => {
      setupMockOpenKnowledgeApis();
      mockDocRepo.findDocumentByExactTitle.mockResolvedValueOnce({
        id: 888,
        title: 'Hildegarda de Bingen — Dossier Biográfico y Obra',
        status: 'ready',
        category: 'Personajes Históricos',
        content: '# Hildegarda de Bingen\nContenido existente...',
      });

      const result = await service.acquireCharacter('Hildegarda de Bingen', {
        autoApprove: true,
      });

      expect(result.alreadyExists).toBe(true);
      expect(result.documentId).toBe(888);
      expect(mockIngestService.ingestText).not.toHaveBeenCalled();
    });

    it('NO produce falso positivo de duplicado si findDocumentByExactTitle devuelve otro dossier distinto por coincidencia fuzzy', async () => {
      setupMockOpenKnowledgeApis();
      mockDocRepo.findDocumentByExactTitle.mockResolvedValueOnce({
        id: 258,
        title: 'Otro Personaje Distinto — Dossier Biográfico y Obra',
        status: 'ready',
        category: 'Personajes Históricos',
        content: '# Otro Personaje\nContenido distinto...',
      });

      const result = await service.acquireCharacter('Hildegarda de Bingen', {
        autoApprove: true,
      });

      expect(result.alreadyExists).toBe(false);
      expect(result.documentId).toBe(777);
      expect(mockIngestService.ingestText).toHaveBeenCalledTimes(1);
    });
  });

  describe('Enrutamiento de comandos en JarvisCommandService', () => {
    it('dispara CharacterAcquisitionService ante comandos explícitos y NO secuestra preguntas normales', async () => {
      const mockAcq = {
        acquireCharacter: jest.fn().mockResolvedValue({
          success: true,
          canonicalName: 'Hildegarda de Bingen',
          slug: 'hildegarda-de-bingen',
          documentId: 777,
          status: 'ready',
          alreadyExists: false,
          category: 'Personajes Históricos',
          filePath: 'docs/books/characters/hildegarda-de-bingen.md',
          cachePath: 'storage/character-acquisition/hildegarda-de-bingen.json',
          sourcesUsed: ['https://es.wikipedia.org/wiki/Hildegarda_de_Bingen'],
          publicDomainWorks: [],
          downloadedBooks: [],
          graphEntitiesCount: 5,
          graphRelationsCount: 4,
          summaryExcerpt: 'Abadesa y polímata medieval.',
          wordCount: 1500,
          chaptersCount: 4,
        }),
        formatChatReport: jest
          .fn()
          .mockReturnValue('🏛️ Adquisición completada: Hildegarda de Bingen'),
      } as any;

      const cmdService = new JarvisCommandService(
        { create: jest.fn().mockResolvedValue(undefined) } as any,
        { getMostRecentDocuments: jest.fn().mockResolvedValue([]) } as any,
        {} as any,
        { create: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { handleListCommand: jest.fn().mockResolvedValue(null) } as any,
        { getIndex: jest.fn().mockReturnValue({ documentos: [] }) } as any,
        undefined,
        undefined,
        undefined,
        undefined,
        mockAcq,
      );

      // Comandos válidos de adquisición
      const r1 = await cmdService.handleCommand(
        '/adquirir Hildegarda de Bingen',
        'sess-1',
        Date.now(),
      );
      expect(r1.handled).toBe(true);
      expect(mockAcq.acquireCharacter).toHaveBeenCalledWith(
        'Hildegarda de Bingen',
        expect.objectContaining({ autoApprove: true }),
      );

      const r2 = await cmdService.handleCommand(
        'investigá y agregá a la biblioteca a Paracelso',
        'sess-1',
        Date.now(),
      );
      expect(r2.handled).toBe(true);
      expect(mockAcq.acquireCharacter).toHaveBeenCalledWith(
        'Paracelso',
        expect.objectContaining({ autoApprove: true }),
      );

      const r3 = await cmdService.handleCommand(
        'alimentá tu bd con Hipatia de Alejandría',
        'sess-1',
        Date.now(),
      );
      expect(r3.handled).toBe(true);
      expect(mockAcq.acquireCharacter).toHaveBeenCalledWith(
        'Hipatia de Alejandría',
        expect.objectContaining({ autoApprove: true }),
      );

      // Comando natural por voz con enfoque temático explícito (ej. Pamela Colman Smith + tarot)
      const rVoice1 = await cmdService.handleCommand(
        'busca e ingesta informacion especificamente de tarot sobre "pamela coleman smith"',
        'sess-1',
        Date.now(),
      );
      expect(rVoice1.handled).toBe(true);
      expect(mockAcq.acquireCharacter).toHaveBeenCalledWith(
        'pamela coleman smith',
        expect.objectContaining({ autoApprove: true, focusTopic: 'tarot' }),
      );

      const rVoice2 = await cmdService.handleCommand(
        'JarBees, buscá e ingestá información sobre Pamela Colman Smith específicamente de tarot.',
        'sess-1',
        Date.now(),
      );
      expect(rVoice2.handled).toBe(true);
      expect(mockAcq.acquireCharacter).toHaveBeenCalledWith(
        'Pamela Colman Smith',
        expect.objectContaining({ autoApprove: true, focusTopic: 'tarot' }),
      );

      // Pregunta normal NO debe disparar adquisición
      mockAcq.acquireCharacter.mockClear();
      const r4 = await cmdService.handleCommand(
        '¿Quién fue Hildegarda de Bingen y qué escribió sobre viriditas?',
        'sess-1',
        Date.now(),
      );
      expect(r4.handled).toBe(false);
      expect(mockAcq.acquireCharacter).not.toHaveBeenCalled();
    });
  });
});
