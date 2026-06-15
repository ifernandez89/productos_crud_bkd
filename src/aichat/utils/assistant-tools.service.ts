import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

type WeatherCodeEntry = {
  code: number;
  label: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name?: string;
};

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

type HolidayRecord = {
  date: string;
  localName: string;
  name?: string;
};

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

@Injectable()
export class AssistantToolsService {
  private readonly logger = new Logger(AssistantToolsService.name);
  private readonly defaultWeatherLocation = 'Paraná, Entre Rios, Argentina';

  async resolve(query: string): Promise<string | null> {
    const normalized = this.normalize(query);

    if (this.isWeatherQuery(normalized)) {
      return this.getWeatherAnswer(query);
    }

    if (this.isHolidayQuery(normalized)) {
      return this.getHolidayAnswer(query);
    }

    if (this.isTimeQuery(normalized)) {
      return this.getTimeAnswer(query);
    }

    if (this.isCountryQuery(normalized)) {
      return this.getCountryAnswer(query);
    }

    return null;
  }

  private isWeatherQuery(normalized: string): boolean {
    return /(clima|temperatura|tiempo|pronostico|lluvia|llueve|soleado|nublado|viento|hace calor|hace frio)/i.test(
      normalized,
    );
  }

  private isHolidayQuery(normalized: string): boolean {
    return /(feriado|feriado[s]?|asueto|dia no laborable|dias no laborables|puente)/i.test(
      normalized,
    );
  }

  private isTimeQuery(normalized: string): boolean {
    return /(hora|horario|zon[a|a] horaria|que hora|qué hora|hora local|hora actual)/i.test(
      normalized,
    );
  }

  private isCountryQuery(normalized: string): boolean {
    return /(pais|país|capital|moneda|idioma|poblacion|población|bandera|datos de|sobre [a-z])/i.test(
      normalized,
    );
  }

  private normalize(input: string): string {
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
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
        if (location.length >= 3) {
          return location.replace(/\s+/g, ' ');
        }
      }
    }

    return null;
  }

  private extractCountry(query: string): string | null {
    const match = query.match(
      /(?:pais|país|capital|moneda|idioma|poblacion|población|bandera|sobre|de)\s+([\p{L}][\p{L}\s\-]{2,})/iu,
    );

    if (match?.[1]) {
      return match[1].trim().replace(/\s+/g, ' ');
    }

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

    if (normalized.includes('pasado manana') || normalized.includes('pasadomanana')) {
      return this.offsetDate(today, 2);
    }

    if (normalized.includes('manana')) {
      return this.offsetDate(today, 1);
    }

    if (normalized.includes('hoy')) {
      return this.offsetDate(today, 0);
    }

    const explicitDate = query.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (explicitDate?.[1]) {
      const date = new Date(`${explicitDate[1]}T00:00:00`);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return today;
  }

  private offsetDate(baseDate: Date, days: number): Date {
    const result = new Date(baseDate);
    result.setDate(result.getDate() + days);
    return result;
  }

  private formatIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async getWeatherAnswer(query: string): Promise<string> {
    const location = this.extractLocation(query) ?? this.defaultWeatherLocation;

    const geocoded = await this.geocodeLocation(location);
    const weather = await this.fetchCurrentWeather(geocoded.lat, geocoded.lon);

    return [
      `Clima para ${geocoded.displayName}:`,
      `Temperatura: ${weather.temperature}°C`,
      `Sensación térmica: ${weather.apparentTemperature}°C`,
      `Viento: ${weather.windSpeed} km/h`,
      `Humedad: ${weather.humidity}%`,
      `Estado: ${weather.label}`,
    ].join('\n');
  }

  private async geocodeLocation(location: string): Promise<{
    lat: number;
    lon: number;
    displayName: string;
  }> {
    const response = await axios.get<NominatimResult[]>(
      'https://nominatim.openstreetmap.org/search',
      {
        params: {
          q: `${location}, Argentina`,
          format: 'jsonv2',
          limit: 1,
        },
        headers: {
          'User-Agent': 'productos-crud-bkd/1.0',
        },
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

  private async fetchCurrentWeather(lat: number, lon: number): Promise<{
    temperature: number | string;
    apparentTemperature: number | string;
    windSpeed: number | string;
    humidity: number | string;
    label: string;
  }> {
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
    if (!current) {
      throw new HttpException(
        'No pude obtener el estado actual del clima.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      temperature: current.temperature_2m ?? 'desconocida',
      apparentTemperature: current.apparent_temperature ?? 'desconocida',
      windSpeed: current.wind_speed_10m ?? 'desconocida',
      humidity: current.relative_humidity_2m ?? 'desconocida',
      label: this.describeWeatherCode(current.weather_code),
    };
  }

  private describeWeatherCode(code?: number): string {
    const weatherCodes: WeatherCodeEntry[] = [
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
      weatherCodes.find((entry) => entry.code === code)?.label ||
      'Estado meteorológico no disponible'
    );
  }

  private async getHolidayAnswer(query: string): Promise<string> {
    const targetDate = this.extractHolidayDate(query);
    const year = targetDate.getFullYear();
    const isoDate = this.formatIsoDate(targetDate);

    const response = await axios.get<HolidayRecord[]>(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/AR`,
    );

    const holidays = response.data || [];
    const matchedHoliday = holidays.find((holiday) => holiday.date === isoDate);

    if (matchedHoliday) {
      return `Sí, el ${isoDate} es feriado en Argentina: ${matchedHoliday.localName}.`;
    }

    const upcoming = holidays
      .filter((holiday) => holiday.date >= isoDate)
      .slice(0, 3)
      .map((holiday) => `${holiday.date}: ${holiday.localName}`)
      .join('\n');

    return upcoming
      ? `No, el ${isoDate} no figura como feriado nacional en Argentina. Próximos feriados:\n${upcoming}`
      : `No encontré feriados nacionales para ${year} en Argentina.`;
  }

  private async getTimeAnswer(query: string): Promise<string> {
    const normalized = this.normalize(query);
    let timezone = 'America/Argentina/Buenos_Aires';

    if (normalized.includes('utc')) {
      timezone = 'Etc/UTC';
    }

    const response = await axios.get<WorldTimeResponse>(
      `https://worldtimeapi.org/api/timezone/${timezone}`,
    );

    return `Hora actual en ${response.data.timezone}: ${response.data.datetime}`;
  }

  private async getCountryAnswer(query: string): Promise<string> {
    const country = this.extractCountry(query);

    if (!country) {
      throw new HttpException(
        'Necesito el nombre de un país para consultar sus datos.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const response = await axios.get<CountryRecord[]>(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`,
    );

    const info = response.data?.[0];
    if (!info) {
      throw new HttpException(
        `No pude encontrar datos para ${country}.`,
        HttpStatus.NOT_FOUND,
      );
    }

    const capital = info.capital?.[0] || 'No disponible';
    const population = info.population
      ? info.population.toLocaleString('es-AR')
      : 'No disponible';
    const currencies = info.currencies
      ? Object.values(info.currencies)
          .map((currency) => `${currency.name || 'Moneda'} (${currency.symbol || '?'})`)
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
  }
}