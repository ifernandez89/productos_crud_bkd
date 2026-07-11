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
import { DomainRouterService } from './tools/intent/domain-router.service';
import { SportsTool } from './tools/sports/sports-tool.service';
import { ContentCacheService } from './tools/web/content-cache.service';
import { CategorySummaryService } from './library/category-summary.service';
import { DocumentSummaryService } from './library/document-summary.service';
import { WebHelper } from './tools/web/web-helper';
import { SourceRegistry } from './tools/web/source-registry';
import { randomUUID } from 'crypto';
import { GoogleCalendarService } from './tools/google/google-calendar.service';
import { GoogleTasksService } from './tools/google/google-tasks.service';
import { AstrologyTool } from './tools/astrology/astrology-tool.service';
import { MemoryExtractorService } from './memory/memory-extractor.service';
import { InvestigationService } from './tools/web/investigation.service';
import { TaskReminderService } from './tools/tasks/task-reminder.service';
import { KnowledgeEvolutionService } from './memory/knowledge-evolution.service';

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
    private readonly domainRouter: DomainRouterService,
    private readonly sportsTool: SportsTool,
    private readonly contentCache: ContentCacheService,
    private readonly categorySummaryService: CategorySummaryService,
    private readonly documentSummaryService: DocumentSummaryService,
    @Inject(OllamaProvider) private readonly ollamaProvider: ILLMProvider,
    @Inject(OpenRouterProvider) private readonly openRouterProvider: ILLMProvider,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly googleTasks: GoogleTasksService,
    private readonly astrologyTool: AstrologyTool,
    private readonly investigationService: InvestigationService,
    private readonly taskReminderService: TaskReminderService,
    private readonly memoryExtractor: MemoryExtractorService,
    private readonly knowledgeEvolution: KnowledgeEvolutionService,
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
    const hasSessionId = Boolean(options.sessionId);
    const useMemory = options.useMemory !== false;
    const useDocuments = options.useDocuments !== false;
    const maxHistoryMessages = options.maxHistoryMessages || 6;
    const providerName = options.provider || 'ollama';
    const provider = this.providers.get(providerName)!;

    const startTime = Date.now();
    const toolsUsed: string[] = [];

    // ── HELP SHORTCUT — "h", "H", "help", "ayuda" devuelve la guía de comandos ─
    if (/^(h|help|ayuda)$/i.test(userMessage.trim())) {
      const helpMsg = this.buildHelpMessage();
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: helpMsg, metadata: { source: 'help' } });
      return helpMsg;
    }

    // ── BIBLIOTECA — lista de documentos guardados ───────────────────────────
    if (/^(mis documentos|biblioteca|mis libros|mis pdfs|documentos guardados|que (libros|documentos|pdfs) (tengo|hay)|lista de (documentos|libros|pdfs))$/i.test(userMessage.trim())) {
      const libraryMsg = await this.buildLibraryMessage();
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: libraryMsg, metadata: { source: 'library_list' } });
      return libraryMsg;
    }

    // ── RESUMEN DE DOCUMENTO INDIVIDUAL ────────────────────────────────────
    const docSummaryRequest = this.extractDocumentSummaryRequest(userMessage);
    if (docSummaryRequest) {
      const summaryMsg = await this.buildDocumentSummaryResponse(
        docSummaryRequest.title,
        docSummaryRequest.maxItems,
      );
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: summaryMsg, metadata: { source: 'document_summary' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: summaryMsg, toolsUsed: ['document_summary'], modelUsed: 'ollama', provider: 'ollama', durationMs: Date.now() - startTime, success: true });
      return summaryMsg;
    }

    // ── DEDUPLICAR DOCUMENTOS ────────────────────────────────────────────────
    if (/^(elimina(r)? (los )?(pdf|documentos?|libros?)? ?(repetidos?|duplicados?)|borr(a|ar) (los )?(pdf|documentos?|libros?)? ?(repetidos?|duplicados?)|deduplicar|limpiar (la )?biblioteca)$/i.test(userMessage.trim())) {
      const dedupMsg = await this.deduplicateDocuments();
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: dedupMsg, metadata: { source: 'library_dedup' } });
      return dedupMsg;
    }

    // ── ELIMINAR DOCUMENTO POR TÍTULO ────────────────────────────────────────
    const deleteDocRequest = this.extractDeleteDocumentRequest(userMessage);
    if (deleteDocRequest) {
      const deleteMsg = await this.deleteDocumentByTitle(deleteDocRequest);
      await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: deleteMsg, metadata: { source: 'library_delete' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: deleteMsg, toolsUsed: ['library_delete'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: true });
      return deleteMsg;
    }

    if (this.isRepeatRequest(userMessage)) {
      if (!hasSessionId) {
        return 'Para repetir la última respuesta necesito que mantengas el mismo sessionId de la conversación anterior.';
      }

      const lastAnswer = await this.conversationRepo.getLastAssistantMessage(sessionId);
      if (lastAnswer) {
        const repeatedContent = this.isVoiceRequest(userMessage)
          ? `No puedo generar audio en este canal, pero te repito la respuesta en texto: ${lastAnswer.content}`
          : lastAnswer.content;

        await this.conversationRepo.create({
          sessionId,
          role: 'user',
          content: userMessage,
        });
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
        return repeatedContent;
      }

      await this.conversationRepo.create({
        sessionId,
        role: 'user',
        content: userMessage,
      });
      return 'No encuentro una respuesta anterior para repetir dentro de esta conversación. Hacé otra pregunta primero y luego intentá repetirla.';
    }

    await this.conversationRepo.create({ sessionId, role: 'user', content: userMessage });

    const investigationUrl = this.investigationService.extractUrl(userMessage);
    if (investigationUrl) {
      const result = await this.investigationService.investigateUrl(investigationUrl, sessionId);
      await this.conversationRepo.create({ sessionId, role: 'assistant', content: JSON.stringify(result), metadata: { source: 'investigation' } });
      await this.agentRunRepo.create({ sessionId, question: userMessage, answer: JSON.stringify(result), toolsUsed: ['investigation'], modelUsed: 'none', provider: 'investigation', durationMs: Date.now() - startTime, success: true });
      return JSON.stringify(result, null, 2);
    }

    try {
      const taskReminderReply = await this.taskReminderService.handleTaskCommand(userMessage, taskSessionId);
      if (taskReminderReply) {
        await this.conversationRepo.create({ sessionId, role: 'assistant', content: taskReminderReply, metadata: { source: 'task_reminder' } });
        await this.agentRunRepo.create({ sessionId, question: userMessage, answer: taskReminderReply, toolsUsed: ['task_reminder'], modelUsed: 'none', provider: 'task_reminder', durationMs: Date.now() - startTime, success: true });
        return taskReminderReply;
      }

      // ── Intent Router — clasifica la intención ANTES de ejecutar nada ──────
      const intent = await this.intentRouter.classify(userMessage);
      this.logger.log(`[intent] ${intent.intent} (${intent.confidence}) — ${intent.reason}`);

      // ── REPEAT ────────────────────────────────────────────────────────────
      if (intent.intent === 'REPEAT') {
        const lastAnswer = await this.conversationRepo.getLastAssistantMessage(sessionId);
        const answer = lastAnswer?.content ?? 'No encuentro una respuesta anterior. Hacé una pregunta primero.';
        await this.conversationRepo.create({ sessionId, role: 'assistant', content: answer, metadata: { source: 'repeat' } });
        await this.agentRunRepo.create({ sessionId, question: userMessage, answer, toolsUsed: ['repeat'], modelUsed: 'none', provider: 'repeat', durationMs: Date.now() - startTime, success: true });
        return answer;
      }

      // ── TOOL directa (clima, math, economía, calendarios, hora) ───────────
      if (intent.intent === 'TOOL') {
        const toolAnswer = await this.assistantTools.resolve(userMessage);
        if (toolAnswer) {
          toolsUsed.push('direct_tool');
          await this.conversationRepo.create({ sessionId, role: 'assistant', content: toolAnswer, metadata: { source: 'tool' } });
          await this.agentRunRepo.create({ sessionId, question: userMessage, answer: toolAnswer, toolsUsed, modelUsed: 'none', provider: 'tool', durationMs: Date.now() - startTime, success: true });
          return toolAnswer;
        }
        // Si la tool falla → continúa al LLM
      }

      // ── GOOGLE CALENDAR ───────────────────────────────────────────────────
      if (intent.intent === 'CALENDAR') {
        const calContext = await this.googleCalendar.getUpcomingEvents();
        if (calContext) {
          toolsUsed.push('google_calendar');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, calContext);
        }
      }

      // ── GOOGLE TASKS ──────────────────────────────────────────────────────
      if (intent.intent === 'TASKS') {
        const tasksContext = await this.googleTasks.getPendingTasks();
        if (tasksContext) {
          toolsUsed.push('google_tasks');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, tasksContext);
        }
      }

      // ── ASTROLOGY — cálculos instantáneos sin scraping ────────────────────
      if (intent.intent === 'ASTROLOGY') {
        // Detectar si pide posiciones completas o solo clima del día
        const wantsFullChart = /(carta astral|posiciones planetarias|todos los planetas|aspectos|balance)/i.test(userMessage);

        const astroData = wantsFullChart
          ? this.astrologyTool.getPlanetaryPositions()
          : this.astrologyTool.getTodaySkyData();

        toolsUsed.push('astrology_calculated');
        // ⚠️ NO guardar aquí — respondWithAstrologyPrompt llama saveAndObserve internamente
        // (antes había doble-guardado: conversationRepo.create + agentRunRepo.create + respondWithLLM)
        return await this.respondWithAstrologyPrompt(userMessage, sessionId, providerName, provider, toolsUsed, startTime, astroData);
      }

      // ── URL — scrapear y procesar con LLM ────────────────────────────────
      if (intent.intent === 'URL') {
        await this.assistantTools.resolve(userMessage); // dispara el scraping y cachea
        const browserCtx = this.assistantTools.consumeBrowserContext();
        if (browserCtx) {
          toolsUsed.push('browser');
          await this.conversationRepo.create({ sessionId, role: 'system', content: browserCtx, metadata: { source: 'browser_context' } });
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, browserCtx);
        }
        // Sin contexto (solo URL, sin pregunta) → responder sin browserCtx
        return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime);
      }

      // ── SITE_SEARCH — buscar en un sitio específico ────────────────────────
      if (intent.intent === 'SITE_SEARCH' && intent.siteSearch) {
        const { site, query } = intent.siteSearch;
        this.logger.log(`[jarvis] SITE_SEARCH intent detected for site: ${site}, query: ${query}`);

        const siteSearchCtx = await this.executeSiteSearch(site, query);
        if (siteSearchCtx) {
          toolsUsed.push('site_search');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, siteSearchCtx);
        }

        // Sin evidencia del sitio específico → informar honestamente, no inventar
        const noEvidenceMsg = this.buildNoEvidenceMessage(userMessage, site);
        await this.conversationRepo.create({ sessionId, role: 'assistant', content: noEvidenceMsg, metadata: { source: 'site_search_fail' } });
        await this.agentRunRepo.create({ sessionId, question: userMessage, answer: noEvidenceMsg, toolsUsed: [...toolsUsed, 'site_search_fail'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: false });
        return noEvidenceMsg;
      }

      // ── SPORTS — cascada: API deportiva → DuckDuckGo → scraping ────────
      if (intent.intent === 'SPORTS') {
        const sportsResult = await this.sportsTool.search(intent.sportsQuery ?? userMessage);
        if (sportsResult.found) {
          toolsUsed.push(sportsResult.hasGoalDetail ? 'sports_scraping' : 'sports_api');
          const webCtx = `**Datos deportivos (${sportsResult.source}):**\n${sportsResult.content}`;
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx);
        }
        // Sin datos en ninguna fuente → búsqueda web general con caché
        this.logger.log(`[intent] sports vacío → fallback WEB con caché`);
        const webCtx = await this.autoWebSearch(userMessage, 'deportes');
        if (webCtx) {
          toolsUsed.push('auto_search');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx);
        }
        // Sin evidencia deportiva → no inventar resultados
        const noSportsMsg = this.buildNoEvidenceMessage(userMessage);
        await this.conversationRepo.create({ sessionId, role: 'assistant', content: noSportsMsg, metadata: { source: 'sports_fail' } });
        await this.agentRunRepo.create({ sessionId, question: userMessage, answer: noSportsMsg, toolsUsed: [...toolsUsed, 'sports_fail'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: false });
        return noSportsMsg;
      }

      // ── WEB — DomainRouter → caché inteligente → DuckDuckGo ──────────────────
      if (intent.intent === 'WEB') {
        // DomainRouter clasifica el dominio y sugiere las 3 fuentes más relevantes
        const domain = this.domainRouter.classify(userMessage);
        this.logger.log(`[domain] ${domain.domain} (${domain.confidence}) — ${domain.reason}`);

        // Mapear dominio a categoría de SourceRegistry
        const category = this.domainToCategory(domain.domain) ?? this.detectCategory(userMessage);

        // Usar la query enriquecida si el DomainRouter la mejoró
        const searchQuery = domain.enrichedQuery ?? userMessage;

        const webCtx = await this.autoWebSearchWithSources(
          searchQuery,
          category,
          domain.suggestedSources,
        );

        if (webCtx) {
          toolsUsed.push('auto_search');
          if (domain.domain !== 'UNKNOWN') toolsUsed.push(`domain:${domain.domain}`);
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx);
        }

        // Sin resultados web — si es una consulta de noticias locales:
        if (category === 'noticias' || category === 'gobierno' || domain.domain === 'LOCAL_NEWS' || domain.domain === 'GOVERNMENT_LOCAL') {
          this.logger.log(`[jarvis] noticias sin resultados → último intento con titulares de El Once`);
          try {
            const elonceSource = SourceRegistry.getAll().find(s => s.urlBase.includes('elonce.com'));
            const directCtx = await WebHelper.scrapeHeadlines('https://www.elonce.com', 10, elonceSource);
            if (directCtx && directCtx.length > 200) {
              toolsUsed.push('direct_elonce_headlines');
              return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, directCtx);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`[jarvis] El Once titulares falló: ${msg}`);
          }

          const now = new Date();
          const hora = now.toLocaleTimeString('es-AR', {
            hour: '2-digit', minute: '2-digit',
            timeZone: 'America/Argentina/Buenos_Aires',
          });
          const failMsg = [
            `⚠️ No pude obtener las noticias actuales en este momento (${hora} hs).`,
            ``,
            `Intenté conectarme a las fuentes locales pero no respondieron. Podés consultarlas directamente en:`,
            `- 📰 **El Once**: https://www.elonce.com`,
            `- 📰 **UNO Entre Ríos**: https://www.unoentrerios.com.ar`,
            `- 🏗️ **Mi Paraná**: https://mi.parana.gob.ar`,
            ``,
            `Volvé a preguntarme en un momento, las fuentes suelen recuperarse enseguida.`,
          ].join('\n');
          await this.conversationRepo.create({ sessionId, role: 'assistant', content: failMsg, metadata: { source: 'web_fail_graceful' } });
          await this.agentRunRepo.create({ sessionId, question: userMessage, answer: failMsg, toolsUsed: [...toolsUsed, 'web_fail'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: false });
          return failMsg;
        }

        // Para otras categorías sin resultados web → si la pregunta es sobre eventos
        // actuales, no pasar al LLM sin evidencia (evita alucinaciones)
        if (this.isCurrentEventQuery(userMessage)) {
          const noWebMsg = this.buildNoEvidenceMessage(userMessage);
          await this.conversationRepo.create({ sessionId, role: 'assistant', content: noWebMsg, metadata: { source: 'web_fail_graceful' } });
          await this.agentRunRepo.create({ sessionId, question: userMessage, answer: noWebMsg, toolsUsed: [...toolsUsed, 'web_fail'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: false });
          return noWebMsg;
        }
        // Para preguntas que no son de eventos actuales → el LLM puede responder con conocimiento base
      }

      // ── LOCAL / RAG — pero antes, si needsWebSearch → enriquecer con web ──
      // Esto cubre casos donde el IntentRouter dijo LOCAL pero la pregunta
      // requiere datos actuales (noticias, gobierno, personas, eventos, etc.)
      if (this.needsWebSearch(userMessage)) {
        const category = this.detectCategory(userMessage);
        const webCtx = await this.autoWebSearch(userMessage, category);
        if (webCtx) {
          toolsUsed.push('auto_search');
          if (category) toolsUsed.push(`cache:${category}`);
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx);
        }
      }

      // ── LOCAL puro — memoria + documentos + historial + LLM ───────────────
      return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime);

    } catch (error) {
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

      // Si el error ya es un mensaje amigable para el usuario (ej: Ollama no disponible)
      // lo devolvemos como respuesta en lugar de explotar con 500
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

  // ── Construcción de contexto ────────────────────────────────────────────────

  private async buildJarvisContext(
    userMessage: string,
    sessionId: string,
    useMemory: boolean,
    useDocuments: boolean,
    maxHistoryMessages: number,
    browserContext?: string,
    hasWebContext?: boolean,   // true cuando viene de búsqueda automática (no browser)
  ): Promise<{ systemPrompt: string; userPrompt: string; usedMemory: boolean; usedDocs: boolean }> {
    const profile = await this.userProfileRepo.getOrCreate();
    const identity = this.jarvisIdentity.getIdentity();
    const capabilities = this.capabilitiesService.getCapabilities();
    const relevantSkills = this.skillRegistry.findRelevant(userMessage, 3);

    const activeCapabilities = Object.entries(capabilities)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
      .join(', ');

    const profileSummary = [
      profile.name ? `Usuario: ${profile.name}` : 'Usuario: desconocido',
      profile.country ? `País del usuario: ${profile.country}` : undefined,
      profile.language ? `Idioma del usuario: ${profile.language}` : undefined,
      profile.timezone ? `Zona horaria del usuario: ${profile.timezone}` : undefined,
    ]
      .filter(Boolean)
      .join(' | ');

    const systemPrompt = [
      `Tu nombre es: ${identity.name}, un asistente personal inteligente.`,
      `Tu tono es ${identity.personality.tone} y tu verbosidad es ${identity.personality.verbosity}.`,
      '',
      `Idioma principal: ${identity.language || 'es-AR'}.`,
      `País: ${identity.country || 'Argentina'}.`,
      `Perfil del usuario: ${profileSummary || 'No hay datos de perfil disponibles.'}`,
      '',
      '⏰ FECHA Y HORA ACTUAL:',
      `- Año actual: 2026 (NO 2024, NO 2025)`,
      `- Fecha completa: ${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      `- Hora: ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: profile.timezone || 'America/Argentina/Buenos_Aires' })}`,
      '',
      '📍 CONTEXTO LOCAL — Paraná, Entre Ríos, Argentina:',
      '- Ciudad capital de Entre Ríos, fundada el 25 de junio de 1813',
      '- NO confundir con el río Paraná (el usuario se refiere a la CIUDAD)',
      '- Cuando el usuario dice "Paraná" sin contexto → asumir la ciudad',
      '- Sitios relevantes: Parque Urquiza, Costanera, Puerto Viejo, Plaza 1º de Mayo',
      '- Fuentes locales: El Once (elonce.com), Mi Paraná (mi.parana.gob.ar), UNO Entre Ríos (unoentrerios.com.ar)',
      '- ⚠️ AUTORIDADES LOCALES: NO usar conocimiento interno sobre intendentes, gobernadores u otros funcionarios.',
      '    El cargo de intendente dura 4 años y puede cambiar. SIEMPRE consultar en El Once o Mi Paraná.',
      '    Si no tenés datos web en este prompt sobre autoridades → debés decir que no podés confirmarlo sin fuente actual.',
      '',
      '🚨 REGLAS CRÍTICAS — NOTICIAS Y DATOS ACTUALES:',
      browserContext
        ? '- Tenés contenido web real en este prompt. Usálo. Hacé el resumen con los datos reales disponibles.'
        : '- NO tenés noticias del día en este prompt. Si el usuario pide noticias actuales/de hoy, respondé EXACTAMENTE:',
      browserContext
        ? ''
        : '  "No pude obtener las noticias en este momento. Por favor intentá de nuevo en unos segundos o consultá elonce.com directamente."',
      browserContext
        ? ''
        : '- NUNCA inventes titulares, eventos, ni menciones funcionarios locales sin datos web en el prompt.',
      '',
      'Reglas generales:',
      '1. Responder siempre en español argentino, de forma clara y natural.',
      '2. Usar el contexto provisto (memoria, documentos, web) para fundamentar la respuesta.',
      '3. No inventar datos. Si no tenés la info, decílo claramente.',
      browserContext
        ? '4. Cuando tenés contenido web extraído, respondé específicamente lo que el usuario preguntó usando ese contenido. No resumas todo — enfocaté en la pregunta.'
        : '4. Responder en máximo 3 oraciones salvo que se pidan detalles.',
      '5. Si el usuario pide un resumen, usá viñetas o párrafos cortos según corresponda.',
      '6. Si mencionan "hoy", "actual", "este año" → usar el año 2026, NO 2024.',
      '',
      `Timezone: ${identity.timezone}`,
      `Especialidades: ${identity.specialties?.join(', ') ?? 'ninguna'}`,
      `Capacidades activas: ${activeCapabilities}`,
    ].join('\n');

    const contextParts: string[] = [];
    let usedMemory = false;
    let usedDocs = false;

    if (relevantSkills.length > 0) {
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
        contextParts.push(`### MEMORIA\n${memories.map((m) => m.content).join('\n')}`);
      }
    }

    // RAG de documentos
    if (useDocuments) {
      // Primero intentar detectar si es una solicitud de resumen de documento individual
      const docSummary = this.detectDocumentSummaryRequest(userMessage);
      
      if (docSummary.isRequest && docSummary.title) {
        this.logger.log(`[rag:document] detectado resumen de documento: "${docSummary.title}"`);
        
        try {
          const result = await this.documentSummaryService.generateDocumentSummary(
            docSummary.title,
            docSummary.maxKeyPoints,
          );

          usedDocs = true;
          
          // Formatear el resumen para el contexto
          const formattedSummary = [
            `### RESUMEN DEL DOCUMENTO: "${result.title}"`,
            result.category ? `**Categoría:** ${result.category}` : '',
            result.wordCount > 0 ? `**Palabras:** ~${result.wordCount} | **Chunks:** ${result.chunkCount}` : '',
            '',
            '**RESUMEN EJECUTIVO:**',
            result.summary,
            '',
            '**PUNTOS CLAVE:**',
            ...result.keyPoints.map((point, idx) => `${idx + 1}. ${point}`),
          ].filter(line => line !== '').join('\n');

          contextParts.push(formattedSummary);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[rag:document] error al generar resumen: ${msg}`);
          // Si el documento no se encuentra, agregar mensaje de error al contexto
          contextParts.push(`### DOCUMENTOS\n${msg}`);
        }
      } else {
        // Si no es resumen de documento individual, intentar resumen por categoría
        const categorySummary = this.detectCategorySummaryRequest(userMessage);
        
        if (categorySummary.isRequest && categorySummary.category) {
          this.logger.log(`[rag:category] detectado resumen por categoría: "${categorySummary.category}"`);
          
          try {
            // Generar resumen combinado de la categoría
            const result = await this.categorySummaryService.generateCategorySummary(
              categorySummary.category,
              categorySummary.query,
            );

            if (result.chunksUsed > 0) {
              usedDocs = true;
              // Agregar el resumen generado como contexto
              contextParts.push(`### RESUMEN DE DOCUMENTOS (${result.category})\n${result.summary}\n\n*Basado en ${result.documentsUsed} documento(s): ${result.documentTitles.join(', ')}*`);
            } else {
              // No hay documentos en esa categoría
              contextParts.push(`### DOCUMENTOS\n${result.summary}`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`[rag:category] error al generar resumen: ${msg}`);
            // Fallback a búsqueda normal si falla el resumen por categoría
          }
        }
        
        // Búsqueda normal de chunks si no es resumen por categoría ni por documento
        if (!categorySummary.isRequest) {
          const chunks = await this.documentRepo.searchChunks(userMessage, 3);
          if (chunks.length > 0) {
            usedDocs = true;
            const docText = chunks
              .map((c) => `[${(c as any).document?.title || 'Doc'}]\n${c.content}`)
              .join('\n---\n');
            contextParts.push(`### DOCUMENTOS\n${docText}`);
          }
        }
      }
    }

    // Contexto extraído de la web por el BrowserTool
    if (browserContext) {
      contextParts.push(`### CONTENIDO WEB EXTRAÍDO EN TIEMPO REAL\n${browserContext}`);
    }

    // Resumen de sesión (si existe, evita enviar 100 mensajes)
    const summary = await this.sessionSummaryRepo.get(sessionId);
    if (summary) {
      contextParts.push(`### RESUMEN DE CONVERSACIÓN\n${summary.summary}`);
    } else {
      // Historial reciente solo si no hay resumen
      const recentMessages = await this.conversationRepo.getRecentMessages(sessionId, maxHistoryMessages);
      if (recentMessages.length > 1) {
        const historyText = recentMessages
          .slice(0, -1)
          .map((m) => `${m.role === 'user' ? 'Usuario' : 'Jarvis'}: ${m.content}`)
          .join('\n');
        contextParts.push(`### HISTORIAL RECIENTE\n${historyText}`);
      }
    }

    const webInstruction = (browserContext || hasWebContext)
      ? '\n\n⚠️ INSTRUCCIÓN OBLIGATORIA: Respondé EXCLUSIVAMENTE usando los datos de "CONTENIDO WEB EXTRAÍDO EN TIEMPO REAL" o "BÚSQUEDA WEB AUTOMÁTICA" que están arriba. PROHIBIDO decir que no tenés información — los datos ya están en este prompt. Si el contenido está en inglés, traducílo al español.'
      : '';

    const userPrompt = contextParts.length > 0
      ? `${contextParts.join('\n\n')}\n\n### PREGUNTA ACTUAL\n${userMessage}${webInstruction}`
      : userMessage;
    return { systemPrompt, userPrompt, usedMemory, usedDocs };
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



  // ── Respuesta centralizada via LLM ──────────────────────────────────────────

  private async respondWithLLM(
    userMessage: string,
    sessionId: string,
    providerName: string,
    provider: ILLMProvider,
    toolsUsed: string[],
    startTime: number,
    webContext?: string,
  ): Promise<string> {
    const { systemPrompt, userPrompt, usedMemory, usedDocs } =
      await this.buildJarvisContext(userMessage, sessionId, true, true, 6, webContext, !!webContext);

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

    // ── Fallback automático: si la respuesta parece una negativa y no teníamos
    //    contexto web, buscar en internet y reintentar UNA vez ─────────────────
    const isEvasiveResponse = !webContext && this.looksEvasive(response.content);
    if (isEvasiveResponse) {
      this.logger.log(`[jarvis] respuesta evasiva detectada → buscando en internet`);
      const category = this.detectCategory(userMessage);
      const webCtx = await this.autoWebSearch(userMessage, category);
      if (webCtx) {
        toolsUsed.push('web_fallback');
        if (category) toolsUsed.push(`cache:${category}`);
        // Reintentar con el contexto web
        const { systemPrompt: sp2, userPrompt: up2 } =
          await this.buildJarvisContext(userMessage, sessionId, false, false, 0, webCtx, true);
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
        // Persistir la segunda respuesta (mejorada)
        await this.saveAndObserve(sessionId, userMessage, response2Content, toolsUsed, response2, startTime);
        return response2Content;
      }
    }

    await this.saveAndObserve(sessionId, userMessage, responseContent, toolsUsed, response, startTime);
    return responseContent;
  }

  /**
   * Respuesta especializada para ASTROLOGY.
   * Usa un system prompt enfocado en datos astronómicos calculados localmente.
   * NO usa el prompt genérico de noticias — evita que el LLM diga "no tengo info".
   *
   * Flujo: astronomy-engine → datos locales → prompt especializado → LLM → respuesta
   * Sin scraping. Sin DuckDuckGo. Sin Playwright. Sin internet.
   */
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

  /**
   * Detecta si una respuesta del LLM es evasiva/negativa.
   * Ej: "no tengo acceso", "no puedo", "te recomiendo buscar en..."
   */
  private looksEvasive(text: string): boolean {
    const n = text.toLowerCase();
    return (
      // Patrones clásicos de "no tengo acceso"
      n.includes('no tengo acceso') ||
      n.includes('no tengo información') ||
      n.includes('no puedo acceder') ||
      n.includes('información en tiempo real') ||
      n.includes('no dispongo de') ||
      n.includes('mis datos no incluyen') ||
      // Patrones de "te recomiendo ir a otra parte"
      n.includes('te recomiendo buscar') ||
      n.includes('te recomiendo consultar') ||
      n.includes('te sugiero consultar') ||
      n.includes('consultá fuentes') ||
      n.includes('visitá el sitio') ||
      n.includes('podés buscar en') ||
      // Patrones de "no hay info disponible" (respuesta actual del modelo)
      n.includes('no hay información disponible') ||
      n.includes('no tengo datos específicos') ||
      n.includes('no cuento con información') ||
      // Patrones de respuestas genéricas que evitan el tema
      n.includes('puedo ofrecerte algunos datos generales') ||
      n.includes('puedo decirte que en general') ||
      n.includes('datos generales y eventos relevantes que podrían') ||
      n.includes('no dispongo de noticias') ||
      // Pattern combinado
      (n.includes('lo siento') && n.includes('no'))
    );
  }

  /** Persiste la respuesta y registra en observabilidad */
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

    // ── Auto-extracción de memoria (background, no bloquea) ───────────────
    // Analiza el mensaje del usuario buscando hechos persistentes.
    // Errores acá NO deben romper la respuesta ya enviada al usuario.
    this.memoryExtractor.extractAndSave(question, sessionId).catch((err) => {
      this.logger.warn(`[memory:extract] error background: ${err?.message ?? err}`);
    });

    // ── Knowledge Evolution (background, no bloquea) ───────────────────────
    // Snapshot automático de cada intercambio significativo.
    this.knowledgeEvolution.extractAndSave(question, answer, sessionId).catch((err) => {
      this.logger.warn(`[evolution:extract] error background: ${err?.message ?? err}`);
    });
  }

  /**
   * Determina si la pregunta necesita búsqueda web automática.
   * Regla principal: buscar SIEMPRE a menos que sea conversación trivial.
   */
  private needsWebSearch(message: string): boolean {
    const n = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // Excluir mensajes muy cortos (<3 palabras)
    if (n.split(/\s+/).filter(Boolean).length < 3) return false;

    // Excluir saludos y conversación trivial
    if (/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|como estas|como andas|que tal|que onda|gracias|de nada|ok|dale|si|no|perfecto|genial|excelente|entendido|claro|listo)[\s!?.]*$/i.test(n)) {
      return false;
    }

    // Excluir preguntas sobre el asistente mismo
    if (/(quien eres|como te llamas|que eres|que podes hacer|que sabes|cuales son tus capacidades|sos un|eres un)/i.test(n)) {
      return false;
    }

    // Excluir comandos de memoria/perfil
    if (/^(recorda|guarda|guarda|anota|anota|mi nombre es|me llamo|prefiero|siempre)/i.test(n)) {
      return false;
    }

    // ⚠️ Excluir astrología — tiene su propio router y NO necesita web
    // Si una query astrológica cayó en LOCAL (bug de routing), no intentar web
    if (/(astrolog|horoscopo|carta astral|luna llena|luna nueva|luna creciente|luna menguante|mercurio retrogrado|venus retrograda|energia lunar|energia astral|que dicen los astros|planetas visibles)/i.test(n)) {
      this.logger.warn(`[needsWebSearch] query astrológico detectado en LOCAL — NO buscar web (debería haber ido por ASTROLOGY)`);
      return false;
    }

    // ⚠️ FORZAR búsqueda web para gobierno local (datos cambian frecuentemente)
    if (/(intendent|gobernador|concejal|concejo|municipalidad|quien gobierna|autoridades|gobierno de parana|gestion municipal)/i.test(n)) {
      this.logger.log(`[needsWebSearch] gobierno local detectado → FORZAR WEB`);
      return true;
    }

    // Todo lo demás → buscar en internet
    return true;
  }

  /**
   * Búsqueda web automática con estrategia de caché inteligente.
   * 
   * FLUJO:
   * 1. Si hay categoría conocida → buscar en caché primero
   * 2. Cache HIT → servir en milisegundos
   * 3. Cache MISS → scrapear fuentes confiables → guardar
   * 4. Fallback → DuckDuckGo genérico → Google Playwright
   * 
   * @param query    La pregunta del usuario
   * @param category Categoría detectada (opcional)
   */
  private async autoWebSearch(query: string, category?: string): Promise<string | null> {
    // Para noticias, enriquecer la query con la fecha actual para obtener resultados frescos
    const enrichedQuery = this.enrichQueryForCategory(query, category);

    this.logger.log(
      `[jarvis:auto_search] buscando: "${enrichedQuery.slice(0, 80)}" ${category ? `[${category}]` : ''}`,
    );

    // 1. Si hay categoría, usar caché inteligente
    if (category) {
      try {
        // Timeout total de 15s para el caché — si no responde, pasar a WebHelper
        const cachePromise = this.contentCache.fetchRelevantContent(enrichedQuery, category, 2);
        const cacheTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('cache timeout 15s')), 15_000),
        );
        const cached = await Promise.race([cachePromise, cacheTimeout]);

        if (cached.length > 0) {
          const fromCacheCount = cached.filter((r) => r.fromCache).length;
          this.logger.log(
            `[jarvis:auto_search] ${cached.length} resultados (${fromCacheCount} desde caché)`,
          );

          // Formatear resultados
          return cached
            .map((r, i) => {
              const source = r.fromCache ? '💾 CACHÉ' : '🌐 WEB';
              const title = r.title ? `**${i + 1}. ${r.title}**` : `**${i + 1}. Resultado**`;
              return `${title} ${source}\n🔗 ${r.url}\n\n${r.content.slice(0, 2000)}`;
            })
            .join('\n\n---\n\n');
        }

        this.logger.log(`[jarvis:auto_search] caché vacío para "${category}" → WebHelper`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[jarvis:auto_search] error en caché: ${msg} → fallback`);
      }
    }

    // 2. Fallback: WebHelper con fuentes priorizadas por categoría
    // ⏱️ Timeout de 25s total — si tarda más, es mejor dar una respuesta parcial
    const webHelperTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000));
    const webHelperResult = WebHelper.search(enrichedQuery, category, true);
    const result = await Promise.race([webHelperResult, webHelperTimeout]);

    if (result) {
      this.logger.log(`[jarvis:auto_search] OK WebHelper (${result.length} chars)`);
      return result;
    }

    // 3. Sin resultados — omitir Playwright (demasiado lento, target <60s total)
    this.logger.log(`[jarvis:auto_search] WebHelper vacío → sin resultados`);
    return null;
  }

  /**
   * Mapea un Domain del DomainRouter a una categoría de SourceRegistry.
   */
  private domainToCategory(domain: string): string | undefined {
    const map: Record<string, string> = {
      SPORTS: 'deportes',
      LOCAL_NEWS: 'noticias',
      NATIONAL_NEWS: 'noticias',
      POLITICS: 'noticias',
      AI: 'ia',
      AI_PAPERS: 'academic_ai',
      PROGRAMMING: 'tecnologia',
      DEVELOPMENT: 'desarrollo',
      SCIENCE: 'ciencia',
      TECHNOLOGY: 'tecnologia',
      MUSIC: 'musica',
      MOVIES_TV: 'entretenimiento',
      MYSTERY: 'misterios',
      ECONOMY: 'noticias',
      GOVERNMENT_LOCAL: 'gobierno',
      REFERENCE: 'referencia',
      PLANTS: 'referencia',
      MATH: 'academic_math',
      PHYSICS: 'academic_physics',
      ASTRONOMY: 'academic_astronomy',
      WEB_DOCS: 'academic_dev',
    };
    return map[domain];
  }

  /**
   * Versión mejorada de autoWebSearch que acepta fuentes sugeridas por el DomainRouter.
   * Las fuentes del DomainRouter tienen prioridad sobre el caché genérico.
   */
  private async autoWebSearchWithSources(
    query: string,
    category?: string,
    suggestedSources?: string[],
  ): Promise<string | null> {
    // Si hay fuentes específicas del DomainRouter, scrapear directamente
    if (suggestedSources && suggestedSources.length > 0) {
      this.logger.log(
        `[domain_search] usando ${suggestedSources.length} fuentes dirigidas para "${query.slice(0, 60)}"`,
      );

      const sourceDefs = suggestedSources
        .map((urlBase) => SourceRegistry.findByUrl(urlBase))
        .filter(Boolean);

      if (sourceDefs.length > 0) {
        const scrapeResults = await Promise.allSettled(
          sourceDefs.slice(0, 3).map((src) => {
            const searchUrl = SourceRegistry.buildSearchUrl(src!, query);
            const targetUrl = searchUrl || src!.urlBase;
            return WebHelper.scrapeUrlWithSelectors(targetUrl, query, src!);
          }),
        );

        const useful: string[] = [];
        for (const r of scrapeResults) {
          if (r.status === 'fulfilled' && r.value && r.value.length > 150) {
            useful.push(r.value);
            if (useful.length >= 2) break;
          }
        }

        if (useful.length > 0) {
          this.logger.log(`[domain_search] ${useful.length} resultados de fuentes dirigidas`);
          return useful.join('\n\n---\n\n');
        }
        this.logger.log(`[domain_search] fuentes dirigidas vacías → fallback autoWebSearch`);
      }
    }

    // Fallback al flujo original con caché
    return this.autoWebSearch(query, category);
  }

  /**
   * Enriquece la query con fecha/localidad para categorías que necesitan datos actuales.
   * Esto mejora significativamente los resultados de DuckDuckGo para noticias.
   */
  private enrichQueryForCategory(query: string, category?: string): string {
    if (!category) return query;

    // Detectar localidad en la query original
    const n = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mentionsParana = /parana|entre rios|litoral/.test(n);
    const mentionsArgentina = /argentin/.test(n);

    // Para noticias: construir query limpia si es genérica o enriquecerla si es específica
    if (category === 'noticias') {
      const isGeneric = /^(noticias?|novedades?|actualidad|que paso|que hay de nuevo|noticias de hoy|ultimas noticias)[\s?¿!¡.]*$/i.test(n.trim());
      if (isGeneric) {
        const localidad = mentionsParana ? 'Paraná Entre Ríos'
          : mentionsArgentina ? 'Argentina'
            : '';
        return `noticias ${localidad} hoy`.replace(/\s+/g, ' ').trim();
      }
      // No es genérico, mantener el término de búsqueda y agregar 'noticias' / 'hoy' si no están
      let enriched = query;
      if (!/noticia/i.test(n)) enriched = `noticias ${enriched}`;
      if (!/hoy|actual|reciente/i.test(n)) enriched = `${enriched} hoy`;
      return enriched;
    }

    if (category === 'gobierno') {
      const isGeneric = /^(gobierno|autoridades|quien gobierna|gestion municipal)[\s?¿!¡.]*$/i.test(n.trim());
      if (isGeneric) {
        const localidad = mentionsParana ? 'Paraná Entre Ríos' : 'Argentina';
        return `noticias gobierno ${localidad} hoy`.trim();
      }
      return query;
    }

    // Deportes: conservar query original pero agregar fecha actual
    const now = new Date();
    const today = `${now.getDate()} de ${now.toLocaleDateString('es-AR', { month: 'long' })} de ${now.getFullYear()}`;
    if (/\bhoy\b/i.test(query)) return query.replace(/\bhoy\b/gi, today);
    return `${query} ${today}`;
  }
  /**
   * Detecta la categoría de una pregunta para optimizar caché.
   * Esto acelera las consultas frecuentes usando fuentes priorizadas.
   */
  private detectCategory(message: string): string | undefined {
    const n = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // ⚠️ ASTROLOGÍA YA NO ES CATEGORÍA WEB — se maneja con AstrologyTool (intent ASTROLOGY)
    // Las consultas astrológicas son detectadas por IntentRouter y enviadas al tool de cálculo

    // Gobierno local — solo cuando se pregunta EXPLÍCITAMENTE por autoridades/gestión
    if (/(intendent|gobernador|concejal|concejo|municipalidad|quien gobierna|autoridades|gobierno de parana|gestion municipal)/i.test(n)) {
      return 'gobierno';
    }

    // ── NOTICIAS — va ANTES que Paraná para evitar el falso match gobierno ──
    // "noticias de Paraná hoy" → noticias (NO gobierno)
    if (/(noticia|novedades|actualidad|resumen|breaking|informa|titulo|tapa|diario|periodico|prensa)/i.test(n) && n.length > 10) {
      return 'noticias';
    }

    // Paraná (ciudad) — contexto local cuando NO es noticias ni gobierno
    if (/(parana\b|ciudad de parana|parque urquiza|costanera|puerto viejo)/i.test(n)) {
      // Si menciona río → geografía/noticias generales
      if (/(rio|caudal|nivel|afluente)/i.test(n)) return 'noticias';
      // Cualquier otra consulta sobre la ciudad → El Once + Mi Paraná
      return 'noticias';
    }

    // Deportes
    if (/(futbol|gol|partido|seleccion|equipo|jugador|campeon|copa|liga|torneo|clasifico|gano|perdio|empato)/i.test(n)) {
      return 'deportes';
    }

    // Clima
    if (/(clima|temperatura|lluvia|calor|frio|pronostico|meteorolog|tiempo \(clima\)|despejado|nublado)/i.test(n)) {
      return 'clima';
    }

    // Noticias (segunda guarda — queries cortos con "hoy", "reciente", etc.)
    if (/(ultimo|ultima|hoy|reciente)/i.test(n) && n.length > 15) {
      return 'noticias';
    }

    // ── IA — ANTES que tecnología genérica para capturar queries de ML/LLM/AI ──
    // "qué pasó hoy en inteligencia artificial", "nuevo modelo de OpenAI", "ChatGPT update"
    if (/(\bia\b|inteligencia artificial|machine learning|deep learning|llm\b|openai|chatgpt|gemini\b|claude\b|llama\b|gpt-|gpt4|gpt3|copilot|midjourney|stable diffusion|diffusion model|modelo de lenguaje|red neuronal|transformer\b|hugging face|huggingface)/i.test(n)) {
      return 'ia';
    }

    // ── DESARROLLO — preguntas sobre frameworks, librerías, lenguajes, GitHub ──
    // "novedades en NestJS", "nueva versión de React", "qué hay en npm esta semana"
    if (/(nestjs|nodejs|node\.js|typescript|javascript|react\b|next\.js|nextjs|vue\b|angular\b|svelte|python\b|rust\b|golang|deno\b|bun\b|npm\b|yarn\b|pnpm|webpack|vite\b|rollup|esbuild|prisma\b|docker\b|kubernetes|k8s|github\b|gitlab|git\b|api rest|graphql|websocket|backend|frontend|framework|libreria|biblioteca|sdk\b|cli\b|dev\.to|medium\.com)/i.test(n)) {
      return 'desarrollo';
    }

    // Tecnología & gadgets — lo que queda (hardware, electrónica, empresa tech)
    if (/(tecnologia|software|hardware|gadget|smartphone|celular|tablet|laptop|procesador|chip\b|apple\b|google\b|microsoft\b|meta\b|amazon\b|app\b|aplicacion)/i.test(n)) {
      return 'tecnologia';
    }

    // Ciencia
    if (/(ciencia|investigacion|estudio|descubr|scientist|paper|journal|nature|conicet)/i.test(n)) {
      return 'ciencia';
    }

    // Matemáticas
    if (/(matematica|ecuacion|teorema|demostrac|calculo|algebra|geometria|topologia)/i.test(n)) {
      return 'matematicas';
    }

    // Física
    if (/(fisica|cuantic|particula|cern|relatividad|energia|cosmos|astrofisica)/i.test(n)) {
      return 'fisica';
    }

    // Música
    if (/(musica|cancion|album|artista|concierto|festival|spotify|billboard)/i.test(n)) {
      return 'musica';
    }

    // Entretenimiento (películas, series, MCU)
    if (/(pelicula|film|cine|actor|actriz|director|oscar|estreno|imdb|marvel|mcu|serie)/i.test(n)) {
      return 'entretenimiento';
    }

    return undefined;
  }

  /**
   * Ejecuta una búsqueda dirigida a un sitio específico.
   * Si la query pide noticias/titulares, usa scrapeHeadlines para extraer
   * titulares reales en lugar de texto genérico del cuerpo.
   */
  private async executeSiteSearch(site: string, query: string): Promise<string | null> {
    this.logger.log(`[jarvis:site_search] buscando en ${site}: "${query.slice(0, 60)}"`);

    const isHeadlinesQuery = /\b(noticias|titulares|novedades|que paso|que hay|actualidad|portada|principales|importantes|recientes|hoy)\b/i.test(query);

    // 1. Si pide noticias/titulares → extraer titulares reales primero
    if (isHeadlinesQuery) {
      const source = SourceRegistry.getAll().find(s => s.urlBase.includes(site));
      const targetUrl = source?.urlBase ?? `https://${site}`;
      const limit = this.extractNumberFromQuery(query) ?? 8;

      const headlines = await WebHelper.scrapeHeadlines(targetUrl, limit, source);
      if (headlines) {
        this.logger.log(`[jarvis:site_search] titulares OK de ${site}`);
        return headlines;
      }
      this.logger.warn(`[jarvis:site_search] sin titulares de ${site}, intentando scraping general`);
    }

    // 2. Intentar caché
    try {
      const source = SourceRegistry.getAll().find(s => s.urlBase.includes(site));
      const category = source?.category ?? 'noticias';
      const siteQuery = `site:${site} ${query}`;

      const cachePromise = this.contentCache.fetchRelevantContent(siteQuery, category, 2);
      const cacheTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('cache timeout 15s')), 15_000),
      );
      const cached = await Promise.race([cachePromise, cacheTimeout]);

      if (cached && cached.length > 0) {
        return cached
          .map((r, i) => {
            const sourceLabel = r.fromCache ? '💾 CACHÉ' : '🌐 WEB';
            const title = r.title ? `**${i + 1}. ${r.title}**` : `**${i + 1}. Resultado**`;
            return `${title} ${sourceLabel}\n🔗 ${r.url}\n\n${r.content.slice(0, 2000)}`;
          })
          .join('\n\n---\n\n');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[jarvis:site_search] error en caché: ${msg}`);
    }

    // 3. Fallback: WebHelper
    const webHelperTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000));
    const result = await Promise.race([
      WebHelper.search(`site:${site} ${query}`, undefined, true),
      webHelperTimeout,
    ]);

    return result ?? null;
  }

  /**
   * Extrae un número de una query. Ej: "dame 6 noticias" → 6
   */
  private extractNumberFromQuery(query: string): number | null {
    const match = query.match(/\b(\d+)\b/);
    return match ? Math.min(parseInt(match[1], 10), 15) : null;
  }

  /**
   * Detecta si la pregunta requiere información de eventos actuales/recientes.
   * Estas preguntas NO deben responderse sin evidencia web — el LLM inventaría.
   */
  private isCurrentEventQuery(message: string): boolean {
    const n = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /(hoy|ayer|esta semana|esta noche|ahora|actualmente|reciente|noticias|novedad|ultimo|ultima|ocurrio|paso hoy|que hay|resultado|partido|gol|marcador|score|precio actual|cotizacion|dolar hoy|quedo|gano|perdio|empato|clasifico|quien gano|como salio|que paso con|revisa|dame las noticias|titulares)/.test(n);
  }

  /**
   * Construye un mensaje honesto cuando no hay evidencia web disponible.
   * Evita que el LLM invente noticias, resultados o eventos actuales.
   */
  private buildNoEvidenceMessage(query: string, site?: string): string {
    const now = new Date();
    const hora = now.toLocaleTimeString('es-AR', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });

    const siteHint = site
      ? `Intenté buscar en **${site}** pero no pude obtener contenido en este momento.`
      : `Intenté buscar en las fuentes disponibles pero no obtuve resultados verificados.`;

    return [
      `⚠️ No tengo datos verificados para responder esto (${hora} hs).`,
      ``,
      siteHint,
      ``,
      `No voy a inventar información sobre eventos actuales. Podés:`,
      site ? `- Consultar directamente: https://${site}` : `- Reformular la pregunta o intentar en un momento`,
      `- Volver a preguntarme en unos segundos`,
    ].join('\n');
  }

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

  /** Guía de comandos rápida — se activa escribiendo "h" */
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
      `  Resumen por categoría →  \`resumen sobre <tema>\``,
      `                           \`resumen sobre plantas medicinales\``,
      `                           \`qué dicen mis PDFs de medicina\``,
      `                           \`información sobre desarrollo\``,
      `  Resumen de documento  →  \`resumen de '<título>'\``,
      `                           \`resumen de 'Manual de Plantas'\``,
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
      `**CALENDARIO Y TAREAS GOOGLE**`,
      `  Ver eventos hoy        →  \`qué tengo en el calendario hoy\``,
      `  Ver tareas pendientes  →  \`mis tareas de Google\``,
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
      `💡 Tip: escribí **h** en cualquier momento para ver esta guía.`,
      ``,
      `📄 **Nota sobre PDFs:** Al subir documentos/PDFs, la categoría se detecta`,
      `    automáticamente del contenido. Podés preguntar por temas específicos`,
      `    y JarBees combinará información de todos los documentos relacionados.`,
    ].join('\n');
  }

  /**
   * Extrae el título del documento a eliminar del mensaje del usuario.
   * Detecta: "eliminar documento 'X'", "borrar el PDF 'X'", "borra el libro X", etc.
   */
  private extractDeleteDocumentRequest(message: string): string | null {
    const pattern = /(?:elimina(?:r)?|borra(?:r)?|borrar|remover|quitar)\s+(?:el\s+)?(?:documento|pdf|libro|archivo)\s+['"]?(.+?)['"]?$/i;
    const match = message.trim().match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/['".]+$/, '').trim();
    }
    return null;
  }

  /**
   * Elimina un documento por título (fuzzy match).
   */
  private async deleteDocumentByTitle(title: string): Promise<string> {
    const candidates = await this.documentRepo.searchDocuments(title, 5);

    if (candidates.length === 0) {
      return `❌ No encontré ningún documento con el título "${title}".\n\nUsá \`mis documentos\` para ver los títulos disponibles.`;
    }

    // Match exacto tiene prioridad
    const exact = candidates.find(
      d => d.title.toLowerCase().trim() === title.toLowerCase().trim(),
    );
    const target = exact ?? candidates[0];

    await this.documentRepo.deleteDocument(target.id);

    return `🗑️ Documento eliminado correctamente.\n\n  • **Título:** ${target.title}\n  • **Categoría:** ${target.category ?? 'sin categoría'}\n  • **ID:** ${target.id}`;
  }

  /** Elimina documentos duplicados, conservando el más reciente de cada título */
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

  /** Lista los documentos de la biblioteca agrupados por categoría */
  private async buildLibraryMessage(): Promise<string> {
    const docs = await this.documentRepo.getMostRecentDocuments(50);

    if (!docs || docs.length === 0) {
      return `📚 Tu biblioteca está vacía.\n\nSubí un PDF desde el chat para empezar a construirla.`;
    }

    // Agrupar por categoría
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
        const chunks = (doc as any)._count?.chunks ?? '?';
        const used   = (doc as any).timesUsed > 0 ? ` · usado ${(doc as any).timesUsed}x` : '';
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

  /**
   * Detecta si el usuario pide un resumen de un documento específico.
   * Patrones soportados:
   *   - "resumen de 'Manual de Plantas Medicinales'"
   *   - "resumen del libro 'TypeScript Handbook'"
   *   - "puntos clave de 'Guía de NestJS'"
   *   - "dame los 10 items de 'nombre del libro'"
   *   - "dame 5 puntos del documento 'título'"
   *   - "lo más importante de 'nombre'"
   */
  private extractDocumentSummaryRequest(
    message: string,
  ): { title: string; maxItems: number } | null {
    const trimmed = message.trim();

    // Normalizar quitando tildes para mejor matching
    const normalized = trimmed.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // Palabras que NO deben iniciar un título (son preposiciones / artículos / comandos genéricos)
    const GENERIC_STARTERS = /^(?:sobre|acerca|los|las|un|una|el|la|mis|tus|sus|lo|al|del|por|en|para|con|sin|entre|que|cuando|como|donde|quien|cual|todo|toda|todos|todas|algo|nada|mucho|poco|muy|mas|menos|mejor|peor|nuevo|viejo|gran|grande|pequeño)\b/i;

    // Extraer número de items si se especifica ("dame los 10 puntos", "5 items")
    const numMatch = normalized.match(/\b(\d+)\s*(puntos?|items?|temas?|cosas?|ideas?)\b/);
    const maxItems = numMatch ? Math.min(Math.max(parseInt(numMatch[1], 10), 3), 15) : 10;

    // ── Patrón 1: título entre comillas simples o dobles ──────────────────────
    //   "resumen de 'Manual de Plantas'"
    //   "puntos clave de \"TypeScript Handbook\""
    const quotedMatch = trimmed.match(
      /(?:resumen|puntos\s*clave|items?\s*(?:mas|más)?\s*(?:relevantes?|importantes?)?|lo\s*(?:mas|más)?\s*importante|dame\s*(?:los?|un(?:os?)?)\s*(?:\d+\s*)?(?:puntos?|items?|resumenes?|aspectos?))[\s\S]*?['""]([^'""]{3,})['""]?/i,
    );
    if (quotedMatch?.[1]?.trim()) {
      return { title: quotedMatch[1].trim(), maxItems };
    }

    // ── Patrón 2: "resumen del libro/pdf/documento <título>" ─────────────────
    //   "resumen del libro Manual de Plantas Medicinales"
    const docTypeMatch = trimmed.match(
      /(?:resumen|puntos\s*clave|dame\s*(?:los?|un(?:os?)?)\s*(?:\d+\s*)?(?:puntos?|items?))\s*(?:de(?:l)?\s*(?:libro|pdf|documento|doc|archivo))\s+([A-ZÁÉÍÓÚÑ][\w\s\-\.]{3,80})/i,
    );
    if (docTypeMatch?.[1]?.trim()) {
      return { title: docTypeMatch[1].trim(), maxItems };
    }

    // ── Patrón 3: "resumen de/del/sobre <título>" (con preposición explícita) ─
    //   "resumen de Manual de Plantas Medicinales"
    const withPrepMatch = trimmed.match(
      /^(?:resumen|puntos\s*clave|lo\s*(?:mas|más)?\s*importante)\s+(?:de(?:l)?|sobre)\s+(.{3,80})/i,
    );
    if (withPrepMatch?.[1]?.trim()) {
      const title = withPrepMatch[1].trim();
      if (!GENERIC_STARTERS.test(title)) {
        return { title, maxItems };
      }
    }

    // ── Patrón 4: "resumen <título>" SIN preposición ──────────────────────────
    //   "Resumen Carta astral Ignacio Gabriel Fernández"
    //   "resumen Manual de Plantas Medicinales"
    // EXCLUYE: "resumen sobre ...", "resumen de ...", "resumeme ...", etc.
    const directMatch = trimmed.match(
      /^resumen\s+(?!(?:de(?:l)?|sobre|los|las|un|una|el|la|mis|tus|sus|me|nos|les|le|ya|si|no|por|en|para|con|sin|que)\s)(.{4,80})/i,
    );
    if (directMatch?.[1]?.trim()) {
      const title = directMatch[1].trim();
      const words = title.split(/\s+/);
      // Al menos 2 palabras y no un tema genérico de una sola palabra
      if (words.length >= 2) {
        return { title, maxItems };
      }
    }

    // ── Patrón 5: mensaje completo == título del documento ────────────────────
    // El usuario escribe exactamente el título guardado en la DB sin comandos
    // Condiciones: 2-10 palabras, al menos una con mayúscula, no empieza con verbo de comando
    const COMMAND_STARTERS = /^(?:busca|buscame|buscá|dame|dime|mostrame|muestra|explica|explicame|describe|describime|analiza|que dice|que dicen|qué dice|qué dicen|cuanto|cuánto|cuando|cuándo|donde|dónde|como|cómo|por qué|porque|cual|cuál|tiene|hay|existe)\b/i;
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount >= 2 && wordCount <= 10 && !COMMAND_STARTERS.test(trimmed)) {
      // Tiene alguna mayúscula (indica nombre propio / título)
      const hasUpperCase = /[A-ZÁÉÍÓÚÑ]/.test(trimmed);
      // No empieza con minúscula genérica (ej: "plantas medicinales")
      const startsWithUpper = /^[A-ZÁÉÍÓÚÑ\d]/.test(trimmed);
      if (hasUpperCase && startsWithUpper && !GENERIC_STARTERS.test(trimmed)) {
        return { title: trimmed, maxItems };
      }
    }

    return null;
  }


  /**
   * Genera y formatea el mensaje de respuesta con el resumen de un documento.
   */
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // NotFoundException (documento no encontrado) → mensaje amigable
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
      this.logger.error(`[document-summary] error: ${msg}`);
      return `⚠️ No pude generar el resumen en este momento. Intentá de nuevo.`;
    }
  }

  async findRelevantSkills(query: string) {
    return this.skillRegistry.findRelevant(query, 5);
  }

  async listTools() {
    return this.toolRegistry.getEnabledTools();
  }

  // ── Session Summary ─────────────────────────────────────────────────────────

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
    } catch (error) {
      this.logger.warn(`No se pudo generar resumen: ${error.message}`);
    }
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

  /**
   * Detecta si el usuario está pidiendo un resumen por categoría y extrae la categoría.
   * Ejemplos:
   * - "resumen sobre plantas medicinales" → plantas_medicinales
   * - "qué dicen mis documentos de medicina" → medicina
   * - "información sobre desarrollo" → desarrollo
   * - "tenemos información en documentos sobre tecnología?" → tecnologia
   * - "hay algo de agricultura en mis PDFs?" → agricultura
   */
  private detectCategorySummaryRequest(message: string): { isRequest: boolean; category?: string; query?: string } {
    const normalized = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Patrones para detectar resumen por categoría
    const patterns = [
      // "resumen sobre X", "información sobre X"
      /(?:resumen|resumir|resumime|que dice|que dicen|informacion|info)\s+(?:sobre|de|acerca de)\s+([a-z_\s]+)/i,
      
      // "documentos sobre X", "PDFs de X"
      /(?:documentos?|pdfs?|archivos?)\s+(?:sobre|de|acerca de)\s+([a-z_\s]+)/i,
      
      // "busca en X", "mostrame de X"
      /(?:busca|buscar|mostrame|muestra)\s+(?:en|de)\s+([a-z_\s]+)/i,
      
      // "tenemos/hay/existe información EN documentos SOBRE X"
      /(?:tenemos|hay|existe|tenes)\s+(?:algo|informacion|info|datos?|contenido)?\s*(?:en|de)?\s*(?:mis|los|tus)?\s*(?:documentos?|pdfs?|archivos?|biblioteca)?\s+(?:sobre|de|acerca de|en)\s+([a-z_\s]+)/i,
      
      // "mis documentos de X", "en mis PDFs de X"
      /(?:mis|los|tus)\s+(?:documentos?|pdfs?|archivos?)\s+(?:de|sobre)\s+([a-z_\s]+)/i,
      
      // "que tengo sobre X", "que hay de X"
      /(?:que|cual)\s+(?:tengo|hay|existe|tenes|tenemos)\s+(?:sobre|de|acerca de)\s+([a-z_\s]+)/i,
      
      // "según mis documentos de X"
      /(?:segun|en base a)\s+(?:mis|los)?\s*(?:documentos?|pdfs?)\s+(?:de|sobre)\s+([a-z_\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        let categoryRaw = match[1].trim();
        
        // Remover palabras comunes al final que no son parte de la categoría
        categoryRaw = categoryRaw
          .replace(/\s+(en|de|sobre|con|sin|para|por|como|que|cual|donde|cuando|porque).*$/i, '')
          .trim();
        
        // Normalizar la categoría detectada
        const category = categoryRaw
          .replace(/\s+/g, '_')
          .replace(/[^a-z_]/g, '');

        // Validar que la categoría no sea demasiado corta o una palabra común
        if (category.length < 3 || ['mis', 'los', 'tus', 'una', 'ese', 'esto', 'eso'].includes(category)) {
          continue;
        }

        // Extraer query específica si existe (ej: "resumen de plantas medicinales sobre propiedades")
        const queryMatch = message.match(/(?:sobre|de|con)\s+([a-z\s]+)$/i);
        const query = queryMatch && queryMatch[1].length > 3 ? queryMatch[1].trim() : undefined;

        this.logger.log(`[category-detection] detectado: "${category}" de mensaje: "${message.slice(0, 60)}..."`);
        return { isRequest: true, category, query };
      }
    }

    return { isRequest: false };
  }

  /**
   * Detecta si el usuario está pidiendo un resumen de un documento específico.
   * Ejemplos:
   * - "resumen de 'Manual de Plantas Medicinales'"
   * - "resumen del documento TypeScript Handbook"
   * - "dame los 10 puntos clave de 'Guía de NestJS'"
   * - "puntos clave del PDF sobre agricultura"
   */
  private detectDocumentSummaryRequest(message: string): { isRequest: boolean; title?: string; maxKeyPoints?: number } {
    // Reutilizar la misma lógica robusta de extractDocumentSummaryRequest
    const extracted = this.extractDocumentSummaryRequest(message);
    if (extracted) {
      return { isRequest: true, title: extracted.title, maxKeyPoints: extracted.maxItems };
    }
    return { isRequest: false };
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
}

