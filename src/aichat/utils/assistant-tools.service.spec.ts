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
});
