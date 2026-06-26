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
import { WebHelper } from './tools/web/web-helper';
import { SourceRegistry } from './tools/web/source-registry';
import { randomUUID } from 'crypto';
import { GoogleCalendarService } from './tools/google/google-calendar.service';
import { GoogleTasksService } from './tools/google/google-tasks.service';
import { AstrologyTool } from './tools/astrology/astrology-tool.service';
import { MemoryExtractorService } from './memory/memory-extractor.service';
import { InvestigationService } from './tools/web/investigation.service';
import { TaskReminderService } from './tools/tasks/task-reminder.service';

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
    @Inject(OllamaProvider) private readonly ollamaProvider: ILLMProvider,
    @Inject(OpenRouterProvider) private readonly openRouterProvider: ILLMProvider,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly googleTasks: GoogleTasksService,
    private readonly astrologyTool: AstrologyTool,
    private readonly investigationService: InvestigationService,
    private readonly taskReminderService: TaskReminderService,
    private readonly memoryExtractor: MemoryExtractorService,
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
        
        // Fallback a web general si falla
        this.logger.log(`[jarvis] SITE_SEARCH vacío → fallback WEB`);
        intent.intent = 'WEB';
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
        return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime);
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
          this.logger.log(`[jarvis] noticias sin resultados → último intento directo a El Once`);
          try {
            const directCtx = await WebHelper.scrapeUrl('https://www.elonce.com');
            if (directCtx && directCtx.length > 200) {
              toolsUsed.push('direct_elonce');
              return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, directCtx);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`[jarvis] El Once directo falló: ${msg}`);
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

        // Para otras categorías sin resultados → LLM con conocimiento propio
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
      const chunks = await this.documentRepo.searchChunks(userMessage, 3);
      if (chunks.length > 0) {
        usedDocs = true;
        const docText = chunks
          .map((c) => `[${(c as any).document?.title || 'Doc'}]\n${c.content}`)
          .join('\n---\n');
        contextParts.push(`### DOCUMENTOS\n${docText}`);
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
    if (usedDocs)   toolsUsed.push('rag');

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
        { role: 'user',   content: userPrompt },
      ],
    });

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
            { role: 'user',   content: up2 },
          ],
        });
        // Persistir la segunda respuesta (mejorada)
        await this.saveAndObserve(sessionId, userMessage, response2.content, toolsUsed, response2, startTime);
        return response2.content;
      }
    }

    await this.saveAndObserve(sessionId, userMessage, response.content, toolsUsed, response, startTime);
    return response.content;
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
    const profile   = await this.userProfileRepo.getOrCreate();
    const identity  = this.jarvisIdentity.getIdentity();
    const now       = new Date();
    const dateStr   = now.toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr   = now.toLocaleTimeString('es-AR', {
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
        { role: 'user',   content: userPrompt },
      ],
    });

    await this.saveAndObserve(sessionId, userMessage, response.content, toolsUsed, response, startTime);
    return response.content;
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
    const webHelperResult  = WebHelper.search(enrichedQuery, category, true);
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
      SPORTS:           'deportes',
      LOCAL_NEWS:       'noticias',
      NATIONAL_NEWS:    'noticias',
      POLITICS:         'noticias',
      AI:               'ia',
      AI_PAPERS:        'academic_ai',
      PROGRAMMING:      'tecnologia',
      DEVELOPMENT:      'desarrollo',
      SCIENCE:          'ciencia',
      TECHNOLOGY:       'tecnologia',
      MUSIC:            'musica',
      MOVIES_TV:        'entretenimiento',
      MYSTERY:          'misterios',
      ECONOMY:          'noticias',
      GOVERNMENT_LOCAL: 'gobierno',
      REFERENCE:        'referencia',
      PLANTS:           'referencia',
      MATH:             'academic_math',
      PHYSICS:          'academic_physics',
      ASTRONOMY:        'academic_astronomy',
      WEB_DOCS:         'academic_dev',
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
    const mentionsParana   = /parana|entre rios|litoral/.test(n);
    const mentionsArgentina = /argentin/.test(n);

    // Para noticias: construir query limpia si es genérica o enriquecerla si es específica
    if (category === 'noticias') {
      const isGeneric = /^(noticias?|novedades?|actualidad|que paso|que hay de nuevo|noticias de hoy|ultimas noticias)[\s?¿!¡.]*$/i.test(n.trim());
      if (isGeneric) {
        const localidad = mentionsParana   ? 'Paraná Entre Ríos'
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
    const now   = new Date();
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
   */
  private async executeSiteSearch(site: string, query: string): Promise<string | null> {
    const siteQuery = `site:${site} ${query}`;
    this.logger.log(`[jarvis:site_search] Buscando en sitio específico: "${siteQuery}"`);

    // 1. Intentar buscar en el caché primero para evitar DDG throttling y mejorar velocidad
    try {
      const source = SourceRegistry.getAll().find(s => s.urlBase.includes(site));
      const category = source?.category ?? 'noticias';

      const cachePromise = this.contentCache.fetchRelevantContent(siteQuery, category, 2);
      const cacheTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('cache timeout 15s')), 15_000),
      );
      const cached = await Promise.race([cachePromise, cacheTimeout]);

      if (cached && cached.length > 0) {
        const fromCacheCount = cached.filter((r) => r.fromCache).length;
        this.logger.log(
          `[jarvis:site_search] ${cached.length} resultados desde caché (${fromCacheCount} cache hit)`,
        );

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
      this.logger.warn(`[jarvis:site_search] error en caché: ${msg} → fallback a WebHelper`);
    }

    // 2. Fallback: WebHelper con timeout de 25s
    const webHelperTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000));
    const webHelperResult = WebHelper.search(siteQuery, undefined, true);
    const result = await Promise.race([webHelperResult, webHelperTimeout]);

    if (result) {
      this.logger.log(`[jarvis:site_search] OK WebHelper (${result.length} chars)`);
      return result;
    }

    return null;
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
