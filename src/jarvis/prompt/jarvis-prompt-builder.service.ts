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
      '- Ciudad capital de Entre Ríos, founded el 25 de junio de 1813',
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

    // ── Local JSON Knowledge lookup ──────────────────────────────────────────
    const localKnowledgeCtx = await this.jarvisKnowledge.extractRelevantContext(userMessage);
    if (localKnowledgeCtx) {
      contextParts.push(localKnowledgeCtx);
    }
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
      if (prefetchedRagContext) {
        usedDocs = true;
        contextParts.push(prefetchedRagContext);
      } else {
        const docSummary = await this.detectDocumentSummaryRequest(userMessage);
        
        if (docSummary.isRequest && docSummary.title) {
          this.logger.log(`[rag:document] detectado resumen de documento: "${docSummary.title}"`);
          
          try {
            const result = await this.documentSummaryService.generateDocumentSummary(
              docSummary.title,
              docSummary.maxKeyPoints,
            );

            usedDocs = true;
            
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
          } catch (err: any) {
            this.logger.warn(`[rag:document] error al generar resumen: ${err.message}`);
            contextParts.push(`### DOCUMENTOS\n${err.message}`);
          }
        } else {
          const categorySummary = this.detectCategorySummaryRequest(userMessage);
          
          if (categorySummary.isRequest && categorySummary.category) {
            this.logger.log(`[rag:category] detectado resumen por categoría: "${categorySummary.category}"`);
            
            try {
              const result = await this.categorySummaryService.generateCategorySummary(
                categorySummary.category,
                categorySummary.query,
              );

              if (result.chunksUsed > 0) {
                usedDocs = true;
                contextParts.push(`### RESUMEN DE DOCUMENTOS (${result.category})\n${result.summary}\n\n*Basado en ${result.documentsUsed} documento(s): ${result.documentTitles.join(', ')}*`);
              } else {
                contextParts.push(`### DOCUMENTOS\n${result.summary}`);
              }
            } catch (err: any) {
              this.logger.warn(`[rag:category] error al generar resumen: ${err.message}`);
            }
          }
          
          if (!categorySummary.isRequest) {
            let chunks = [] as any[];
            try {
              const queryEmbedding = await this.embeddingsService.generateEmbedding(userMessage);
              chunks = await this.documentRepo.searchChunksSemantic(queryEmbedding, 3);
            } catch (err: any) {
              this.logger.warn(`[rag:semantic] Fallback a búsqueda textual: ${err.message}`);
              chunks = await this.documentRepo.searchChunks(userMessage, 3);
            }
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
    }

    if (browserContext) {
      contextParts.push(`### CONTENIDO WEB EXTRAÍDO EN TIEMPO REAL\n${browserContext}`);
    }

    const summary = await this.sessionSummaryRepo.get(sessionId);
    if (summary) {
      contextParts.push(`### RESUMEN DE CONVERSACIÓN\n${summary.summary}`);
    } else {
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

  // ── Helper parsers ────────────────────────────────────────────────────────

  private async detectDocumentSummaryRequest(message: string): Promise<{ isRequest: boolean; title?: string; maxKeyPoints?: number }> {
    const extracted = await this.extractDocumentSummaryRequest(message);
    if (extracted) {
      return { isRequest: true, title: extracted.title, maxKeyPoints: extracted.maxItems };
    }
    return { isRequest: false };
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

  private detectCategorySummaryRequest(message: string): { isRequest: boolean; category?: string; query?: string } {
    const normalized = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
          .replace(/\s+(en|de|sobre|con|sin|para|por|como|que|cual|donde|cuando|porque).*$/i, '')
          .trim();
        
        const category = categoryRaw
          .replace(/\s+/g, '_')
          .replace(/[^a-z_]/g, '');

        if (category.length < 3 || ['mis', 'los', 'tus', 'una', 'ese', 'esto', 'eso'].includes(category)) {
          continue;
        }

        const queryMatch = message.match(/(?:sobre|de|con)\s+([a-z\s]+)$/i);
        const query = queryMatch && queryMatch[1].length > 3 ? queryMatch[1].trim() : undefined;

        return { isRequest: true, category, query };
      }
    }

    return { isRequest: false };
  }
}
