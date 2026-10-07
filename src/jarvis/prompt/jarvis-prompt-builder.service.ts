import { Injectable, Logger } from '@nestjs/common';
import { UserProfileRepository } from '../repositories/user-profile.repository';
import { JarvisIdentityService } from '../config/jarvis-identity.service';
import { CapabilitiesService } from '../config/capabilities.service';
import { SkillRegistryService } from '../skills/skill-registry.service';
import { SessionSummaryRepository } from '../repositories/session-summary.repository';
import { ConversationRepository } from '../repositories/conversation.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { MemoryRepository } from '../repositories/memory.repository';
import { CategorySummaryService } from '../library/category-summary.service';
import { DocumentSummaryService } from '../library/document-summary.service';
import { JarvisKnowledgeService } from '../knowledge/jarvis-knowledge.service';
import { EmbeddingsService } from '../library/embeddings.service';
import { CorpusSelectorService } from '../knowledge/corpus-selector.service';

@Injectable()
export class JarvisPromptBuilderService {
  private readonly logger = new Logger(JarvisPromptBuilderService.name);

  constructor(
    private readonly userProfileRepo: UserProfileRepository,
    private readonly jarvisIdentity: JarvisIdentityService,
    private readonly capabilitiesService: CapabilitiesService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly sessionSummaryRepo: SessionSummaryRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly memoryRepo: MemoryRepository,
    private readonly categorySummaryService: CategorySummaryService,
    private readonly documentSummaryService: DocumentSummaryService,
    private readonly jarvisKnowledge: JarvisKnowledgeService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly corpusSelector: CorpusSelectorService,
  ) {}

  async buildJarvisContext(
    userMessage: string,
    sessionId: string,
    useMemory: boolean,
    useDocuments: boolean,
    maxHistoryMessages: number,
    browserContext?: string,
    hasWebContext?: boolean,
    prefetchedRagContext?: string,
    mode?: string,
  ): Promise<{
    systemPrompt: string;
    userPrompt: string;
    usedMemory: boolean;
    usedDocs: boolean;
  }> {
    const profile = await this.userProfileRepo.getOrCreate();
    const identity = this.jarvisIdentity.getIdentity();
    const capabilities = this.capabilitiesService.getCapabilities();
    const relevantSkills = this.skillRegistry.findRelevant(userMessage, 3);

    const isChatbotMode = mode === 'chatbot' || mode === 'chat' || !mode || mode === 'auto';
    const isCoderMode = mode === 'coder' || mode === 'code';
    const isTranslatorMode = mode === 'traductor' || mode === 'translate';
    const isReaderMode = mode === 'reader' || mode === 'lector';

    const activeCapabilities = Object.entries(capabilities)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
      .join(', ');

    const profileSummary = [
      profile.name ? `Usuario: ${profile.name}` : 'Usuario: desconocido',
      profile.country ? `País del usuario: ${profile.country}` : undefined,
      profile.language ? `Idioma del usuario: ${profile.language}` : undefined,
      profile.timezone
        ? `Zona horaria del usuario: ${profile.timezone}`
        : undefined,
    ]
      .filter(Boolean)
      .join(' | ');

    const dateStr = new Date().toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: profile.timezone || 'America/Argentina/Buenos_Aires',
    });

    let systemPrompt = '';

    if (isCoderMode) {
      systemPrompt = [
        `Tu nombre es: ${identity.name}, Especialista en Desarrollo y Arquitectura de Software (Qwen2.5-Coder).`,
        `Perfil del usuario: ${profileSummary || 'Desarrollador'}`,
        `Fecha: ${dateStr}, ${timeStr} hs.`,
        '',
        'DIRECTRICES DE CÓDIGO:',
        '1. Responde con código limpio, bien tipado y estructurado.',
        '2. Proporciona explicaciones técnicas precisas y enfocadas a producción.',
        '3. Mantén el contexto técnico de la conversación anterior.',
      ].join('\n');
    } else if (isTranslatorMode) {
      systemPrompt = [
        `Tu nombre es: ${identity.name}, Traductor Profesional Especializado.`,
        'Traduce el contenido de manera precisa, conservando terminología y formato original.',
        'Devuelve únicamente la traducción limpia, sin preámbulos.',
      ].join('\n');
    } else if (isReaderMode) {
      systemPrompt = [
        `Tu nombre es: ${identity.name}, Asistente de Lectura y Síntesis para TTS.`,
        'Prepara el texto con buena cadencia, puntuación y claridad para ser narrado o leído en voz alta.',
      ].join('\n');
    } else {
      // Modo Chatbot / Asistente General
      systemPrompt = [
        `Tu nombre es: ${identity.name}, un asistente personal inteligente, conversacional y empático.`,
        `Tu tono es ${identity.personality.tone} y tu estilo es cercano, claro y fluido.`,
        '',
        `Idioma principal: ${identity.language || 'es-AR'}.`,
        `País: ${identity.country || 'Argentina'}.`,
        `Perfil del usuario: ${profileSummary || 'No hay datos de perfil disponibles.'}`,
        '',
        '⏰ FECHA Y HORA ACTUAL:',
        `- Año actual: 2026`,
        `- Fecha completa: ${dateStr}`,
        `- Hora: ${timeStr} hs`,
        '',
        'DIRECTRICES GENERALES DE CONVERSACIÓN:',
        '1. Respondé de forma natural, amigable y fluida en español argentino.',
        '2. Mantené siempre el hilo y contexto de la conversación anterior. Si el usuario hace preguntas de seguimiento, pide explicaciones de algo que dijiste o dice "no entendí", explicálo con sencillez tomando como referencia el mensaje anterior.',
        '3. Para chistes, humor, consejos, reflexiones o charlas cotidianas, respondé con creatividad sin bloqueos artificiales.',
        '4. Si no tenés un dato verificado o de actualidad, decílo con sinceridad sin inventar.',
      ].join('\n');
    }

    const contextParts: string[] = [];
    let usedMemory = false;
    let usedDocs = false;
    let requestedDocTitle: string | null = null;

    // ── Local JSON Knowledge lookup ──────────────────────────────────────────
    const localKnowledgeCtx =
      await this.jarvisKnowledge.extractRelevantContext(userMessage);
    if (localKnowledgeCtx) {
      contextParts.push(localKnowledgeCtx);
    }

    // Incluir skills solo si no es un modo puramente conversacional
    if (!isChatbotMode && relevantSkills.length > 0) {
      const skillText = relevantSkills
        .map(
          (skill) =>
            `- ${skill.name}: ${skill.description} (${skill.keywords.join(', ')})\n  Resumen: ${skill.summary}`,
        )
        .join('\n');
      contextParts.push(`### SKILLS RELEVANTES\n${skillText}`);
    }

    if (useMemory) {
      const memories = await this.memoryRepo.search(userMessage, 3);
      if (memories.length > 0) {
        usedMemory = true;
        contextParts.push(
          `### MEMORIA\n${memories.map((m) => m.content).join('\n')}`,
        );
      }
    }

    // RAG de documentos
    if (useDocuments) {
      const docSummary = await this.detectDocumentSummaryRequest(userMessage);

      if (docSummary.isRequest && docSummary.title) {
        requestedDocTitle = docSummary.title;
        this.logger.log(
          `[rag:document] detectado resumen de documento: "${docSummary.title}"`,
        );

        try {
          const result =
            await this.documentSummaryService.generateDocumentSummary(
              docSummary.title,
              docSummary.maxKeyPoints,
            );

          usedDocs = true;

          const docInIndex = this.corpusSelector.getIndex()?.documentos?.find(
            (d) => d.titulo.toLowerCase() === result.title.toLowerCase(),
          );
          const author =
            docInIndex?.autor ||
            this.corpusSelector.getAuthorAndSchoolByTitle(result.title).author;

          const formattedSummary = [
            `### RESUMEN DEL DOCUMENTO: "${result.title}"`,
            author && author !== 'Autor Desconocido' ? `**Autor:** ${author}` : '',
            result.category ? `**Categoría:** ${result.category}` : '',
            result.wordCount > 0
              ? `**Palabras:** ~${result.wordCount} | **Chunks:** ${result.chunkCount}`
              : '',
            '',
            '**RESUMEN EJECUTIVO:**',
            result.summary,
            '',
            '**PUNTOS CLAVE Y CONCEPTOS:**',
            ...result.keyPoints.map((point, idx) => `${idx + 1}. ${point}`),
          ]
            .filter((line) => line !== '')
            .join('\n');

          contextParts.push(formattedSummary);
        } catch (err: any) {
          this.logger.warn(
            `[rag:document] error al generar resumen: ${err.message}`,
          );
          contextParts.push(`### DOCUMENTOS\n${err.message}`);
        }
      } else if (prefetchedRagContext) {
        usedDocs = true;
        contextParts.push(prefetchedRagContext);
      } else {
        const categorySummary =
          this.detectCategorySummaryRequest(userMessage);

          if (categorySummary.isRequest && categorySummary.category) {
            this.logger.log(
              `[rag:category] detectado resumen por categoría: "${categorySummary.category}"`,
            );

            try {
              const result =
                await this.categorySummaryService.generateCategorySummary(
                  categorySummary.category,
                  categorySummary.query,
                );

              if (result.chunksUsed > 0) {
                usedDocs = true;
                contextParts.push(
                  `### RESUMEN DE DOCUMENTOS (${result.category})\n${result.summary}\n\n*Basado en ${result.documentsUsed} documento(s): ${result.documentTitles.join(', ')}*`,
                );
              } else {
                contextParts.push(`### DOCUMENTOS\n${result.summary}`);
              }
            } catch (err: any) {
              this.logger.warn(
                `[rag:category] error al generar resumen: ${err.message}`,
              );
            }
          }

          if (!categorySummary.isRequest) {
            let chunks = [] as any[];
            try {
              const queryEmbedding =
                await this.embeddingsService.generateEmbedding(userMessage);
              chunks = await this.documentRepo.searchChunksSemantic(
                queryEmbedding,
                15,
              );
            } catch (err: any) {
              this.logger.warn(
                `[rag:semantic] Fallback a búsqueda textual: ${err.message}`,
              );
              chunks = await this.documentRepo.searchChunks(userMessage, 15);
            }
            if (chunks.length > 0) {
              usedDocs = true;
              // Aplicar reranker híbrido
              const rerankedChunks = this.rerankChunks(chunks, userMessage);
              
              const formattedParts = rerankedChunks.map((c) => {
                const docTitle = c.document?.title || 'Documento';
                const docInIndex = this.corpusSelector.getIndex().documentos.find(
                  (d) => d.titulo.toLowerCase() === docTitle.toLowerCase(),
                );
                
                const author = docInIndex?.autor || this.corpusSelector.getAuthorAndSchoolByTitle(docTitle).author;
                const language = docInIndex?.idioma || 'es';
                const school = this.corpusSelector.getAuthorAndSchoolByTitle(docTitle).school;
                const category = docInIndex?.categorias?.join(', ') || 'General';
                const concepts = docInIndex?.conceptosClave?.slice(0, 6).join(', ') || 'N/A';

                return [
                  `---`,
                  `DOCUMENTO: "${docTitle}"`,
                  `AUTOR: ${author}`,
                  `ESCUELA DE PENSAMIENTO: ${school}`,
                  `IDIOMA: ${language}`,
                  `CATEGORÍAS: ${category}`,
                  `CONCEPTOS PRINCIPALES: ${concepts}`,
                  `CONTENIDO:`,
                  c.content,
                ].join('\n');
              });

              contextParts.push(
                `### DOCUMENTOS DE LA BIBLIOTECA PERSONAL (RAG)\n` +
                  `⚠️ IDIOMA OBLIGATORIO: Respondé 100% EN ESPAÑOL. Traducí cualquier fragmento o término que esté en inglés.\n` +
                  `Utilizá el siguiente contenido sutil y contextual para fundamentar tu respuesta. Si hay contradicciones entre autores o escuelas, exponé de forma separada y clara cada perspectiva citando al autor correspondiente.\n\n` +
                  formattedParts.join('\n\n'),
              );
            }
          }
        }
    }

    if (browserContext) {
      contextParts.push(
        `### CONTENIDO WEB EXTRAÍDO EN TIEMPO REAL\n${browserContext}`,
      );
    }

    const summary = await this.sessionSummaryRepo.get(sessionId);
    if (summary) {
      contextParts.push(`### RESUMEN DE LA SESIÓN ANTERIOR\n${summary.summary}`);
    }

    const recentMessages = await this.conversationRepo.getRecentMessages(
      sessionId,
      maxHistoryMessages || 16,
    );
    if (recentMessages.length > 1) {
      const historyText = recentMessages
        .slice(0, -1)
        .map(
          (m) => `${m.role === 'user' ? 'Usuario' : 'JarBees'}: ${m.content}`,
        )
        .join('\n\n');
      contextParts.push(
        `### HILO DE LA CONVERSACIÓN PREVIO (CONTEXTO Y MEMORIA DE DIÁLOGO)\n` +
          `Utilizá el siguiente historial de mensajes anteriores para mantener la coherencia, recordar chistes, datos y responder con exactitud a preguntas de seguimiento:\n\n${historyText}`,
      );
    }

    const webInstruction =
      browserContext || hasWebContext
        ? '\n\n⚠️ INSTRUCCIÓN OBLIGATORIA: Respondé EXCLUSIVAMENTE usando los datos de "CONTENIDO WEB EXTRAÍDO EN TIEMPO REAL" o "BÚSQUEDA WEB AUTOMÁTICA" que están arriba. PROHIBIDO decir que no tenés información — los datos ya están en este prompt. Si el contenido está en inglés, traducílo al español.'
        : '';

    const docInstruction =
      usedDocs && requestedDocTitle
        ? `\n\n📌 INSTRUCCIÓN DE RESUMEN DE DOCUMENTO: El usuario solicitó/mencionó la obra "${requestedDocTitle}". Presentá una respuesta clara, directa y estructurada que sintetice la obra, detallando su resumen ejecutivo, sus puntos clave principales y los ejes o capítulos conceptuales más importantes basándote en la información estructurada provista arriba.`
        : '';

    const languageReminder =
      '\n\n⚠️ INSTRUCCIÓN OBLIGATORIA DE IDIOMA: Respondé 100% EN ESPAÑOL (es-AR). Aunque los fragmentos de la biblioteca o la web presentados arriba estén en inglés u otro idioma, DEBES TRADUCIR TODO Y RESPONDER EN ESPAÑOL. Está PROHIBIDO responder en inglés.';

    const userPrompt =
      contextParts.length > 0
        ? `${contextParts.join('\n\n')}\n\n### PREGUNTA ACTUAL\n${userMessage}${webInstruction}${docInstruction}${languageReminder}`
        : userMessage;

    return { systemPrompt, userPrompt, usedMemory, usedDocs };
  }

  // ── Helper parsers ────────────────────────────────────────────────────────

  private async detectDocumentSummaryRequest(
    message: string,
  ): Promise<{ isRequest: boolean; title?: string; maxKeyPoints?: number }> {
    const extracted = await this.extractDocumentSummaryRequest(message);
    if (extracted) {
      return {
        isRequest: true,
        title: extracted.title,
        maxKeyPoints: extracted.maxItems,
      };
    }
    return { isRequest: false };
  }

  private async extractDocumentSummaryRequest(
    message: string,
  ): Promise<{ title: string; maxItems: number } | null> {
    const trimmed = message.trim();
    const normalized = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const numMatch = normalized.match(
      /\b(\d+)\s*(puntos?|items?|temas?|cosas?|ideas?)\b/,
    );
    const maxItems = numMatch
      ? Math.min(Math.max(parseInt(numMatch[1], 10), 3), 15)
      : 10;

    const ACTION_PREFIXES =
      /^(?:resumen|resumir|resumime|puntos\s*clave|lo\s*(?:mas|más)?\s*importante|dame\s*(?:los?\s*)?(?:\d+\s*)?(?:puntos?|items?|resumenes?|aspectos?)|describe|describime|explica(?:me)?|explicá)\b/i;
    const CONNECTORS =
      /^\s*(?:acerca\s+de|(?:de\s+)?el\s+libro|(?:de\s+)?del\s+libro|(?:de\s+)?el\s+pdf|(?:de\s+)?del\s+pdf|(?:de\s+)?el\s+documento|(?:de\s+)?del\s+documento|(?:de\s+)?el\s+archivo|(?:de\s+)?del\s+archivo|de(?:l)?|sobre)\s+/i;
    const GENERIC_STARTERS =
      /^(?:sobre|acerca|los|las|un|una|el|la|mis|tus|sus|lo|al|del|por|en|para|con|sin|entre|que|cuando|como|donde|quien|cual|todo|toda|todos|todas|algo|nada|mucho|poco|muy|mas|menos|mejor|peor|nuevo|viejo|gran|grande|pequeño)\b/i;
    const GREETINGS =
      /^(?:hola|buenas|buenos\s+dias|buenas\s+tardes|che|jarvis|ia|asistente|por\s+favor)\b\s*[,.!?]?\s*/i;

    let title = trimmed;
    let match;
    while ((match = title.match(GREETINGS))) {
      title = title.substring(match[0].length).trim();
    }

    const actionMatch = title.match(ACTION_PREFIXES);
    if (!actionMatch) {
      // 🌟 Si el mensaje no contiene prefijo de acción (ej: el usuario escribió "Energetica Psiquica y Esencia Del Sueño"),
      // pero coincide directamente con una obra/documento disponible en la biblioteca:
      if (title.length >= 3) {
        const matchedDocTitle = await this.findMatchingDocumentTitle(title);
        if (matchedDocTitle) {
          return { title: matchedDocTitle, maxItems };
        }
      }
      return null;
    }

    title = title.substring(actionMatch[0].length).trim();
    const connMatch = title.match(CONNECTORS);
    if (connMatch) {
      title = title.substring(connMatch[0].length).trim();
    }
    title = title.replace(/^['"“‘«](.*)['"”’»]$/, '$1').trim();

    if (title.length >= 2) {
      const titleLower = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (GENERIC_STARTERS.test(titleLower)) {
        const hasDoc = await this.dbOrIndexHasDocument(title);
        if (hasDoc) return { title, maxItems };
      } else {
        return { title, maxItems };
      }
    }

    return null;
  }

  private async findMatchingDocumentTitle(title: string): Promise<string | null> {
    // 1. Probar en el índice de la biblioteca (CorpusSelector)
    if (this.corpusSelector) {
      const matches = this.corpusSelector.findRelevantDocuments(title, 1);
      if (matches.length > 0 && matches[0].score >= 2.0) {
        return matches[0].document.titulo;
      }
    }

    // 2. Probar en la base de datos o por coincidencia directa de título
    const normSearch = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (normSearch.length < 3) return null;

    const index = this.corpusSelector?.getIndex();
    if (index && index.documentos) {
      const foundInIndex = index.documentos.find((doc) => {
        const normDocTitle = doc.titulo
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
        return normDocTitle === normSearch || normDocTitle.includes(normSearch) || normSearch.includes(normDocTitle);
      });
      if (foundInIndex) return foundInIndex.titulo;
    }

    try {
      const existing = await this.documentRepo.findDocumentByExactTitle(title);
      if (existing) return existing.title;

      const candidates = await this.documentRepo.searchDocumentsByTitle(title, 3);
      const match = candidates.find((doc) => {
        const normDocTitle = doc.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
        return normDocTitle === normSearch || normDocTitle.includes(normSearch) || normSearch.includes(normDocTitle);
      });
      if (match) return match.title;
    } catch {
      // ignore
    }

    return null;
  }

  private async dbOrIndexHasDocument(title: string): Promise<boolean> {
    const matched = await this.findMatchingDocumentTitle(title);
    return !!matched;
  }

  private detectCategorySummaryRequest(message: string): {
    isRequest: boolean;
    category?: string;
    query?: string;
  } {
    const normalized = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const patterns = [
      /(?:resumen|resumir|resumime|que dice|que dicen|informacion|info)\s+(?:sobre|de|acerca de)\s+([a-z_\s]+)/i,
      /(?:documentos?|pdfs?|archivos?)\s+(?:sobre|de|acerca de)\s+([a-z_\s]+)/i,
      /(?:busca|buscar|mostrame|muestra)\s+(?:en|de)\s+([a-z_\s]+)/i,
      /(?:tenemos|hay|existe|tenes)\s+(?:algo|informacion|info|datos?|contenido)?\s*(?:en|de)?\s*(?:mis|los|tus)?\s*(?:documentos?|pdfs?|archivos?|biblioteca)?\s+(?:sobre|de|acerca de|en)\s+([a-z_\s]+)/i,
      /(?:mis|los|tus)\s+(?:documentos?|pdfs?|archivos?)\s+(?:de|sobre)\s+([a-z_\s]+)/i,
      /(?:que|cual)\s+(?:tengo|hay|existe|tenes|tenemos)\s+(?:sobre|de|acerca de)\s+([a-z_\s]+)/i,
      /(?:segun|en base a)\s+(?:mis|los)?\s*(?:documentos?|pdfs?)\s+(?:de|sobre)\s+([a-z_\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        let categoryRaw = match[1].trim();

        categoryRaw = categoryRaw
          .replace(
            /\s+(en|de|sobre|con|sin|para|por|como|que|cual|donde|cuando|porque).*$/i,
            '',
          )
          .trim();

        const category = categoryRaw
          .replace(/\s+/g, '_')
          .replace(/[^a-z_]/g, '');

        if (
          category.length < 3 ||
          ['mis', 'los', 'tus', 'una', 'ese', 'esto', 'eso'].includes(category)
        ) {
          continue;
        }

        const queryMatch = message.match(/(?:sobre|de|con)\s+([a-z\s]+)$/i);
        const query =
          queryMatch && queryMatch[1].length > 3
            ? queryMatch[1].trim()
            : undefined;

        return { isRequest: true, category, query };
      }
    }

    return { isRequest: false };
  }

  private rerankChunks(chunks: any[], query: string): any[] {
    if (chunks.length <= 1) return chunks;

    const queryTerms = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9áéíóúüñ]+/)
      .filter((t) => t.length >= 3);

    if (queryTerms.length === 0) return chunks;

    const scored = chunks.map((chunk, index) => {
      const contentLower = chunk.content
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      let matches = 0;
      for (const term of queryTerms) {
        if (contentLower.includes(term)) {
          matches++;
        }
      }

      const lexicalScore = matches / queryTerms.length;
      const semanticScore = 1.0 - index / chunks.length;
      const score = 0.4 * lexicalScore + 0.6 * semanticScore;

      return { chunk, score };
    });

    return scored.sort((a, b) => b.score - a.score).map((item) => item.chunk);
  }
}
