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
  | 'ASTROLOGY'  // Clima astrológico, posiciones planetarias — calculado en tiempo real
  | 'REPEAT'     // Repetir última respuesta
  | 'CALENDAR'   // Consultar o agendar en Google Calendar
  | 'TASKS'      // Consultar o agendar en Google Tasks
  | 'SITE_SEARCH'; // Búsqueda dirigida en un sitio específico (elonce, wikipedia, etc.)

export interface IntentResult {
  intent: IntentType;
  confidence: 'high' | 'medium' | 'low';
  reason: string;       // para logging
  urls?: string[];      // si intent === 'URL'
  sportsQuery?: string; // si intent === 'SPORTS', la query limpia
  siteSearch?: {
    site: string;       // dominio, ej. "elonce.com"
    query: string;      // búsqueda de texto
  };
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
    // Para mensajes largos (historial pegado), clasificar solo las primeras 200 chars
    const classifyText = message.length > 300 ? message.slice(0, 200) : message;

    // 1. Reglas determinísticas de alta confianza (instantáneas, sin LLM)
    const fastResult = this.fastClassify(message);

    // Logging de diagnóstico — visible en logs para detectar bugs de routing
    this.logger.log(
      JSON.stringify({
        query: message.slice(0, 80),
        detectedIntent: fastResult.intent,
        confidence: fastResult.confidence,
        reason: fastResult.reason,
      }),
    );

    // Si la confianza es high O medium → no gastar tiempo en el LLM
    if (fastResult.confidence === 'high' || fastResult.confidence === 'medium') {
      this.logger.log(`[intent:fast] ${fastResult.intent} (${fastResult.confidence}) — "${message.slice(0, 60)}"`);
      return fastResult;
    }

    // 2. Clasificador LLM solo para casos de baja confianza — usa texto truncado
    try {
      const llmResult = await this.llmClassify(classifyText);
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
    // Si el mensaje es muy largo (ej: el usuario pegó historial de conversación),
    // clasificar solo por las primeras 200 chars para evitar falsos positivos.
    // El historial anterior puede contener palabras de deportes, goles, etc. que
    // confunden el clasificador. La intención real siempre está al inicio.
    const classifyText = message.length > 300 ? message.slice(0, 200) : message;

    const n = this.normalize(classifyText);
    const urls = this.extractUrls(message); // URLs: buscar en el mensaje completo

    // SITE_SEARCH — alta confianza
    const siteSearch = this.extractSiteSearchFromText(classifyText);
    if (siteSearch) {
      return {
        intent: 'SITE_SEARCH',
        confidence: 'high',
        reason: `site search detected for: ${siteSearch.site}`,
        siteSearch,
      };
    }

    // REPEAT — alta confianza
    if (/\b(repeti|repetí|repetir|repite|dilo de nuevo|decilo de nuevo|voz alta)\b/i.test(n)) {
      return { intent: 'REPEAT', confidence: 'high', reason: 'repeat keyword' };
    }

    // CALENDAR — alta confianza
    if (/(calendario|agenda|reunion|citas|que tengo hoy|que tengo mañana|eventos de hoy|eventos proximos|agendar|agendame)/i.test(n)) {
      // Excluir si pregunta por "calendario maya/hebreo" que es una tool genérica
      if (!/(maya|tzolkin|haab|hebreo)/i.test(n)) {
        return { intent: 'CALENDAR', confidence: 'high', reason: 'calendar keyword' };
      }
    }

    // TASKS — alta confianza
    if (/(tareas pendientes|lista de tareas|tareas para hoy|recordame|recuerdame|anotar tarea|anota una tarea|mis pendientes)/i.test(n)) {
      return { intent: 'TASKS', confidence: 'high', reason: 'tasks keyword' };
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
    // ⚠️ Excluir "clima astrológico/zodiacal/lunar" → eso es ASTROLOGY calculado, no meteorología
    if (/(clima|temperatura|tiempo en|pronostico|lluvia|hace calor|hace frio)/i.test(n)
        && !/(astro|zodiac|lunar|horoscopo|signo|astrolog)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'weather tool' };
    }
    if (/(dolar|cotizacion del dolar|riesgo pais|inflacion|blue)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'economy tool' };
    }
    if (/(\d+\s*[\+\-\*\/\^]\s*\d|raiz cuadrada|logaritmo|calcula |integral |derivada )/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'math tool' };
    }
    // ⚠️ NOTA: luna/fase lunar ya NO van a TOOL — van a ASTROLOGY (ver bloque debajo)
    if (/(solsticio|amanecer|atardecer)/i.test(n)
        && !/(astro|zodiac|lunar|astrolog|signo)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'astronomy tool' };
    }
    if (/(eclipse solar|eclipse lunar)/i.test(n)
        && !/(carta|astrolog|horoscopo)/i.test(n)) {
      return { intent: 'TOOL', confidence: 'high', reason: 'eclipse tool' };
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

    // ── ASTROLOGY — DEBE ir ANTES del bloque WEB para que "hoy"/"esta noche" no sean capturados ──
    // ⚠️ CRÍTICO: el bloque WEB tiene "hoy", "ayer", "esta semana" → capturaría queries astrológicos
    //             si ASTROLOGY no va primero.

    // Palabras clave explícitas de astrología — alta confianza
    if (/(astrolog|horoscopo|carta astral|signo del zodiaco|retrogrado|aspectos astrologicos|transitos|revolucion solar)/i.test(n)) {
      return { intent: 'ASTROLOGY', confidence: 'high', reason: 'explicit astrology keyword' };
    }

    // Posiciones planetarias — alta confianza
    if (/(luna en |sol en |mercurio en |venus en |marte en |jupiter en |saturno en |posicion(es)? planet)/i.test(n)) {
      return { intent: 'ASTROLOGY', confidence: 'high', reason: 'planetary position query' };
    }

    // Energías y clima astrológico — alta confianza
    if (/(energia (del dia|lunar|astral|cosmica|de hoy|de esta noche|de esta semana)|clima astral|clima zodiac|energia espiritual)/i.test(n)) {
      return { intent: 'ASTROLOGY', confidence: 'high', reason: 'astrology energy query' };
    }

    // "qué dicen los astros", "qué hay en el cielo", "astrología para esta noche"
    if (/(que dicen los astros|que hay en el cielo|astros (de|para|esta)|astrologia para|que pasa (en el cielo|con los astros|con los planetas))/i.test(n)) {
      return { intent: 'ASTROLOGY', confidence: 'high', reason: 'astrology sky query' };
    }

    // Luna y fases — ASTROLOGY (NO meteorología)
    // ⚠️ Movido desde TOOL: luna/fase lunar son consultas astrológicas, no meteorológicas
    if (/(luna|fase lunar|luna llena|luna nueva|luna creciente|luna menguante|donde esta la luna|como esta la luna|que signo|que signo es|signo lunar)/i.test(n)
        && !/(clima|temperatura|lluvia|meteorolog|precipitacion)/i.test(n)) {
      return { intent: 'ASTROLOGY', confidence: 'high', reason: 'moon/astrology query' };
    }

    // Planetas en contexto astrológico (sin "clima" ni "meteorología")
    if (/(mercurio retrogrado|venus retrograda|marte retrogrado|planetas visibles|que planetas hay|signo del mes)/i.test(n)) {
      return { intent: 'ASTROLOGY', confidence: 'high', reason: 'astrology planet retrograde' };
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
- ASTROLOGY: es sobre astrología, horóscopo, posiciones planetarias, la luna, energías astrológicas
- SITE_SEARCH: es una búsqueda dirigida dentro de un sitio específico (ej. "buscar X en Y", "noticias de X en Y")

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
    const validIntents: IntentType[] = ['LOCAL', 'WEB', 'SPORTS', 'RAG', 'TOOL', 'ASTROLOGY', 'SITE_SEARCH'];
    const matched = validIntents.find((i) => raw.startsWith(i));

    if (matched === 'SITE_SEARCH') {
      const extracted = this.extractSiteSearchFromText(message);
      if (extracted) {
        return {
          intent: 'SITE_SEARCH',
          confidence: 'high',
          reason: `LLM classified as SITE_SEARCH & extracted: ${extracted.site}`,
          siteSearch: extracted,
        };
      }
      return {
        intent: 'WEB',
        confidence: 'medium',
        reason: 'LLM classified as SITE_SEARCH but could not extract details → WEB fallback',
      };
    }

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

  /**
   * Extrae los parámetros de búsqueda en un sitio específico si la query coincide.
   */
  private extractSiteSearchFromText(message: string): { site: string; query: string } | null {
    const n = this.normalize(message);
    const cleanN = n.replace(/[?¿!¡.]/g, '').trim();

    // 1. buscar/noticias de/sobre X en Y
    const pattern1 = /(?:noticias?|novedades?|info|informacion|que paso|buscar?|busca|encontrar?|encontra)\s+(?:de|sobre|con)?\s*(.+?)\s+\ben\s+([a-z0-9\s.-]+)$/i;
    
    // 2. que dice Y sobre X
    const pattern2 = /(?:que dice|que dicen|segun|buscar en)\s+([a-z0-9\s.-]+)\s+sobre\s+(.+)$/i;

    // 3. buscar en Y: X o buscar en Y X
    const pattern3 = /(?:buscar en|busca en)\s+([a-z0-9\s.-]+)(?::|\s+)\s*(.+)$/i;

    // 4. X en Y (cuando Y es un dominio conocido o alias conocido)
    const pattern4 = /(.+?)\s+\ben\s+([a-z0-9\s.-]+)$/i;

    let siteCandidate = '';
    let queryCandidate = '';
    let match = pattern1.exec(cleanN);

    if (match) {
      queryCandidate = match[1].trim();
      siteCandidate = match[2].trim();
    } else {
      match = pattern2.exec(cleanN);
      if (match) {
        siteCandidate = match[1].trim();
        queryCandidate = match[2].trim();
      } else {
        match = pattern3.exec(cleanN);
        if (match) {
          siteCandidate = match[1].trim();
          queryCandidate = match[2].trim();
        } else {
          match = pattern4.exec(cleanN);
          if (match) {
            queryCandidate = match[1].trim();
            siteCandidate = match[2].trim();
          }
        }
      }
    }

    if (!siteCandidate || !queryCandidate) return null;

    const cleanSite = siteCandidate.trim();
    const cleanQuery = queryCandidate.trim();

    // Evitar falsos positivos con preposiciones comunes o consultas de lugar/tiempo no web
    if (['argentina', 'parana', 'entre rios', 'el mundo', 'cancha', 'vivo', 'directo', 'ingles', 'español', 'casa', 'internet'].includes(cleanSite)) {
      return null;
    }

    const siteAliasMap: Record<string, string> = {
      'elonce': 'elonce.com',
      'el once': 'elonce.com',
      'once digital': 'elonce.com',
      'elonce digital': 'elonce.com',
      'infobae': 'infobae.com',
      'la nacion': 'lanacion.com.ar',
      'uno': 'unoentrerios.com.ar',
      'uno entre rios': 'unoentrerios.com.ar',
      'apf': 'apfdigital.com.ar',
      'apf digital': 'apfdigital.com.ar',
      'analisis': 'analisisdigital.com.ar',
      'analisis digital': 'analisisdigital.com.ar',
      'el entre rios': 'elentrerios.com',
      'entre rios': 'elentrerios.com',
      'mi parana': 'mi.parana.gob.ar',
      'parana gob': 'parana.gob.ar',
      'tyc': 'tycsports.com',
      'tyc sports': 'tycsports.com',
      'tycsports': 'tycsports.com',
      'ole': 'ole.com.ar',
      'promiedos': 'promiedos.com.ar',
      'conicet': 'conicet.gov.ar',
      'fayerwayer': 'fayerwayer.com',
      'xataka': 'xataka.com',
      'muycomputer': 'muycomputer.com',
      'techcrunch': 'techcrunch.com',
      'ars technica': 'arstechnica.com',
      'huggingface': 'huggingface.co',
      'hugging face': 'huggingface.co',
      'devto': 'dev.to',
      'dev.to': 'dev.to',
      'github': 'github.com',
      'npm': 'npmjs.org',
      'nestjs': 'nestjs.com',
      'mystery planet': 'mysteryplanet.com.ar',
      'rolling stone': 'rollingstone.com.ar',
      'los 40': 'los40.com.ar',
      'los40': 'los40.com.ar',
      'wikipedia': 'es.wikipedia.org',
      'youtube': 'youtube.com',
      'espn': 'espndeportes.espn.com',
      'clarin': 'clarin.com',
      'perfil': 'perfil.com',
      'cronica': 'cronica.com.ar',
      'pagina12': 'pagina12.com.ar',
      'pagina 12': 'pagina12.com.ar'
    };

    let domain: string | undefined = undefined;
    const isDomain = /^[a-z0-9-]+\.[a-z.]{2,}$/i.test(cleanSite);

    if (siteAliasMap[cleanSite]) {
      domain = siteAliasMap[cleanSite];
    } else {
      // Búsqueda por subcadena
      const matchedKey = Object.keys(siteAliasMap).find(
        (key) => cleanSite.includes(key) || key.includes(cleanSite)
      );
      if (matchedKey) {
        domain = siteAliasMap[matchedKey];
      }
    }

    if (!domain && isDomain) {
      domain = cleanSite;
    }

    if (!domain) return null;

    // Recuperar la query con mayúsculas/minúsculas originales
    const queryIndex = cleanN.indexOf(queryCandidate);
    let originalQuery = cleanQuery;
    if (queryIndex !== -1) {
      originalQuery = message.slice(queryIndex, queryIndex + queryCandidate.length).trim();
    }

    return {
      site: domain,
      query: originalQuery
    };
  }

  private normalize(input: string): string {
    return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
}
