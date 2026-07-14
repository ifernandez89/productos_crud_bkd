import { EmbeddingsService } from './embeddings.service';

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;

  beforeEach(() => {
    service = new EmbeddingsService();
    jest.resetAllMocks();
  });

  it('debe reintentar con un modelo alternativo si el principal falla', async () => {
    const axiosPost = jest.spyOn(require('axios'), 'post')
      .mockRejectedValueOnce({ response: { status: 404 }, message: 'model not found' })
      .mockResolvedValueOnce({ data: { embedding: [0.1, 0.2, 0.3] } });

    const result = await service.generateEmbedding('hola');

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(axiosPost).toHaveBeenCalledTimes(2);
  });
});
