import * as fs from 'fs';
import * as path from 'path';
import { JarvisCommandService } from './jarvis-command.service';

describe('JarvisCommandService', () => {
  it('returns the scanned books from the library index when the user asks for mis documentos', async () => {
    const conversationRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const documentRepo = {
      getMostRecentDocuments: jest.fn().mockResolvedValue([]),
    } as any;
    const userProfileRepo = {} as any;
    const agentRunRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const categorySummaryService = {} as any;
    const documentSummaryService = {} as any;
    const documentCompareService = {} as any;
    const knowledgeTestService = {} as any;
    const jarvisKnowledge = {
      handleListCommand: jest.fn().mockResolvedValue(null),
    } as any;
    const corpusSelector = {
      getIndex: jest.fn().mockReturnValue({
        metadata: { version: 1, descripcion: '', nota: '' },
        documentos: [
          {
            id: 'book-1',
            titulo: 'Libro escaneado',
            archivo: 'libro.pdf',
            tipo: 'libro',
            formato: 'pdf',
            autor: 'Autor de prueba',
            idioma: 'es',
            categorias: ['mística'],
            conceptosClave: ['concepto'],
            capitulos: [],
            embeddings: 'ready',
            descripcionBreve: 'Descripción de prueba',
            tags: ['prueba'],
          },
        ],
      }),
    } as any;

    const service = new JarvisCommandService(
      conversationRepo,
      documentRepo,
      userProfileRepo,
      agentRunRepo,
      categorySummaryService,
      documentSummaryService,
      documentCompareService,
      knowledgeTestService,
      jarvisKnowledge,
      corpusSelector,
    );

    const result = await service.handleCommand(
      'mis documentos',
      'session-1',
      123,
    );

    expect(result.handled).toBe(true);
    expect(result.response).toContain('Libro escaneado');
    expect(result.response).toContain('Autor de prueba');
  });

  it('returns the authors from the library index when the user asks for mis autores', async () => {
    const conversationRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const documentRepo = {
      getMostRecentDocuments: jest.fn().mockResolvedValue([]),
    } as any;
    const userProfileRepo = {} as any;
    const agentRunRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const categorySummaryService = {} as any;
    const documentSummaryService = {} as any;
    const documentCompareService = {} as any;
    const knowledgeTestService = {} as any;
    const jarvisKnowledge = {
      handleListCommand: jest.fn().mockResolvedValue(null),
    } as any;
    const corpusSelector = {
      getIndex: jest.fn().mockReturnValue({
        metadata: { version: 1, descripcion: '', nota: '' },
        documentos: [
          {
            id: 'book-1',
            titulo: 'Libro escaneado',
            archivo: 'libro.pdf',
            tipo: 'libro',
            formato: 'pdf',
            autor: 'Autor de prueba',
            idioma: 'es',
            categorias: ['mística'],
            conceptosClave: ['concepto'],
            capitulos: [],
            embeddings: 'ready',
            descripcionBreve: 'Descripción de prueba',
            tags: ['prueba'],
          },
          {
            id: 'book-2',
            titulo: 'Otro libro',
            archivo: 'otro.pdf',
            tipo: 'libro',
            formato: 'pdf',
            autor: 'Autor de prueba',
            idioma: 'es',
            categorias: ['mística'],
            conceptosClave: ['concepto'],
            capitulos: [],
            embeddings: 'ready',
            descripcionBreve: 'Descripción de prueba',
            tags: ['prueba'],
          },
        ],
      }),
    } as any;

    const service = new JarvisCommandService(
      conversationRepo,
      documentRepo,
      userProfileRepo,
      agentRunRepo,
      categorySummaryService,
      documentSummaryService,
      documentCompareService,
      knowledgeTestService,
      jarvisKnowledge,
      corpusSelector,
    );

    const result = await service.handleCommand('mis autores', 'session-1', 123);

    expect(result.handled).toBe(true);
    expect(result.response).toContain('Autor de prueba');
  });

  it('returns the books associated with a specific author when the user sends the author name', async () => {
    const indexPath = path.join(
      process.cwd(),
      'src',
      'jarvis',
      'knowledge',
      'library-index.json',
    );
    const raw = fs.readFileSync(indexPath, 'utf8');
    const index = JSON.parse(raw);
    const docs = index.documentos as Array<Record<string, any>>;
    const targetDoc = docs.find((doc) =>
      /hermes trismegisto/i.test(doc.autor ?? ''),
    );

    expect(targetDoc).toBeDefined();

    const conversationRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const documentRepo = {
      getMostRecentDocuments: jest.fn().mockResolvedValue([]),
    } as any;
    const userProfileRepo = {} as any;
    const agentRunRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const categorySummaryService = {} as any;
    const documentSummaryService = {} as any;
    const documentCompareService = {} as any;
    const knowledgeTestService = {} as any;
    const jarvisKnowledge = {
      handleListCommand: jest.fn().mockResolvedValue(null),
    } as any;
    const corpusSelector = {
      getIndex: jest.fn().mockReturnValue(index),
    } as any;

    const service = new JarvisCommandService(
      conversationRepo,
      documentRepo,
      userProfileRepo,
      agentRunRepo,
      categorySummaryService,
      documentSummaryService,
      documentCompareService,
      knowledgeTestService,
      jarvisKnowledge,
      corpusSelector,
    );

    const result = await service.handleCommand(
      'Hermes Trismegisto',
      'session-1',
      123,
    );

    expect(result.handled).toBe(true);
    expect(result.response).toContain(targetDoc!.titulo);
    expect(result.response).toContain('Hermes Trismegisto');
  });

  it('shows cleaned titles in mis documentos instead of the noisy author suffixes', async () => {
    const conversationRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const documentRepo = {
      getMostRecentDocuments: jest.fn().mockResolvedValue([]),
    } as any;
    const userProfileRepo = {} as any;
    const agentRunRepo = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const categorySummaryService = {} as any;
    const documentSummaryService = {} as any;
    const documentCompareService = {} as any;
    const knowledgeTestService = {} as any;
    const jarvisKnowledge = {
      handleListCommand: jest.fn().mockResolvedValue(null),
    } as any;
    const corpusSelector = {
      getIndex: jest.fn().mockReturnValue({
        metadata: { version: 1, descripcion: '', nota: '' },
        documentos: [
          {
            id: 'book-1',
            titulo: 'aventuras fuera del cuerpo buhlman william',
            archivo: 'aventuras-fuera-del-cuerpo-buhlman-william.pdf',
            tipo: 'libro',
            formato: 'pdf',
            autor: 'William Buhlman',
            idioma: 'es',
            categorias: ['espiritualidad'],
            conceptosClave: ['aventuras fuera del cuerpo'],
            capitulos: [],
            embeddings: 'ready',
            descripcionBreve: 'test',
            tags: ['test'],
          },
        ],
      }),
    } as any;

    const service = new JarvisCommandService(
      conversationRepo,
      documentRepo,
      userProfileRepo,
      agentRunRepo,
      categorySummaryService,
      documentSummaryService,
      documentCompareService,
      knowledgeTestService,
      jarvisKnowledge,
      corpusSelector,
    );

    const result = await service.handleCommand(
      'mis documentos',
      'session-1',
      123,
    );

    expect(result.handled).toBe(true);
    expect(result.response).toContain(
      'aventuras fuera del cuerpo buhlman william',
    );
    expect(result.response).toContain('William Buhlman');
  });

  it('loads Jung and Grinberg entries from the library index JSON so authors and categories are discoverable', async () => {
    const indexPath = path.join(
      process.cwd(),
      'src',
      'jarvis',
      'knowledge',
      'library-index.json',
    );
    const raw = fs.readFileSync(indexPath, 'utf8');
    const index = JSON.parse(raw);
    const docs = index.documentos as Array<Record<string, any>>;

    const jungDocs = docs.filter(
      (doc) =>
        /carl gustav jung/i.test(doc.autor ?? '') ||
        /carl gustav jung/i.test(doc.titulo ?? '') ||
        /carl gustav jung/i.test(doc.archivo ?? ''),
    );
    const grinbergDocs = docs.filter(
      (doc) =>
        /jacobo grinberg|grinberg zylberbaum/i.test(doc.autor ?? '') ||
        /jacobo grinberg|grinberg zylberbaum/i.test(doc.titulo ?? '') ||
        /jacobo grinberg|grinberg zylberbaum/i.test(doc.archivo ?? ''),
    );

    expect(jungDocs.length).toBeGreaterThan(0);
    expect(grinbergDocs.length).toBeGreaterThan(0);

    const jungCategories = new Set(
      jungDocs.flatMap((doc) => doc.categorias ?? []),
    );
    const grinbergCategories = new Set(
      grinbergDocs.flatMap((doc) => doc.categorias ?? []),
    );

    expect(
      Array.from(jungCategories).some((c) =>
        /psic|anal|arquet|inconsc/i.test(c),
      ),
    ).toBe(true);
    expect(
      Array.from(grinbergCategories).some((c) =>
        /chaman|espirit|mistic|medicina|psic/i.test(c),
      ),
    ).toBe(true);
  });
});
