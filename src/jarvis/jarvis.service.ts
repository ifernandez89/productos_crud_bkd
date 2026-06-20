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
      // 1. Tools pre-LLM
      const toolAnswer = await this.assistantTools.resolve(userMessage);
      if (toolAnswer) {
        toolsUsed.push('direct_tool');
        await this.conversationRepo.create({
          sessionId,
          role: 'assistant',
          content: toolAnswer,
          metadata: { source: 'tool' },
        });
        await this.agentRunRepo.create({
          sessionId,
          question: userMessage,
          answer: toolAnswer,
          toolsUsed,
          modelUsed: 'none',
          provider: 'tool',
          durationMs: Date.now() - startTime,
          success: true,
        });
        return toolAnswer;
      }

      // 2. Construir contexto (memoria + RAG + historial)
      const { systemPrompt, userPrompt, usedMemory, usedDocs } =
        await this.buildJarvisContext(userMessage, sessionId, useMemory, useDocuments, maxHistoryMessages);

      if (usedMemory) toolsUsed.push('memory');
      if (usedDocs) toolsUsed.push('rag');

      // 3. Invocar LLM via provider intercambiable
      const response = await provider.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      // 4. Persistir respuesta
      await this.conversationRepo.create({
        sessionId,
        role: 'assistant',
        content: response.content,
        metadata: {
          source: 'llm',
          model: response.model,
          provider: response.provider,
          latencyMs: response.latencyMs,
          tokensUsed: response.tokensUsed,
        },
      });

      // 5. Observabilidad
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

      // 6. Resumen de sesión progresivo
      await this.updateSessionSummaryIfNeeded(sessionId);

      return response.content;
    } catch (error) {
      this.logger.error(`Error en Jarvis query: ${error.message}`);
      await this.agentRunRepo.create({
        sessionId,
        question: userMessage,
        toolsUsed,
        modelUsed: providerName,
        provider: providerName,
        durationMs: Date.now() - startTime,
        success: false,
        errorMsg: error.message,
      });
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
      '1. Usar un estilo claro, conciso y natural en español.',
      '2. Priorizar memoria, contexto y documentos cuando sean relevantes.',
      '3. No inventar datos. Si no sabés, decilo claramente.',
      '4. Responder en máximo 3 oraciones salvo que se pidan detalles.',
      '5. Usar herramientas o memoria solo cuando ayude a resolver la pregunta.',
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
        ? `${contextParts.join('\n\n')}\n\n### PREGUNTA ACTUAL\n${userMessage}`
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
}
