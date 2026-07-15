import { Injectable, Logger } from '@nestjs/common';
import { ConversationRepository } from '../repositories/conversation.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { UserProfileRepository } from '../repositories/user-profile.repository';
import { AgentRunRepository } from '../repositories/agent-run.repository';
import { CategorySummaryService } from '../library/category-summary.service';
import { DocumentSummaryService } from '../library/document-summary.service';
import { DocumentCompareService } from '../library/document-compare.service';
import { KnowledgeTestService } from '../library/knowledge-test.service';
import { JarvisKnowledgeService } from '../knowledge/jarvis-knowledge.service';
import { CorpusSelectorService } from '../knowledge/corpus-selector.service';
import { randomUUID } from 'crypto';

@Injectable()
export class JarvisCommandService {
  private readonly logger = new Logger(JarvisCommandService.name);

  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly userProfileRepo: UserProfileRepository,
    private readonly agentRunRepo: AgentRunRepository,
    private readonly categorySummaryService: CategorySummaryService,
    private readonly documentSummaryService: DocumentSummaryService,
    private readonly documentCompareService: DocumentCompareService,
    private readonly knowledgeTestService: KnowledgeTestService,
    private readonly jarvisKnowledge: JarvisKnowledgeService,
    private readonly corpusSelector: CorpusSelectorService,
  ) {}

  /**
   * Main entry point to intercept and handle commands.
   * Returns an object indicating if the query was handled as a command, and the response.
   */
  async handleCommand(
    userMessage: string,
    sessionId: string,
    startTime: number,
  ): Promise<{ handled: boolean; response?: string }> {
    const trimmedMessage = userMessage.trim();
    const hasSessionId = Boolean(sessionId);

    // 1. Local JSON Knowledge list lookup
    const knowledgeListReply = await this.jarvisKnowledge.handleListCommand(userMessage);
    if (knowledgeListReply) {
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: knowledgeListReply, metadata: { source: 'knowledge_list' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: knowledgeListReply, toolsUsed: ['knowledge_list'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: knowledgeListReply };
    }

    // 2. CONFIGURACIÓN DE MODO RAG / ONLINE
    const modeChangeMatch = trimmedMessage.match(/^(?:configurar\s+)?modo\s+(offline|localfirst|local[-_\s]first|hybrid|hibrido|webfirst|web[-_\s]first)$/i);
    if (modeChangeMatch) {
      const profile = await this.userProfileRepo.getOrCreate();
      let preferences: Record<string, any> = {};
      if (profile.preferences) {
        try {
          preferences = typeof profile.preferences === 'string'
            ? JSON.parse(profile.preferences)
            : (profile.preferences as any);
        } catch (err) {
          // ignore
        }
      }

      let targetMode: 'OFFLINE' | 'LOCAL_FIRST' | 'HYBRID' | 'WEB_FIRST' = 'LOCAL_FIRST';
      const m = modeChangeMatch[1].toLowerCase().replace(/[-_\s]/g, '');
      if (m === 'offline') targetMode = 'OFFLINE';
      else if (m === 'localfirst') targetMode = 'LOCAL_FIRST';
      else if (m === 'hybrid' || m === 'hibrido') targetMode = 'HYBRID';
      else if (m === 'webfirst') targetMode = 'WEB_FIRST';

      const updatedPrefs = { ...preferences, ragMode: targetMode };
      await this.userProfileRepo.update(profile.id, { preferences: updatedPrefs });

      const explanation: Record<string, string> = {
        OFFLINE: '🔒 **Modo OFFLINE activado**: No consultaré internet bajo ninguna circunstancia. Solo usaré los documentos indexados en la biblioteca y mis conocimientos locales.',
        LOCAL_FIRST: '🏠 **Modo LOCAL FIRST activado (Recomendado)**: Buscaré primero en tus documentos (RAG) o en mi conocimiento base. Solo iré a internet como último recurso si no encuentro la información.',
        HYBRID: '⚖️ **Modo HÍBRIDO activado**: Usaré herramientas web automáticas para temas dinámicos (clima, noticias, cotizaciones), y para todo lo demás priorizaré tus documentos y conocimiento local.',
        WEB_FIRST: '🌐 **Modo WEB FIRST activado**: Buscaré primero en internet para enriquecer todas las respuestas, excepto saludos y comandos simples.',
      };

      const reply = explanation[targetMode];
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: reply, metadata: { source: 'mode_change', mode: targetMode } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: reply, toolsUsed: ['mode_change'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: reply };
    }

    // 3. HELP SHORTCUT — "h", "H", "help", "ayuda" devuelve la guía de comandos
    if (/^(h|help|ayuda)$/i.test(trimmedMessage)) {
      const helpMsg = this.buildHelpMessage();
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: helpMsg, metadata: { source: 'help' } });
      return { handled: true, response: helpMsg };
    }

    // 4. BIBLIOTECA — lista de documentos guardados
    if (/^(mis documentos|biblioteca|mis libros|mis pdfs|documentos guardados|que (libros|documentos|pdfs) (tengo|hay)|lista de (documentos|libros|pdfs))$/i.test(trimmedMessage)) {
      const libraryMsg = await this.buildLibraryMessage();
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: libraryMsg, metadata: { source: 'library_list' } });
      return { handled: true, response: libraryMsg };
    }

    // 5. CATEGORÍAS — lista de categorías con conteo
    if (/^(mis categor[ií]as|categor[ií]as|categorias de (mis )?(documentos|pdfs|libros)|que categor[ií]as (tengo|hay))$/i.test(trimmedMessage)) {
      const catMsg = await this.buildCategoriesMessage();
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: catMsg, metadata: { source: 'library_categories' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: catMsg, toolsUsed: ['library_categories'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: catMsg };
    }

    // 5b. AUTORES — lista de autores de la biblioteca
    if (/^(mis autores|autores|lista de autores|que autores (tengo|hay))$/i.test(trimmedMessage)) {
      const authorsMsg = await this.buildAuthorsMessage();
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: authorsMsg, metadata: { source: 'library_authors' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: authorsMsg, toolsUsed: ['library_authors'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: authorsMsg };
    }

    // 6. LIBROS POR AUTOR
    const authorBooksRequest = this.extractAuthorBooksRequest(userMessage);
    if (authorBooksRequest) {
      const authorBooksMsg = await this.buildAuthorBooksMessage(authorBooksRequest.author);
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: authorBooksMsg, metadata: { source: 'library_author_books', author: authorBooksRequest.author } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: authorBooksMsg, toolsUsed: ['library_author_books'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: authorBooksMsg };
    }

    // 7. RESUMEN DE DOCUMENTO INDIVIDUAL
    const docSummaryRequest = await this.extractDocumentSummaryRequest(userMessage);
    if (docSummaryRequest) {
      const summaryMsg = await this.buildDocumentSummaryResponse(
        docSummaryRequest.title,
        docSummaryRequest.maxItems,
      );
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: summaryMsg, metadata: { source: 'document_summary' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: summaryMsg, toolsUsed: ['document_summary'], modelUsed: 'ollama', provider: 'ollama', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: summaryMsg };
    }

    // 7. COMPARACIÓN ENTRE DOS DOCUMENTOS
    const compareRequest = this.extractCompareRequest(userMessage);
    if (compareRequest) {
      const compareMsg = await this.buildCompareResponse(compareRequest.titleA, compareRequest.titleB);
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: compareMsg, metadata: { source: 'document_compare' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: compareMsg, toolsUsed: ['document_compare'], modelUsed: 'ollama', provider: 'ollama', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: compareMsg };
    }

    // 8. DIAGNÓSTICO BIBLIOTECA RAG
    if (/^(diagn[oó]stico( de( la)?)? biblioteca|estado del conocimiento|cobertura rag|stats biblioteca|diagn[oó]stico rag)$/i.test(trimmedMessage)) {
      const diag = await this.knowledgeTestService.getLibraryDiagnostic();
      const diagMsg = this.knowledgeTestService.formatDiagnostic(diag);
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: diagMsg, metadata: { source: 'library_diagnostic' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: diagMsg, toolsUsed: ['library_diagnostic'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: diagMsg };
    }

    // 9. TEST DE CONOCIMIENTO RAG
    const knowledgeTestMatch = trimmedMessage.match(/^(test de conocimiento|validar conocimiento|test rag|validar rag|probar rag)(?:\s+(\d+))?$/i);
    if (knowledgeTestMatch) {
      const numTests = knowledgeTestMatch[2] ? parseInt(knowledgeTestMatch[2], 10) : 3;
      const testResult = await this.knowledgeTestService.runKnowledgeValidation(
        Math.min(Math.max(numTests, 1), 5),
      );
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: testResult.summary, metadata: { source: 'knowledge_test', passRate: testResult.passRate } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: testResult.summary, toolsUsed: ['knowledge_test'], modelUsed: 'ollama', provider: 'ollama', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: testResult.summary };
    }

    // 10. PROBE RAG (qué chunks recupera el RAG para esta query)
    const probeMatch = trimmedMessage.match(/^probe:\s*(.+)$/i);
    if (probeMatch) {
      const probeQuery = probeMatch[1].trim();
      const probeResult = await this.knowledgeTestService.probeRag(probeQuery);
      const probeMsg = this.knowledgeTestService.formatProbeResult(probeResult);
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: probeMsg, metadata: { source: 'rag_probe', query: probeQuery } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: probeMsg, toolsUsed: ['rag_probe'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: probeMsg };
    }

    // 11. DEDUPLICAR DOCUMENTOS
    if (/^(elimina(r)? (los )?(pdf|documentos?|libros?)? ?(repetidos?|duplicados?)|borr(a|ar) (los )?(pdf|documentos?|libros?)? ?(repetidos?|duplicados?)|deduplicar|limpiar (la )?biblioteca)$/i.test(trimmedMessage)) {
      const dedupMsg = await this.deduplicateDocuments();
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: dedupMsg, metadata: { source: 'library_dedup' } });
      return { handled: true, response: dedupMsg };
    }

    // 12. ELIMINAR DOCUMENTO POR TÍTULO
    const deleteDocRequest = this.extractDeleteDocumentRequest(userMessage);
    if (deleteDocRequest) {
      const deleteMsg = await this.deleteDocumentByTitle(deleteDocRequest);
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: deleteMsg, metadata: { source: 'library_delete' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: deleteMsg, toolsUsed: ['library_delete'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return { handled: true, response: deleteMsg };
    }

    // 13. REPEAT / VOICE SHORTCUT
    if (this.isRepeatRequest(userMessage)) {
      if (!hasSessionId) {
        const reply = 'Para repetir la última respuesta necesito que mantengas el mismo sessionId de la conversación anterior.';
        return { handled: true, response: reply };
      }

      const lastAnswer = await this.conversationRepo.getLastAssistantMessage(sessionId);
      if (lastAnswer) {
        const repeatedContent = this.isVoiceRequest(userMessage)
          ? `No puedo generar audio en este canal, pero te repito la respuesta en texto: ${lastAnswer.content}`
          : lastAnswer.content;

        await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
        await this.conversationRepo.create({
          sessionId,
          role: 'assistant',
          content: repeatedContent,
          metadata: { source: 'repeat', repeatedMessageId: lastAnswer.id },
        });
        await this.agentRunRepo.create({
          sessionId,
          question: userMessage,
          answer: repeatedContent,
          toolsUsed: ['repeat'],
          modelUsed: 'none',
          provider: 'repeat',
          durationMs: Date.now() - startTime,
          success: true,
        });
        return { handled: true, response: repeatedContent };
      }

      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      const reply = 'No encuentro una respuesta anterior para repetir dentro de esta conversación. Hacé otra pregunta primero y luego intentá repetirla.';
      return { handled: true, response: reply };
    }

    return { handled: false };
  }

  // ── Parsers & Helpers ──────────────────────────────────────────────────────

  private isRepeatRequest(message: string): boolean {
    const normalized = message
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return /\b(repiti[rt]|repeti[rt]|repite|repitelo|dilo de nuevo|decilo de nuevo|voz alta|en voz alta|repeat|say it again)\b/.test(normalized);
  }

  private isVoiceRequest(message: string): boolean {
    const normalized = message.toLowerCase();
    return /voz|audio|habl(a|e|o)|en voz alta|voz alta/.test(normalized);
  }

  private extractDeleteDocumentRequest(message: string): string | null {
    const pattern = /(?:elimina(?:r)?|borra(?:r)?|borrar|remover|quitar)\s+(?:el\s+)?(?:documento|pdf|libro|archivo)\s+['"]?(.+?)['"]?$/i;
    const match = message.trim().match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/['".]+$/, '').trim();
    }
    return null;
  }

  private async deleteDocumentByTitle(title: string): Promise<string> {
    const candidates = await this.documentRepo.searchDocuments(title, 5);
    if (candidates.length === 0) {
      return `❌ No encontré ningún documento con el título "${title}".\n\nUsá \`mis documentos\` para ver los títulos disponibles.`;
    }

    const exact = candidates.find(
      d => d.title.toLowerCase().trim() === title.toLowerCase().trim(),
    );
    const target = exact ?? candidates[0];
    await this.documentRepo.deleteDocument(target.id);

    return `🗑️ Documento eliminado correctamente.\n\n  • **Título:** ${target.title}\n  • **Categoría:** ${target.category ?? 'sin categoría'}\n  • **ID:** ${target.id}`;
  }

  private async deduplicateDocuments(): Promise<string> {
    const groups = await this.documentRepo.findDuplicates();
    if (groups.length === 0) {
      return `✅ Tu biblioteca no tiene documentos duplicados.`;
    }

    const allDupeIds = groups.flatMap((g) => g.duplicates);
    const deleted = await this.documentRepo.deleteManyDocuments(allDupeIds);

    const lines: string[] = [
      `🧹 **Duplicados eliminados: ${deleted} documento${deleted !== 1 ? 's' : ''}**`,
      ``,
    ];
    for (const g of groups) {
      lines.push(`  • "${g.title}" — se eliminaron ${g.duplicates.length} copia${g.duplicates.length !== 1 ? 's' : ''} (conservado id:${g.keeper})`);
    }
    lines.push(``, `✅ Biblioteca limpia.`);
    return lines.join('\n');
  }

  private async buildCategoriesMessage(): Promise<string> {
    const index = this.corpusSelector?.getIndex?.();
    const docsFromIndex = index?.documentos ?? [];

    if (docsFromIndex.length > 0) {
      const categoryMap = new Map<string, number>();
      for (const doc of docsFromIndex) {
        for (const category of doc.categorias ?? []) {
          const normalized = category.trim();
          if (!normalized) continue;
          categoryMap.set(normalized, (categoryMap.get(normalized) ?? 0) + 1);
        }
      }

      if (categoryMap.size > 0) {
        const lines = [
          `📁 **Tus categorías** (${docsFromIndex.length} documento${docsFromIndex.length !== 1 ? 's' : ''})`,
          ``,
        ];

        for (const [name, count] of Array.from(categoryMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
          lines.push(`  📂 **${name}** — ${count} documento${count !== 1 ? 's' : ''}`);
          lines.push(`     → \`resumen sobre ${name}\``);
        }

        lines.push(``);
        lines.push(`💡 Podés pedir:`);
        lines.push(`  \`resumen sobre <categoría>\`  —  resumen de todos los docs de esa categoría`);
        lines.push(`  \`mis documentos\`              —  ver todos los títulos organizados`);

        return lines.join('\n');
      }
    }

    const stats = await this.documentRepo.getLibraryStats();
    if (stats.totalDocs === 0) {
      return `📁 No tenés categorías aún — tu biblioteca está vacía.\n\nSubí un PDF y la categoría se detecta automáticamente.`;
    }

    const lines = [
      `📁 **Tus categorías** (${stats.totalDocs} documento${stats.totalDocs !== 1 ? 's' : ''} · ${stats.totalChunks} secciones indexadas)`,
      ``,
    ];

    for (const cat of stats.byCategory) {
      const name = cat.category ?? 'sin categoría';
      const count = cat._count.id;
      lines.push(`  📂 **${name}** — ${count} documento${count !== 1 ? 's' : ''}`);
      lines.push(`     → \`resumen sobre ${name}\``);
    }

    lines.push(``);
    lines.push(`💡 Podés pedir:`);
    lines.push(`  \`resumen sobre <categoría>\`  —  resumen de todos los docs de esa categoría`);
    lines.push(`  \`mis documentos\`              —  ver todos los títulos organizados`);

    return lines.join('\n');
  }

  private async buildAuthorsMessage(): Promise<string> {
    const index = this.corpusSelector?.getIndex?.();
    const docsFromIndex = index?.documentos ?? [];

    if (docsFromIndex.length > 0) {
      const authorMap = new Map<string, number>();
      for (const doc of docsFromIndex) {
        const author = (doc.autor ?? '').trim();
        if (!author) continue;
        authorMap.set(author, (authorMap.get(author) ?? 0) + 1);
      }

      if (authorMap.size > 0) {
        const lines = [
          `✍️ **Tus autores** (${docsFromIndex.length} documento${docsFromIndex.length !== 1 ? 's' : ''})`,
          ``,
        ];

        for (const [name, count] of Array.from(authorMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
          lines.push(`  • **${name}** — ${count} documento${count !== 1 ? 's' : ''}`);
        }

        lines.push(``);
        lines.push(`💡 Podés pedir:`);
        lines.push(`  \`resumen de '<autor>'\`  —  ver una vista general de los documentos de ese autor`);
        lines.push(`  \`mis documentos\`       —  ver todos los títulos organizados`);

        return lines.join('\n');
      }
    }

    const docs = await this.documentRepo.getMostRecentDocuments(50);
    if (!docs || docs.length === 0) {
      return `✍️ No encontré autores en la biblioteca todavía.`;
    }

    const authorMap = new Map<string, number>();
    for (const doc of docs) {
      const author = ((doc as any).author ?? (doc as any).autor ?? '').toString().trim();
      if (!author) continue;
      authorMap.set(author, (authorMap.get(author) ?? 0) + 1);
    }

    if (authorMap.size === 0) {
      return `✍️ No encontré autores en la biblioteca todavía.`;
    }

    const lines = [`✍️ **Tus autores** (${docs.length} documento${docs.length !== 1 ? 's' : ''})`, ``];
    for (const [name, count] of Array.from(authorMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  • **${name}** — ${count} documento${count !== 1 ? 's' : ''}`);
    }

    return lines.join('\n');
  }
  private extractAuthorBooksRequest(message: string): { author: string } | null {
    const trimmed = message.trim();
    if (!trimmed) return null;

    if (/^(mis documentos|biblioteca|mis libros|mis pdfs|documentos guardados|que (libros|documentos|pdfs) (tengo|hay)|lista de (documentos|libros|pdfs)|mis categor[ií]as|categor[ií]as|categorias de (mis )?(documentos|pdfs|libros)|que categor[ií]as (tengo|hay)|mis autores|autores|lista de autores|que autores (tengo|hay))$/i.test(trimmed)) {
      return null;
    }

    const explicitMatch = trimmed.match(/^(?:libros?|documentos?|obras?)\s+(?:de|del|sobre|de los|de las)\s+(.{2,80})$/i);
    if (explicitMatch?.[1]?.trim()) {
      return { author: explicitMatch[1].trim() };
    }

    const simpleAuthor = trimmed.match(/^([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.\-]{2,80})$/u);
    if (simpleAuthor?.[1]) {
      const candidate = simpleAuthor[1].trim();
      if (/^(?:resumen|puntos|compara|comparar|relaciona|relacionar|busca|dame|muestra|mostrame|explica|analiza|describe|diagnostico|test|probe|configurar|modo|eliminar|borrar|repetir|repite|hola|help|ayuda)/i.test(candidate)) {
        return null;
      }
      const words = candidate.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        return { author: candidate };
      }
    }

    return null;
  }

  private async buildAuthorBooksMessage(author: string): Promise<string> {
    const index = this.corpusSelector?.getIndex?.();
    const docsFromIndex = index?.documentos ?? [];
    const normalizedAuthor = this.normalizeText(author);

    const matches = docsFromIndex.filter((doc) => {
      const authorField = this.normalizeText(doc.autor ?? '');
      const titleField = this.normalizeText(doc.titulo ?? '');
      const fileField = this.normalizeText(doc.archivo ?? '');
      
      // 1. Coincidencia exacta o substring
      if (
        authorField.includes(normalizedAuthor) ||
        titleField.includes(normalizedAuthor) ||
        fileField.includes(normalizedAuthor)
      ) {
        return true;
      }

      // 2. Fuzzy matching para el nombre del autor (ej: 'grindberg' -> 'grinberg')
      const queryWords = normalizedAuthor.split(/[\s\-]+/g).filter(w => w.length > 2);
      const docAuthorWords = authorField.split(/[\s\-]+/g).filter(w => w.length > 2);

      if (queryWords.length > 0 && docAuthorWords.length > 0) {
        // Todas las palabras largas buscadas deben matchear de forma fuzzy con alguna palabra del autor del doc
        const isClose = queryWords.every((qw) => {
          return docAuthorWords.some((dw) => {
            if (dw.includes(qw) || qw.includes(dw)) return true;
            const dist = this.levenshtein(qw, dw);
            // Si la palabra es larga, tolerar distancia de 2; si es corta, distancia de 1
            const maxDist = qw.length >= 6 ? 2 : 1;
            return dist <= maxDist;
          });
        });
        if (isClose) return true;
      }

      return false;
    });

    if (matches.length > 0) {
      const lines = [`📚 **Libros de ${author}** (${matches.length})`, ``];
      for (const doc of matches) {
        const formato = (doc.formato ?? 'pdf').toString().toUpperCase();
        lines.push(`  • ${doc.titulo} — ${doc.autor ?? 'Sin autor'} [${formato}]`);
      }
      lines.push(``);
      lines.push(`💡 Podés pedir:`);
      lines.push(`  \`resumen de '${matches[0].titulo}'\``);
      return lines.join('\n');
    }

    return `📚 No encontré libros asociados al autor "${author}" en la biblioteca actual.`;
  }

  private levenshtein(a: string, b: string): number {
    const tmp: number[][] = [];
    let i, j;
    for (i = 0; i <= a.length; i++) {
      tmp[i] = [i];
    }
    for (j = 0; j <= b.length; j++) {
      tmp[0][j] = j;
    }
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1,
          tmp[i][j - 1] + 1,
          tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return tmp[a.length][b.length];
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
  private extractCompareRequest(message: string): { titleA: string; titleB: string } | null {
    const patterns = [
      /resumen\s+(?:de\s+)?['"]([^'"]{3,})['"]\s+(?:relaciona(?:do)?\s+(?:con)?|vs\.?|versus)\s+['"]([^'"]{3,})['"]/i,
      /compara(?:r)?\s+['"]([^'"]{3,})['"]\s+(?:con|y|vs\.?)\s+['"]([^'"]{3,})['"]/i,
      /relaciona(?:r)?\s+['"]([^'"]{3,})['"]\s+(?:con|y)\s+['"]([^'"]{3,})['"]/i,
      /diferencia(?:s)?\s+entre\s+['"]([^'"]{3,})['"]\s+y\s+['"]([^'"]{3,})['"]/i,
      /(?:compara(?:r)?|relaciona(?:r)?)\s+([\w\s]{3,40}?)\s+(?:con|y|vs\.?)\s+([\w\s]{3,40}?)$/i,
    ];

    for (const pattern of patterns) {
      const match = message.trim().match(pattern);
      if (match?.[1] && match?.[2]) {
        return {
          titleA: match[1].trim(),
          titleB: match[2].trim(),
        };
      }
    }
    return null;
  }

  private async buildCompareResponse(titleA: string, titleB: string): Promise<string> {
    try {
      const result = await this.documentCompareService.compare(titleA, titleB);
      return [
        `🔀 **Comparación: "${result.titleA}" ↔ "${result.titleB}"**`,
        ``,
        result.comparison,
        ``,
        `💡 Podés profundizar con:`,
        `  \`resumen de '${result.titleA}'\``,
        `  \`resumen de '${result.titleB}'\``,
      ].join('\n');
    } catch (err: any) {
      return `❌ ${err.message}`;
    }
  }

  private async buildLibraryMessage(): Promise<string> {
    const index = this.corpusSelector?.getIndex?.();
    const docsFromIndex = index?.documentos ?? [];

    if (docsFromIndex.length > 0) {
      const byCategory = new Map<string, typeof docsFromIndex>();
      for (const doc of docsFromIndex) {
        const cat = doc.categorias?.[0] ?? 'sin categoría';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(doc);
      }

      const lines: string[] = [`📚 **Tus documentos escaneados** (${docsFromIndex.length} documento${docsFromIndex.length !== 1 ? 's' : ''})`, ``];

      for (const [category, items] of byCategory.entries()) {
        lines.push(`📁 **${category.toUpperCase()}** (${items.length})`);
        for (const doc of items) {
          const estado = doc.embeddings === 'ready' ? 'indexado' : doc.embeddings === 'processing' ? 'procesando' : 'disponible';
          const displayTitle = doc.titulo?.trim() || doc.archivo?.trim() || 'Sin título';
          lines.push(`  • ${displayTitle} — ${doc.autor} [${doc.formato.toUpperCase()}] · estado: ${estado}`);
        }
        lines.push(``);
      }

      lines.push(`💡 Podés preguntar:`);
      lines.push(`  - Resumen de un doc  →  \`resumen de 'Título del libro'\``);
      lines.push(`  - Puntos clave       →  \`puntos clave de 'TypeScript Handbook'\``);
      lines.push(`  - Buscar en docs     →  \`busca en mis documentos <tema>\``);
      lines.push(`  - Limpiar dupl.      →  \`eliminar documentos repetidos\``);

      return lines.join('\n');
    }

    const docs = await this.documentRepo.getMostRecentDocuments(50);
    if (!docs || docs.length === 0) {
      return `📚 Tu biblioteca está vacía.\n\nSubí un PDF desde el chat para empezar a construirla.`;
    }

    const byCategory = new Map<string, typeof docs>();
    for (const doc of docs) {
      const cat = (doc as any).category ?? 'sin categoría';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(doc);
    }

    const lines: string[] = [`📚 **Tu biblioteca** (${docs.length} documento${docs.length !== 1 ? 's' : ''})`, ``];

    for (const [category, items] of byCategory.entries()) {
      lines.push(`📁 **${category.toUpperCase()}** (${items.length})`);
      for (const doc of items) {
        const used = (doc as any).timesUsed > 0 ? ` · usado ${(doc as any).timesUsed}x` : '';
        const tipo = (doc as any).category === 'web' ? 'web' : 'pdf';
        lines.push(`  • ${doc.title}  [${tipo}] - CATEGORÍA: "${((doc as any).category ?? 'sin categoría').toUpperCase()}"${used ? `  _(${used.trim()})_` : ''}`);
      }
      lines.push(``);
    }

    lines.push(`💡 Podés preguntar:`);
    lines.push(`  - Resumen de un doc  →  \`resumen de 'Título del libro'\``);
    lines.push(`  - Puntos clave       →  \`puntos clave de 'TypeScript Handbook'\``);
    lines.push(`  - Buscar en docs     →  \`busca en mis documentos <tema>\``);
    lines.push(`  - Limpiar dupl.      →  \`eliminar documentos repetidos\``);

    return lines.join('\n');
  }

  private async extractDocumentSummaryRequest(message: string): Promise<{ title: string; maxItems: number } | null> {
    const trimmed = message.trim();
    const normalized = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const numMatch = normalized.match(/\b(\d+)\s*(puntos?|items?|temas?|cosas?|ideas?)\b/);
    const maxItems = numMatch ? Math.min(Math.max(parseInt(numMatch[1], 10), 3), 15) : 10;

    const ACTION_PREFIXES = /^(?:resumen|resumir|resumime|puntos\s*clave|lo\s*(?:mas|más)?\s*importante|dame\s*(?:los?\s*)?(?:\d+\s*)?(?:puntos?|items?|resumenes?|aspectos?)|describe|describime|explica(?:me)?|explicá)\b/i;
    const CONNECTORS = /^\s*(?:acerca\s+de|(?:de\s+)?el\s+libro|(?:de\s+)?del\s+libro|(?:de\s+)?el\s+pdf|(?:de\s+)?del\s+pdf|(?:de\s+)?el\s+documento|(?:de\s+)?del\s+documento|(?:de\s+)?el\s+archivo|(?:de\s+)?del\s+archivo|de(?:l)?|sobre)\s+/i;
    const GENERIC_STARTERS = /^(?:sobre|acerca|los|las|un|una|el|la|mis|tus|sus|lo|al|del|por|en|para|con|sin|entre|que|cuando|como|donde|quien|cual|todo|toda|todos|todas|algo|nada|mucho|poco|muy|mas|menos|mejor|peor|nuevo|viejo|gran|grande|pequeño)\b/i;
    const GREETINGS = /^(?:hola|buenas|buenos\s+dias|buenas\s+tardes|che|jarvis|ia|asistente|por\s+favor)\b\s*[,.!?]?\s*/i;

    let title = trimmed;
    let match;
    while ((match = title.match(GREETINGS))) {
      title = title.substring(match[0].length).trim();
    }

    const actionMatch = title.match(ACTION_PREFIXES);
    if (!actionMatch) {
      return null;
    }

    title = title.substring(actionMatch[0].length).trim();
    const connMatch = title.match(CONNECTORS);
    if (connMatch) {
      title = title.substring(connMatch[0].length).trim();
    }
    title = title.replace(/^['"“‘«](.*)['"”’»]$/, '$1').trim();

    if (title.length >= 2) {
      const titleLower = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (GENERIC_STARTERS.test(titleLower)) {
        const hasDoc = await this.dbOrIndexHasDocument(title);
        if (hasDoc) return { title, maxItems };
      } else {
        return { title, maxItems };
      }
    }

    return null;
  }

  private async dbOrIndexHasDocument(title: string): Promise<boolean> {
    const index = this.corpusSelector.getIndex();
    if (index && index.documentos) {
      const normSearch = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const inIndex = index.documentos.some(doc => {
        const normDocTitle = doc.titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        return normDocTitle.includes(normSearch) || normSearch.includes(normDocTitle);
      });
      if (inIndex) return true;
    }
    try {
      const candidates = await this.documentRepo.searchDocumentsByTitle(title, 1);
      return candidates.length > 0;
    } catch {
      return false;
    }
  }

  private async buildDocumentSummaryResponse(
    titleOrId: string | number,
    maxKeyPoints = 10,
  ): Promise<string> {
    try {
      const result = await this.documentSummaryService.generateDocumentSummary(
        titleOrId,
        maxKeyPoints,
      );

      const lines: string[] = [
        `📄 **${result.title}**`,
        result.category ? `📁 Categoría: ${result.category}` : '',
        `📊 ${result.wordCount.toLocaleString('es-AR')} palabras · ${result.chunkCount} secciones`,
        ``,
        `## Resumen`,
        result.summary,
        ``,
        `## Puntos Clave (top ${result.keyPoints.length})`,
      ];

      result.keyPoints.forEach((point, i) => {
        lines.push(`${i + 1}. ${point}`);
      });

      lines.push(``);
      lines.push(`💡 Podés profundizar con: _"busca en mis documentos <tema>"_`);

      return lines.filter(l => l !== undefined).join('\n');
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('No encontré')) {
        return [
          `⚠️ ${msg}`,
          ``,
          `💡 Tip: usá comillas para el título exacto:`,
          `   \`resumen de 'Nombre exacto del documento'\``,
          ``,
          `O revisá tus documentos con: \`mis documentos\``,
        ].join('\n');
      }
      return `⚠️ No pude generar el resumen en este momento. Intentá de nuevo.`;
    }
  }

  private buildHelpMessage(): string {
    return [
      `📋 **Guía de comandos — JarBees**`,
      ``,
      `**AGENDA / PENDIENTES**`,
      `  Ver lista         →  \`lista de pendientes\``,
      `  Agregar           →  \`agregar <tarea> a mis pendientes\``,
      `                       \`pendiente: <tarea>\``,
      `  Borrar por número →  \`borra el 2\``,
      `  Borrar por nombre →  \`borra el pendiente <nombre>\``,
      `  Borrar todo       →  \`borra todos los pendientes\``,
      `  Editar por número →  \`cambia el 2 a <nuevo texto>\``,
      `  Editar por nombre →  \`edita <nombre> por <nuevo texto>\``,
      `  Completar         →  \`completé el pendiente 1\``,
      ``,
      `**BIBLIOTECA / DOCUMENTOS / PDFs**`,
      `  Ver documentos        →  \`mis documentos\`  /  \`biblioteca\``,
      `  Ver autores           →  \`mis autores\``,
      `  Resumen por categoría →  \`resumen sobre <tema>\``,
      `                           \`resumen sobre plantas medicinales\``,
      `                           \`qué dicen mis PDFs de medicina\``,
      `                           \`información sobre desarrollo\``,
      `  Resumen de documento  →  \`resumen de '<título>'\``,
      `                           \`resumen de 'Manual de Plantas'\``,
      `                           \`describe 'La Vía del Tarot'\``,
      `                           \`explicame 'El Kybalion'\``,
      `                           \`puntos clave de 'TypeScript Handbook'\``,
      `                           \`dame 10 items de 'Guía de NestJS'\``,
      `  Buscar en docs        →  \`busca en mis documentos <tema>\``,
      `                           \`según mis PDFs, <pregunta>\``,
      `  Limpiar duplicados    →  \`eliminar documentos repetidos\``,
      `  Eliminar por título   →  \`eliminar documento '<título>'\``,
      `                           \`borrar el libro 'Botanica Oculta'\``,
      `                           \`eliminar el PDF 'TypeScript Handbook'\``,
      ``,
      `**BÚSQUEDA WEB**`,
      `  Noticias generales     →  \`últimas noticias\``,
      `  Sitio específico       →  \`dame 6 noticias de elonce\``,
      `                             \`dame noticias de infobae\``,
      `  Deportes               →  \`resultado del partido de Argentina\``,
      ``,
      `**MODO DE BÚSQUEDA / INTERNET**`,
      `  Cambiar modo      →  \`modo offline\`  /  \`modo local first\``,
      `                       \`modo hybrid\`   /  \`modo web first\``,
      ``,
      `**CALENDARIO Y TAREAS GOOGLE**`,
      `  Ver eventos hoy        →  \`qué tengo en el calendario hoy\``,
      `  Ver agenda del día     →  \`agenda del lunes\``,
      `  Ver tareas pendientes  →  \`mis tareas de Google\``,
      `  Detectar conflictos    →  \`tengo conflictos el lunes?\``,
      ``,
      `**GMAIL**`,
      `  Correos importantes    →  \`correos importantes\`  /  \`mis emails\``,
      `  Correos de hoy         →  \`correos de hoy\``,
      `  Buscar correo          →  \`busca en mi correo <tema>\``,
      `  Crear borrador         →  \`redactá un email a nombre@mail.com sobre <asunto>\``,
      ``,
      `**GOOGLE DRIVE**`,
      `  Archivos recientes     →  \`mis archivos de Drive\``,
      `  Buscar archivo         →  \`busca en Drive <nombre>\``,
      `  Sincronizar con RAG    →  \`sincronizá <URL de Drive>\``,
      ``,
      `**YOUTUBE**`,
      `  Buscar videos          →  \`busca videos de <tema>\``,
      `  Info de un video       →  \`info de https://youtube.com/watch?v=ID\``,
      ``,
      `**MEMORIA**`,
      `  Guardar dato           →  \`recorda que mi proyecto se llama JarBees\``,
      ``,
      `**REPETIR ÚLTIMA RESPUESTA**`,
      `  \`repetir\`  /  \`repetí\`  /  \`dilo de nuevo\``,
      ``,
      `**IMÁGENES / OCR** *(adjuntá un archivo)*`,
      `  Analizar error         →  subí la captura + escribí \`¿qué error es este?\``,
      `  OCR rápido             →  subí imagen + modo \`ocr\``,
      ``,
      `**DIAGNÓSTICO Y VALIDACIÓN RAG**`,
      `  Estado de la biblioteca  →  \`diagnóstico biblioteca\``,
      `                               \`estado del conocimiento\``,
      `  Validar que el RAG        →  \`test de conocimiento\``,
      `  aprende de tus PDFs           \`test de conocimiento 5\` (5 pruebas)`,
      `  Ver qué chunks recupera  →  \`probe: <tu pregunta>\``,
      `                               \`probe: qué dice sobre las plantas?\``,
      ``,
      `💡 Tip: escribí **h** en cualquier momento para ver esta guía.`,
      ``,
      `📄 **Nota sobre PDFs:** Al subir documentos/PDFs, la categoría se detecta`,
      `    automáticamente del contenido. Podés preguntar por temas específicos`,
      `    y JarBees combinará información de todos los documentos relacionados.`,
    ].join('\n');
  }
}
