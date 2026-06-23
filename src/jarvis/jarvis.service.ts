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
import { randomUUID } from 'crypto';
import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';

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
        // Sin datos en ninguna fuente → búsqueda web general
        this.logger.log(`[intent] sports vacío → fallback WEB`);
        const webCtx = await this.autoWebSearch(userMessage);
        if (webCtx) {
          toolsUsed.push('auto_search');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx);
        }
        return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime);
      }

      // ── WEB — DuckDuckGo → Google ─────────────────────────────────────────
      if (intent.intent === 'WEB') {
        const webCtx = await this.autoWebSearch(userMessage);
        if (webCtx) {
          toolsUsed.push('auto_search');
          return await this.respondWithLLM(userMessage, sessionId, providerName, provider, toolsUsed, startTime, webCtx);
        }
        // Sin resultados → LLM solo
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
      'Reglas:',
      '1. Responder siempre en español argentino, de forma clara y natural.',
      '2. Usar el contexto provisto (memoria, documentos, web) para fundamentar la respuesta.',
      '3. No inventar datos. Si no tenés la info, decilo claramente.',
      browserContext
        ? '4. Cuando tenés contenido web extraído, respondé específicamente lo que el usuario preguntó usando ese contenido. No resumás todo — enfocate en la pregunta.'
        : '4. Responder en máximo 3 oraciones salvo que se pidan detalles.',
      '5. Si el usuario pide un resumen, usá viñetas o párrafos cortos según corresponda.',
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

    // Cuando hay contexto web, el systemPrompt prohíbe explícitamente
    // decir "no tengo acceso" — esos datos YA están en el prompt
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

    await this.conversationRepo.create({
      sessionId,
      role: 'assistant',
      content: response.content,
      metadata: { source: 'llm', model: response.model, provider: response.provider, latencyMs: response.latencyMs },
    });

    await this.agentRunRepo.create({
      sessionId,
      question: userMessage,
      answer: response.content,
      toolsUsed,
      modelUsed: response.model,
      provider: response.provider,
      durationMs: Date.now() - startTime,
      tokensUsed: response.tokensUsed,
      success: true,
    });

    await this.updateSessionSummaryIfNeeded(sessionId);
    return response.content;
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

    // Todo lo demás → buscar en internet
    return true;
  }

  /**
   * Búsqueda rápida usando DuckDuckGo Instant Answer API (sin Playwright, sin clave).
   * Fallback a Google con Playwright si DuckDuckGo no devuelve resultados útiles.
   */
  private async autoWebSearch(query: string): Promise<string | null> {
    // Intento 1: DuckDuckGo HTML scraping (rápido, ~1-2s)
    const ddgResult = await this.searchDuckDuckGo(query);
    if (ddgResult) {
      this.logger.log(`[jarvis:auto_search] DuckDuckGo OK para: "${query.slice(0, 60)}"`);
      return ddgResult;
    }

    // Intento 2: Google con Playwright (más lento pero más completo)
    this.logger.log(`[jarvis:auto_search] DuckDuckGo vacío → Google Playwright para: "${query.slice(0, 60)}"`);
    try {
      const results = await this.browserTool.search(query, 4);
      if (!results.length) return null;
      return results
        .map((r, i) => `**${i + 1}. ${r.title}**\n🔗 ${r.url}\n${r.snippet || ''}`)
        .join('\n\n');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[jarvis:auto_search] Google también falló: ${msg}`);
      return null;
    }
  }

  /**
   * Búsqueda en DuckDuckGo via HTML (sin API key, sin Playwright, ~1-2s).
   */
  private async searchDuckDuckGo(query: string): Promise<string | null> {
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encoded}&kl=ar-es`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'es-AR,es;q=0.9',
        },
        timeout: 6_000,   // reducido de 8s a 6s
        validateStatus: (s) => s < 400,
      });

      const $ = cheerioLoad(response.data as string);
      const results: Array<{ title: string; url: string; snippet: string }> = [];

      $('.result__body').each((_, el) => {
        if (results.length >= 4) return;
        const title   = $(el).find('.result__title a').text().trim();
        const href    = $(el).find('.result__url').text().trim();
        const snippet = $(el).find('.result__snippet').text().trim();
        if (title && href) {
          results.push({ title, url: href.startsWith('http') ? href : `https://${href}`, snippet });
        }
      });

      if (!results.length) {
        this.logger.warn(`[jarvis:ddg] sin resultados para: "${query.slice(0, 60)}"`);
        return null;
      }

      this.logger.log(`[jarvis:ddg] ${results.length} resultados`);
      return results
        .map((r, i) => `**${i + 1}. ${r.title}**\n🔗 ${r.url}\n${r.snippet}`)
        .join('\n\n');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[jarvis:ddg] error: ${msg}`);
      return null;
    }
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
