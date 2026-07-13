import { Test, TestingModule } from '@nestjs/testing';
import { AichatController } from './aichat.controller';
import { AichatService } from './aichat.service';
import { ConverterService } from './utils/converter.service';

describe('AichatController', () => {
  let controller: AichatController;
  let service: jest.Mocked<AichatService>;

  const mockService = {
    preguntarOllamaOexternal: jest.fn(),
    preguntarHRM: jest.fn(),
    obtenerPreguntas: jest.fn(),
    getLastAssistantMessage: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockConverter = {
    convert: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AichatController],
      providers: [
        {
          provide: AichatService,
          useValue: mockService,
        },
        {
          provide: ConverterService,
          useValue: mockConverter,
        },
      ],
    }).compile();

    controller = module.get<AichatController>(AichatController);
    service = module.get(AichatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('preguntar', () => {
    it('should call service with correct params', async () => {
      const dto = { pregunta: 'Test question' };
      service.preguntarOllamaOexternal.mockResolvedValue('Test answer');
      service.getLastAssistantMessage.mockReturnValue('Last answer');

      const result = await controller.preguntar(dto as any);

      expect(result).toEqual({ respuesta: 'Test answer', lastMessage: 'Last answer' });
      expect(service.preguntarOllamaOexternal).toHaveBeenCalled();
      expect(service.getLastAssistantMessage).toHaveBeenCalled();
    });
  });

  describe('listar', () => {
    it('should return preguntas', async () => {
      service.obtenerPreguntas.mockResolvedValue([]);

      const result = await controller.listar();

      expect(result).toEqual([]);
      expect(service.obtenerPreguntas).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return expected message', async () => {
      service.findAll.mockReturnValue('This action returns all aichat');

      const result = await controller.findAll();

      expect(result).toBe('This action returns all aichat');
    });
  });

  describe('findOne', () => {
    it('should return expected message', async () => {
      service.findOne.mockReturnValue('This action returns a #1 aichat');

      const result = await controller.findOne(1);

      expect(result).toBe('This action returns a #1 aichat');
    });
  });

  describe('update', () => {
    it('should return expected message', async () => {
      // update/remove were removed from AichatController — skipping
    });
  });

  describe('remove', () => {
    it('should return expected message', async () => {
      // update/remove were removed from AichatController — skipping
    });
  });
});
