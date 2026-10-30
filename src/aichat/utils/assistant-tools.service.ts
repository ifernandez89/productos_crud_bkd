import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DateTime } from 'luxon';
import * as Astronomy from 'astronomy-engine';
import {
  toJewishDate,
  formatJewishDateInHebrew,
  toGregorianDate,
} from 'jewish-date';
import { create, all } from 'mathjs';
import { BrowserToolService } from '../../jarvis/tools/browser/browser-tool.service';

const math = create(all);

// ─── Types ────────────────────────────────────────────────────────────────────

type WeatherCodeEntry = { code: number; label: string };
type NominatimResult = { lat: string; lon: string; display_name?: string };
type OpenMeteoCurrentResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    relative_humidity_2m?: number;
    time?: string;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: number[];
    precipitation?: number[];
    weather_code?: number[];
    temperature_2m?: number[];
  };
};
type HolidayRecord = { date: string; localName: string; name?: string };
type WorldTimeResponse = {
  datetime: string;
  timezone: string;
  utc_offset: string;
};
type CountryRecord = {
  name?: { common?: string };
  capital?: string[];
  population?: number;
  flags?: { svg?: string; png?: string };
  currencies?: Record<string, { name?: string; symbol?: string }>;
  languages?: Record<string, string>;
};
type NewtonResponse = { result: string; operation: string; expression: string };

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AssistantToolsService {
  private readonly logger = new Logger(AssistantToolsService.name);
  private readonly defaultWeatherLocation = 'Paraná, Entre Rios, Argentina';

  constructor(private readonly browserTool: BrowserToolService) {}

  /**
   * Obtiene un resumen estructurado del clima y pronóstico en tiempo real para inyección de contexto en LLM.
   */
  async getWeatherSummary(
    query: string,
    coordinates?: { latitude?: number; longitude?: number },
  ): Promise<string | null> {
    return this.getWeatherAnswer(query, coordinates);
  }

  // ── Router principal ────────────────────────────────────────────────────────

  async resolve(
    query: string,
    coordinates?: { latitude?: number; longitude?: number },
  ): Promise<string | null> {
    const normalized = this.normalize(query);

    // Detector de saludo — prioridad máxima para evitar falsos positivos en clima/hora
    if (this.isGreetingQuery(normalized)) {
      this.logger.log(`[tool:greeting → ollama] "${query}"`);
      return null;
    }

    // Detector de URL — si el mensaje contiene una URL, scrapear y resumir
    if (this.hasUrl(query)) {
      this.logger.log(`[tool:browser] "${query}"`);
      return this.getBrowserAnswer(query);
    }

    // Detector de búsqueda web — si el usuario pide buscar en internet
    if (this.isWebSearchQuery(normalized)) {
      this.logger.log(`[tool:browser:search] "${query}"`);
      return this.getWebSearchAnswer(query);
    }

    // Si la pregunta mezcla dominios distintos, Ollama maneja mejor la respuesta completa
    if (this.isMixedQuery(query, normalized)) {
      this.logger.log(`[tool:mixed → ollama] "${query}"`);
      return null;
    }

    if (this.isWeatherQuery(normalized)) {
      this.logger.log(`[tool:weather] "${query}"`);
      return this.getWeatherAnswer(query, coordinates);
    }
    if (this.isEconomyQuery(normalized)) {
      this.logger.log(`[tool:economy] "${query}"`);
      return this.getEconomyAnswer(query, normalized);
    }
    if (this.isHolidayQuery(normalized)) {
      this.logger.log(`[tool:holiday] "${query}"`);
      return this.getHolidayAnswer(query);
    }
    if (this.isTimeQuery(normalized)) {
      this.logger.log(`[tool:time] "${query}"`);
      return this.getTimeAnswer(query);
    }
    if (this.isCountryQuery(normalized)) {
      this.logger.log(`[tool:country] "${query}"`);
      return this.getCountryAnswer(query);
    }
    if (this.isAstronomyQuery(normalized)) {
      this.logger.log(`[tool:astronomy] "${query}"`);
      return this.getAstronomyAnswer(query, normalized);
    }
    if (this.isMayanCalendarQuery(normalized)) {
      this.logger.log(`[tool:mayan] "${query}"`);
      return this.getMayanCalendarAnswer(query);
    }
    if (this.isHebrewCalendarQuery(normalized)) {
      this.logger.log(`[tool:hebrew] "${query}"`);
      return this.getHebrewCalendarAnswer(query);
    }
    if (this.isMathQuery(query, normalized)) {
      const mathAnswer = await this.getMathAnswer(query, normalized);
      if (mathAnswer) {
        this.logger.log(`[tool:math] "${query}"`);
        return mathAnswer;
      }
    }

    this.logger.log(`[tool:none → ollama] "${query}"`);
    return null;
  }

  // Detecta preguntas que combinan 2 o más dominios distintos → mejor dejarlas a Ollama
  private isMixedQuery(query: string, n: string): boolean {
    // Si la combinación es Clima + Fecha/Hora/Ubicación, getWeatherAnswer ya sintetiza fecha, ubicación y clima
    const hasWeather = this.isWeatherQuery(n);
    const hasTime = this.isTimeQuery(n);
    const otherDomains = [
      this.isAstronomyQuery(n),
      this.isHolidayQuery(n),
      this.isCountryQuery(n),
      this.isMathQuery(query, n),
      this.isEconomyQuery(n),
    ].filter(Boolean).length;

    // Si combina múltiples dominios externos, delegar a Ollama
    if (otherDomains >= 2 || (otherDomains >= 1 && (hasWeather || hasTime))) {
      return true;
    }
    return false;
  }

  // Detecta saludos simples para evitar falsos positivos en clima/hora
  private isGreetingQuery(n: string): boolean {
    const trimmed = n.trim();
    // Saludo simple de máx 40 chars con palabras clave
    if (trimmed.length > 40) return false;
    return /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|como estas|como andas|que onda|como va|todo bien|hermano|amigo|brother|hey|hi|hello|como te va|que haces|que tal todo)[\s,?!.]*$/i.test(
      trimmed,
    );
  }

  // ── Detectores de intención ─────────────────────────────────────────────────

  private isWeatherQuery(n: string): boolean {
    // Excluir "clima astrológico" / "clima zodiacal" / "clima lunar" → eso es astrología
    if (/(astro|zodiac|lunar|horoscopo|signo|tarot|astrolog)/i.test(n))
      return false;
    return /(clima|temperatura|pronostico|pronóstico|lluvia|llueve|soleado|nublado|viento|hace calor|hace frio|hace frío|como esta el tiempo|cómo está el tiempo|estado del tiempo|tiempo en)/i.test(
      n,
    );
  }

  private isEconomyQuery(n: string): boolean {
    return /(dolar|dólar|cotizacion|cotización|riesgo pais|riesgo país|inflacion|inflación)/i.test(
      n,
    );
  }

  private isHolidayQuery(n: string): boolean {
    return /(feriado|asueto|dia no laborable|dias no laborables|puente)/i.test(
      n,
    );
  }

  private isTimeQuery(n: string): boolean {
    return /(que hora|qué hora|hora actual|hora local|que hora tiene|qué hora tiene|que dia|qué día|dia es hoy|día es hoy|que fecha|qué fecha|fecha actual|fecha de hoy|dia actual|en que dia|en qué día|en que fecha|en qué fecha|cual es la fecha|cuál es la fecha|sabes que dia|sabes qué día|sabes que fecha|sabes qué fecha|no me dijiste la fecha|dime la fecha|decime la fecha|zona horaria|horario actual)/i.test(
      n,
    );
  }

  private isCountryQuery(n: string): boolean {
    return /(?:^|\s)(?:pais|país|capital\s+de|moneda\s+de|idioma\s+de|poblacion\s+de|población\s+de|bandera\s+de|datos\s+de)\s+/i.test(
      n,
    );
  }

  private isAstronomyQuery(n: string): boolean {
    return /(luna|fase lunar|luna llena|luna nueva|cuarto creciente|cuarto menguante|eclipse|solsticio|equinoccio|hemisferio|estacion del ano|primavera|verano|otono|invierno|planeta|mercurio|venus|marte|jupiter|saturno|urano|neptuno|amanecer|atardecer|alba|ocaso|astronomia|constelacion|elongacion|conjuncion)/i.test(
      n,
    );
  }

  private isMayanCalendarQuery(n: string): boolean {
    return /(maya|tzolkin|haab|kin|long count|calendario maya|cuenta larga)/i.test(
      n,
    );
  }

  private isHebrewCalendarQuery(n: string): boolean {
    return /(hebreo|judio|judaico|calendario hebreo|fecha hebrea|parasha|shabat)/i.test(
      n,
    );
  }

  private isMathQuery(query: string, n: string): boolean {
    // 1. Verbos e intenciones matemáticas explícitas
    const explicitMathVerbs =
      /(cu[aá]nto\s+(?:es|da|ser[ií]a)|calcul[aoá](?:me|r)?|resuelv[ea]|resolv[eé]r?|deriv[aoá](?:da|r)?|integr[aoá](?:l|r)?|simplific[aoá](?:r)?|factoriz[aoá](?:r)?|ra[ií]z\s+(?:cuadrada|c[uú]bica)|logaritmo|seno(?:\s+de)?|coseno(?:\s+de)?|tangente(?:\s+de))/i;

    if (explicitMathVerbs.test(n)) {
      return true;
    }

    // 2. Si no hay verbos explícitos, verificar si la consulta es una expresión aritmética pura
    const trimmed = query.trim().replace(/^[\¿\¡\s]+|[\?\!\=\s]+$/g, '').trim();

    // Si tiene palabras de lenguaje natural (2+ letras) que no sean tokens matemáticos reconocidos,
    // es una frase conversacional (ej: "Hablemos de música!! Por ej pop 80/90!"), NO una operación pura.
    const mathTokens = new Set([
      'sqrt',
      'sin',
      'cos',
      'tan',
      'log',
      'pi',
      'exp',
      'abs',
      'mod',
    ]);
    const words = trimmed.toLowerCase().match(/[a-záéíóúñ]{2,}/g) || [];
    const nonMathWords = words.filter((w) => !mathTokens.has(w));
    if (nonMathWords.length > 0) {
      return false;
    }

    // Debe contener dígitos y al menos un operador aritmético (+, -, *, /, ^, %)
    const hasDigits = /\d/.test(trimmed);
    const hasOperator = /[\+\-\*\/\^\%]/.test(trimmed);

    // Debe contener únicamente caracteres válidos de operaciones matemáticas
    const isMathCharsOnly = /^[\d\s\+\-\*\/\^\(\)\.\,\%\!\:a-zA-Z]+$/.test(trimmed);

    return hasDigits && hasOperator && isMathCharsOnly;
  }

  // ── Detector de URL ─────────────────────────────────────────────────────────

  private hasUrl(message: string): boolean {
    return /https?:\/\/[^\s]+/.test(message);
  }

  private isWebSearchQuery(n: string): boolean {
    return /(busca|buscar|buscame|buscá|googlea|googleame|googleá|investiga|investigame|investigá|encontra|encontrá|encontrame|busca en internet|busca en la web|busca en google|que dice internet|que dice la web|que hay sobre|que se sabe de|novedades de|novedades sobre|noticias de|noticias sobre)/i.test(
      n,
    );
  }

  /**
   * Extrae el texto del mensaje quitando las URLs.
   * Si queda texto significativo (>5 chars) → el usuario tiene una pregunta/instrucción.
   */
  private extractInstructionFromMessage(message: string): string {
    const urls = this.browserTool.extractUrls(message);
    return urls
      .reduce((msg, url) => msg.replace(url, ''), message)
      .replace(/[;,]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private async getBrowserAnswer(query: string): Promise<string | null> {
    try {
      const context = await this.browserTool.buildContext(query);
      if (!context) return null;

      const instruction = this.extractInstructionFromMessage(query);
      const hasQuestion = instruction.length > 5;

      // Si el usuario escribió algo además de la URL → siempre al LLM
      // El LLM usa el contenido web como contexto para responder la pregunta específica
      if (hasQuestion) {
        this.logger.log(
          `[browser] pregunta detectada ("${instruction.slice(0, 60)}") → LLM processing`,
        );
        this._lastBrowserContext = context;
        return null; // JarvisService lo inyecta en el prompt
      }

      // Sin pregunta (solo URL) → mostrar contenido crudo
      const rendered = context.includes('_(JS renderizado)_')
        ? ' _(páginas con JavaScript renderizadas)_'
        : '';

      return (
        `📄 **Contenido extraído de la web${rendered}:**\n\n` +
        context +
        `\n\n---\n_Extraído en tiempo real por JarBees Browser Tool_`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[browser] error en getBrowserAnswer: ${msg}`);
      return null;
    }
  }

  // Cache liviano del último contexto browser para que JarvisService lo use
  private _lastBrowserContext: string | null = null;

  /**
   * Extrae el contexto web cacheado y lo limpia (para que JarvisService lo inyecte en el prompt).
   */
  consumeBrowserContext(): string | null {
    const ctx = this._lastBrowserContext;
    this._lastBrowserContext = null;
    return ctx;
  }

  private async getWebSearchAnswer(query: string): Promise<string> {
    try {
      const cleanQuery = query
        .replace(
          /^(busca|buscame|buscá|googlea|googleame|googleá|investiga|investigame|investigá|encontra|encontrá|encontrame)\s+/i,
          '',
        )
        .replace(/(en internet|en la web|en google|en línea)/gi, '')
        .trim();

      this.logger.log(`[browser:search] buscando: "${cleanQuery}"`);
      const results = await this.browserTool.search(cleanQuery, 5);

      if (results.length === 0) {
        return `No encontré resultados en internet para: "${cleanQuery}"`;
      }

      const resultLines = results
        .map(
          (r, i) =>
            `**${i + 1}. ${r.title}**\n🔗 ${r.url}\n${r.snippet || 'Sin descripción disponible.'}`,
        )
        .join('\n\n');

      return (
        `🔍 **Resultados de búsqueda para: "${cleanQuery}"**\n\n` +
        resultLines +
        `\n\n---\n_Búsqueda realizada en tiempo real por JarBees Browser Tool_`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[browser:search] error: ${msg}`);
      return null as any;
    }
  }

  // ── Utilidades comunes ──────────────────────────────────────────────────────

  private normalize(input: string): string {
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private static readonly NON_LOCATION_WORDS = new Set([
    'esta', 'este', 'está', 'esto', 'estos', 'estas',
    'noche', 'tarde', 'dia', 'día', 'hoy', 'mañana', 'manana',
    'pasado', 'semana', 'mes', 'ano', 'año', 'ahora', 'luego', 'despues', 'después',
    'antes', 'pronto', 'siempre', 'nunca',
    'mi', 'mí', 'ti', 'conmigo', 'vos', 'tu', 'tú', 'su', 'sus', 'usted', 'nosotros', 'ellos',
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'al', 'del', 'a', 'de', 'en', 'para', 'por', 'con',
    'lluvia', 'lluvias', 'clima', 'tiempo', 'pronostico', 'pronóstico', 'temperatura',
    'viento', 'frio', 'frío', 'calor', 'sol', 'nublado', 'cielo', 'tormenta', 'llovizna',
    'aqui', 'aquí', 'aca', 'acá', 'alla', 'allá', 'donde', 'dónde', 'cuando', 'cuándo',
    'quien', 'quién', 'como', 'cómo', 'que', 'qué', 'cual', 'cuál',
    'saber', 'sabes', 'saberlo', 'decir', 'dime', 'decime', 'contar', 'contame',
    'ver', 'mirar', 'consultar'
  ]);

  private extractLocation(query: string): string | null {
    const patterns = [
      /(?:en|para|de)\s+([\p{L}][\p{L}\s\-]{2,})/iu,
      /(?:en|para)\s+([^?.,;!]+)/iu,
    ];
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match?.[1]) {
        const raw = match[1].trim();
        const cleaned = this.cleanLocationString(raw);
        if (cleaned && cleaned.length >= 3) {
          return cleaned;
        }
      }
    }
    return null;
  }

  private cleanLocationString(location: string): string {
    const words = location
      .toLowerCase()
      .replace(/[^\p{L}\s\-]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const validWords = words.filter(
      (w) => !AssistantToolsService.NON_LOCATION_WORDS.has(w),
    );

    if (validWords.length === 0) return '';
    const res = validWords.join(' ').trim();
    return res.length >= 3 ? res : '';
  }

  private extractCountry(query: string): string | null {
    const match = query.match(
      /(?:pais|país|capital|moneda|idioma|poblacion|población|bandera|sobre|de)\s+([\p{L}][\p{L}\s\-]{2,})/iu,
    );
    if (match?.[1]) return match[1].trim().replace(/\s+/g, ' ');
    if (/argentina/i.test(query)) return 'Argentina';
    if (/brasil/i.test(query)) return 'Brasil';
    if (/chile/i.test(query)) return 'Chile';
    if (/uruguay/i.test(query)) return 'Uruguay';
    if (/paraguay/i.test(query)) return 'Paraguay';
    return null;
  }

  private extractHolidayDate(query: string): Date {
    const normalized = this.normalize(query);
    const today = new Date();
    if (normalized.includes('pasado manana')) return this.offsetDate(today, 2);
    if (normalized.includes('manana')) return this.offsetDate(today, 1);
    if (normalized.includes('hoy')) return this.offsetDate(today, 0);
    const explicit = query.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (explicit?.[1]) {
      const d = new Date(`${explicit[1]}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return today;
  }

  private offsetDate(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

  private formatIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ── CLIMA (Open-Meteo + Nominatim) ──────────────────────────────────────────

  private async getWeatherAnswer(
    query: string,
    coordinates?: { latitude?: number; longitude?: number },
  ): Promise<string | null> {
    try {
      let lat: number;
      let lon: number;
      let displayName: string;

      if (coordinates?.latitude != null && coordinates?.longitude != null) {
        lat = coordinates.latitude;
        lon = coordinates.longitude;
        const reverse = await this.reverseGeocodeLocation(lat, lon);
        displayName = reverse.displayName;
      } else {
        const location =
          this.extractLocation(query) ?? this.defaultWeatherLocation;
        const geocoded = await this.geocodeLocation(location);
        lat = geocoded.lat;
        lon = geocoded.lon;
        displayName = geocoded.displayName;
      }

      const weather = await this.fetchCurrentWeather(lat, lon);
      const normalized = this.normalize(query);
      const isAskingDate = /(dia|día|fecha|hoy)/i.test(normalized);
      const isAskingRainOrForecast =
        /(lluvia|llover|noche|pronostico|pronóstico|precipitacion|precipitación)/i.test(
          normalized,
        );
      const now = DateTime.now()
        .setZone('America/Argentina/Buenos_Aires')
        .setLocale('es');
      const dateHeader = isAskingDate
        ? `📅 Fecha: ${now.toFormat("cccc d 'de' MMMM 'de' yyyy")} (Hora: ${now.toFormat('HH:mm')} ART)`
        : '';

      const lines = [
        ...(dateHeader ? [dateHeader] : []),
        `📍 Ubicación: ${displayName}`,
        `🌤️ Clima actual:`,
        `- Temperatura: ${weather.temperature}°C`,
        `- Sensación térmica: ${weather.apparentTemperature}°C`,
        `- Viento: ${weather.windSpeed} km/h`,
        `- Humedad: ${weather.humidity}%`,
        `- Estado: ${weather.label}`,
      ];

      if (
        weather.tonightSummary &&
        (isAskingRainOrForecast || weather.tonightPrecipProb >= 25)
      ) {
        lines.push(`🌧️ Pronóstico de lluvia para esta noche:\n- ${weather.tonightSummary}`);
      }

      return lines.join('\n');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[tool:weather] API no disponible (${msg}), cayendo a ollama`,
      );
      return null;
    }
  }

  private async geocodeLocation(
    location: string,
  ): Promise<{ lat: number; lon: number; displayName: string }> {
    const response = await axios.get<NominatimResult[]>(
      'https://nominatim.openstreetmap.org/search',
      {
        params: { q: `${location}, Argentina`, format: 'jsonv2', limit: 1 },
        headers: { 'User-Agent': 'productos-crud-bkd/1.0' },
      },
    );
    const result = response.data?.[0];
    if (!result) {
      throw new HttpException(
        `No pude encontrar coordenadas para "${location}".`,
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      lat: Number(result.lat),
      lon: Number(result.lon),
      displayName: result.display_name || location,
    };
  }

  private async reverseGeocodeLocation(
    latitude: number,
    longitude: number,
  ): Promise<{ displayName: string }> {
    const response = await axios.get<NominatimResult>(
      'https://nominatim.openstreetmap.org/reverse',
      {
        params: {
          lat: latitude,
          lon: longitude,
          format: 'jsonv2',
          zoom: 10, // zoom 10 = ciudad, no negocio/calle
        },
        headers: { 'User-Agent': 'productos-crud-bkd/1.0' },
      },
    );
    const result = response.data;

    // Construir nombre legible: "Ciudad, Provincia, País" — ignorar calles y negocios
    const addr = (result as any).address;
    const city =
      addr?.city ?? addr?.town ?? addr?.village ?? addr?.municipality ?? '';
    const state = addr?.state ?? '';
    const country = addr?.country ?? '';
    const displayName =
      [city, state, country].filter(Boolean).join(', ') ||
      result.display_name ||
      `Lat ${latitude}, Lon ${longitude}`;

    return { displayName };
  }

  private async fetchCurrentWeather(lat: number, lon: number) {
    const response = await axios.get<OpenMeteoCurrentResponse>(
      'https://api.open-meteo.com/v1/forecast',
      {
        params: {
          latitude: lat,
          longitude: lon,
          current:
            'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m',
          hourly:
            'precipitation_probability,precipitation,weather_code,temperature_2m',
          forecast_days: 2,
          timezone: 'auto',
        },
      },
    );
    const current = response.data.current;
    if (!current)
      throw new HttpException(
        'No pude obtener el clima actual.',
        HttpStatus.BAD_GATEWAY,
      );

    const hourly = response.data.hourly;
    let tonightSummary = '';
    let tonightPrecipProb = 0;

    if (hourly?.time && hourly.precipitation_probability) {
      const now = DateTime.now().setZone('America/Argentina/Buenos_Aires');
      const todayIso = now.toISODate();
      let maxProb = 0;
      let maxMm = 0;
      let dominantCode = 0;
      let count = 0;

      for (let i = 0; i < hourly.time.length; i++) {
        const t = hourly.time[i];
        if (t && t.startsWith(todayIso)) {
          const hour = parseInt(t.slice(11, 13), 10);
          if (hour >= 20 && hour <= 23) {
            count++;
            const p = hourly.precipitation_probability[i] ?? 0;
            const mm = hourly.precipitation?.[i] ?? 0;
            if (p > maxProb) {
              maxProb = p;
              dominantCode = hourly.weather_code?.[i] ?? dominantCode;
            }
            if (mm > maxMm) maxMm = mm;
          }
        }
      }

      if (count > 0) {
        tonightPrecipProb = maxProb;
        if (maxProb >= 60 || maxMm >= 1.0) {
          tonightSummary = `Alta probabilidad de lluvia para esta noche (${maxProb}%, acumulado estimado ${maxMm} mm).`;
        } else if (maxProb >= 30 || maxMm > 0.1) {
          tonightSummary = `Baja a moderada probabilidad de lloviznas aisladas para esta noche (${maxProb}%, acumulado ~${maxMm} mm).`;
        } else {
          tonightSummary = `No se pronostican lluvias para esta noche (probabilidad de precipitación ${maxProb}%, cielo mayormente ${this.describeWeatherCode(dominantCode).toLowerCase()}).`;
        }
      }
    }

    return {
      temperature: current.temperature_2m ?? 'desconocida',
      apparentTemperature: current.apparent_temperature ?? 'desconocida',
      windSpeed: current.wind_speed_10m ?? 'desconocida',
      humidity: current.relative_humidity_2m ?? 'desconocida',
      label: this.describeWeatherCode(current.weather_code),
      tonightSummary,
      tonightPrecipProb,
    };
  }

  private describeWeatherCode(code?: number): string {
    const map: WeatherCodeEntry[] = [
      { code: 0, label: 'Despejado' },
      { code: 1, label: 'Mayormente despejado' },
      { code: 2, label: 'Parcialmente nublado' },
      { code: 3, label: 'Cubierto' },
      { code: 45, label: 'Niebla' },
      { code: 48, label: 'Niebla con escarcha' },
      { code: 51, label: 'Llovizna leve' },
      { code: 53, label: 'Llovizna moderada' },
      { code: 55, label: 'Llovizna intensa' },
      { code: 61, label: 'Lluvia leve' },
      { code: 63, label: 'Lluvia moderada' },
      { code: 65, label: 'Lluvia intensa' },
      { code: 71, label: 'Nieve leve' },
      { code: 73, label: 'Nieve moderada' },
      { code: 75, label: 'Nieve intensa' },
      { code: 80, label: 'Chubascos leves' },
      { code: 81, label: 'Chubascos moderados' },
      { code: 82, label: 'Chubascos fuertes' },
      { code: 95, label: 'Tormenta' },
      { code: 96, label: 'Tormenta con granizo leve' },
      { code: 99, label: 'Tormenta con granizo fuerte' },
    ];
    return (
      map.find((e) => e.code === code)?.label ??
      'Estado meteorológico no disponible'
    );
  }

  // ── ECONOMÍA ARGENTINA (DolarAPI) ───────────────────────────────────────────

  private async getEconomyAnswer(
    query: string,
    normalized: string,
  ): Promise<string | null> {
    try {
      if (/(riesgo pais|riesgo país)/i.test(normalized)) {
        const res = await axios.get('https://dolarapi.com/v1/riesgopais');
        const data = res.data;
        const dt = new Date(data.fechaActualizacion).toLocaleString('es-AR');
        return `Riesgo País (Argentina): ${data.valor} puntos.\n(Actualizado: ${dt})`;
      }

      const res = await axios.get('https://dolarapi.com/v1/dolares');
      const dolares: any[] = res.data;

      // Si pide uno específico (blue, mep, ccl, oficial, tarjeta, mayorista)
      let targetCasa = '';
      if (/(blue|informal|ilegal)/i.test(normalized)) targetCasa = 'blue';
      else if (/(mep|bolsa)/i.test(normalized)) targetCasa = 'mep';
      else if (/(ccl|contado|liqui)/i.test(normalized))
        targetCasa = 'contadoconliqui';
      else if (/(oficial|banco nacion)/i.test(normalized))
        targetCasa = 'oficial';
      else if (/(tarjeta|turista)/i.test(normalized)) targetCasa = 'tarjeta';
      else if (/(mayorista)/i.test(normalized)) targetCasa = 'mayorista';

      let message = 'Cotizaciones del dólar en Argentina:\n';

      if (targetCasa) {
        const item = dolares.find(
          (d) =>
            d.casa.toLowerCase().replace(/\s+/g, '') ===
            targetCasa.replace(/\s+/g, ''),
        );
        if (item) {
          return `Dólar ${item.nombre}:\nCompra: $${item.compra} | Venta: $${item.venta}\n(Actualizado: ${new Date(item.fechaActualizacion).toLocaleString('es-AR')})`;
        }
      }

      // Si no especificó, devuelve los 3 más comunes
      const defaults = ['oficial', 'blue', 'mep'];
      for (const item of dolares) {
        if (defaults.includes(item.casa)) {
          message += `- ${item.nombre}: Compra $${item.compra} / Venta $${item.venta}\n`;
        }
      }
      return message.trim();
    } catch (err: unknown) {
      this.logger.warn(`[tool:economy] DolarAPI no disponible: ${err}`);
      return null;
    }
  }

  // ── FERIADOS (Nager.Date) ────────────────────────────────────────────────────

  private async getHolidayAnswer(query: string): Promise<string | null> {
    try {
      const targetDate = this.extractHolidayDate(query);
      const year = targetDate.getFullYear();
      const isoDate = this.formatIsoDate(targetDate);

      const response = await axios.get<HolidayRecord[]>(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/AR`,
        { timeout: 5000, validateStatus: (s) => s === 200 },
      );
      const holidays = response.data || [];
      const match = holidays.find((h) => h.date === isoDate);

      if (match)
        return `Sí, el ${isoDate} es feriado en Argentina: ${match.localName}.`;

      const upcoming = holidays
        .filter((h) => h.date >= isoDate)
        .slice(0, 3)
        .map((h) => `${h.date}: ${h.localName}`)
        .join('\n');

      return upcoming
        ? `No, el ${isoDate} no es feriado nacional en Argentina. Próximos feriados:\n${upcoming}`
        : `No encontré feriados nacionales para ${year} en Argentina.`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[tool:holiday] API no disponible (${msg}), cayendo a ollama`,
      );
      return null;
    }
  }

  // ── HORA Y FECHA (Luxon & WorldTimeAPI) ──────────────────────────────────────

  private async getTimeAnswer(query: string): Promise<string> {
    const normalized = this.normalize(query);
    let timezone = 'America/Argentina/Buenos_Aires';
    if (normalized.includes('utc')) timezone = 'Etc/UTC';

    const isDateQuery =
      /(dia|día|fecha|ano|año|mes|hoy|cuando es|no me dijiste la fecha)/i.test(
        normalized,
      );

    const now = DateTime.now().setZone(timezone).setLocale('es');
    const abbrev =
      timezone === 'America/Argentina/Buenos_Aires'
        ? 'ART'
        : now.offsetNameShort || now.zoneName;

    if (isDateQuery) {
      const fullDate = now.toFormat("cccc d 'de' MMMM 'de' yyyy");
      return `Hoy es ${fullDate}. Hora actual en Argentina: ${now.toFormat('HH:mm')} (${abbrev}).`;
    }

    return `Hora actual: ${now.toFormat('HH:mm')} (${abbrev}), ${now.toFormat("cccc d 'de' MMMM 'de' yyyy")}.`;
  }

  // ── PAÍSES (REST Countries) ──────────────────────────────────────────────────

  private async getCountryAnswer(query: string): Promise<string | null> {
    const country = this.extractCountry(query);
    if (!country) return null;

    try {
      const response = await axios.get<CountryRecord[]>(
        `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`,
      );
      const info = response.data?.[0];
      if (!info) {
        this.logger.log(`[tool:country → ollama] sin datos para "${country}"`);
        return null;
      }

      const capital = info.capital?.[0] || 'No disponible';
      const population = info.population
        ? info.population.toLocaleString('es-AR')
        : 'No disponible';
      const currencies = info.currencies
        ? Object.values(info.currencies)
            .map((c) => `${c.name} (${c.symbol})`)
            .join(', ')
        : 'No disponible';
      const languages = info.languages
        ? Object.values(info.languages).join(', ')
        : 'No disponible';

      return [
        `País: ${info.name?.common || country}`,
        `Capital: ${capital}`,
        `Población: ${population}`,
        `Monedas: ${currencies}`,
        `Idiomas: ${languages}`,
      ].join('\n');
    } catch (error) {
      // ENOTFOUND, timeout, red → fallback amigable sin romper
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[tool:country] API no disponible (${msg}), cayendo a ollama`,
      );
      return null; // null → JarvisService cae a LLM con contexto
    }
  }

  // ── ASTRONOMÍA (astronomy-engine — sin clave, cálculo local) ────────────────

  private async getAstronomyAnswer(
    query: string,
    normalized: string,
  ): Promise<string> {
    const now = new Date();
    const adate = new Astronomy.AstroTime(now);

    // Fase lunar
    if (
      /(luna|fase lunar|luna llena|luna nueva|cuarto creciente|cuarto menguante)/i.test(
        normalized,
      )
    ) {
      return this.getMoonPhaseAnswer(now, adate);
    }

    // Eclipse de luna
    if (/(eclipse.*luna|eclipse lunar)/i.test(normalized)) {
      return this.getLunarEclipseAnswer(adate);
    }

    // Eclipse de sol
    if (/(eclipse.*sol|eclipse solar)/i.test(normalized)) {
      return this.getSolarEclipseAnswer(adate);
    }

    // Solsticios / equinoccios
    if (/(solsticio|equinoccio)/i.test(normalized)) {
      return this.getSeasonsAnswer(now.getFullYear());
    }

    // Amanecer / atardecer
    if (/(amanecer|atardecer|alba|ocaso)/i.test(normalized)) {
      return this.getSunriseSunsetAnswer(query, now);
    }

    // Planeta específico
    const planet = this.extractPlanet(normalized);
    if (planet) return this.getPlanetAnswer(planet, adate);

    // Fallback: datos lunares generales
    return this.getMoonPhaseAnswer(now, adate);
  }

  private getMoonPhaseAnswer(now: Date, adate: Astronomy.AstroTime): string {
    const illumination = Astronomy.Illumination(Astronomy.Body.Moon, adate);
    const moonPhaseDegrees = Astronomy.MoonPhase(adate); // 0-360: 0=New, 90=1stQ, 180=Full, 270=3rdQ
    const phaseFraction = illumination.phase_fraction;

    const phaseLabel = this.describeMoonPhase(moonPhaseDegrees);

    // Próximas fases
    const nextNewMoon = Astronomy.SearchMoonPhase(0, adate, 30);
    const nextFullMoon = Astronomy.SearchMoonPhase(180, adate, 30);
    const nextQ1 = Astronomy.SearchMoonPhase(90, adate, 30);
    const nextQ3 = Astronomy.SearchMoonPhase(270, adate, 30);

    const fmt = (t: Astronomy.AstroTime | null) =>
      t
        ? t.date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : 'No calculada';

    return [
      `Fase lunar actual: ${phaseLabel}`,
      `Iluminación: ${(phaseFraction * 100).toFixed(1)}%`,
      `Ángulo de fase: ${moonPhaseDegrees.toFixed(1)}°`,
      ``,
      `Próximas fases:`,
      `🌑 Luna nueva:        ${fmt(nextNewMoon)}`,
      `🌓 Cuarto creciente:  ${fmt(nextQ1)}`,
      `🌕 Luna llena:        ${fmt(nextFullMoon)}`,
      `🌗 Cuarto menguante:  ${fmt(nextQ3)}`,
    ].join('\n');
  }

  private describeMoonPhase(angle: number): string {
    if (angle < 22.5) return '🌑 Luna nueva';
    if (angle < 67.5) return '🌒 Creciente cóncava';
    if (angle < 112.5) return '🌓 Cuarto creciente';
    if (angle < 157.5) return '🌔 Creciente gibosa';
    if (angle < 202.5) return '🌕 Luna llena';
    if (angle < 247.5) return '🌖 Menguante gibosa';
    if (angle < 292.5) return '🌗 Cuarto menguante';
    if (angle < 337.5) return '🌘 Menguante cóncava';
    return '🌑 Luna nueva';
  }

  private getLunarEclipseAnswer(adate: Astronomy.AstroTime): string {
    const eclipse = Astronomy.SearchLunarEclipse(adate);
    if (!eclipse) return 'No encontré datos de próximo eclipse lunar.';
    const date = eclipse.peak.date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const kind =
      eclipse.kind === 'total'
        ? 'Total'
        : eclipse.kind === 'partial'
          ? 'Parcial'
          : 'Penumbral';
    return `Próximo eclipse lunar: ${kind} el ${date}`;
  }

  private getSolarEclipseAnswer(adate: Astronomy.AstroTime): string {
    const eclipse = Astronomy.SearchGlobalSolarEclipse(adate);
    if (!eclipse) return 'No encontré datos de próximo eclipse solar.';
    const date = eclipse.peak.date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const kind =
      eclipse.kind === 'total'
        ? 'Total'
        : eclipse.kind === 'annular'
          ? 'Anular'
          : 'Parcial';
    return `Próximo eclipse solar: ${kind} el ${date}`;
  }

  private getSeasonsAnswer(year: number): string {
    const seasons = Astronomy.Seasons(year);
    const fmt = (t: Astronomy.AstroTime) =>
      t.date.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    return [
      `Eventos astronómicos ${year}:`,
      `🌱 Equinoccio de primavera (norte): ${fmt(seasons.mar_equinox)}`,
      `☀️  Solsticio de verano (norte):     ${fmt(seasons.jun_solstice)}`,
      `🍂 Equinoccio de otoño (norte):     ${fmt(seasons.sep_equinox)}`,
      `❄️  Solsticio de invierno (norte):   ${fmt(seasons.dec_solstice)}`,
      ``,
      `(Para el hemisferio sur, las estaciones son inversas)`,
    ].join('\n');
  }

  private async getSunriseSunsetAnswer(
    query: string,
    now: Date,
  ): Promise<string> {
    const location = this.extractLocation(query) ?? this.defaultWeatherLocation;
    const geocoded = await this.geocodeLocation(location);
    const observer = new Astronomy.Observer(geocoded.lat, geocoded.lon, 0);
    const adate = new Astronomy.AstroTime(now);

    const sunrise = Astronomy.SearchRiseSet(
      Astronomy.Body.Sun,
      observer,
      +1,
      adate,
      1,
    );
    const sunset = Astronomy.SearchRiseSet(
      Astronomy.Body.Sun,
      observer,
      -1,
      adate,
      1,
    );

    const fmt = (t: Astronomy.AstroTime | null) =>
      t
        ? t.date.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'No disponible';

    return [
      `Horarios solares para ${geocoded.displayName}:`,
      `🌅 Amanecer: ${fmt(sunrise)}`,
      `🌇 Atardecer: ${fmt(sunset)}`,
    ].join('\n');
  }

  private extractPlanet(normalized: string): string | null {
    const planets: Record<string, string> = {
      mercurio: 'Mercury',
      venus: 'Venus',
      marte: 'Mars',
      jupiter: 'Jupiter',
      saturno: 'Saturn',
      urano: 'Uranus',
      neptuno: 'Neptune',
    };
    for (const [es, en] of Object.entries(planets)) {
      if (normalized.includes(es)) return en;
    }
    return null;
  }

  private getPlanetAnswer(planet: string, adate: Astronomy.AstroTime): string {
    try {
      const body = Astronomy.Body[planet as keyof typeof Astronomy.Body];
      const illumination = Astronomy.Illumination(body, adate);
      const elongation = Astronomy.AngleFromSun(body, adate);

      return [
        `${planet} ahora:`,
        `Magnitud visual: ${illumination.mag.toFixed(2)}`,
        `Elongación solar: ${elongation.toFixed(1)}°`,
        `Iluminación: ${(illumination.phase_fraction * 100).toFixed(1)}%`,
      ].join('\n');
    } catch {
      return `No pude calcular datos actuales para ${planet}.`;
    }
  }

  // ── CALENDARIO MAYA (cálculo matemático puro) ────────────────────────────────

  private getMayanCalendarAnswer(query: string): string {
    // Extraer fecha del query o usar hoy
    const dateMatch = query.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    const date = dateMatch
      ? new Date(
          Number(dateMatch[3]),
          Number(dateMatch[2]) - 1,
          Number(dateMatch[1]),
        )
      : new Date();

    const result = this.gregorianToMayan(date);
    return [
      `Fecha Maya para ${date.toLocaleDateString('es-AR')}:`,
      `Cuenta Larga:  ${result.longCount}`,
      `Tzolk'in:      ${result.tzolkin.number} ${result.tzolkin.dayName}`,
      `Haab':         ${result.haab.day} ${result.haab.monthName}`,
      `Señor de la Noche: G${result.lordOfNight}`,
    ].join('\n');
  }

  private gregorianToMayan(date: Date): {
    longCount: string;
    tzolkin: { number: number; dayName: string };
    haab: { day: number; monthName: string };
    lordOfNight: number;
  } {
    // Día juliano
    const jdn = this.dateToJulianDayNumber(date);

    // Correlación GMT (584283)
    const CORRELATION = 584283;
    const mayanDay = jdn - CORRELATION;

    // Cuenta Larga
    let remaining = mayanDay;
    const baktun = Math.floor(remaining / 144000);
    remaining %= 144000;
    const katun = Math.floor(remaining / 7200);
    remaining %= 7200;
    const tun = Math.floor(remaining / 360);
    remaining %= 360;
    const uinal = Math.floor(remaining / 20);
    remaining %= 20;
    const kin = remaining;
    const longCount = `${baktun}.${katun}.${tun}.${uinal}.${kin}`;

    // Tzolk'in (260 días = 20 nombres × 13 números)
    const tzolkinNames = [
      'Imix',
      'Ik',
      'Akbal',
      'Kan',
      'Chicchan',
      'Cimi',
      'Manik',
      'Lamat',
      'Muluc',
      'Oc',
      'Chuen',
      'Eb',
      'Ben',
      'Ix',
      'Men',
      'Cib',
      'Caban',
      'Etznab',
      'Cauac',
      'Ahau',
    ];
    const tzolkinNumber = ((mayanDay % 13) + 13) % 13 || 13;
    const tzolkinDay = ((mayanDay % 20) + 20) % 20;

    // Haab' (365 días = 18 meses de 20 + Uayeb de 5)
    const haabMonths = [
      'Pop',
      'Uo',
      'Zip',
      'Zotz',
      'Tzec',
      'Xul',
      'Yaxkin',
      'Mol',
      'Chen',
      'Yax',
      'Zac',
      'Ceh',
      'Mac',
      'Kankin',
      'Muan',
      'Pax',
      'Kayab',
      'Cumku',
      'Uayeb',
    ];
    const haabPosition = (((mayanDay + 348) % 365) + 365) % 365;
    const haabDay = haabPosition % 20;
    const haabMonth = Math.floor(haabPosition / 20);

    // Señor de la Noche (ciclo de 9)
    const lordOfNight = ((mayanDay % 9) + 9) % 9 || 9;

    return {
      longCount,
      tzolkin: { number: tzolkinNumber, dayName: tzolkinNames[tzolkinDay] },
      haab: { day: haabDay, monthName: haabMonths[Math.min(haabMonth, 18)] },
      lordOfNight,
    };
  }

  private dateToJulianDayNumber(date: Date): number {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const a = Math.floor((14 - m) / 12);
    const yr = y + 4800 - a;
    const mo = m + 12 * a - 3;
    return (
      d +
      Math.floor((153 * mo + 2) / 5) +
      365 * yr +
      Math.floor(yr / 4) -
      Math.floor(yr / 100) +
      Math.floor(yr / 400) -
      32045
    );
  }

  // ── CALENDARIO HEBREO (jewish-date) ──────────────────────────────────────────

  private getHebrewCalendarAnswer(query: string): string {
    const dateMatch = query.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    const date = dateMatch
      ? new Date(
          Number(dateMatch[3]),
          Number(dateMatch[2]) - 1,
          Number(dateMatch[1]),
        )
      : new Date();

    const jewish = toJewishDate(date);
    const hebrewFormatted = formatJewishDateInHebrew(jewish);

    // Calculamos el día gregoriano equivalente de regreso para verificar
    const backToGregorian = toGregorianDate(jewish);

    return [
      `Fecha Hebrea para ${date.toLocaleDateString('es-AR')}:`,
      `Fecha en hebreo: ${hebrewFormatted}`,
      `Año hebreo:  ${jewish.year}`,
      `Mes hebreo:  ${jewish.monthName}`,
      `Día hebreo:  ${jewish.day}`,
      `Verificación gregoriana: ${backToGregorian.toLocaleDateString('es-AR')}`,
    ].join('\n');
  }

  // ── MATEMÁTICAS (mathjs local + Newton API para derivadas/integrales) ─────────

  private async getMathAnswer(
    query: string,
    normalized: string,
  ): Promise<string | null> {
    // Derivada → Newton API (sin clave)
    if (/(deriva|derivada)/i.test(normalized)) {
      return this.getNewtonAnswer('derive', query);
    }

    // Integral → Newton API
    if (/(integral|integra)/i.test(normalized)) {
      return this.getNewtonAnswer('integrate', query);
    }

    // Simplificación → Newton API
    if (/(simplifica|simplificar)/i.test(normalized)) {
      return this.getNewtonAnswer('simplify', query);
    }

    // Factorización → Newton API
    if (/(factoriza|factorizar)/i.test(normalized)) {
      return this.getNewtonAnswer('factor', query);
    }

    // Cálculo local con mathjs
    return this.evaluateWithMathJs(query);
  }

  private extractMathExpression(query: string): string | null {
    // 1. Quitar saludos y verbos introductores de consulta
    let expr = query
      .replace(/^(?:hola|por\s+favor|che|jarvis|jarbees)[,\s]*/i, '')
      .replace(
        /^(?:calcula(?:me|r)?|calcul[aoá]|cu[aá]nto\s+(?:es|da|ser[ií]a)|resuelv[ea]|resolv[eé]r?|simplific[aoá](?:r)?|factoriz[aoá](?:r)?|deriv[aoá](?:da|r)?|integr[aoá](?:l|r)?)\s*(?:de|el|la|los|las|:|es)?\s*/i,
        '',
      )
      .replace(/[\?\!\=]+$/g, '')
      .trim();

    if (!expr) return null;

    // 2. Si la expresión resultante contiene sólo caracteres matemáticos válidos
    if (/^[\d\s\+\-\*\/\^\(\)\.\,xXyYπeE%a-zA-Z]+$/.test(expr)) {
      return expr;
    }

    // 3. Busca expresión tipo "de x^2+3x" o ": 25 * 4"
    const exprMatch = query.match(/(?:de|of|:)\s*([^\?\.]+)/i);
    if (exprMatch?.[1]?.trim()) {
      const candidate = exprMatch[1].trim();
      if (/^[\d\s\+\-\*\/\^\(\)\.\,xXyYπeE%a-zA-Z]+$/.test(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async getNewtonAnswer(
    operation: string,
    query: string,
  ): Promise<string | null> {
    const expr = this.extractMathExpression(query);
    if (!expr) return null;

    // Newton API usa expresiones URL-encoded
    const encoded = encodeURIComponent(expr.replace(/\s/g, '+'));

    try {
      const response = await axios.get<NewtonResponse>(
        `https://newton.vercel.app/api/v2/${operation}/${encoded}`,
        {
          timeout: 5000, // corto: si cae, cae rápido
          validateStatus: (s) => s === 200,
        },
      );
      const opLabels: Record<string, string> = {
        derive: 'Derivada',
        integrate: 'Integral',
        simplify: 'Simplificado',
        factor: 'Factorizado',
      };
      if (!response.data?.result) return null;
      return `${opLabels[operation] ?? operation} de "${expr}":\n${response.data.result}`;
    } catch (err: unknown) {
      // ECONNRESET / timeout / 4xx → fallback silencioso a mathjs
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Newton API no disponible (${msg}), usando mathjs como fallback`,
      );
      return this.evaluateWithMathJs(query);
    }
  }

  private evaluateWithMathJs(query: string): string | null {
    const expr = this.extractMathExpression(query);
    if (!expr) return null;

    try {
      const sanitized = expr
        .replace(/,/g, '.')
        .replace(/π/g, 'pi')
        .replace(/x/g, '*');

      const result = math.evaluate(sanitized);
      if (
        result === undefined ||
        result === null ||
        typeof result === 'function'
      ) {
        return null;
      }

      const formattedResult =
        typeof result === 'number'
          ? Number.isInteger(result)
            ? result.toString()
            : Number(result.toFixed(6)).toString()
          : String(result);

      return `Resultado de "${expr}": ${formattedResult}`;
    } catch {
      return null;
    }
  }
}
