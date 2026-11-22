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
      /nikola tesla/i.test(doc.autor ?? ''),
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
      'Nikola Tesla',
      'session-1',
      123,
    );

    expect(result.handled).toBe(true);
    expect(result.response).toContain(targetDoc!.titulo);
    expect(result.response).toContain('Nikola Tesla');
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

  it('does NOT hijack thematic or comparative RAG queries starting with Explicame into a single-book summary', async () => {
    const conversationRepo = { create: jest.fn().mockResolvedValue(undefined) } as any;
    const documentRepo = {
      findDocumentByExactTitle: jest.fn().mockResolvedValue({
        id: 260,
        title: 'Tarot Rider–Waite–Smith: Guía Completa de los 56 Arcanos Menores y 22 Arcanos Mayores',
      }),
      searchDocumentsByTitle: jest.fn().mockResolvedValue([
        {
          id: 260,
          title: 'Tarot Rider–Waite–Smith: Guía Completa de los 56 Arcanos Menores y 22 Arcanos Mayores',
        },
      ]),
    } as any;
    const documentSummaryService = {
      generateDocumentSummary: jest.fn().mockResolvedValue({
        title: 'La Vía del Tarot',
        category: 'Tarot y Simbolismo',
        wordCount: 50000,
        chunkCount: 887,
        summary: 'Resumen de prueba',
        keyPoints: ['Punto 1'],
      }),
    } as any;
    const corpusSelector = {
      getIndex: jest.fn().mockReturnValue({
        metadata: { version: 1, descripcion: '', nota: '' },
        documentos: [
          {
            id: 'rws',
            titulo: 'Tarot Rider–Waite–Smith: Guía Completa de los 56 Arcanos Menores y 22 Arcanos Mayores',
            autor: 'Pamela Colman Smith & Arthur Edward Waite',
            categorias: ['tarot'],
            conceptosClave: ['arcanos mayores', 'arcanos menores'],
            capitulos: [],
            embeddings: 'ready',
            descripcionBreve: '',
            tags: ['tarot'],
          },
          {
            id: 'jodo',
            titulo: 'La Vía del Tarot',
            autor: 'Alejandro Jodorowsky & Marianne Costa',
            categorias: ['tarot'],
            conceptosClave: ['arcanos mayores', 'arcanos menores'],
            capitulos: [],
            embeddings: 'ready',
            descripcionBreve: '',
            tags: ['tarot'],
          },
        ],
      }),
    } as any;

    const service = new JarvisCommandService(
      conversationRepo,
      documentRepo,
      {} as any,
      { create: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      documentSummaryService,
      {} as any,
      {} as any,
      { handleListCommand: jest.fn().mockResolvedValue(null) } as any,
      corpusSelector,
    );

    // Consulta temática comparativa: NO debe ser secuestrada como resumen mono-libro
    const thematic = await service.handleCommand(
      'Explicame la relación y diferencia entre los arcanos mayores y menores del tarot',
      'session-tarot-1',
      Date.now(),
    );
    expect(thematic.handled).toBe(false);
    expect(documentSummaryService.generateDocumentSummary).not.toHaveBeenCalled();

    // Pedido explícito entrecomillado de libro SÍ debe ser manejado
    const explicitQuoted = await service.handleCommand(
      "explicame 'La Vía del Tarot'",
      'session-tarot-2',
      Date.now(),
    );
    expect(explicitQuoted.handled).toBe(true);
    expect(documentSummaryService.generateDocumentSummary).toHaveBeenCalledWith(
      'La Vía del Tarot',
      10,
    );
  });
});
