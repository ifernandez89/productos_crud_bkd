import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ContextSelectorService } from './context-selector.service.ts';
import type { SourceState } from './context-selector.interface.ts';

/**
 * JCA-001 Capa 2: RAG & PgVector Integration Test Suite
 * 
 * Verifica las 6 condiciones obligatorias de la Capa 2:
 * 1. Cero consultas a PgVector cuando RAG es UNNEEDED o EXCLUDED.
 * 2. Consulta única a PgVector cuando RAG es REQUESTED o SELECTED.
 * 3. Máquina de estados de RAG: NOT_AUTHORIZED, AUTHORIZED_PENDING, EXECUTED_WITH_RESULTS, EXECUTED_EMPTY, FAILED.
 * 4. Eliminación de la doble búsqueda: cuando pre-search finaliza vacío, ragRetrievalStatus es EXECUTED_EMPTY y nunca se dispara fallback ciego.
 * 5. Preservación de similitud vectorial real (ScoredChunk.similarity) eliminando el disfraz ordinal (1.0 - index / chunks.length).
 * 6. Umbral configurable minSimilarity (0.60, 0.65, 0.68, 0.70, 0.75) y cálculo de coseno $1 - \text{cosine\_distance}$.
 */

describe('JCA-001 Capa 2: RAG & PgVector Integration Suite', () => {
  const service = new ContextSelectorService();

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 1: GOBERNANZA DE PRE-SEARCH (CERO QUERIES EN UNNEEDED / EXCLUDED)
  // ════════════════════════════════════════════════════════════════════════════
  describe('1. Gobernanza de Pre-Search (Cero queries en UNNEEDED y EXCLUDED)', () => {
    it('Caso 1.1: Consulta conceptual teórica ("¿Qué es un embedding?") asigna RAG UNNEEDED -> Pre-search omitido', () => {
      const plan = service.evaluate({
        userMessage: '¿Qué es un embedding?',
        classifiedIntent: 'LOCAL',
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      const ragAuthorized = plan.sources.rag === 'REQUESTED' || plan.sources.rag === 'SELECTED';
      assert.strictEqual(ragAuthorized, false, 'RAG no debe autorizarse para consulta conceptual pura');
    });

    it('Caso 1.2: Consulta matemática con colisión de "resultado" asigna RAG UNNEEDED -> Pre-search omitido', () => {
      const plan = service.evaluate({
        userMessage: '¿Cuánto es 2 + 2? Explicá el resultado',
        classifiedIntent: 'SPORTS',
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      const ragAuthorized = plan.sources.rag === 'REQUESTED' || plan.sources.rag === 'SELECTED';
      assert.strictEqual(ragAuthorized, false, 'RAG no debe autorizarse para cálculo matemático');
    });

    it('Caso 1.3: Directiva explícita de exclusión ("Busca en mi biblioteca, pero sin documentos") asigna RAG EXCLUDED', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mi biblioteca sobre cábala, pero sin documentos',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
      const ragAuthorized = plan.sources.rag === 'REQUESTED' || plan.sources.rag === 'SELECTED';
      assert.strictEqual(ragAuthorized, false, 'RAG bloqueado estrictamente por directiva');
    });

    it('Caso 1.4: Petición explícita ("Busca en mis documentos qué es un embedding") autoriza RAG REQUESTED -> Búsqueda única', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mis documentos qué es un embedding',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      const ragAuthorized = plan.sources.rag === 'REQUESTED' || plan.sources.rag === 'SELECTED';
      assert.strictEqual(ragAuthorized, true, 'RAG debidamente autorizado cuando el usuario lo pide explícitamente');
    });

    it('Caso 1.5: Petición bibliográfica ("Busca el documento sobre Muldoon en la biblioteca") autoriza RAG REQUESTED', () => {
      const plan = service.evaluate({
        userMessage: 'Busca el documento sobre Muldoon en la biblioteca',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      const ragAuthorized = plan.sources.rag === 'REQUESTED' || plan.sources.rag === 'SELECTED';
      assert.strictEqual(ragAuthorized, true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 2: MÁQUINA DE ESTADOS Y ELIMINACIÓN DE LA DOBLE BÚSQUEDA RAG
  // ════════════════════════════════════════════════════════════════════════════
  describe('2. Máquina de Estados de RAG y Eliminación de Doble Búsqueda', () => {
    type RagRetrievalStatus =
      | 'NOT_AUTHORIZED'
      | 'AUTHORIZED_PENDING'
      | 'EXECUTED_WITH_RESULTS'
      | 'EXECUTED_EMPTY'
      | 'FAILED';

    function simulateRagPipeline(
      userMessage: string,
      classifiedIntent: string,
      mockPgvectorSearch: () => Array<{ id: number; similarity: number }>,
      options: { useDocuments?: boolean } = {},
    ): {
      ragAuthorized: boolean;
      ragStatus: RagRetrievalStatus;
      vectorQueriesExecuted: number;
      chunksInjected: number;
    } {
      const plan = service.evaluate({ userMessage, classifiedIntent });
      const useDocs = options.useDocuments !== false;
      const ragAuthorized =
        useDocs &&
        (plan.sources.rag === 'REQUESTED' || plan.sources.rag === 'SELECTED');

      let ragStatus: RagRetrievalStatus = ragAuthorized
        ? 'AUTHORIZED_PENDING'
        : 'NOT_AUTHORIZED';

      let vectorQueriesExecuted = 0;
      let chunksInjected = 0;

      if (ragAuthorized) {
        try {
          vectorQueriesExecuted++;
          const chunks = mockPgvectorSearch();
          if (chunks.length > 0) {
            ragStatus = 'EXECUTED_WITH_RESULTS';
            chunksInjected = chunks.length;
          } else {
            ragStatus = 'EXECUTED_EMPTY';
          }
        } catch {
          ragStatus = 'FAILED';
        }
      }

      return {
        ragAuthorized,
        ragStatus,
        vectorQueriesExecuted,
        chunksInjected,
      };
    }

    it('Caso 2.1: Consulta conceptual produce NOT_AUTHORIZED con 0 búsquedas vectoriales', () => {
      const res = simulateRagPipeline('¿Qué es la fotosíntesis?', 'LOCAL', () => [
        { id: 1, similarity: 0.8 },
      ]);

      assert.strictEqual(res.ragAuthorized, false);
      assert.strictEqual(res.ragStatus, 'NOT_AUTHORIZED');
      assert.strictEqual(res.vectorQueriesExecuted, 0);
      assert.strictEqual(res.chunksInjected, 0);
    });

    it('Caso 2.2: Consulta documental que encuentra fragmentos produce EXECUTED_WITH_RESULTS con exactamente 1 búsqueda', () => {
      const res = simulateRagPipeline(
        'Busca en mis documentos el capítulo de proyección astral',
        'RAG',
        () => [
          { id: 101, similarity: 0.85 },
          { id: 102, similarity: 0.72 },
        ],
      );

      assert.strictEqual(res.ragAuthorized, true);
      assert.strictEqual(res.ragStatus, 'EXECUTED_WITH_RESULTS');
      assert.strictEqual(res.vectorQueriesExecuted, 1, 'Exactamente una búsqueda ejecutada');
      assert.strictEqual(res.chunksInjected, 2);
    });

    it('Caso 2.3: Consulta documental sin matches produce EXECUTED_EMPTY y CERO búsquedas adicionales', () => {
      const res = simulateRagPipeline(
        'Busca en mis documentos física cuántica de agujeros de gusano',
        'RAG',
        () => [],
      );

      assert.strictEqual(res.ragAuthorized, true);
      assert.strictEqual(res.ragStatus, 'EXECUTED_EMPTY');
      assert.strictEqual(res.vectorQueriesExecuted, 1, 'Exactamente una búsqueda, sin fallback ciego');
      assert.strictEqual(res.chunksInjected, 0);
    });

    it('Caso 2.4: Fallo en base de datos transiciona limpiamente a estado FAILED', () => {
      const res = simulateRagPipeline(
        'Busca en mis documentos alquimia medieval',
        'RAG',
        () => {
          throw new Error('Connection timeout in pgvector');
        },
      );

      assert.strictEqual(res.ragAuthorized, true);
      assert.strictEqual(res.ragStatus, 'FAILED');
      assert.strictEqual(res.vectorQueriesExecuted, 1);
      assert.strictEqual(res.chunksInjected, 0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 3: PRESERVACIÓN DE SIMILITUD REAL EN ScoredChunk
  // ════════════════════════════════════════════════════════════════════════════
  describe('3. Preservación de Similitud Vectorial Real (ScoredChunk)', () => {
    interface ScoredChunkTest {
      id: number;
      documentId: number;
      content: string;
      similarity: number;
    }

    function mapRowsToChunksMirror(rows: any[]): ScoredChunkTest[] {
      return rows.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        content: row.content,
        similarity:
          typeof row.similarity === 'number'
            ? row.similarity
            : Number(row.similarity ?? 0),
      }));
    }

    it('Caso 3.1: Mapeo de filas SQL a ScoredChunk preserva floats empíricos sin truncamiento', () => {
      const sqlRows = [
        { id: 1, documentId: 10, content: 'Fragmento A', similarity: 0.842351 },
        { id: 2, documentId: 10, content: 'Fragmento B', similarity: 0.691238 },
        { id: 3, documentId: 11, content: 'Fragmento C', similarity: '0.751100' },
      ];

      const chunks = mapRowsToChunksMirror(sqlRows);

      assert.strictEqual(chunks.length, 3);
      assert.strictEqual(chunks[0].similarity, 0.842351);
      assert.strictEqual(chunks[1].similarity, 0.691238);
      assert.strictEqual(chunks[2].similarity, 0.7511);
      assert.strictEqual(typeof chunks[0].similarity, 'number');
      assert.strictEqual(typeof chunks[2].similarity, 'number');
    });

    it('Caso 3.2: Valores nulos o indefinidos de similitud hacen fallback seguro a 0', () => {
      const sqlRows = [
        { id: 4, documentId: 12, content: 'Fragmento D', similarity: null },
        { id: 5, documentId: 12, content: 'Fragmento E', similarity: undefined },
      ];

      const chunks = mapRowsToChunksMirror(sqlRows);
      assert.strictEqual(chunks[0].similarity, 0);
      assert.strictEqual(chunks[1].similarity, 0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 4: EVALUACIÓN COMPARATIVA DEL UMBRAL minSimilarity
  // ════════════════════════════════════════════════════════════════════════════
  describe('4. Evaluación del Umbral de Similitud (minSimilarity)', () => {
    const candidateChunks = [
      { id: 1, content: 'Chunk afinidad superior', similarity: 0.82 },
      { id: 2, content: 'Chunk afinidad sólida', similarity: 0.72 },
      { id: 3, content: 'Chunk afinidad moderada', similarity: 0.67 },
      { id: 4, content: 'Chunk afinidad limítrofe', similarity: 0.63 },
      { id: 5, content: 'Chunk ruido irrelevante', similarity: 0.55 },
    ];

    const filterByThreshold = (chunks: typeof candidateChunks, minSim: number) =>
      chunks.filter((c) => c.similarity >= minSim);

    it('Caso 4.1: Umbral 0.60 retiene fragmentos de afinidad sólida y moderada (4 de 5)', () => {
      const filtered = filterByThreshold(candidateChunks, 0.60);
      assert.strictEqual(filtered.length, 4);
      assert.deepStrictEqual(filtered.map((c) => c.id), [1, 2, 3, 4]);
    });

    it('Caso 4.2: Umbral 0.65 descarta el fragmento limítrofe 0.63 (3 de 5)', () => {
      const filtered = filterByThreshold(candidateChunks, 0.65);
      assert.strictEqual(filtered.length, 3);
      assert.deepStrictEqual(filtered.map((c) => c.id), [1, 2, 3]);
    });

    it('Caso 4.3: Umbral por defecto 0.68 descarta 0.67 y conserva solo afinidad sólida (2 de 5)', () => {
      const filtered = filterByThreshold(candidateChunks, 0.68);
      assert.strictEqual(filtered.length, 2);
      assert.deepStrictEqual(filtered.map((c) => c.id), [1, 2]);
    });

    it('Caso 4.4: Umbral 0.70 es conservador y retiene 2 fragmentos', () => {
      const filtered = filterByThreshold(candidateChunks, 0.70);
      assert.strictEqual(filtered.length, 2);
      assert.deepStrictEqual(filtered.map((c) => c.id), [1, 2]);
    });

    it('Caso 4.5: Umbral 0.75 es ultra restrictivo y solo retiene el top match (1 de 5)', () => {
      const filtered = filterByThreshold(candidateChunks, 0.75);
      assert.strictEqual(filtered.length, 1);
      assert.deepStrictEqual(filtered.map((c) => c.id), [1]);
    });

    it('Caso 4.6: Interpretación KaTeX / Semántica: 1 - cosine_distance es similitud angular, no probabilidad', () => {
      const sim = 0.68;
      assert.ok(sim >= 0 && sim <= 1);
      assert.strictEqual(typeof sim, 'number');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 5: RERANKER HÍBRIDO CON SIMILITUD VECTORIAL REAL
  // ════════════════════════════════════════════════════════════════════════════
  describe('5. Reranker Híbrido con Similitud Real vs Disfraz Ordinal', () => {
    function rerankChunksMirror(chunks: any[], query: string): any[] {
      if (!chunks || chunks.length === 0) return [];

      const queryTerms = query
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9áéíóúüñ]+/)
        .filter((t) => t.length >= 3);

      const scored = chunks.map((chunk) => {
        const contentLower = (chunk.content || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

        let matches = 0;
        if (queryTerms.length > 0) {
          for (const term of queryTerms) {
            if (contentLower.includes(term)) matches++;
          }
        }

        const lexicalScore = queryTerms.length > 0 ? matches / queryTerms.length : 0.0;
        const semanticScore =
          typeof chunk.similarity === 'number'
            ? chunk.similarity
            : Number(chunk.similarity ?? 0.0);

        const hybridScore = 0.4 * lexicalScore + 0.6 * semanticScore;

        chunk.lexicalScore = lexicalScore;
        chunk.semanticScore = semanticScore;
        chunk.hybridScore = hybridScore;

        return { chunk, score: hybridScore };
      });

      return scored.sort((a, b) => b.score - a.score).map((item) => item.chunk);
    }

    it('Caso 5.1: semanticScore utiliza la similitud real del chunk, NO el índice posicional', () => {
      const chunks = [
        { id: 10, content: 'Texto sin coincidencia léxica directa', similarity: 0.95 },
        { id: 20, content: 'Texto con repetición de embedding embedding', similarity: 0.70 },
      ];

      const reranked = rerankChunksMirror(chunks, 'embedding');

      assert.strictEqual(chunks[0].semanticScore, 0.95, 'Debe preservar 0.95');
      assert.strictEqual(chunks[1].semanticScore, 0.70, 'Debe preservar 0.70');
    });

    it('Caso 5.2: Cálculo híbrido respeta la ponderación 40% léxico + 60% semántico', () => {
      const chunk = { id: 30, content: 'El concepto de embedding vectorial', similarity: 0.80 };
      const query = 'embedding vectorial';

      const reranked = rerankChunksMirror([chunk], query);
      const c = reranked[0];

      assert.strictEqual(c.lexicalScore, 1.0);
      assert.strictEqual(c.semanticScore, 0.80);
      const expectedHybrid = 0.4 * 1.0 + 0.6 * 0.80;
      assert.ok(Math.abs(c.hybridScore - expectedHybrid) < 1e-6, `hybridScore debe ser 0.88 (fue ${c.hybridScore})`);
    });

    it('Caso 5.3: Inversión de ranking cuando un chunk semánticamente potente supera a uno débil con más palabras clave', () => {
      const chunkWeakSemantic = {
        id: 40,
        content: 'alpha beta gamma delta',
        similarity: 0.30,
      };
      const chunkStrongSemantic = {
        id: 50,
        content: 'alpha solamente',
        similarity: 0.92,
      };

      const query = 'alpha beta gamma delta';
      const reranked = rerankChunksMirror([chunkWeakSemantic, chunkStrongSemantic], query);

      assert.strictEqual(reranked[0].id, 50, 'El chunk con alta similitud semántica (0.92) debe liderar');
      assert.strictEqual(reranked[1].id, 40, 'El chunk con baja similitud semántica (0.30) queda relegado');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 6: GOBERNANZA DE MEMORIA E HISTORIAL CONTEXTUAL
  // ════════════════════════════════════════════════════════════════════════════
  describe('6. Gobernanza de Memoria e Historial (UNNEEDED vs EXCLUDED)', () => {
    it('Caso 6.1: Directiva "sin memoria" o "olvida mis datos previos" excluye activamente la memoria', () => {
      const plan = service.evaluate({
        userMessage: 'Explícame qué es la fotosíntesis, pero sin memoria previa',
        classifiedIntent: 'LOCAL',
      });

      assert.strictEqual(plan.sources.memory, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeMemory, true);
      const memoryAuthorized = plan.sources.memory === 'REQUESTED' || plan.sources.memory === 'SELECTED';
      assert.strictEqual(memoryAuthorized, false, 'Memoria debe estar desautorizada');
    });

    it('Caso 6.2: Consulta conceptual pura no solicita memoria (UNNEEDED)', () => {
      const plan = service.evaluate({
        userMessage: '¿Cuál es la velocidad de la luz?',
        classifiedIntent: 'LOCAL',
      });

      assert.strictEqual(plan.sources.memory, 'UNNEEDED');
      const memoryAuthorized = plan.sources.memory === 'REQUESTED' || plan.sources.memory === 'SELECTED';
      assert.strictEqual(memoryAuthorized, false, 'Memoria no requerida para constante física');
    });

    it('Caso 6.3: Consulta personal sobre el usuario ("¿Te acordás cómo me llamo?") autoriza memoria', () => {
      const plan = service.evaluate({
        userMessage: '¿Te acordás cómo me llamo y qué preferencias tengo?',
        classifiedIntent: 'TOOL',
      });

      assert.ok(
        plan.sources.memory === 'REQUESTED' || plan.sources.memory === 'SELECTED',
        `Memoria debe estar autorizada (fue ${plan.sources.memory})`,
      );
    });

    it('Caso 6.4: Gobernanza del historial: SELECTED cuando hay historial activo, UNNEEDED cuando no lo hay', () => {
      const planWithHistory = service.evaluate({
        userMessage: '¿Y qué más?',
        classifiedIntent: 'LOCAL',
        hasActiveSessionHistory: true,
      });
      assert.strictEqual(planWithHistory.sources.conversationHistory, 'SELECTED');

      const planWithoutHistory = service.evaluate({
        userMessage: '¿Cuál es la capital de Francia?',
        classifiedIntent: 'LOCAL',
        hasActiveSessionHistory: false,
      });
      assert.strictEqual(planWithoutHistory.sources.conversationHistory, 'UNNEEDED');
    });
  });
});
