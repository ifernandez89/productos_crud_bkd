import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ILLMProvider } from '../llm/llm-provider.interface';
import { OllamaProvider } from '../llm/ollama.provider';

export interface TopicSnapshot {
  topic: string;
  date: Date;
  conclusion: string;
  sessionId?: string;
  tags: string[];
}

export interface EvolutionEntry {
  date: string;
  summary: string;
  tags: string[];
}

export interface EvolutionReport {
  topic: string;
  firstMentioned: string;
  lastMentioned: string;
  totalMentions: number;
  evolution: EvolutionEntry[];
  narrative: string; // narración generada por el LLM
}

/**
 * KnowledgeEvolutionService — El diferencial real de JarBees.
 *
 * Responde preguntas como:
 * - "¿Cómo cambió mi opinión sobre Qwen en los últimos 6 meses?"
 * - "¿Cómo evolucionó mi backend?"
 * - "¿Qué aprendí sobre NestJS este año?"
 *
 * Eso no existe en ningún otro modelo.
 *
 * Flujo:
 * 1. Después de cada conversación importante, extractTopicSnapshot()
 *    detecta el tema, fecha, conclusión y tags → guarda en DB
 * 2. GET /jarbees/evolution?topic=X → getEvolution() reconstruye la
 *    historia completa del tema con narración del LLM
 */
@Injectable()
export class KnowledgeEvolutionService {
  private readonly logger = new Logger(KnowledgeEvolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OllamaProvider) private readonly llm: ILLMProvider,
  ) {}

  // ── Guardar snapshot de un tema ─────────────────────────────────────────────

  /**
   * Extrae el tema y conclusión de un intercambio y lo persiste.
   * Se llama en background — no bloquea la respuesta al usuario.
   *
   * @param userMessage    La pregunta del usuario
   * @param assistantReply La respuesta de JarBees
   * @param sessionId      UUID de la sesión
   */
  async extractAndSave(
    userMessage: string,
    assistantReply: string,
    sessionId?: string,
  ): Promise<void> {
    // No analizar mensajes triviales o muy cortos
    if (userMessage.trim().split(/\s+/).length < 5) return;
    if (!this.isSignificantExchange(userMessage, assistantReply)) return;

    try {
      const snapshot = await this.extractTopicSnapshot(
        userMessage,
        assistantReply,
      );
      if (!snapshot) return;

      await this.prisma.topicSnapshot.create({
        data: {
          topic: snapshot.topic,
          conclusion: snapshot.conclusion,
          tags: JSON.stringify(snapshot.tags),
          sessionId: sessionId,
        },
      });

      this.logger.log(
        `[evolution] snapshot guardado: "${snapshot.topic}" [${snapshot.tags.join(', ')}]`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[evolution] no se pudo guardar snapshot: ${msg}`);
    }
  }

  // ── Consultar evolución de un tema ──────────────────────────────────────────

  /**
   * Reconstruye la historia completa de cómo evolucionó un tema.
   * Ejemplo: getEvolution("Qwen") → narración de cómo cambió la opinión sobre Qwen
   */
  async getEvolution(
    topic: string,
    limitDays = 365,
  ): Promise<EvolutionReport | null> {
    const since = new Date();
    since.setDate(since.getDate() - limitDays);

    const snapshots = await this.prisma.topicSnapshot.findMany({
      where: {
        OR: [
          { topic: { contains: topic } },
          { tags: { contains: topic.toLowerCase() } },
          { conclusion: { contains: topic } },
        ],
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (snapshots.length === 0) {
      this.logger.log(
        `[evolution] sin snapshots para "${topic}" en los últimos ${limitDays} días`,
      );
      return null;
    }

    const evolution: EvolutionEntry[] = snapshots.map((s) => ({
      date: s.createdAt.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      summary: s.conclusion,
      tags: this.parseTags(s.tags),
    }));

    // Generar narración con el LLM
    const narrative = await this.generateNarrative(topic, evolution);

    return {
      topic,
      firstMentioned: evolution[0].date,
      lastMentioned: evolution[evolution.length - 1].date,
      totalMentions: snapshots.length,
      evolution,
      narrative,
    };
  }

  /**
   * Lista todos los temas registrados con su frecuencia.
   */
  async listTopics(): Promise<
    Array<{ topic: string; mentions: number; lastSeen: string }>
  > {
    const grouped = await this.prisma.topicSnapshot.groupBy({
      by: ['topic'],
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    });

    return grouped.map((g) => ({
      topic: g.topic,
      mentions: g._count.id,
      lastSeen: (g._max.createdAt ?? new Date()).toLocaleDateString('es-AR'),
    }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────

  private parseTags(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Determina si un intercambio vale la pena guardar.
   * Evita guardar saludos, preguntas triviales o respuestas muy cortas.
   */
  private isSignificantExchange(
    userMessage: string,
    assistantReply: string,
  ): boolean {
    if (assistantReply.split(/\s+/).length < 15) return false;
    const trivial =
      /^(hola|gracias|ok|dale|si|no|perfecto|buenas|chau|ciao|de nada)[!?.]*$/i;
    if (trivial.test(userMessage.trim())) return false;
    return true;
  }

  /**
   * Usa el LLM para extraer el tema principal y la conclusión del intercambio.
   */
  private async extractTopicSnapshot(
    userMessage: string,
    assistantReply: string,
  ): Promise<TopicSnapshot | null> {
    const prompt = `Analizá este intercambio y extraé la información en formato JSON.
Devolvé SOLO el JSON, sin markdown ni texto extra.

{
  "topic": "tema principal en 1-3 palabras (ej: 'Qwen', 'NestJS', 'arquitectura backend')",
  "conclusion": "conclusión o aprendizaje clave en 1-2 oraciones",
  "tags": ["tag1", "tag2", "tag3"]
}

Si no hay tema claro o es trivial, devolvé: {"topic": null}

Intercambio:
Usuario: ${userMessage.slice(0, 500)}
JarBees: ${assistantReply.slice(0, 500)}`;

    try {
      const response = await this.llm.generate({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 150,
      });

      const cleanJson = response.content
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(cleanJson);
      if (!parsed.topic) return null;

      return {
        topic: parsed.topic,
        date: new Date(),
        conclusion: parsed.conclusion || assistantReply.slice(0, 200),
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.map((t: string) => t.toLowerCase())
          : [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Genera una narración natural de la evolución de un tema.
   */
  private async generateNarrative(
    topic: string,
    evolution: EvolutionEntry[],
  ): Promise<string> {
    if (evolution.length === 1) {
      return `Solo hay un registro sobre "${topic}" del ${evolution[0].date}: ${evolution[0].summary}`;
    }

    const timeline = evolution
      .map((e) => `[${e.date}] ${e.summary}`)
      .join('\n');

    try {
      const response = await this.llm.generate({
        messages: [
          {
            role: 'system',
            content:
              'Sos JarBees. Narrás en primera persona (desde la perspectiva del usuario) ' +
              'cómo evolucionó su pensamiento sobre un tema. ' +
              'Usá un tono natural, como si le contaras a alguien cómo cambió su forma de ver algo. ' +
              'Respondé en español. Máximo 4 oraciones.',
          },
          {
            role: 'user',
            content: `Tema: "${topic}"\n\nTimeline de menciones:\n${timeline}\n\nNarrá la evolución.`,
          },
        ],
        temperature: 0.4,
        maxTokens: 300,
      });

      return response.content;
    } catch {
      // Fallback: descripción simple sin LLM
      return (
        `Desde ${evolution[0].date} hasta ${evolution[evolution.length - 1].date}, ` +
        `"${topic}" fue mencionado ${evolution.length} veces. ` +
        `Último registro: ${evolution[evolution.length - 1].summary}`
      );
    }
  }
}
