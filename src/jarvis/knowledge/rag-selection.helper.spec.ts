import { CorpusSelectorService, CorpusMatch } from './corpus-selector.service';
import {
  buildRagContextHeader,
  extractUserScopeExclusions,
  isExhaustiveOrComparativeRagQuery,
  selectCorpusTargets,
  selectDiversifiedChunks,
  stripNegativeExclusionsForSearch,
} from './rag-selection.helper';

describe('RAG Multi-Bibliography & Author Selection Helper', () => {
  const makeMatch = (
    overrides: Partial<CorpusMatch['document']> & {
      score: number;
      matchedOn: string[];
    },
  ): CorpusMatch => ({
    document: {
      id: overrides.id || 'doc-1',
      dbId: overrides.dbId,
      titulo: overrides.titulo || 'Documento',
      autor: overrides.autor || 'Autor',
      archivo: overrides.archivo || 'doc.md',
      tipo: 'libro',
      formato: 'md',
      idioma: 'es',
      categorias: overrides.categorias || ['tarot'],
      conceptosClave: overrides.conceptosClave || ['tarot'],
      capitulos: [],
      embeddings: 'ready',
      descripcionBreve: '',
      tags: ['tarot'],
    },
    score: overrides.score,
    matchedOn: overrides.matchedOn,
    needsEmbedding: false,
  });

  describe('stripNegativeExclusionsForSearch & extractUserScopeExclusions', () => {
    it('elimina cláusulas de exclusión solo para búsqueda semántica sin perder el núcleo', () => {
      const q =
        'Dame los significados de los arcanos menores del tarot segun pamela coleman smith pero con dos o tres palabras que describan cada una; dejemos afuera los arcanos mayores por ahora';
      const cleaned = stripNegativeExclusionsForSearch(q);
      expect(cleaned.toLowerCase()).toContain('arcanos menores');
      expect(cleaned.toLowerCase()).toContain('pamela coleman smith');
      expect(cleaned.toLowerCase()).not.toContain('arcanos mayores');

      const exclusions = extractUserScopeExclusions(q);
      expect(exclusions).toHaveLength(1);
      expect(exclusions[0].toLowerCase()).toContain('arcanos mayores');
    });

    it('detecta consultas exhaustivas y comparativas', () => {
      expect(
        isExhaustiveOrComparativeRagQuery(
          'Dame los significados de los arcanos menores del tarot',
        ),
      ).toBe(true);
      expect(
        isExhaustiveOrComparativeRagQuery(
          'Explicame la relación y diferencia entre arcanos mayores y menores del tarot',
        ),
      ).toBe(true);
      expect(isExhaustiveOrComparativeRagQuery('¿Qué hora es hoy?')).toBe(false);
    });
  });

  describe('selectCorpusTargets', () => {
    const rwsGuide = makeMatch({
      id: 'rws-guide',
      dbId: 260,
      titulo:
        'Tarot Rider–Waite–Smith: Guía Completa de los 56 Arcanos Menores y 22 Arcanos Mayores',
      autor: 'Pamela Colman Smith & Arthur Edward Waite',
      score: 18,
      matchedOn: ['título:tarot', 'título:arcanos', 'título:menores', 'autor:pamela', 'autor:smith'],
    });
    const pamelaDossier = makeMatch({
      id: 'pamela-dossier',
      dbId: 259,
      titulo: 'Pamela Colman Smith (Tarot) — Dossier Temático y Obra',
      autor: 'Pamela Colman Smith',
      score: 14,
      matchedOn: ['título:tarot', 'autor:pamela', 'autor:smith'],
    });
    const jodorowsky = makeMatch({
      id: 'jodo',
      dbId: 23,
      titulo: 'La Vía del Tarot',
      autor: 'Alejandro Jodorowsky & Marianne Costa',
      score: 11,
      matchedOn: ['título:tarot', 'título:arcanos', 'título:menores'],
    });
    const samael = makeMatch({
      id: 'samael',
      dbId: 252,
      titulo: 'Tarot y Kábala - Samael Aun Weor -',
      autor: 'Samael Aun Weor',
      score: 10.5,
      matchedOn: ['título:tarot', 'título:arcanos', 'título:menores'],
    });

    it('aísla estrictamente a las obras de Pamela Colman Smith cuando se pide explícitamente por esa autora', () => {
      const result = selectCorpusTargets(
        [rwsGuide, pamelaDossier, jodorowsky, samael],
        4,
      );
      expect(result.selectionMode).toBe('explicit_author');
      expect(result.selectedMatches.map((m) => m.document.dbId)).toEqual([260, 259]);
      expect(result.explicitAuthors).toHaveLength(1);
    });

    it('selecciona múltiples tradiciones bibliográficas (RWS + Jodorowsky + Samael) cuando NO se especifica autor', () => {
      const rwsNoAuthor = {
        ...rwsGuide,
        score: 14,
        matchedOn: ['título:tarot', 'título:arcanos', 'título:menores'],
      };
      const pamelaNoAuthor = {
        ...pamelaDossier,
        score: 12,
        matchedOn: ['título:tarot'],
      };
      const result = selectCorpusTargets(
        [rwsNoAuthor, pamelaNoAuthor, jodorowsky, samael],
        4,
      );
      expect(result.selectionMode).toBe('multi_bibliography');
      // Primeros 3 slots: 1 obra principal por cada tradición distinta
      expect(result.selectedMatches.slice(0, 3).map((m) => m.document.dbId)).toEqual([
        260, 23, 252,
      ]);
    });
  });

  describe('selectDiversifiedChunks', () => {
    it('intercala en round-robin entre múltiples libros cuando está en modo multi-autor', () => {
      const chunks = [
        { id: 1, documentId: 23, content: 'Jodo 1' },
        { id: 2, documentId: 23, content: 'Jodo 2' },
        { id: 3, documentId: 23, content: 'Jodo 3' },
        { id: 4, documentId: 23, content: 'Jodo 4' },
        { id: 5, documentId: 252, content: 'Samael 1' },
        { id: 6, documentId: 252, content: 'Samael 2' },
        { id: 7, documentId: 260, content: 'RWS 1' },
        { id: 8, documentId: 260, content: 'RWS 2' },
      ];
      const diversified = selectDiversifiedChunks(chunks, {
        maxChunks: 6,
        isMultiAuthorMode: true,
      });
      const counts = diversified.reduce<Record<number, number>>((acc, c) => {
        acc[c.documentId] = (acc[c.documentId] || 0) + 1;
        return acc;
      }, {});
      expect(diversified).toHaveLength(6);
      expect(counts[23]).toBe(2);
      expect(counts[252]).toBe(2);
      expect(counts[260]).toBe(2);
    });

    it('preserva ranking puro cuando es consulta mono-autor para no diluir tablas de 4 palos con biografía', () => {
      const chunks = [
        { id: 1, documentId: 260, content: 'Bastos 14 cartas' },
        { id: 2, documentId: 260, content: 'Copas 14 cartas' },
        { id: 3, documentId: 260, content: 'Espadas 14 cartas' },
        { id: 4, documentId: 260, content: 'Oros 14 cartas' },
        { id: 5, documentId: 259, content: 'Biografía 1' },
        { id: 6, documentId: 259, content: 'Biografía 2' },
      ];
      const picked = selectDiversifiedChunks(chunks, {
        maxChunks: 4,
        isMultiAuthorMode: false,
      });
      expect(picked.map((c) => c.id)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('buildRagContextHeader', () => {
    it('incluye directiva estricta de exclusión y síntesis multi-bibliográfica cuando corresponde', () => {
      const singleWithExclusion = buildRagContextHeader({
        userMessage:
          'Arcanos menores según Pamela Colman Smith; dejemos afuera los arcanos mayores',
        distinctBooksCount: 1,
        distinctAuthors: ['Pamela Colman Smith & Arthur Edward Waite'],
        selectionMode: 'explicit_author',
      });
      expect(singleWithExclusion).toContain('EXCLUSIÓN EXPLÍCITA');
      expect(singleWithExclusion).toContain('arcanos mayores');

      const multiHeader = buildRagContextHeader({
        userMessage: 'Explicame arcanos mayores y menores del tarot',
        distinctBooksCount: 3,
        distinctAuthors: [
          'Pamela Colman Smith & Arthur Edward Waite',
          'Alejandro Jodorowsky & Marianne Costa',
          'Samael Aun Weor',
        ],
        selectionMode: 'multi_bibliography',
      });
      expect(multiHeader).toContain('SÍNTESIS MULTI-BIBLIOGRÁFICA');
      expect(multiHeader).toContain('Samael Aun Weor');
    });
  });

  describe('CorpusSelectorService integración con biblioteca Tarot real', () => {
    it('detecta acentos en Kábala/Vía y selecciona las 3 tradiciones en consultas generales vs solo Pamela cuando se la nombra', () => {
      const selector = new CorpusSelectorService();

      const generalMatches = selector.findRelevantDocuments(
        'Explicame la relación entre los arcanos mayores y menores del tarot',
        6,
      );
      const generalSelection = selectCorpusTargets(generalMatches, 4);
      const generalTitles = generalSelection.selectedMatches.map((m) =>
        m.document.titulo.toLowerCase(),
      );

      expect(generalSelection.selectionMode).toBe('multi_bibliography');
      expect(generalTitles.some((t) => t.includes('rider') || t.includes('waite'))).toBe(true);
      expect(generalTitles.some((t) => t.includes('vía del tarot'))).toBe(true);
      expect(generalTitles.some((t) => t.includes('kábala') || t.includes('kabala'))).toBe(true);

      const pamelaMatches = selector.findRelevantDocuments(
        'Dame los significados de los arcanos menores del tarot segun pamela coleman smith',
        6,
      );
      const pamelaSelection = selectCorpusTargets(pamelaMatches, 4);
      expect(pamelaSelection.selectionMode).toBe('explicit_author');
      expect(
        pamelaSelection.selectedMatches.every((m) =>
          m.document.autor.toLowerCase().includes('pamela'),
        ),
      ).toBe(true);

      const conceptual = selector.findRelevantDocuments('¿Qué es un embedding?', 6);
      expect(conceptual).toHaveLength(0);
    });
  });
});
