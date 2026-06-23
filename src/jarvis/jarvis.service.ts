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
import { SportsTool } from './tools/sports/sports-tool.service';
import { ContentCacheService } from './tools/web/content-cache.service';
import { WebHelper } from './tools/web/web-helper';
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
    private readonly sportsTool: SportsTool,
    private readonly contentCache: ContentCacheService,
    @Inject(OllamaProvider) private readonly ollamaProvider: ILLMProvider,
    @Inject(OpenRouterProvider) private readonly openRouterProvider: ILLMProvider,
  ) {
    this.providers = new Map([
      ['ollama', this.ollamaProvider],
      ['openrouter', this.openRouterProvider],
    ]);
  }

  // ── Query principal ─────────────────────────────────────────────────────────

  async query(userMessage: string, options: JarvisQueryOptions = {}): Promise<string> {
    const sessionId = options.sessionId || randomUUID();
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

    try {
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

      // ── WEB — cach\u00e9 inteligente → DuckDuckGo → Google ─────────────────────
      if (intent.intent === 'WEB') {
        // Intentar detectar categor\u00eda del query para usar cach\u00e9 optimizado
        const category = this.detectCategory(userMessage);
        const webCtx = await this.autoWebSearch(userMessage, category);
        if (webCtx) {
          toolsUsed.push('auto_search');
          if (category) toolsUsed.push(`cache:${category}`);
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx);
        }

        // Sin resultados web — si es una consulta de noticias/actualidad, NO dejar
        // que el LLM invente: devolver mensaje claro de fallo temporal
        if (category === 'noticias' || category === 'gobierno') {
          const failMsg = [
            `\u26a0\ufe0f No pude obtener las noticias actuales en este momento (problema temporal de conectividad con las fuentes).`,
            ``,
            `Pod\u00e9s consultarlas directamente en:`,
            `- \ud83d\udcf0 **El Once**: https://www.elonce.com`,
            `- \ud83d\udcf0 **UNO Entre R\u00edos**: https://www.unoentrerios.com.ar`,
            `- \ud83c\udfd7\ufe0f **Mi Paran\u00e1**: https://mi.parana.gob.ar`,
            ``,
            `Intent\u00e1 de nuevo en unos segundos, a veces las fuentes tardan en responder.`,
          ].join('\n');
          await this.conversationRepo.create({ sessionId, role: 'assistant', content: failMsg, metadata: { source: 'web_fail_graceful' } });
          await this.agentRunRepo.create({ sessionId, question: userMessage, answer: failMsg, toolsUsed: [...toolsUsed, 'web_fail'], modelUsed: 'none', provider: 'none', durationMs: Date.now() - startTime, success: false });
          return failMsg;
        }

        // Para otras categor\u00edas sin resultados → LLM con conocimiento propio
      }

      // ── LOCAL / RAG — memoria + documentos + historial + LLM ─────────────
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

    const userPrompt = contextParts.length > 0
        ? `${contextParts.join('\n\n')}\n\n### PREGUNTA ACTUAL\n${userMessage}${
            browserContext
              ? '\n\n⚠️ INSTRUCCIÓN: Respondé usando los datos de "CONTENIDO WEB EXTRAÍDO EN TIEMPO REAL" o "BÚSQUEDA WEB AUTOMÁTICA" que están arriba. No digas que no tenés información — los datos ya están en este prompt.'
              : ''
          }`
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
      await this.buildJarvisContext(userMessage, sessionId, true, true, 6, webContext);

    if (usedMemory) toolsUsed.push('memory');
    if (usedDocs)   toolsUsed.push('rag');

    const finalSystemPrompt = webContext
      ? systemPrompt
          .replace(
            '4. Responder en máximo 3 oraciones salvo que se pidan detalles.',
            '4. TENÉS datos reales en el contexto. Usálos para responder. NUNCA digas "no tengo acceso a información en tiempo real" — eso sería mentira si tenés datos en el contexto.',
          )
          .replace(
            '3. No inventar datos. Si no tenés la info, decilo claramente.',
            '3. Usá SOLO los datos del contexto. No inventés datos extra. Si los datos del contexto no son suficientes, decí específicamente qué falta.',
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
          await this.buildJarvisContext(userMessage, sessionId, false, false, 0, webCtx);
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
    if (/^(recorda|guardá|guarda|anotá|anota|mi nombre es|me llamo|prefiero|siempre)/i.test(n)) {
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
        const cached = await this.contentCache.fetchRelevantContent(enrichedQuery, category, 3);

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
    const result = await WebHelper.search(enrichedQuery, category, true);

    if (result) {
      this.logger.log(`[jarvis:auto_search] OK WebHelper (${result.length} chars)`);
      return result;
    }

    // 3. Último fallback: Playwright con query enriquecida
    this.logger.log(`[jarvis:auto_search] WebHelper vacío → Google Playwright`);
    try {
      const hits = await this.browserTool.search(enrichedQuery, 4);
      if (!hits.length) return null;
      return hits
        .map((r, i) => `**${i + 1}. ${r.title}**\n🔗 ${r.url}\n${r.snippet || ''}`)
        .join('\n\n');
    } catch {
      return null;
    }
  }

  /**
   * Enriquece la query con fecha/localidad para categorías que necesitan datos actuales.
   * Esto mejora significativamente los resultados de DuckDuckGo para noticias.
   */
  private enrichQueryForCategory(query: string, category?: string): string {
    if (!category) return query;

    const now   = new Date();
    const day   = now.getDate();
    const month = now.toLocaleDateString('es-AR', { month: 'long' });
    const year  = now.getFullYear();
    const today = `${day} de ${month} de ${year}`;

    const newsCategories = ['noticias', 'gobierno', 'deportes'];
    if (!newsCategories.includes(category)) return query;

    // Detectar localidad en la query original
    const n = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mentionsParana   = /parana|entre rios|litoral/.test(n);
    const mentionsArgentina = /argentin/.test(n);

    // Para noticias: construir query limpia en lugar de la pregunta completa
    // "resumen de noticias para Paran\u00e1 el d\u00eda de hoy" \u2192 "noticias Paran\u00e1 Entre R\u00edos 23 de junio de 2026"
    if (category === 'noticias') {
      const localidad = mentionsParana   ? 'Paran\u00e1 Entre R\u00edos'
                      : mentionsArgentina ? 'Argentina'
                      : '';
      return `noticias ${localidad} ${today}`.replace(/\s+/g, ' ').trim();
    }

    if (category === 'gobierno') {
      const localidad = mentionsParana ? 'Paran\u00e1 Entre R\u00edos' : 'Argentina';
      return `noticias gobierno ${localidad} ${today}`.trim();
    }

    // Deportes: conservar query original pero reemplazar "hoy" por fecha
    if (/\bhoy\b/i.test(query)) return query.replace(/\bhoy\b/gi, today);
    return `${query} ${today}`;
  }

  /**
   * Detecta la categoría de una pregunta para optimizar caché.
   * Esto acelera las consultas frecuentes usando fuentes priorizadas.
   */
  private detectCategory(message: string): string | undefined {
    const n = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

    // Tecnología & IA
    if (/(ia\b|inteligencia artificial|openai|chatgpt|llm|modelo|hugging|ollama|tecnologia|software|app\b)/i.test(n)) {
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

    // Películas
    if (/(pelicula|film|cine|actor|actriz|director|oscar|estreno|imdb|marvel|mcu)/i.test(n)) {
      return 'peliculas';
    }

    // Música
    if (/(musica|cancion|album|artista|concierto|festival|spotify|billboard)/i.test(n)) {
      return 'musica';
    }

    return undefined;
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
