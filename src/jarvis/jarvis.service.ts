import { Injectable, Logger, Inject } from '@nestjs/common';
import { MemoryRepository } from './repositories/memory.repository';
import { ConversationRepository } from './repositories/conversation.repository';
import { DocumentRepository } from './repositories/document.repository';
import { UserProfileRepository } from './repositories/user-profile.repository';
import { AgentRunRepository } from './repositories/agent-run.repository';
import { SessionSummaryRepository } from './repositories/session-summary.repository';
import { FeedbackRepository } from './repositories/feedback.repository';
import { FeedbackDto } from './dto/feedback.dto';
import { ILLMProvider } from './llm/llm-provider.interface';
import { OllamaProvider } from './llm/ollama.provider';
import { OpenRouterProvider } from './llm/openrouter.provider';
import { AssistantToolsService } from '../aichat/utils/assistant-tools.service';
import { JarvisIdentityService } from './config/jarvis-identity.service';
import { CapabilitiesService } from './config/capabilities.service';
import { SkillRegistryService } from './skills/skill-registry.service';
import { ToolRegistryService } from './tools/registry/tool-registry.service';
import { BrowserToolService } from './tools/browser/browser-tool.service';
import { IntentRouterService } from './tools/intent/intent-router.service';
import { GoogleCalendarService } from './tools/google/google-calendar.service';
import { GoogleTasksService } from './tools/google/google-tasks.service';
import { GoogleGmailService } from './tools/google/google-gmail.service';
import { GoogleDriveService } from './tools/google/google-drive.service';
import { YouTubeService } from './tools/google/youtube.service';
import { AstrologyTool } from './tools/astrology/astrology-tool.service';
import { MemoryExtractorService } from './memory/memory-extractor.service';
import { InvestigationService } from './tools/web/investigation.service';
import { TaskReminderService } from './tools/tasks/task-reminder.service';
import { KnowledgeEvolutionService } from './memory/knowledge-evolution.service';
import { JarvisKnowledgeService } from './knowledge/jarvis-knowledge.service';
import { JarvisCommandService } from './commands/jarvis-command.service';
import { JarvisWebSearchService } from './tools/web/jarvis-web-search.service';
import { JarvisPromptBuilderService } from './prompt/jarvis-prompt-builder.service';
import { EmbeddingsService } from './library/embeddings.service';
import { CorpusSelectorService } from './knowledge/corpus-selector.service';
import { DocumentIngestService } from './library/document-ingest.service';
import { randomUUID } from 'crypto';

export interface JarvisQueryOptions {
  sessionId?: string;
  useMemory?: boolean;
  useDocuments?: boolean;
  maxHistoryMessages?: number;
  provider?: 'ollama' | 'openrouter';
}

@Injectable()
export class JarvisService {
  private readonly logger = new Logger(JarvisService.name);
  private readonly providers: Map<string, ILLMProvider>;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly userProfileRepo: UserProfileRepository,
    private readonly agentRunRepo: AgentRunRepository,
    private readonly sessionSummaryRepo: SessionSummaryRepository,
    private readonly assistantTools: AssistantToolsService,
    private readonly jarvisIdentity: JarvisIdentityService,
    private readonly capabilitiesService: CapabilitiesService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly feedbackRepo: FeedbackRepository,
    private readonly browserTool: BrowserToolService,
    private readonly intentRouter: IntentRouterService,
    @Inject(OllamaProvider) private readonly ollamaProvider: ILLMProvider,
    @Inject(OpenRouterProvider) private readonly openRouterProvider: ILLMProvider,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly googleTasks: GoogleTasksService,
    private readonly googleGmail: GoogleGmailService,
    private readonly googleDrive: GoogleDriveService,
    private readonly youtubeService: YouTubeService,
    private readonly astrologyTool: AstrologyTool,
    private readonly investigationService: InvestigationService,
    private readonly taskReminderService: TaskReminderService,
    private readonly memoryExtractor: MemoryExtractorService,
    private readonly knowledgeEvolution: KnowledgeEvolutionService,
    private readonly jarvisKnowledge: JarvisKnowledgeService,
    private readonly jarvisCommand: JarvisCommandService,
    private readonly jarvisWebSearch: JarvisWebSearchService,
    private readonly jarvisPromptBuilder: JarvisPromptBuilderService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly corpusSelector: CorpusSelectorService,
    private readonly ingestService: DocumentIngestService,
  ) {
    this.providers = new Map([
      ['ollama', this.ollamaProvider],
      ['openrouter', this.openRouterProvider],
    ]);
  }

  // ── Query principal ─────────────────────────────────────────────────────────

  async query(userMessage: string, options: JarvisQueryOptions = {}): Promise<string> {
    const sessionId = options.sessionId || randomUUID();
    const taskSessionId = options.sessionId;
    const useMemory = options.useMemory !== false;
    const useDocuments = options.useDocuments !== false;
    const maxHistoryMessages = options.maxHistoryMessages || 6;
    const providerName = options.provider || 'ollama';
    const provider = this.providers.get(providerName)!;

    const startTime = Date.now();
    const toolsUsed: string[] = [];

    // ── 1. Interceptar comandos y accesos directos ──────────────────────────
    const commandResult = await this.jarvisCommand.handleCommand(userMessage, sessionId, startTime);
    if (commandResult.handled) {
      return commandResult.response!;
    }

    // ── 2. Obtener preferencias del usuario (Modo RAG/Online) ───────────────
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
    const mode = (preferences.ragMode || 'LOCAL_FIRST') as 'OFFLINE' | 'LOCAL_FIRST' | 'HYBRID' | 'WEB_FIRST';

    await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });

    // ── 3. Comprobar urls para investigación ────────────────────────────────
    const investigationUrl = this.investigationService.extractUrl(userMessage);
    if (investigationUrl) {
      const result = await this.investigationService.investigateUrl(investigationUrl, sessionId);
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: JSON.stringify(result), metadata: { source: 'investigation' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: JSON.stringify(result), toolsUsed: ['investigation'], modelUsed: 'none', provider: 'investigation', durationMs: Date.now() - startTime, success: true });
      return JSON.stringify(result, null, 2);
    }

    try {
      // ── 4. Comprobar tareas y recordatorios ────────────────────────────────
      const taskReminderReply = await this.taskReminderService.handleTaskCommand(userMessage, taskSessionId);
      if (taskReminderReply) {
        await this.conversationRepo.create({ sessionId, role: 'assistant', content: taskReminderReply, metadata: { source: 'task_reminder' } });
        await this.agentRunRepo.create({ sessionId, question: userMessage, answer: taskReminderReply, toolsUsed: ['task_reminder'], modelUsed: 'none', provider: 'task_reminder', durationMs: Date.now() - startTime, success: true });
        return taskReminderReply;
      }

      // ── 5. Clasificar intención ───────────────────────────────────────────
      const intent = await this.intentRouter.classify(userMessage);
      this.logger.log(`[intent] ${intent.intent} (${intent.confidence}) — ${intent.reason}`);

      // ── 6. RAG pre-search ────────────────────────────────────────────────
      let prefetchedRagContext: string | undefined = undefined;
      let hasRagHits = false;

      if (useDocuments) {
        let chunks = [] as any[];
        try {
          // 1. Consultar el índice de la biblioteca para encontrar documentos relevantes
          const matches = this.corpusSelector.findRelevantDocuments(userMessage, 3);
          const targetDocIds: number[] = [];

          if (matches.length > 0) {
            this.logger.log(`[rag] Corpus Selector detectó ${matches.length} documentos relevantes.`);
            for (const match of matches) {
              const doc = match.document;
              try {
                if (doc.embeddings !== 'ready') {
                  const dbId = await this.corpusSelector.lazyLoadDocument(doc, this.ingestService, this.documentRepo);
                  targetDocIds.push(dbId);
                } else {
                  // Verificar existencia real en base de datos
                  const existing = await this.documentRepo.searchDocumentsByTitle(doc.titulo, 1);
                  if (existing.length > 0) {
                    targetDocIds.push(existing[0].id);
                  } else {
                    this.logger.warn(`[rag] "${doc.titulo}" marcado como ready pero no hallado en BD. Recargando...`);
                    const dbId = await this.corpusSelector.lazyLoadDocument(doc, this.ingestService, this.documentRepo);
                    targetDocIds.push(dbId);
                  }
                }
              } catch (err: any) {
                this.logger.error(`[rag] Error en lazy loading de "${doc.titulo}": ${err.message}`);
              }
            }
          }

          // 2. Ejecutar la búsqueda semántica
          const queryEmbedding = await this.embeddingsService.generateEmbedding(userMessage);

          if (targetDocIds.length > 0) {
            this.logger.log(`[rag] Buscando semánticamente en documentos específicos: ${targetDocIds.join(', ')}`);
            chunks = await this.documentRepo.searchChunksSemanticInDocuments(queryEmbedding, targetDocIds, 3);
          } else {
            // Fallback: búsqueda global si no hay coincidencia en el índice estructural
            this.logger.log(`[rag] Sin coincidencias en el índice. Ejecutando búsqueda global.`);
            chunks = await this.documentRepo.searchChunksSemantic(queryEmbedding, 3);
          }
        } catch (err: any) {
          this.logger.warn(`[rag:semantic-pre] fallback a búsqueda textual en pre-search: ${err.message}`);
          try {
            // Re-obtener los IDs de destino si existieron
            const matches = this.corpusSelector.findRelevantDocuments(userMessage, 3);
            const targetDocIds: number[] = [];
            for (const match of matches) {
              const existing = await this.documentRepo.searchDocumentsByTitle(match.document.titulo, 1);
              if (existing.length > 0) targetDocIds.push(existing[0].id);
            }

            if (targetDocIds.length > 0) {
              chunks = await this.documentRepo.searchChunksInDocuments(userMessage, targetDocIds, 3);
            } else {
              chunks = await this.documentRepo.searchChunks(userMessage, 3);
            }
          } catch (fallbackErr: any) {
            this.logger.error(`[rag:fallback] Error en búsqueda textual fallback: ${fallbackErr.message}`);
          }
        }

        if (chunks.length > 0) {
          hasRagHits = true;
          prefetchedRagContext = `### DOCUMENTOS\n` + chunks
            .map((c) => `[${(c as any).document?.title || 'Doc'}]\n${c.content}`)
            .join('\n---\n');
        }
      }

      // ── 7. Decidir si buscar en la web en primera instancia ───────────────
      let triggerWebSearch = false;

      if (mode !== 'OFFLINE') {
        if (intent.intent === 'WEB' || intent.intent === 'SPORTS') {
          if (mode === 'WEB_FIRST') {
            triggerWebSearch = true;
          } else if (mode === 'HYBRID') {
            const isDynamic = /(noticias|titulares|dolar|euro|cotizacion|precio|partido|goles|clima|pronostico|temperatura|busca en internet|busca en la web|googlea)/i.test(userMessage);
            triggerWebSearch = isDynamic || !hasRagHits;
          } else if (mode === 'LOCAL_FIRST') {
            const isExplicitWeb = /(busca(r)? en internet|busca(r)? en la web|busca(r)? en google|googlea(r)?|navega(r)?|chequea(r)? online|fijate en internet|investiga(r)? en la web)/i.test(userMessage);
            const isDynamic = /(noticias|titulares|dolar|euro|cotizacion|precio|partido|goles|clima|pronostico|temperatura)/i.test(userMessage);
            triggerWebSearch = isExplicitWeb || (isDynamic && !hasRagHits);
          }
        }
      }

      // ── 8. Ejecutar intent TOOL (directa: clima, math, etc.) ──────────────
      if (intent.intent === 'TOOL') {
        const toolAnswer = await this.assistantTools.resolve(userMessage);
        if (toolAnswer) {
          toolsUsed.push('direct_tool');
          await this.conversationRepo.create({ sessionId, role: 'assistant', content: toolAnswer, metadata: { source: 'tool' } });
          await this.agentRunRepo.create({ sessionId, question: userMessage, answer: toolAnswer, toolsUsed, modelUsed: 'none', provider: 'tool', durationMs: Date.now() - startTime, success: true });
          return toolAnswer;
        }
      }

      // ── 9. Ejecutar Google Calendar ────────────────────────────────────────
      if (intent.intent === 'CALENDAR') {
        const calContext = await this.googleCalendar.getUpcomingEvents();
        if (calContext) {
          toolsUsed.push('google_calendar');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, calContext, undefined, mode);
        }
      }

      // ── 10. Ejecutar Google Tasks ──────────────────────────────────────────
      if (intent.intent === 'TASKS') {
        const tasksContext = await this.googleTasks.getPendingTasks();
        if (tasksContext) {
          toolsUsed.push('google_tasks');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, tasksContext, undefined, mode);
        }
      }

      // ── 11. Ejecutar Gmail ─────────────────────────────────────────────────
      if (intent.intent === 'GMAIL') {
        const n = userMessage.toLowerCase();
        let gmailContext: string;

        if (/(correos de hoy|de hoy|recibidos hoy)/i.test(n)) {
          gmailContext = await this.googleGmail.getEmailsFromToday();
        } else if (/(busca|buscar|buscame)\s+.*(correo|email|mail)/i.test(n)) {
          const queryMatch = userMessage.match(/busca(?:r|me)?\s+(?:en\s+(?:mi\s+)?(?:correo|gmail))?\s*['""]?([^'""\n]+)['""]?/i);
          const q = queryMatch?.[1]?.trim() ?? userMessage;
          gmailContext = await this.googleGmail.searchEmails(q);
        } else if (/(borrador|redacta|escrib[ei])\s+/i.test(n)) {
          const toMatch = userMessage.match(/(?:a|para)\s+([\w.@+-]+@[\w.]+)/i);
          const subjectMatch = userMessage.match(/(?:sobre|asunto|subject)\s+['"]?([^'""\n]{3,60})['"]?/i);
          if (toMatch && subjectMatch) {
            const body = userMessage.replace(/.*(?:sobre|asunto)\s+['""]?[^'""\n]+['""]?/i, '').trim() || '(cuerpo pendiente)';
            gmailContext = await this.googleGmail.draftEmail(toMatch[1], subjectMatch[1], body);
          } else {
            gmailContext = '⚠️ Para crear un borrador necesito el destinatario y el asunto.\nEjemplo: "redactá un email a nombre@email.com sobre Reunión del lunes"';
          }
        } else {
          gmailContext = await this.googleGmail.getImportantEmails();
        }

        toolsUsed.push('gmail');
        return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, gmailContext, undefined, mode);
      }

      // ── 12. Ejecutar Google Drive ──────────────────────────────────────────
      if (intent.intent === 'DRIVE') {
        const n = userMessage.toLowerCase();
        let driveContext: string;

        if (/(sincroniza|agrega al conocimiento|importa)\s+/i.test(n)) {
          const idMatch = userMessage.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
          if (idMatch) {
            driveContext = await this.googleDrive.syncToKnowledge(idMatch[1]);
          } else {
            driveContext = '⚠️ Para sincronizar un archivo de Drive, compartí la URL del archivo.\nEjemplo: "sincronizá https://drive.google.com/file/d/FILE_ID/view"';
          }
        } else if (/(archivos recientes|archivos de drive|mis archivos)/i.test(n)) {
          driveContext = await this.googleDrive.listRecentFiles();
        } else {
          const queryMatch = userMessage.match(/(?:busca|encontrá|encontrar|buscar)\s+(?:en\s+drive\s+)?['"]?([^'""\n]{3,60})['"]?/i);
          const q = queryMatch?.[1]?.trim() ?? userMessage;
          driveContext = await this.googleDrive.searchFiles(q);
        }

        toolsUsed.push('drive');
        return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, driveContext, undefined, mode);
      }

      // ── 13. Ejecutar YouTube ───────────────────────────────────────────────
      if (intent.intent === 'YOUTUBE') {
        const videoId = this.youtubeService.extractVideoId(userMessage);
        let ytContext: string;

        if (videoId) {
          if (/(comentarios?|comments?|que dice la gente|opiniones?)/i.test(userMessage)) {
            const [info, comments] = await Promise.all([
              this.youtubeService.getVideoInfo(videoId),
              this.youtubeService.getVideoComments(videoId),
            ]);
            ytContext = `${info}\n\n---\n\n${comments}`;
          } else {
            ytContext = await this.youtubeService.getVideoInfo(videoId);
          }
        } else if (/(canal|channel)\s+/i.test(userMessage)) {
          const idMatch = userMessage.match(/(?:canal|channel)\s+(?:de\s+)?[@]?([\w.-]{3,})/i);
          ytContext = idMatch?.[1]
            ? await this.youtubeService.getChannelInfo(idMatch[1])
            : await this.youtubeService.searchVideos(userMessage);
        } else {
          const queryMatch = userMessage.match(/(?:busca(?:r)?|dame|mostrame)\s+(?:videos?\s+(?:de|sobre))?\s*['"]?([^'""\n]{3,80})['"]?/i)
            ?? userMessage.match(/(?:videos?\s+(?:de|sobre))\s+['"]?([^'""\n]{3,80})['"]?/i);
          const q = queryMatch?.[1]?.trim() ?? userMessage;
          ytContext = await this.youtubeService.searchVideos(q);
        }

        toolsUsed.push('youtube');
        return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, ytContext, undefined, mode);
      }

      // ── 14. Ejecutar Astrology ─────────────────────────────────────────────
      if (intent.intent === 'ASTROLOGY') {
        const wantsFullChart = /(carta astral|posiciones planetarias|todos los planetas|aspectos|balance)/i.test(userMessage);
        const astroData = wantsFullChart
          ? this.astrologyTool.getPlanetaryPositions()
          : this.astrologyTool.getTodaySkyData();

        toolsUsed.push('astrology_calculated');
        return await this.respondWithAstrologyPrompt(userMessage, sessionId, providerName, provider, toolsUsed, startTime, astroData);
      }

      // ── 15. Ejecutar URL scraping ──────────────────────────────────────────
      if (intent.intent === 'URL') {
        await this.assistantTools.resolve(userMessage);
        const browserCtx = this.assistantTools.consumeBrowserContext();
        if (browserCtx) {
          toolsUsed.push('browser');
          await this.conversationRepo.create({ sessionId, role: 'system', content: browserCtx, metadata: { source: 'browser_context' } });
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, browserCtx, undefined, mode);
        }
        return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, undefined, undefined, mode);
      }

      // ── 16. SITE_SEARCH ────────────────────────────────────────────────────
      if (intent.intent === 'SITE_SEARCH' && intent.siteSearch) {
        const { site, query } = intent.siteSearch;
        const siteSearchCtx = await this.jarvisWebSearch.executeSiteSearch(site, query);
        if (siteSearchCtx) {
          toolsUsed.push('site_search');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, siteSearchCtx, prefetchedRagContext, mode);
        }

        const noEvidenceMsg = this.jarvisWebSearch.buildNoEvidenceMessage(userMessage, site);
        await this.conversationRepo.create({ sessionId, role: 'assistant', content: noEvidenceMsg, metadata: { source: 'site_search_fail' } });
        await this.agentRunRepo.create({ sessionId, question: userMessage, answer: noEvidenceMsg, toolsUsed: [...toolsUsed, 'site_search_fail'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: false });
        return noEvidenceMsg;
      }

      // ── 17. SPORTS ─────────────────────────────────────────────────────────
      if (intent.intent === 'SPORTS') {
        if (mode !== 'OFFLINE' && triggerWebSearch) {
          const sportsResult = await this.jarvisWebSearch.autoWebSearch(intent.sportsQuery ?? userMessage, 'deportes');
          if (sportsResult) {
            toolsUsed.push('sports_search');
            return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, sportsResult, prefetchedRagContext, mode);
          }
        }
        const noSportsMsg = this.jarvisWebSearch.buildNoEvidenceMessage(userMessage);
        await this.conversationRepo.create({ sessionId, role: 'assistant', content: noSportsMsg, metadata: { source: 'sports_fail' } });
        await this.agentRunRepo.create({ sessionId, question: userMessage, answer: noSportsMsg, toolsUsed: [...toolsUsed, 'sports_fail'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: false });
        return noSportsMsg;
      }

      // ── 18. WEB search ─────────────────────────────────────────────────────
      if (intent.intent === 'WEB') {
        if (triggerWebSearch) {
          const domain = this.jarvisWebSearch.domainRouter.classify(userMessage);
          this.logger.log(`[domain] ${domain.domain} (${domain.confidence}) — ${domain.reason}`);

          const category = this.jarvisWebSearch.domainToCategory(domain.domain) ?? this.jarvisWebSearch.detectCategory(userMessage);
          const searchQuery = domain.enrichedQuery ?? userMessage;

          const webCtx = await this.jarvisWebSearch.autoWebSearchWithSources(
            searchQuery,
            category,
            domain.suggestedSources,
          );

          if (webCtx) {
            toolsUsed.push('auto_search');
            if (domain.domain !== 'UNKNOWN') toolsUsed.push(`domain:${domain.domain}`);
            return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx, prefetchedRagContext, mode);
          }

          if (category === 'noticias' || category === 'gobierno' || domain.domain === 'LOCAL_NEWS' || domain.domain === 'GOVERNMENT_LOCAL') {
            this.logger.log(`[jarvis] noticias sin resultados → último intento con titulares de El Once`);
            // Let it fallback gracefully or return buildNoEvidenceMessage
          }

          if (this.jarvisWebSearch.isCurrentEventQuery(userMessage)) {
            const noWebMsg = this.jarvisWebSearch.buildNoEvidenceMessage(userMessage);
            await this.conversationRepo.create({ sessionId, role: 'assistant', content: noWebMsg, metadata: { source: 'web_fail_graceful' } });
            await this.agentRunRepo.create({ sessionId, question: userMessage, answer: noWebMsg, toolsUsed: [...toolsUsed, 'web_fail'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: false });
            return noWebMsg;
          }
        }
      }

      // ── 19. Fallback web query ─────────────────────────────────────────────
      if (this.jarvisWebSearch.needsWebSearch(userMessage)) {
        const category = this.jarvisWebSearch.detectCategory(userMessage);
        const webCtx = await this.jarvisWebSearch.autoWebSearch(userMessage, category);
        if (webCtx) {
          toolsUsed.push('auto_search');
          if (category) toolsUsed.push(`cache:${category}`);
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx, prefetchedRagContext, mode);
        }
      }

      // ── 20. LOCAL LLM query ────────────────────────────────────────────────
      return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, undefined, prefetchedRagContext, mode);

    } catch (error: any) {
      const errMsg: string = error?.message ?? String(error);
      this.logger.error(`Error en Jarvis query: ${errMsg}`);

      await this.agentRunRepo.create({
        sessionId,
        question: userMessage,
        toolsUsed,
        modelUsed: providerName,
        provider: providerName,
        durationMs: Date.now() - startTime,
        success: false,
        errorMsg: errMsg,
      });

      if (errMsg.startsWith('⚠️')) {
        await this.conversationRepo.create({
          sessionId,
          role: 'assistant',
          content: errMsg,
          metadata: { source: 'error' },
        });
        return errMsg;
      }

      throw error;
    }
  }

  // ── Respuesta centralizada via LLM ──────────────────────────────────────────

  private async respondWithLLM(
    userMessage: string,
    sessionId: string,
    providerName: string,
    provider: ILLMProvider,
    toolsUsed: string[],
    startTime: number,
    webContext?: string,
    prefetchedRagContext?: string,
    mode?: 'OFFLINE' | 'LOCAL_FIRST' | 'HYBRID' | 'WEB_FIRST',
  ): Promise<string> {
    const { systemPrompt, userPrompt, usedMemory, usedDocs } =
      await this.jarvisPromptBuilder.buildJarvisContext(userMessage, sessionId, true, true, 6, webContext, !!webContext, prefetchedRagContext);

    if (usedMemory) toolsUsed.push('memory');
    if (usedDocs) toolsUsed.push('rag');

    const finalSystemPrompt = webContext
      ? systemPrompt
        .replace(
          '4. Responder en máximo 3 oraciones salvo que se pidan detalles.',
          '4. TENÉS datos reales en el contexto web. Respondé directamente con esos datos. Si el texto es en inglés, traducílo. NUNCA digas "no hay información disponible" si hay datos en el contexto.',
        )
        .replace(
          '3. No inventar datos. Si no tenés la info, decilo claramente.',
          '3. Usá SOLO los datos del contexto web. PROHIBIDO inventar eventos planetarios, nombres de personas, o fechas que no estén en el texto extraído.',
        )
      : systemPrompt;

    const response = await provider.generate({
      messages: [
        { role: 'system', content: finalSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const responseContent = this.formatProviderResponse(response.content, provider);

    const isEvasiveResponse = !webContext && this.looksEvasive(response.content) && mode !== 'OFFLINE';
    if (isEvasiveResponse) {
      this.logger.log(`[jarvis] respuesta evasiva detectada → buscando en internet`);
      const category = this.jarvisWebSearch.detectCategory(userMessage);
      const webCtx = await this.jarvisWebSearch.autoWebSearch(userMessage, category);
      if (webCtx) {
        toolsUsed.push('web_fallback');
        if (category) toolsUsed.push(`cache:${category}`);
        const { systemPrompt: sp2, userPrompt: up2 } =
          await this.jarvisPromptBuilder.buildJarvisContext(userMessage, sessionId, false, false, 0, webCtx, true);
        const sp2Final = sp2
          .replace(
            '4. Responder en máximo 3 oraciones salvo que se pidan detalles.',
            '4. TENÉS datos reales de internet en el contexto. Respondé con esos datos. NO digas que no tenés información.',
          )
          .replace(
            '3. No inventar datos. Si no tenés la info, decilo claramente.',
            '3. Usá SOLO los datos del contexto web. No inventés nada.',
          );
        const response2 = await provider.generate({
          messages: [
            { role: 'system', content: sp2Final },
            { role: 'user', content: up2 },
          ],
        });
        const response2Content = this.formatProviderResponse(response2.content, provider);
        await this.saveAndObserve(sessionId, userMessage, response2Content, toolsUsed, response2, startTime);
        return response2Content;
      }
    }

    await this.saveAndObserve(sessionId, userMessage, responseContent, toolsUsed, response, startTime);
    return responseContent;
  }

  private async respondWithAstrologyPrompt(
    userMessage: string,
    sessionId: string,
    providerName: string,
    provider: ILLMProvider,
    toolsUsed: string[],
    startTime: number,
    astroData: string,
  ): Promise<string> {
    const profile = await this.userProfileRepo.getOrCreate();
    const identity = this.jarvisIdentity.getIdentity();
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('es-AR', {
      hour: '2-digit', minute: '2-digit',
      timeZone: profile.timezone || 'America/Argentina/Buenos_Aires',
    });

    const systemPrompt = [
      `Tu nombre es ${identity.name}. Eres un asistente especializado en astrología.`,
      ``,
      `📅 Fecha y hora actual: ${dateStr}, ${timeStr} hs.`,
      ``,
      `🌌 INSTRUCCIONES PARA RESPUESTA ASTROLÓGICA:`,
      `1. Utiliza EXCLUSIVAMENTE los datos astronómicos calculados que se te proveen.`,
      `2. NO necesitas internet. Los datos ya fueron calculados en tiempo real con astronomía precisa.`,
      `3. NUNCA digas "no tengo acceso", "no dispongo de información" ni nada similar.`,
      `   Los datos ESTÁN en el contexto. Úsalos directamente.`,
      `4. Estructura tu respuesta en 3 partes:`,
      `   🔭 Resumen astronómico (qué hay en el cielo ahora)`,
      `   🌠 Interpretación astrológica (qué energía trae)`,
      `   💡 Consejo o reflexión para el día/noche`,
      `5. Máximo 300 palabras. Tono cálido y cercano. Español argentino.`,
      `6. Si el usuario pregunta algo específico (ej: "¿Mercurio está retrógrado?"), `,
      `   respondé esa pregunta específicamente además de la estructura general.`,
    ].join('\n');

    const userPrompt = [
      `### DATOS ASTRONÓMICOS CALCULADOS EN TIEMPO REAL`,
      `(Fuente: astronomy-engine — cálculos locales de alta precisión VSOP87)`,
      ``,
      astroData,
      ``,
      `### PREGUNTA DEL USUARIO`,
      userMessage,
    ].join('\n');

    const response = await provider.generate({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const responseContent = this.formatProviderResponse(response.content, provider);
    await this.saveAndObserve(sessionId, userMessage, responseContent, toolsUsed, response, startTime);
    return responseContent;
  }

  private formatProviderResponse(content: string, provider: ILLMProvider): string {
    if (provider.getProviderName() !== 'ollama') {
      return content;
    }
    const modelName = provider.getDefaultModel();
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return normalizedContent;
    }
    return `Modelo activo: ${modelName} \n\n${normalizedContent}`;
  }

  private looksEvasive(text: string): boolean {
    const n = text.toLowerCase();
    return (
      n.includes('no tengo acceso') ||
      n.includes('no tengo información') ||
      n.includes('no puedo acceder') ||
      n.includes('información en tiempo real') ||
      n.includes('no dispongo de') ||
      n.includes('mis datos no incluyen') ||
      n.includes('te recomiendo buscar') ||
      n.includes('te recomiendo consultar') ||
      n.includes('te sugiero consultar') ||
      n.includes('consultá fuentes') ||
      n.includes('visitá el sitio') ||
      n.includes('podés buscar en') ||
      n.includes('no hay información disponible') ||
      n.includes('no tengo datos específicos') ||
      n.includes('no cuento con información') ||
      n.includes('puedo ofrecerte algunos datos generales') ||
      n.includes('puedo decirte que en general') ||
      n.includes('datos generales y eventos relevantes que podrían') ||
      n.includes('no dispongo de noticias') ||
      (n.includes('lo siento') && n.includes('no'))
    );
  }

  private async saveAndObserve(
    sessionId: string,
    question: string,
    answer: string,
    toolsUsed: string[],
    response: any,
    startTime: number,
  ): Promise<void> {
    await this.conversationRepo.create({
      sessionId,
      role: 'assistant',
      content: answer,
      metadata: { source: 'llm', model: response.model, provider: response.provider, latencyMs: response.latencyMs },
    });
    await this.agentRunRepo.create({
      sessionId,
      question,
      answer,
      toolsUsed,
      modelUsed: response.model,
      provider: response.provider,
      durationMs: Date.now() - startTime,
      tokensUsed: response.tokensUsed,
      success: true,
    });
    await this.updateSessionSummaryIfNeeded(sessionId);

    this.memoryExtractor.extractAndSave(question, sessionId).catch((err) => {
      this.logger.warn(`[memory:extract] error background: ${err?.message ?? err}`);
    });

    this.knowledgeEvolution.extractAndSave(question, answer, sessionId).catch((err) => {
      this.logger.warn(`[evolution:extract] error background: ${err?.message ?? err}`);
    });
  }

  private async updateSessionSummaryIfNeeded(sessionId: string): Promise<void> {
    const messages = await this.conversationRepo.getBySession(sessionId, 100);
    if (messages.length === 0 || messages.length % 10 !== 0) return;

    const conversationText = messages
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    try {
      const provider = this.providers.get('ollama')!;
      const response = await provider.generate({
        messages: [
          { role: 'system', content: 'Resumí en 2-3 oraciones los temas principales de esta conversación. Sé muy conciso.' },
          { role: 'user', content: conversationText },
        ],
      });
      await this.sessionSummaryRepo.upsert(sessionId, response.content);
      this.logger.log(`Resumen de sesión actualizado: ${sessionId}`);
    } catch (error: any) {
      this.logger.warn(`No se pudo generar resumen: ${error.message}`);
    }
  }

  async getIdentity() {
    return this.jarvisIdentity.getIdentity();
  }

  async getCapabilities() {
    return this.capabilitiesService.getCapabilities();
  }

  async listSkills() {
    return this.skillRegistry.getAllSkills();
  }

  async findRelevantSkills(query: string) {
    return this.skillRegistry.findRelevant(query, 5);
  }

  async listTools() {
    return this.toolRegistry.getEnabledTools();
  }

  // ── Memoria ─────────────────────────────────────────────────────────────────

  async rememberFact(content: string, category: string, importance = 5) {
    return this.memoryRepo.create({ content, category, importance });
  }

  async recallMemory(id: number) {
    return this.memoryRepo.get(id);
  }

  async listMemories() {
    return this.memoryRepo.findAll();
  }

  // ── Documentos RAG ──────────────────────────────────────────────────────────

  async ingestDocument(title: string, content: string, category?: string, source?: string) {
    const doc = await this.documentRepo.createDocument({ title, content, category, source });

    const paragraphs = content
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 50);

    for (const para of paragraphs) {
      await this.documentRepo.createChunk({ documentId: doc.id, content: para });
    }

    this.logger.log(`Documento "${title}" ingestado con ${paragraphs.length} chunks`);
    return doc;
  }

  async searchDocuments(query: string) {
    return this.documentRepo.searchDocuments(query);
  }

  // ── Perfil ──────────────────────────────────────────────────────────────────

  async getProfile() {
    return this.userProfileRepo.getOrCreate();
  }

  async updateProfile(data: {
    name?: string;
    timezone?: string;
    country?: string;
    language?: string;
    preferences?: Record<string, any>;
  }) {
    const profile = await this.userProfileRepo.getOrCreate();
    return this.userProfileRepo.update(profile.id, data);
  }

  // ── Observabilidad ──────────────────────────────────────────────────────────

  async getObservabilityStats() {
    const [stats, topTools] = await Promise.all([
      this.agentRunRepo.getStats(),
      this.agentRunRepo.getTopTools(10),
    ]);
    return { stats, topTools };
  }

  async getRecentRuns(limit = 50) {
    return this.agentRunRepo.getRecentRuns(limit);
  }

  // ── Feedback ────────────────────────────────────────────────────────────────

  async saveFeedback(dto: FeedbackDto) {
    return this.feedbackRepo.create(dto);
  }

  async getRecentFeedback(limit = 50) {
    return this.feedbackRepo.findRecent(limit);
  }

  // ── Browser Tool ─────────────────────────────────────────────────────────────

  async fetchUrl(url: string): Promise<{ url: string; title?: string; description?: string; text?: string; wordCount?: number; links?: string[]; renderedWithPlaywright?: boolean; error?: string }> {
    const result = await this.browserTool.fetch(url);
    if ('error' in result) return { url, error: result.error };
    return {
      url: result.finalUrl,
      title: result.title,
      description: result.description,
      text: result.excerpt,
      wordCount: result.wordCount,
      links: result.links,
      renderedWithPlaywright: result.renderedWithPlaywright,
    };
  }

  async navigateUrl(url: string, options?: { screenshot?: boolean; waitFor?: string }) {
    const result = await this.browserTool.navigate(url, options);
    if ('error' in result) return { url, error: result.error };
    return result;
  }

  async webSearch(query: string, limit = 5) {
    return this.browserTool.search(query, limit);
  }

  getLibraryIndex() {
    return this.corpusSelector.getIndex();
  }
}

