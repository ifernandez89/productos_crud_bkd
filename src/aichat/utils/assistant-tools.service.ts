import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as Astronomy from 'astronomy-engine';
import { toJewishDate, formatJewishDateInHebrew, toGregorianDate } from 'jewish-date';
import { create, all } from 'mathjs';

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
};
type HolidayRecord = { date: string; localName: string; name?: string };
type WorldTimeResponse = { datetime: string; timezone: string; utc_offset: string };
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

  // ── Router principal ────────────────────────────────────────────────────────

  async resolve(query: string): Promise<string | null> {
    const normalized = this.normalize(query);

    if (this.isWeatherQuery(normalized))     return this.getWeatherAnswer(query);
    if (this.isHolidayQuery(normalized))     return this.getHolidayAnswer(query);
    if (this.isTimeQuery(normalized))        return this.getTimeAnswer(query);
    if (this.isCountryQuery(normalized))     return this.getCountryAnswer(query);
    if (this.isAstronomyQuery(normalized))   return this.getAstronomyAnswer(query, normalized);
    if (this.isMayanCalendarQuery(normalized)) return this.getMayanCalendarAnswer(query);
    if (this.isHebrewCalendarQuery(normalized)) return this.getHebrewCalendarAnswer(query);
    if (this.isMathQuery(normalized))        return this.getMathAnswer(query, normalized);

    return null;
  }

  // ── Detectores de intención ─────────────────────────────────────────────────

  private isWeatherQuery(n: string): boolean {
    return /(clima|temperatura|tiempo|pronostico|lluvia|llueve|soleado|nublado|viento|hace calor|hace frio)/i.test(n);
  }

  private isHolidayQuery(n: string): boolean {
    return /(feriado|asueto|dia no laborable|dias no laborables|puente)/i.test(n);
  }

  private isTimeQuery(n: string): boolean {
    return /(hora|horario|zona horaria|que hora|hora local|hora actual)/i.test(n);
  }

  private isCountryQuery(n: string): boolean {
    return /(pais|capital|moneda|idioma|poblacion|bandera|datos de|sobre [a-z])/i.test(n);
  }

  private isAstronomyQuery(n: string): boolean {
    return /(luna|fase lunar|luna llena|luna nueva|cuarto creciente|cuarto menguante|eclipse|solsticio|equinoccio|planeta|mercurio|venus|marte|jupiter|saturno|urano|neptuno|amanecer|atardecer|alba|ocaso|astronomia|constelacion|elongacion|conjuncion)/i.test(n);
  }

  private isMayanCalendarQuery(n: string): boolean {
    return /(maya|tzolkin|haab|kin|long count|calendario maya|cuenta larga)/i.test(n);
  }

  private isHebrewCalendarQuery(n: string): boolean {
    return /(hebreo|judio|judaico|calendario hebreo|fecha hebrea|parasha|shabat)/i.test(n);
  }

  private isMathQuery(n: string): boolean {
    return /(calcula|calculo|cuanto es|cuanto da|resuelve|deriva|integral|simplifica|factoriza|raiz cuadrada|logaritmo|seno|coseno|tangente|matematica|\d+\s*[\+\-\*\/\^]\s*\d)/i.test(n);
  }

  // ── Utilidades comunes ──────────────────────────────────────────────────────

  private normalize(input: string): string {
    return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private extractLocation(query: string): string | null {
    const patterns = [
      /(?:en|para|de)\s+([\p{L}][\p{L}\s\-]{2,})/iu,
      /(?:en|para)\s+([^?.,;!]+)/iu,
    ];
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match?.[1]) {
        const location = match[1].trim();
        if (location.length >= 3) return location.replace(/\s+/g, ' ');
      }
    }
    return null;
  }

  private extractCountry(query: string): string | null {
    const match = query.match(
      /(?:pais|país|capital|moneda|idioma|poblacion|población|bandera|sobre|de)\s+([\p{L}][\p{L}\s\-]{2,})/iu,
    );
    if (match?.[1]) return match[1].trim().replace(/\s+/g, ' ');
    if (/argentina/i.test(query)) return 'Argentina';
    if (/brasil/i.test(query))    return 'Brasil';
    if (/chile/i.test(query))     return 'Chile';
    if (/uruguay/i.test(query))   return 'Uruguay';
    if (/paraguay/i.test(query))  return 'Paraguay';
    return null;
  }

  private extractHolidayDate(query: string): Date {
    const normalized = this.normalize(query);
    const today = new Date();
    if (normalized.includes('pasado manana')) return this.offsetDate(today, 2);
    if (normalized.includes('manana'))         return this.offsetDate(today, 1);
    if (normalized.includes('hoy'))            return this.offsetDate(today, 0);
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

  private async getWeatherAnswer(query: string): Promise<string> {
    const location = this.extractLocation(query) ?? this.defaultWeatherLocation;
    const geocoded = await this.geocodeLocation(location);
    const weather  = await this.fetchCurrentWeather(geocoded.lat, geocoded.lon);
    return [
      `Clima para ${geocoded.displayName}:`,
      `Temperatura: ${weather.temperature}°C`,
      `Sensación térmica: ${weather.apparentTemperature}°C`,
      `Viento: ${weather.windSpeed} km/h`,
      `Humedad: ${weather.humidity}%`,
      `Estado: ${weather.label}`,
    ].join('\n');
  }

  private async geocodeLocation(location: string): Promise<{ lat: number; lon: number; displayName: string }> {
    const response = await axios.get<NominatimResult[]>(
      'https://nominatim.openstreetmap.org/search',
      {
        params: { q: `${location}, Argentina`, format: 'jsonv2', limit: 1 },
        headers: { 'User-Agent': 'productos-crud-bkd/1.0' },
      },
    );
    const result = response.data?.[0];
    if (!result) {
      throw new HttpException(`No pude encontrar coordenadas para "${location}".`, HttpStatus.NOT_FOUND);
    }
    return { lat: Number(result.lat), lon: Number(result.lon), displayName: result.display_name || location };
  }

  private async fetchCurrentWeather(lat: number, lon: number) {
    const response = await axios.get<OpenMeteoCurrentResponse>(
      'https://api.open-meteo.com/v1/forecast',
      {
        params: {
          latitude: lat,
          longitude: lon,
          current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m',
          timezone: 'auto',
        },
      },
    );
    const current = response.data.current;
    if (!current) throw new HttpException('No pude obtener el clima actual.', HttpStatus.BAD_GATEWAY);
    return {
      temperature:         current.temperature_2m         ?? 'desconocida',
      apparentTemperature: current.apparent_temperature   ?? 'desconocida',
      windSpeed:           current.wind_speed_10m         ?? 'desconocida',
      humidity:            current.relative_humidity_2m   ?? 'desconocida',
      label:               this.describeWeatherCode(current.weather_code),
    };
  }

  private describeWeatherCode(code?: number): string {
    const map: WeatherCodeEntry[] = [
      { code: 0,  label: 'Despejado' },
      { code: 1,  label: 'Mayormente despejado' },
      { code: 2,  label: 'Parcialmente nublado' },
      { code: 3,  label: 'Cubierto' },
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
    return map.find((e) => e.code === code)?.label ?? 'Estado meteorológico no disponible';
  }

  // ── FERIADOS (Nager.Date) ────────────────────────────────────────────────────

  private async getHolidayAnswer(query: string): Promise<string> {
    const targetDate = this.extractHolidayDate(query);
    const year       = targetDate.getFullYear();
    const isoDate    = this.formatIsoDate(targetDate);

    const response = await axios.get<HolidayRecord[]>(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/AR`,
    );
    const holidays = response.data || [];
    const match    = holidays.find((h) => h.date === isoDate);

    if (match) return `Sí, el ${isoDate} es feriado en Argentina: ${match.localName}.`;

    const upcoming = holidays
      .filter((h) => h.date >= isoDate)
      .slice(0, 3)
      .map((h) => `${h.date}: ${h.localName}`)
      .join('\n');

    return upcoming
      ? `No, el ${isoDate} no es feriado nacional en Argentina. Próximos feriados:\n${upcoming}`
      : `No encontré feriados nacionales para ${year} en Argentina.`;
  }

  // ── HORA (WorldTimeAPI) ──────────────────────────────────────────────────────

  private async getTimeAnswer(query: string): Promise<string> {
    const normalized = this.normalize(query);
    let timezone = 'America/Argentina/Buenos_Aires';
    if (normalized.includes('utc')) timezone = 'Etc/UTC';

    const response = await axios.get<WorldTimeResponse>(
      `https://worldtimeapi.org/api/timezone/${timezone}`,
    );
    return `Hora actual en ${response.data.timezone}: ${response.data.datetime}`;
  }

  // ── PAÍSES (REST Countries) ──────────────────────────────────────────────────

  private async getCountryAnswer(query: string): Promise<string> {
    const country = this.extractCountry(query);
    if (!country) throw new HttpException('Necesito el nombre de un país.', HttpStatus.BAD_REQUEST);

    const response = await axios.get<CountryRecord[]>(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`,
    );
    const info = response.data?.[0];
    if (!info) throw new HttpException(`No pude encontrar datos para ${country}.`, HttpStatus.NOT_FOUND);

    const capital    = info.capital?.[0] || 'No disponible';
    const population = info.population ? info.population.toLocaleString('es-AR') : 'No disponible';
    const currencies = info.currencies
      ? Object.values(info.currencies).map((c) => `${c.name} (${c.symbol})`).join(', ')
      : 'No disponible';
    const languages = info.languages ? Object.values(info.languages).join(', ') : 'No disponible';

    return [
      `País: ${info.name?.common || country}`,
      `Capital: ${capital}`,
      `Población: ${population}`,
      `Monedas: ${currencies}`,
      `Idiomas: ${languages}`,
    ].join('\n');
  }

  // ── ASTRONOMÍA (astronomy-engine — sin clave, cálculo local) ────────────────

  private async getAstronomyAnswer(query: string, normalized: string): Promise<string> {
    const now  = new Date();
    const adate = new Astronomy.AstroTime(now);

    // Fase lunar
    if (/(luna|fase lunar|luna llena|luna nueva|cuarto creciente|cuarto menguante)/i.test(normalized)) {
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
    const phaseAngle   = illumination.phase_angle;
    const phaseFraction = illumination.phase_fraction;

    const phaseLabel = this.describeMoonPhase(phaseAngle);

    // Próximas fases
    const nextNewMoon  = Astronomy.SearchMoonPhase(0,  adate, 30);
    const nextFullMoon = Astronomy.SearchMoonPhase(180, adate, 30);
    const nextQ1       = Astronomy.SearchMoonPhase(90,  adate, 30);
    const nextQ3       = Astronomy.SearchMoonPhase(270, adate, 30);

    const fmt = (t: Astronomy.AstroTime | null) =>
      t ? t.date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'No calculada';

    return [
      `Fase lunar actual: ${phaseLabel}`,
      `Iluminación: ${(phaseFraction * 100).toFixed(1)}%`,
      `Ángulo de fase: ${phaseAngle.toFixed(1)}°`,
      ``,
      `Próximas fases:`,
      `🌑 Luna nueva:        ${fmt(nextNewMoon)}`,
      `🌓 Cuarto creciente:  ${fmt(nextQ1)}`,
      `🌕 Luna llena:        ${fmt(nextFullMoon)}`,
      `🌗 Cuarto menguante:  ${fmt(nextQ3)}`,
    ].join('\n');
  }

  private describeMoonPhase(angle: number): string {
    if (angle < 22.5)                    return '🌑 Luna nueva';
    if (angle < 67.5)                    return '🌒 Creciente cóncava';
    if (angle < 112.5)                   return '🌓 Cuarto creciente';
    if (angle < 157.5)                   return '🌔 Creciente gibosa';
    if (angle < 202.5)                   return '🌕 Luna llena';
    if (angle < 247.5)                   return '🌖 Menguante gibosa';
    if (angle < 292.5)                   return '🌗 Cuarto menguante';
    if (angle < 337.5)                   return '🌘 Menguante cóncava';
    return '🌑 Luna nueva';
  }

  private getLunarEclipseAnswer(adate: Astronomy.AstroTime): string {
    const eclipse = Astronomy.SearchLunarEclipse(adate);
    if (!eclipse) return 'No encontré datos de próximo eclipse lunar.';
    const date = eclipse.peak.date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    const kind = eclipse.kind === 'total' ? 'Total' : eclipse.kind === 'partial' ? 'Parcial' : 'Penumbral';
    return `Próximo eclipse lunar: ${kind} el ${date}`;
  }

  private getSolarEclipseAnswer(adate: Astronomy.AstroTime): string {
    const eclipse = Astronomy.SearchGlobalSolarEclipse(adate);
    if (!eclipse) return 'No encontré datos de próximo eclipse solar.';
    const date = eclipse.peak.date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    const kind = eclipse.kind === 'total' ? 'Total' : eclipse.kind === 'annular' ? 'Anular' : 'Parcial';
    return `Próximo eclipse solar: ${kind} el ${date}`;
  }

  private getSeasonsAnswer(year: number): string {
    const seasons = Astronomy.Seasons(year);
    const fmt = (t: Astronomy.AstroTime) =>
      t.date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  private async getSunriseSunsetAnswer(query: string, now: Date): Promise<string> {
    const location = this.extractLocation(query) ?? this.defaultWeatherLocation;
    const geocoded = await this.geocodeLocation(location);
    const observer = new Astronomy.Observer(geocoded.lat, geocoded.lon, 0);
    const adate    = new Astronomy.AstroTime(now);

    const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, adate, 1);
    const sunset  = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, adate, 1);

    const fmt = (t: Astronomy.AstroTime | null) =>
      t ? t.date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'No disponible';

    return [
      `Horarios solares para ${geocoded.displayName}:`,
      `🌅 Amanecer: ${fmt(sunrise)}`,
      `🌇 Atardecer: ${fmt(sunset)}`,
    ].join('\n');
  }

  private extractPlanet(normalized: string): string | null {
    const planets: Record<string, string> = {
      mercurio: 'Mercury', venus: 'Venus', marte: 'Mars',
      jupiter: 'Jupiter', saturno: 'Saturn', urano: 'Uranus', neptuno: 'Neptune',
    };
    for (const [es, en] of Object.entries(planets)) {
      if (normalized.includes(es)) return en;
    }
    return null;
  }

  private getPlanetAnswer(planet: string, adate: Astronomy.AstroTime): string {
    try {
      const body        = Astronomy.Body[planet as keyof typeof Astronomy.Body];
      const illumination = Astronomy.Illumination(body, adate);
      const elongation   = Astronomy.AngleFromSun(body, adate);

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
      ? new Date(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]))
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
    tzolkin:   { number: number; dayName: string };
    haab:      { day: number; monthName: string };
    lordOfNight: number;
  } {
    // Día juliano
    const jdn = this.dateToJulianDayNumber(date);

    // Correlación GMT (584283)
    const CORRELATION = 584283;
    const mayanDay    = jdn - CORRELATION;

    // Cuenta Larga
    let remaining = mayanDay;
    const baktun  = Math.floor(remaining / 144000); remaining %= 144000;
    const katun   = Math.floor(remaining / 7200);   remaining %= 7200;
    const tun     = Math.floor(remaining / 360);    remaining %= 360;
    const uinal   = Math.floor(remaining / 20);     remaining %= 20;
    const kin     = remaining;
    const longCount = `${baktun}.${katun}.${tun}.${uinal}.${kin}`;

    // Tzolk'in (260 días = 20 nombres × 13 números)
    const tzolkinNames = [
      'Imix', 'Ik', 'Akbal', 'Kan', 'Chicchan', 'Cimi', 'Manik', 'Lamat',
      'Muluc', 'Oc', 'Chuen', 'Eb', 'Ben', 'Ix', 'Men', 'Cib', 'Caban',
      'Etznab', 'Cauac', 'Ahau',
    ];
    const tzolkinNumber = ((mayanDay % 13) + 13) % 13 || 13;
    const tzolkinDay    = ((mayanDay % 20) + 20) % 20;

    // Haab' (365 días = 18 meses de 20 + Uayeb de 5)
    const haabMonths = [
      'Pop', 'Uo', 'Zip', 'Zotz', 'Tzec', 'Xul', 'Yaxkin', 'Mol',
      'Chen', 'Yax', 'Zac', 'Ceh', 'Mac', 'Kankin', 'Muan', 'Pax',
      'Kayab', 'Cumku', 'Uayeb',
    ];
    const haabPosition = ((mayanDay + 348) % 365 + 365) % 365;
    const haabDay      = haabPosition % 20;
    const haabMonth    = Math.floor(haabPosition / 20);

    // Señor de la Noche (ciclo de 9)
    const lordOfNight = ((mayanDay % 9) + 9) % 9 || 9;

    return {
      longCount,
      tzolkin:  { number: tzolkinNumber, dayName: tzolkinNames[tzolkinDay] },
      haab:     { day: haabDay, monthName: haabMonths[Math.min(haabMonth, 18)] },
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
    return d + Math.floor((153 * mo + 2) / 5) + 365 * yr +
      Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400) - 32045;
  }

  // ── CALENDARIO HEBREO (jewish-date) ──────────────────────────────────────────

  private getHebrewCalendarAnswer(query: string): string {
    const dateMatch = query.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    const date = dateMatch
      ? new Date(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]))
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

  private async getMathAnswer(query: string, normalized: string): Promise<string> {
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
    // Busca expresión matemática en el query
    const match = query.match(/[=:es]?\s*([\d\s\+\-\*\/\^\(\)\.x\,π]+)/i);
    if (match?.[1]?.trim()) return match[1].trim();

    // Busca expresión tipo "de x^2+3x"
    const exprMatch = query.match(/(?:de|of|:)\s*([^\?\.]+)/i);
    if (exprMatch?.[1]?.trim()) return exprMatch[1].trim();

    return null;
  }

  private async getNewtonAnswer(operation: string, query: string): Promise<string> {
    const expr = this.extractMathExpression(query);
    if (!expr) return 'No pude identificar la expresión matemática en la pregunta.';

    // Newton API usa expresiones URL-encoded
    const encoded = encodeURIComponent(expr.replace(/\s/g, '+'));

    try {
      const response = await axios.get<NewtonResponse>(
        `https://newton.vercel.app/api/v2/${operation}/${encoded}`,
        {
          timeout: 5000,                          // corto: si cae, cae rápido
          validateStatus: (s) => s === 200,
        },
      );
      const opLabels: Record<string, string> = {
        derive:    'Derivada',
        integrate: 'Integral',
        simplify:  'Simplificado',
        factor:    'Factorizado',
      };
      return `${opLabels[operation] ?? operation} de "${expr}":\n${response.data.result}`;
    } catch (err: unknown) {
      // ECONNRESET / timeout / 4xx → fallback silencioso a mathjs
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Newton API no disponible (${msg}), usando mathjs como fallback`);
      return this.evaluateWithMathJs(query);
    }
  }

  private evaluateWithMathJs(query: string): string {
    // Extraer expresión numérica del texto
    const exprMatch = query.match(/([\d\s\+\-\*\/\^\(\)\.\,]+(?:sqrt|sin|cos|tan|log|pi|e)?[\d\s\+\-\*\/\^\(\)\.\,]*)/i);
    if (!exprMatch?.[0]?.trim()) {
      return 'No pude identificar una expresión matemática válida. Escribí la operación directamente, ej: "cuánto es 25 * 4 + 10".';
    }

    const expr = exprMatch[0].trim();
    try {
      const result = math.evaluate(expr);
      return `Resultado de "${expr}": ${result}`;
    } catch {
      return `No pude evaluar la expresión "${expr}". Intentá escribirla más clara, ej: "sqrt(144)" o "2^10".`;
    }
  }
}
