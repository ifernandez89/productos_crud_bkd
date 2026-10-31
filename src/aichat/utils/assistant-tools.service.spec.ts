import axios from 'axios';
import { AssistantToolsService } from './assistant-tools.service';
import { BrowserToolService } from '../../jarvis/tools/browser/browser-tool.service';

jest.mock('axios');

describe('AssistantToolsService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for unknown country-like queries so the AI flow can continue', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] } as never);

    const browserTool = {} as BrowserToolService;
    const service = new AssistantToolsService(browserTool);
    const result = await service.resolve('Datos de Babilonia');

    expect(result).toBeNull();
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://restcountries.com/v3.1/name/Babilonia',
    );
  });

  describe('math tool & false positive prevention', () => {
    let service: AssistantToolsService;

    beforeEach(() => {
      const browserTool = {} as BrowserToolService;
      service = new AssistantToolsService(browserTool);
    });

    it('returns null for conversational music query containing "80/90" so LLM handles it', async () => {
      const query =
        'Hablemos de música!! Por ej pop 80/90! Que podrías recomendarme?';
      const result = await service.resolve(query);
      expect(result).toBeNull();
    });

    it('returns null for common conversational phrases with numbers or slashes', async () => {
      expect(await service.resolve('trabajamos 24/7 en esto')).toBeNull();
      expect(await service.resolve('pantalla widescreen 16/9')).toBeNull();
      expect(await service.resolve('la reunion es el 10/12/2026')).toBeNull();
    });

    it('correctly calculates legitimate arithmetic queries with explicit intent', async () => {
      const result = await service.resolve('cuánto es 25 * 4 + 10');
      expect(result).toContain('Resultado de "25 * 4 + 10": 110');
    });

    it('correctly calculates isolated math expression without natural language words', async () => {
      const result = await service.resolve('25 * 4');
      expect(result).toContain('Resultado de "25 * 4": 100');
    });

    it('correctly calculates explicit calcula prompt', async () => {
      const result = await service.resolve('calcula 100 / 5');
      expect(result).toContain('Resultado de "100 / 5": 20');
    });
  });

  describe('temporal & composite weather/date/location queries', () => {
    let service: AssistantToolsService;

    beforeEach(() => {
      const browserTool = {} as BrowserToolService;
      service = new AssistantToolsService(browserTool);
    });

    it('resolves date query "Sabes que día es hoy?" with current year and date', async () => {
      const result = await service.resolve('Sabes que día es hoy?');
      expect(result).not.toBeNull();
      expect(result).toContain('Hoy es');
      expect(result).toContain(String(new Date().getFullYear()));
    });

    it('resolves follow-up date query "No me dijiste la fecha" with current year and date', async () => {
      const result = await service.resolve('No me dijiste la fecha');
      expect(result).not.toBeNull();
      expect(result).toContain('Hoy es');
      expect(result).toContain(String(new Date().getFullYear()));
    });

    it('resolves composite query "Sabes que día es hoy? Clima? Ubicación?" with date, location and weather', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('nominatim')) {
          return Promise.resolve({
            data: [
              {
                lat: '-31.73',
                lon: '-60.52',
                display_name: 'Paraná, Entre Ríos, Argentina',
              },
            ],
          }) as never;
        }
        if (url.includes('open-meteo')) {
          return Promise.resolve({
            data: {
              current: {
                temperature_2m: 20.7,
                apparent_temperature: 22.5,
                weather_code: 0,
                wind_speed_10m: 5.5,
                relative_humidity_2m: 81,
              },
            },
          }) as never;
        }
        return Promise.reject(new Error('unhandled mock url')) as never;
      });

      const result = await service.resolve('Sabes que día es hoy? Clima? Ubicación?');
      expect(result).not.toBeNull();
      expect(result).toContain('Fecha:');
      expect(result).toContain(String(new Date().getFullYear()));
      expect(result).toContain('Ubicación: Paraná, Entre Ríos, Argentina');
      expect(result).toContain('Temperatura: 20.7°C');
      expect(result).toContain('Estado: Despejado');
    });

    it('ignores temporal phrases like "para está noche" when extracting location and reports rain forecast', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('nominatim')) {
          return Promise.resolve({
            data: [
              {
                lat: '-31.73',
                lon: '-60.52',
                display_name: 'Paraná, Entre Ríos, Argentina',
              },
            ],
          }) as never;
        }
        if (url.includes('open-meteo')) {
          const nowIso = new Date().toISOString().slice(0, 10);
          return Promise.resolve({
            data: {
              current: {
                temperature_2m: 20.5,
                apparent_temperature: 23.0,
                weather_code: 51,
                wind_speed_10m: 3.0,
                relative_humidity_2m: 85,
              },
              hourly: {
                time: [
                  `${nowIso}T20:00`,
                  `${nowIso}T21:00`,
                  `${nowIso}T22:00`,
                  `${nowIso}T23:00`,
                ],
                precipitation_probability: [35, 20, 15, 10],
                precipitation: [0.2, 0.0, 0.0, 0.0],
                weather_code: [51, 0, 0, 0],
              },
            },
          }) as never;
        }
        return Promise.reject(new Error('unhandled mock url')) as never;
      });

      const result = await service.resolve('esta pronosticado lluvia para está noche?');
      expect(result).not.toBeNull();
      // Verificamos que cayó al default de Paraná y no a un lugar falso
      expect(result).toContain('Ubicación: Paraná, Entre Ríos, Argentina');
      expect(result).toContain('Pronóstico de lluvia para esta noche');
      expect(result).toContain('probabilidad de lloviznas');
    });

    it('resolves 24-hour rain probability query with Open-Meteo forecast without crashing on "durante próximas"', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('nominatim')) {
          return Promise.resolve({
            data: [
              {
                lat: '-31.73',
                lon: '-60.52',
                display_name: 'Distrito Tala, Departamento Paraná, Entre Ríos, Argentina',
              },
            ],
          }) as never;
        }
        if (url.includes('open-meteo')) {
          const baseDate = new Date();
          const futureHour = (h: number) => {
            const d = new Date(baseDate.getTime() + h * 3600 * 1000);
            return d.toISOString().slice(0, 13) + ':00';
          };
          return Promise.resolve({
            data: {
              current: {
                temperature_2m: 22.0,
                apparent_temperature: 23.0,
                weather_code: 1,
                wind_speed_10m: 4.0,
                relative_humidity_2m: 60,
              },
              hourly: {
                time: [
                  futureHour(1),
                  futureHour(3),
                  futureHour(6),
                  futureHour(9),
                ],
                precipitation_probability: [10, 45, 20, 5],
                precipitation: [0.0, 0.4, 0.0, 0.0],
                weather_code: [1, 51, 1, 0],
              },
            },
          }) as never;
        }
        return Promise.reject(new Error('unhandled mock url')) as never;
      });

      const result = await service.resolve('¿Hay probabilidades de lluvia durante las próximas 24 horas?');
      expect(result).not.toBeNull();
      expect(result).toContain('Pronóstico de lluvia (próximas 24 horas)');
      expect(result).toContain('45%');
    });

    it('returns null for explanatory physics/meteorological questions so LLM can explain them', async () => {
      const result = await service.resolve('¿Cómo se forma un frente frío y qué cambios produce en el clima?');
      expect(result).toBeNull();
    });

    it('resolves deterministic date arithmetic via DateMathTool', async () => {
      const r1 = await service.resolve('¿Cuántos días faltan para terminar el año?');
      expect(r1).not.toBeNull();
      expect(r1).toContain('Faltan exactamente');
      expect(r1).toContain('días');

      const r2 = await service.resolve('Si hoy es sábado, ¿qué fecha será dentro de 45 días?');
      expect(r2).not.toBeNull();
      expect(r2).toContain('dentro de 45 días será el');
    });
  });
});
