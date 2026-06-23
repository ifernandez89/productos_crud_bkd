import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type IntentType =
  | 'LOCAL'      // El LLM puede responder con su conocimiento base
  | 'WEB'        // Requiere búsqueda web (DuckDuckGo → API → Playwright)
  | 'URL'        // El usuario pegó una URL para scrapear
  | 'RAG'        // Buscar en documentos/biblioteca local
  | 'TOOL'       // Tool directa (clima, matemáticas, economía, etc.)
  | 'SPORTS'     // Partido, goles, resultado — va a API deportiva primero
  | 'REPEAT';    // Repetir última respuesta

export interface IntentResult {
  intent: IntentType;
  confidence: 'high' | 'medium' | 'low';
  reason: string;       // para logging
  urls?: string[];      // si intent === 'URL'
  sportsQuery?: string; // si intent === 'SPORTS', la query limpia
}

// ── Servicio ──────────────────────────────────────────────────────────────────

@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  // Ollama URL para clasificación rápida (llamada directa, sin LangChain overhead)
  private readonly OLLAMA_URL = 'http://localhost:11434/api/generate';
  private readonly CLASSIFIER_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2:3b';

  // ── API pública ─────────────────────────────────────────────────────────────

  async classify(message: string): Promise<IntentResult> {
    // 1. Reglas determinísticas de alta confianza (instantáneas, sin LLM)
    const fastResult = this.fastClassify(message);

    // Si la confianza es high O medium → no gastar tiempo en el LLM
    if (fastResult.confidence === 'high' || fastResult.confidence === 'medium') {
      this.logger.log(`[intent:fast] ${fastResult.intent} (${fastResult.confidence}) — "${message.slice(0, 60)}"`);
      return fastResult;
    }

    // 2. Clasificador LLM solo para casos de baja confianza
    try {
      const llmResult = await this.llmClassify(message);
      this.logger.log(`[intent:llm] ${llmResult.intent} — "${message.slice(0, 60)}"`);
      return llmResult;
    } catch {
      this.logger.warn(`[intent] LLM no disponible, usando fast classify`);
      // Si fast dice LOCAL con low confidence, escalar a WEB como fallback seguro
      return { ...fastResult, intent: 'WEB', reason: 'LLM unavailable → WEB fallback' };
    }
  }

  // ── Clasificación rápida (reglas) ────────────────────────────────────────────

  private fastClassify(message: string): IntentResult {
    const n = this.normalize(message);
    const urls = this.extractUrls(message);

    // REPEAT — alta confianza
    if (/\b(repeti|repetí|repetir|repite|dilo de nuevo|decilo de nuevo|voz alta)\b/i.test(n)) {
      return { intent: 'REPEAT', confidence: 'high', reason: 'repeat keyword' };
    }

    // URL — alta confianza
    if (urls.length > 0) {
      return { intent: 'URL', confidence: 'high', reason: 'URL detectada', urls };
    }

    // SPORTS — alta confianza (verificar ANTES que TOOL para evitar conflictos con "hora")
    const sportsPattern = /(partido|goles?|resultado|score|marcador|gan[oó]|perdi[oó]|empat[oó]|clasific[oó]|eliminad|jugaron|jug[oó]|copa|mundial|champions|liga|fixture|tabla|posiciones|pr[oó]ximo partido|siguiente partido)/i;
    const timePattern   = /(hoy|ayer|esta semana|anoche|reciente|ultimo partido|ultimo juego|en el partido|proximo|siguiente|cuando juega|cuando es el)/i;
    if (sportsPattern.test(n) || (timePattern.test(n) && /(seleccion|argentina|equipo|futbol)/i.test(n))) {
      const sportsQuery = this.extractSportsQuery(message);
      // Si hay señal temporal O menciona equipos → alta confianza
      // "cuando es el proximo partido de argentina" → SPORTS, no TOOL(hora)
      return {
        intent: 'SPORTS',
        confidence: 'high',
        reason: 'sports keyword' + (timePattern.test(n) ? ' + time signal' : ''),
        sportsQuery,
      };
    }

    // TOOL directa — alta confianza (clima, math, economía, calendarios)
    // NOTA: esto va DESPUÉS de SPORTS para evitar que "hora del partido" se clasifique como TOOL
    if (/(clima|temperatura|tiempo en|pronostico|lluvia|hace calor|hace frio)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'weather tool' };
    }
    if (/(dolar|cotizacion del dolar|riesgo pais|inflacion|blue)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'economy tool' };
    }
    if (/(\d+\s*[\+\-\*\/\^]\s*\d|raiz cuadrada|logaritmo|calcula |integral |derivada )/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'math tool' };
    }
    if (/(luna|fase lunar|eclipse|solsticio|amanecer|atardecer)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'astronomy tool' };
    }
    if (/(feriado|asueto|dia no laborable)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'holiday tool' };
    }
    // Hora: solo si NO es contexto deportivo
    if (/(que hora|hora actual|hora en|zona horaria)/i.test(n) && !/(partido|juego|match)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'time tool' };
    }
    if (/(calendario maya|tzolkin|haab|calendario hebreo|fecha hebrea)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'calendar tool' };
    }

    // RAG — alta confianza (buscar en mis documentos)
    if (/(busca en mis|busca en los pdfs|en mi biblioteca|en mis documentos|en mis notas|segun mis archivos)/i.test(n)) {
      return { intent: 'RAG', confidence: 'high', reason: 'explicit RAG request' };
    }

    // LOCAL — alta confianza (conversación trivial, identidad del asistente)
    const trivialPattern = /^(hola|buenas|gracias|de nada|ok|dale|si|no|perfecto|genial|excelente|entendido|claro|listo|ciao|chau|adios)[\s!?.]*$/i;
    if (trivialPattern.test(n.trim())) {
      return { intent: 'LOCAL', confidence: 'high', reason: 'trivial greeting' };
    }
    if (/(quien eres|como te llamas|que eres|que podes hacer|sos un bot|eres un bot)/i.test(n)) {
      return { intent: 'LOCAL', confidence: 'high', reason: 'identity question' };
    }
    if (/^(recorda|guarda|anota|mi nombre es|me llamo|prefiero que)/i.test(n)) {
      return { intent: 'LOCAL', confidence: 'high', reason: 'memory command' };
    }

    // WEB — señales claras pero no definitivas
    if (/(noticias|noticia|ultima hora|novedades|hoy|ayer|esta semana|precio de|cotizacion|cuando es|donde queda)/i.test(n)) {
      return { intent: 'WEB', confidence: 'medium', reason: 'web signal keyword' };
    }

    // Dudoso → LLM va a clasificar
    return { intent: 'LOCAL', confidence: 'low', reason: 'uncertain — needs LLM classification' };
  }

  // ── Clasificación LLM ────────────────────────────────────────────────────────

  private async llmClassify(message: string): Promise<IntentResult> {
    const prompt = `Clasificá la siguiente pregunta en UNA de estas categorías:
- LOCAL: el asistente puede responder con su conocimiento base (conceptos, definiciones, código, conversación)
- WEB: requiere información actualizada de internet (noticias, eventos recientes, precios actuales)
- SPORTS: es sobre un partido, resultado, goles o evento deportivo reciente
- RAG: el usuario quiere buscar en sus propios documentos/archivos/PDFs
- TOOL: requiere una herramienta específica (clima, calculadora, hora, economía)

Respondé SOLO con la palabra de la categoría. Sin explicaciones.

Pregunta: "${message}"
Categoría:`;

    const response = await axios.post(
      this.OLLAMA_URL,
      {
        model: this.CLASSIFIER_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0, num_predict: 5 }, // mínimo tokens — solo necesita 1 palabra
      },
      { timeout: 8_000 },
    );

    const raw: string = (response.data?.response ?? '').trim().toUpperCase();

    // Mapear respuesta del LLM a IntentType
    const validIntents: IntentType[] = ['LOCAL', 'WEB', 'SPORTS', 'RAG', 'TOOL'];
    const matched = validIntents.find((i) => raw.startsWith(i));

    return {
      intent: matched ?? 'WEB', // si el LLM alucina, WEB es el fallback más útil
      confidence: matched ? 'high' : 'low',
      reason: `LLM classified as: ${raw}`,
    };
  }

  // ── Utilidades ───────────────────────────────────────────────────────────────

  extractUrls(message: string): string[] {
    const regex = /https?:\/\/[^\s<>"')\]]+/gi;
    const matches = message.match(regex) ?? [];
    return [...new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, '')))];
  }

  private extractSportsQuery(message: string): string {
    // Normalizar la query para búsqueda deportiva
    return message
      .replace(/[?¿!¡]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalize(input: string): string {
    return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
}
