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
});
