import { Injectable, Logger } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { OllamaProvider } from '../llm/ollama.provider';
import { EmbeddingsService } from './embeddings.service';

// ── Tipos de resultado ────────────────────────────────────────────────────────

export interface LibraryDiagnostic {
  totalDocs: number;
  totalChunks: number;
  categories: Array<{ name: string; docCount: number }>;
  topUsed: Array<{
    title: string;
    category: string | null;
    timesUsed: number;
    lastUsed: Date | null;
  }>;
  recentlyAdded: Array<{
    title: string;
    category: string | null;
    createdAt: Date;
  }>;
  avgChunksPerDoc: number;
  docsWithoutChunks: number;
}

export interface RagProbeResult {
  query: string;
  expectedDoc: string;
  retrievedChunks: Array<{
    rank: number;
    documentTitle: string;
    documentId: number;
    contentSnippet: string;
    isCorrectDoc: boolean;
  }>;
  passed: boolean;
  topDocIsCorrect: boolean;
  correctDocFoundInTop5: boolean;
  recallAt5: number; // cuántos de los top 5 vinieron del doc esperado
}

export interface KnowledgeValidationResult {
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;
  tests: RagProbeResult[];
  summary: string;
}

export interface ChunkProbeResult {
  query: string;
  retrievedChunks: Array<{
    rank: number;
    documentTitle: string;
    documentId: number;
    category: string | null;
    contentSnippet: string;
    contentLength: number;
  }>;
  totalFound: number;
  uniqueDocuments: number;
}

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * Servicio de diagnóstico y validación de conocimiento del RAG.
 *
 * Comandos disponibles:
 *   "diagnóstico biblioteca"  → stats de la library (docs, chunks, categorías)
 *   "test de conocimiento"    → valida que el RAG recupere chunks del doc correcto
 *   "probe: <pregunta>"       → muestra qué chunks recupera el RAG para esa pregunta
 */
@Injectable()
export class KnowledgeTestService {
  private readonly logger = new Logger(KnowledgeTestService.name);

  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly ollamaProvider: OllamaProvider,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  // ── Diagnóstico de biblioteca ──────────────────────────────────────────────

  /**
   * Genera un diagnóstico completo de la biblioteca RAG:
   * documentos, chunks, categorías, uso, cobertura.
   */
  async getLibraryDiagnostic(): Promise<LibraryDiagnostic> {
    const stats = await this.documentRepo.getLibraryStats();

    // Docs recientes
    const recent = await this.documentRepo.getMostRecentDocuments(5);

    // Docs sin chunks (potencialmente sin contenido indexado)
    const allDocs = await this.documentRepo.findDocuments();
    let docsWithoutChunks = 0;
    for (const doc of allDocs) {
      const full = await this.documentRepo.getDocumentWithChunks(doc.id);
      if (!full?.chunks || full.chunks.length === 0) docsWithoutChunks++;
    }

    const avgChunks =
      stats.totalDocs > 0
        ? Math.round((stats.totalChunks / stats.totalDocs) * 10) / 10
        : 0;

    return {
      totalDocs: stats.totalDocs,
      totalChunks: stats.totalChunks,
      categories: stats.byCategory.map((c: any) => ({
        name: c.category ?? 'sin categoría',
        docCount: c._count.id,
      })),
      topUsed: stats.topDocs.map((d: any) => ({
        title: d.title,
        category: d.category,
        timesUsed: d.timesUsed,
        lastUsed: d.lastUsed,
      })),
      recentlyAdded: recent.map((d: any) => ({
        title: d.title,
        category: d.category,
        createdAt: d.createdAt,
      })),
      avgChunksPerDoc: avgChunks,
      docsWithoutChunks,
    };
  }

  /** Formatea el diagnóstico como string legible para el chat */
  formatDiagnostic(diag: LibraryDiagnostic): string {
    const lines: string[] = [
      `🔬 **Diagnóstico de Biblioteca RAG**`,
      ``,
      `📚 **Cobertura**`,
      `  • Documentos: **${diag.totalDocs}**`,
      `  • Chunks indexados: **${diag.totalChunks}**`,
      `  • Promedio chunks/doc: **${diag.avgChunksPerDoc}**`,
      diag.docsWithoutChunks > 0
        ? `  ⚠️ Documentos sin chunks: **${diag.docsWithoutChunks}** (revisar ingesta)`
        : `  ✅ Todos los documentos tienen chunks indexados`,
      ``,
    ];

    if (diag.categories.length > 0) {
      lines.push(`📁 **Categorías** (${diag.categories.length} total)`);
      for (const cat of diag.categories.slice(0, 10)) {
        lines.push(
          `  • ${cat.name}: ${cat.docCount} doc${cat.docCount !== 1 ? 's' : ''}`,
        );
      }
      lines.push(``);
    }

    if (diag.topUsed.length > 0) {
      lines.push(`🔥 **Más consultados**`);
      for (const doc of diag.topUsed) {
        const last = doc.lastUsed
          ? new Date(doc.lastUsed).toLocaleDateString('es-AR')
          : 'nunca';
        lines.push(
          `  • ${doc.title} — ${doc.timesUsed}x consultas (último: ${last})`,
        );
      }
      lines.push(``);
    }

    if (diag.recentlyAdded.length > 0) {
      lines.push(`🆕 **Últimos documentos agregados**`);
      for (const doc of diag.recentlyAdded) {
        const fecha = new Date(doc.createdAt).toLocaleDateString('es-AR');
        lines.push(
          `  • ${doc.title} [${doc.category ?? 'sin cat.'}] — ${fecha}`,
        );
      }
      lines.push(``);
    }

    lines.push(`💡 **Próximos pasos sugeridos:**`);
    if (diag.docsWithoutChunks > 0) {
      lines.push(
        `  1. Re-ingerir los ${diag.docsWithoutChunks} documento(s) sin chunks`,
      );
    }
    lines.push(
      `  • Ejecutá \`test de conocimiento\` para validar que el RAG recupera correctamente`,
    );
    lines.push(
      `  • Usá \`probe: <pregunta>\` para ver qué chunks recupera el RAG ante una consulta`,
    );

    return lines.join('\n');
  }

  // ── RAG probe (pregunta libre) ─────────────────────────────────────────────

  /**
   * Ejecuta una búsqueda RAG y muestra exactamente qué chunks recuperó,
   * de qué documentos vinieron y cuánto contenido hay por chunk.
   */
  async probeRag(query: string, limit = 8): Promise<ChunkProbeResult> {
    this.logger.log(`[knowledge-test:probe] query="${query}"`);

    let chunks = [] as any[];
    try {
      const queryEmbedding =
        await this.embeddingsService.generateEmbedding(query);
      chunks = await this.documentRepo.searchChunksSemantic(
        queryEmbedding,
        limit,
      );
    } catch (err: any) {
      this.logger.warn(
        `[knowledge-test:probe] Fallback a búsqueda textual: ${err.message}`,
      );
      chunks = await this.documentRepo.searchChunks(query, limit);
    }

    const uniqueDocs = new Set(chunks.map((c) => c.documentId)).size;

    return {
      query,
      retrievedChunks: chunks.map((c, i) => ({
        rank: i + 1,
        documentTitle: (c as any).document?.title ?? '?',
        documentId: c.documentId,
        category: (c as any).document?.category ?? null,
        contentSnippet: c.content.slice(0, 200).replace(/\s+/g, ' ').trim(),
        contentLength: c.content.length,
      })),
      totalFound: chunks.length,
      uniqueDocuments: uniqueDocs,
    };
  }

  /** Formatea el resultado del probe como string legible para el chat */
  formatProbeResult(result: ChunkProbeResult): string {
    const lines = [
      `🔍 **RAG Probe** — \`${result.query.slice(0, 80)}\``,
      ``,
      `Recuperó **${result.totalFound} chunks** de **${result.uniqueDocuments} documento${result.uniqueDocuments !== 1 ? 's' : ''}**`,
      ``,
    ];

    if (result.totalFound === 0) {
      lines.push(`⚠️ No se recuperaron chunks para esta consulta.`);
      lines.push(
        `Verificá que los documentos estén correctamente indexados con \`diagnóstico biblioteca\`.`,
      );
      return lines.join('\n');
    }

    for (const chunk of result.retrievedChunks) {
      lines.push(
        `**#${chunk.rank} — "${chunk.documentTitle}"** [${chunk.category ?? 'sin cat'}]`,
      );
      lines.push(
        `   _${chunk.contentSnippet}${chunk.contentLength > 200 ? '...' : ''}_`,
      );
      lines.push(``);
    }

    lines.push(
      `💡 Si el documento que esperabas NO aparece → el contenido puede no estar chunkeado o el vocabulario no coincide.`,
    );
    return lines.join('\n');
  }

  // ── Validación automática de conocimiento ─────────────────────────────────

  /**
   * Toma N documentos al azar de la biblioteca, genera una pregunta de prueba
   * para cada uno usando el LLM, ejecuta el RAG y verifica si recuperó el doc correcto.
   *
   * Esto simula lo que hace el asistente cuando el usuario hace una pregunta real.
   */
  async runKnowledgeValidation(
    numTests = 3,
  ): Promise<KnowledgeValidationResult> {
    this.logger.log(
      `[knowledge-test] iniciando validación con ${numTests} prueba(s)`,
    );

    const allDocs = await this.documentRepo.getMostRecentDocuments(20);
    // Solo docs que tienen chunks
    const docsWithChunks: any[] = [];
    for (const doc of allDocs) {
      const full = await this.documentRepo.getDocumentWithChunks(doc.id);
      if (full?.chunks && full.chunks.length > 0) {
        docsWithChunks.push(full);
      }
      if (docsWithChunks.length >= numTests) break;
    }

    if (docsWithChunks.length === 0) {
      return {
        totalTests: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        tests: [],
        summary:
          '⚠️ No hay documentos con chunks para testear. Subí al menos un PDF.',
      };
    }

    const actualTests = Math.min(numTests, docsWithChunks.length);
    const tests: RagProbeResult[] = [];
    let passed = 0;

    for (let i = 0; i < actualTests; i++) {
      const doc = docsWithChunks[i];
      const result = await this.runSingleTest(doc);
      tests.push(result);
      if (result.passed) passed++;
    }

    const passRate = Math.round((passed / actualTests) * 100);
    const summary = this.buildValidationSummary(
      tests,
      passed,
      actualTests,
      passRate,
    );

    return {
      totalTests: actualTests,
      passed,
      failed: actualTests - passed,
      passRate,
      tests,
      summary,
    };
  }

  /** Ejecuta un test individual: genera pregunta → busca con RAG → verifica resultado */
  private async runSingleTest(doc: any): Promise<RagProbeResult> {
    this.logger.log(
      `[knowledge-test:single] testing "${doc.title}" (${doc.chunks.length} chunks)`,
    );

    // Tomar un chunk de la mitad del documento (evita índice/introducción)
    const midIndex = Math.floor(doc.chunks.length / 2);
    const testChunk = doc.chunks[midIndex] ?? doc.chunks[0];
    const contentSnippet = testChunk.content.slice(0, 600);

    // Generar una pregunta de prueba específica usando el LLM
    const testQuestion = await this.generateTestQuestion(
      doc.title,
      contentSnippet,
    );

    this.logger.log(
      `[knowledge-test:single] pregunta generada: "${testQuestion}"`,
    );

    // Ejecutar búsqueda RAG
    let chunks = [] as any[];
    try {
      const queryEmbedding =
        await this.embeddingsService.generateEmbedding(testQuestion);
      chunks = await this.documentRepo.searchChunksSemantic(queryEmbedding, 5);
    } catch (err: any) {
      this.logger.warn(
        `[knowledge-test:single] Fallback a búsqueda textual: ${err.message}`,
      );
      chunks = await this.documentRepo.searchChunks(testQuestion, 5);
    }

    const retrievedChunks = chunks.map((c, idx) => ({
      rank: idx + 1,
      documentTitle: (c as any).document?.title ?? '?',
      documentId: c.documentId,
      contentSnippet: c.content.slice(0, 150).replace(/\s+/g, ' ').trim(),
      isCorrectDoc: c.documentId === doc.id,
    }));

    const topIsCorrect = retrievedChunks[0]?.isCorrectDoc ?? false;
    const foundInTop5 = retrievedChunks.some((c) => c.isCorrectDoc);
    const recallAt5 = retrievedChunks.filter((c) => c.isCorrectDoc).length;

    // Test pasa si el documento correcto aparece en top 3
    const passed = retrievedChunks.slice(0, 3).some((c) => c.isCorrectDoc);

    return {
      query: testQuestion,
      expectedDoc: doc.title,
      retrievedChunks,
      passed,
      topDocIsCorrect: topIsCorrect,
      correctDocFoundInTop5: foundInTop5,
      recallAt5,
    };
  }

  /** Genera una pregunta de prueba específica a partir de un fragmento de texto */
  private async generateTestQuestion(
    docTitle: string,
    content: string,
  ): Promise<string> {
    const prompt = `Sos un generador de preguntas de prueba para sistemas RAG.
Dado el siguiente fragmento de texto de un documento, generá UNA SOLA pregunta específica y concreta que:
1. Solo pueda responderse leyendo ese texto
2. No sea demasiado genérica (evitá "¿De qué trata el documento?")
3. Sea sobre un dato, concepto o idea específica del fragmento
4. Sea en español

Documento: "${docTitle}"
Fragmento: ${content.slice(0, 400)}

Respondé SOLO con la pregunta, sin introducción ni explicación.`;

    try {
      const response = await this.ollamaProvider.generate({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 80,
      });

      const question = response.content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim()
        .replace(/^["']|["']$/g, '');

      return (
        question || `¿Qué información contiene el documento "${docTitle}"?`
      );
    } catch {
      return `¿Qué información contiene el documento "${docTitle}"?`;
    }
  }

  /** Construye el resumen legible de la validación completa */
  private buildValidationSummary(
    tests: RagProbeResult[],
    passed: number,
    total: number,
    passRate: number,
  ): string {
    const icon = passRate >= 80 ? '✅' : passRate >= 50 ? '⚠️' : '❌';
    const lines = [
      `${icon} **Test de Conocimiento RAG** — ${passed}/${total} pruebas pasadas (${passRate}%)`,
      ``,
    ];

    for (const test of tests) {
      const statusIcon = test.passed
        ? '✅'
        : test.correctDocFoundInTop5
          ? '⚠️'
          : '❌';
      lines.push(`${statusIcon} **"${test.expectedDoc}"**`);
      lines.push(
        `   _Pregunta:_ "${test.query.slice(0, 100)}${test.query.length > 100 ? '...' : ''}"`,
      );

      if (test.passed) {
        lines.push(
          `   ✅ El RAG recuperó el documento correcto en los primeros 3 resultados`,
        );
        if (test.topDocIsCorrect) {
          lines.push(
            `   🎯 Resultado #1 fue exactamente el documento esperado`,
          );
        }
      } else if (test.correctDocFoundInTop5) {
        lines.push(
          `   ⚠️ El doc correcto apareció en posición >3 de 5 (recall parcial)`,
        );
      } else {
        lines.push(
          `   ❌ El RAG NO recuperó el documento correcto en los primeros 5 resultados`,
        );
        if (test.retrievedChunks[0]) {
          lines.push(
            `   📄 En su lugar recuperó: "${test.retrievedChunks[0].documentTitle}"`,
          );
        }
      }

      lines.push(`   📊 Recall@5: ${test.recallAt5}/5 chunks del doc correcto`);
      lines.push(``);
    }

    // Recomendaciones
    lines.push(`💡 **Interpretación:**`);
    if (passRate === 100) {
      lines.push(
        `  El RAG está funcionando perfectamente. Tus documentos están bien indexados.`,
      );
    } else if (passRate >= 70) {
      lines.push(
        `  El RAG funciona bien en general. Algunos documentos pueden tener chunks cortos o vocabulario ambiguo.`,
      );
    } else if (passRate >= 40) {
      lines.push(`  El RAG tiene dificultades. Revisá:`);
      lines.push(
        `  1. Que los documentos tengan suficiente texto (evitá PDFs de imágenes)`,
      );
      lines.push(
        `  2. Que los chunks no sean muy cortos (ver \`diagnóstico biblioteca\`)`,
      );
    } else {
      lines.push(`  ⚠️ El RAG tiene problemas serios. Posibles causas:`);
      lines.push(`  - PDFs escaneados sin OCR (sin texto extraíble)`);
      lines.push(`  - Documentos con muy poco contenido`);
      lines.push(
        `  - Error en la ingesta (re-subir con \`diagnóstico biblioteca\`)`,
      );
    }

    lines.push(``);
    lines.push(
      `🔍 Usá \`probe: <tu pregunta>\` para inspeccionar qué chunks recupera el RAG ante una consulta específica.`,
    );

    return lines.join('\n');
  }
}
