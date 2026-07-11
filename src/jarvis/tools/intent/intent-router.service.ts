import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { resolveIntentModel } from '../../../shared/ollama-config';

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
  private readonly CLASSIFIER_MODEL = resolveIntentModel();

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

    // RAG con categoría específica — resumen temático
    if (/(resumen|resumir|resumime|que dice|que dicen|informacion|info)\s+(sobre|de|acerca de)\s+\w+/i.test(n)) {
      return { intent: 'RAG', confidence: 'high', reason: 'category summary request' };
    }

    // RAG — consultas sobre existencia de documentos
    if (/(tenemos|hay|existe|tenes)\s+.*(documentos?|pdfs?|archivos?|informacion|info|datos?).*(sobre|de|acerca de)/i.test(n)) {
      return { intent: 'RAG', confidence: 'high', reason: 'document existence query' };
    }

    // RAG — "mis documentos de X"
    if (/(mis|los|tus)\s+(documentos?|pdfs?|archivos?)\s+(de|sobre)/i.test(n)) {
      return { intent: 'RAG', confidence: 'high', reason: 'my documents query' };
    }

    // RAG — resumen de documento individual
    if (/(resumen|puntos clave|items relevantes|lo mas importante)\s+(?:de|del)\s+(?:documento|pdf|libro)/i.test(n)) {
      return { intent: 'RAG', confidence: 'high', reason: 'document summary request' };
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

    // WEB — pedido explícito (alta confianza)
    if (/(busca(r)? en internet|busca(r)? en la web|busca(r)? en google|googlea(r)?|navega(r)?|chequea(r)? online|fijate en internet|investiga(r)? en la web|search on internet|search the web)/i.test(n)) {
      return { intent: 'WEB', confidence: 'high', reason: 'explicit web search request' };
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
        options: { temperature: 0, num_predict: 150 }, // thinking models necesitan tokens para cerrar </think>
        think: false, // desactiva chain-of-thought en phi4-mini-reasoning y qwen3
      },
      { timeout: 8_000 },
    );

    const raw: string = (response.data?.response ?? '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '') // strip chain-of-thought (phi4-mini, qwen3)
      .trim()
      .toUpperCase();

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

    // Alias de sitios conocidos — se usa en todos los patrones
    const siteAliasMap: Record<string, string> = {
      'elonce': 'elonce.com',
      'el once': 'elonce.com',
      'once digital': 'elonce.com',
      'elonce digital': 'elonce.com',
      'el once digital': 'elonce.com',
      'infobae': 'infobae.com',
      'la nacion': 'lanacion.com.ar',
      'uno': 'unoentrerios.com.ar',
      'uno entre rios': 'unoentrerios.com.ar',
      'apf': 'apfdigital.com.ar',
      'apf digital': 'apfdigital.com.ar',
      'analisis': 'analisisdigital.com.ar',
      'analisis digital': 'analisisdigital.com.ar',
      'el entre rios': 'elentrerios.com',
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
      'pagina 12': 'pagina12.com.ar',
    };

    // ── Patrón 0: "revisa X", "abrí X", "chequeá X" — detección directa del sitio ──
    // "revisa el once digital y dame 6 noticias"
    // "revisá infobae"
    // "abrí elonce"
    const revisaMatch = cleanN.match(
      /^(?:revis[ae]|abre|abri|chequea|cheque[ae]|entr[ae]\s+a|mir[ae])\s+(.+?)(?:\s+y\s+.*)?$/i,
    );
    if (revisaMatch) {
      const siteRaw = revisaMatch[1].trim();
      const domain = this.resolveSiteAlias(siteRaw, siteAliasMap);
      if (domain) {
        // Extraer la query del resto del mensaje
        const afterSite = cleanN.replace(revisaMatch[0], '').trim();
        const query = afterSite || 'noticias actuales';
        return { site: domain, query };
      }
    }

    // ── Patrón 1: "dame N noticias del/de elonce/infobae" ──
    // "dame 8 noticias titulares del once digital"
    // "dame las últimas noticias de elonce"
    // "Puedes darme 6 titulares de noticias en mystery planet?"
    const dameMatch = cleanN.match(
      /(?:dame|dime|mostrame|muestrame|conseguime|busca|trae|darme|darnos)\s+.*?(?:noticias?|titulares?|novedades?|actualidad).*?(?:de(?:l)?|en|desde)\s+(.+?)(?:\s*$)/i,
    );
    if (dameMatch) {
      const siteRaw = dameMatch[1].trim();
      const domain = this.resolveSiteAlias(siteRaw, siteAliasMap);
      if (domain) {
        return { site: domain, query: cleanN };
      }
    }

    // ── Patrón 2: "noticias de/en X" ──
    const enPattern = /(?:noticias?|novedades?|info|informacion|que paso|buscar?|busca|encontrar?|encontra)\s+(?:de|sobre|en|desde)?\s*(.+?)\s+\ben\s+([a-z0-9\s.-]+)$/i;
    let match = enPattern.exec(cleanN);
    if (match) {
      const domain = this.resolveSiteAlias(match[2].trim(), siteAliasMap);
      if (domain) return { site: domain, query: match[1].trim() };
    }

    // ── Patrón 3: "que dice Y sobre X" ──
    match = /(?:que dice|que dicen|segun|buscar en)\s+([a-z0-9\s.-]+)\s+sobre\s+(.+)$/i.exec(cleanN);
    if (match) {
      const domain = this.resolveSiteAlias(match[1].trim(), siteAliasMap);
      if (domain) return { site: domain, query: match[2].trim() };
    }

    // ── Patrón 4: "buscar en Y: X" ──
    match = /(?:buscar en|busca en)\s+([a-z0-9\s.-]+)(?::|\s+)\s*(.+)$/i.exec(cleanN);
    if (match) {
      const domain = this.resolveSiteAlias(match[1].trim(), siteAliasMap);
      if (domain) return { site: domain, query: match[2].trim() };
    }

    // ── Patrón 5: "X en Y" — solo si Y es un alias conocido ──
    // Más restrictivo que antes: solo matchea si Y resuelve a un dominio real
    match = /(.+?)\s+\ben\s+([a-z0-9\s.-]+)$/i.exec(cleanN);
    if (match) {
      const falseSites = ['argentina', 'parana', 'entre rios', 'el mundo', 'cancha', 'vivo', 'directo', 'ingles', 'español', 'casa', 'internet'];
      const siteRaw = match[2].trim();
      if (!falseSites.includes(siteRaw)) {
        const domain = this.resolveSiteAlias(siteRaw, siteAliasMap);
        if (domain) return { site: domain, query: match[1].trim() };
      }
    }

    return null;
  }

  /**
   * Resuelve un alias o nombre de sitio a su dominio real.
   * Devuelve null si no se puede identificar el sitio.
   */
  private resolveSiteAlias(raw: string, aliases: Record<string, string>): string | null {
    const clean = raw.trim().toLowerCase();
    if (aliases[clean]) return aliases[clean];

    // Búsqueda por subcadena exacta
    const matchedKey = Object.keys(aliases).find(
      (key) => clean.includes(key) || key.includes(clean),
    );
    if (matchedKey) return aliases[matchedKey];

    // Búsqueda tolerante a typos: comparar palabra a palabra
    // "mystery plantet" → busca si cada palabra del alias aparece en el input
    const cleanWords = clean.split(/\s+/);
    const fuzzyKey = Object.keys(aliases).find((key) => {
      const keyWords = key.split(/\s+/);
      // Si al menos el 75% de las palabras del alias están en el input (con tolerancia de 1 char)
      const matched = keyWords.filter((kw) =>
        cleanWords.some((cw) => cw === kw || this.levenshtein(cw, kw) <= 1),
      );
      return matched.length >= Math.ceil(keyWords.length * 0.75);
    });
    if (fuzzyKey) return aliases[fuzzyKey];

    // Si parece un dominio real
    if (/^[a-z0-9-]+\.[a-z.]{2,}$/i.test(clean)) return clean;

    return null;
  }

  /** Distancia de Levenshtein simplificada para strings cortos */
  private levenshtein(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 2) return 99;
    const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }

  private normalize(input: string): string {
    return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
}
