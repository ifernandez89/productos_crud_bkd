import { Injectable, Logger } from '@nestjs/common';
import { MemoryRepository } from '../repositories/memory.repository';

/**
 * MemoryExtractorService — Extrae hechos persistentes de la conversación
 * y los guarda automáticamente en el nivel de Memoria.
 *
 * Los tres niveles de JarBees:
 * 1. Historial   → ConversationMessage (todo lo que se dijo)
 * 2. Memoria     → Memory (hechos persistentes sobre el usuario) ← este servicio
 * 3. Knowledge   → ScrapedContent (lo obtenido por scraping/web)
 *
 * Extrae automáticamente tras cada turno de conversación.
 * Corre en background — no bloquea la respuesta al usuario.
 */
@Injectable()
export class MemoryExtractorService {
  private readonly logger = new Logger(MemoryExtractorService.name);

  // Patrones que indican hechos memorizables
  private readonly MEMORY_PATTERNS: Array<{
    regex: RegExp;
    category: string;
    importance: number;
    extract: (match: RegExpMatchArray) => string;
  }> = [
    // Identidad
    {
      regex: /(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i,
      category: 'fact',
      importance: 9,
      extract: (m) => `El usuario se llama ${m[1]}`,
    },
    // Profesión / trabajo
    {
      regex: /(?:trabajo(?:\s+(?:con|en|como))?|soy\s+(?:un\s+)?|trabajo\s+de)\s+(desarrollador|programador|ingeniero|diseñador|arquitecto|devops|fullstack|backend|frontend|data\s+scientist|[a-zA-Z]+\s+developer)/i,
      category: 'skill',
      importance: 8,
      extract: (m) => `El usuario trabaja como ${m[1]}`,
    },
    // Tecnologías
    {
      regex: /(?:uso|trabajo con|desarrollo en|programo en|estoy aprendiendo|me especializo en)\s+(NestJS|Next\.?js|React|Angular|Vue|TypeScript|JavaScript|Python|Java|Rust|Go|PostgreSQL|MongoDB|Redis|Docker|Kubernetes|GraphQL|Prisma|[A-Z][a-zA-Z]+)/,
      category: 'skill',
      importance: 7,
      extract: (m) => `El usuario usa/trabaja con ${m[1]}`,
    },
    // Preferencias explícitas
    {
      regex: /(?:prefiero|me gusta(?:\s+más)?|siempre|quiero que|necesito que)\s+(?:las?\s+)?respuestas?\s+(cortas?|largas?|concisas?|detalladas?|con\s+ejemplos?|en\s+viñetas?|con\s+código)/i,
      category: 'preference',
      importance: 9,
      extract: (m) => `El usuario prefiere respuestas ${m[1]}`,
    },
    // Ciudad / ubicación
    {
      regex: /(?:vivo en|soy de|estoy en|me encuentro en)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i,
      category: 'fact',
      importance: 8,
      extract: (m) => `El usuario vive en ${m[1]}`,
    },
    // Proyectos
    {
      regex: /(?:estoy (?:desarrollando|construyendo|trabajando en)|mi proyecto (?:es|se llama))\s+([A-ZÁÉÍÓÚÑ][a-zA-Z0-9\-áéíóúñ]+)/i,
      category: 'context',
      importance: 7,
      extract: (m) => `El usuario está desarrollando el proyecto ${m[1]}`,
    },
    // Intereses
    {
      regex: /(?:me interesa(?:n)?|me apasiona(?:n)?|soy fanático de|me encanta(?:n)?)\s+(?:la?\s+)?(astronomía|astrología|música|cine|deportes|fútbol|programación|inteligencia artificial|IA|[a-záéíóúñA-Z]+)/i,
      category: 'preference',
      importance: 6,
      extract: (m) => `Al usuario le interesa/apasiona ${m[1]}`,
    },
    // Comandos explícitos de memoria
    {
      regex: /^(?:recordá|guarda|anotá|memoriza)\s+que\s+(.+)/i,
      category: 'fact',
      importance: 8,
      extract: (m) => m[1].trim(),
    },
  ];

  constructor(private readonly memoryRepo: MemoryRepository) {}

  /**
   * Analiza el mensaje del usuario y extrae hechos persistentes.
   * Se llama de forma asíncrona — no bloquea la respuesta.
   *
   * @param userMessage  El mensaje del usuario
   * @param sessionId    Para logging (no se guarda en memoria)
   */
  async extractAndSave(userMessage: string, sessionId: string): Promise<void> {
    // No analizar mensajes muy cortos o triviales
    const words = userMessage.trim().split(/\s+/);
    if (words.length < 3) return;

    const extracted: Array<{ content: string; category: string; importance: number }> = [];

    for (const pattern of this.MEMORY_PATTERNS) {
      const match = userMessage.match(pattern.regex);
      if (match) {
        const content = pattern.extract(match);
        if (content && content.length > 5) {
          extracted.push({
            content,
            category: pattern.category,
            importance: pattern.importance,
          });
        }
      }
    }

    if (extracted.length === 0) return;

    // Guardar cada hecho extraído, evitando duplicados
    for (const fact of extracted) {
      try {
        // Buscar si ya existe algo similar para evitar duplicados
        const existing = await this.memoryRepo.search(fact.content, 3);
        const isDuplicate = existing.some((m) => {
          const similarity = this.roughSimilarity(m.content, fact.content);
          return similarity > 0.7;
        });

        if (!isDuplicate) {
          await this.memoryRepo.create({
            content: fact.content,
            category: fact.category,
            importance: fact.importance,
          });
          this.logger.log(
            `[memory:extract] guardado: "${fact.content}" [${fact.category}:${fact.importance}] (session: ${sessionId.slice(0, 8)})`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[memory:extract] error guardando "${fact.content}": ${msg}`);
      }
    }
  }

  /**
   * Calcula similitud aproximada entre dos strings (Jaccard sobre palabras).
   * No es semántica — es solo para evitar duplicados obvios.
   */
  private roughSimilarity(a: string, b: string): number {
    const setA = new Set(
      a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter((w) => w.length > 2),
    );
    const setB = new Set(
      b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter((w) => w.length > 2),
    );
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return intersection / union;
  }
}
