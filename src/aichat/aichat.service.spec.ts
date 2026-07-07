import { Test, TestingModule } from '@nestjs/testing';
import { AichatService } from './aichat.service';
import { PreguntasRepository } from './repositories/preguntas.repository';
import { ProductsRepository } from '../products/repositories/products.repository';
import { OllamaModelService } from './models/ollamaModel';
import { AssistantToolsService } from './utils/assistant-tools.service';
import { ModelRouterService } from './utils/model-router.service';
import { LLAMA_MODEL_TOKEN, QWEN_MODEL_TOKEN } from './aichat.tokens';
import { Product, Pregunta } from '@prisma/client';

describe('AichatService', () => {
  let service: AichatService;
  let preguntasRepository: jest.Mocked<PreguntasRepository>;
  let productsRepository: jest.Mocked<ProductsRepository>;

  const mockProduct: Product = {
    id: 1,
    name: 'Test Product',
    description: 'Test Description',
    price: 100,
    stock: 10,
    image: 'https://example.com/image.jpg',
    isNew: false,
    isOnSale: false,
    isFeatured: false,
    marca: 'Test Brand',
    createdAT: new Date(),
    updatedAt: new Date(),
  };

  const mockPregunta: Pregunta = {
    id: 1,
    texto: 'Test question',
    respuesta: 'Test answer',
    estado: 'success',
    errorMessage: null,
    errorStatus: null,
    createdAt: new Date(),
  };

  const mockPreguntasRepository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findRelevant: jest.fn().mockResolvedValue([]),
  };

  const mockProductsRepository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockOllamaModel = {
    getModel: jest.fn(),
    invoke: jest.fn(),
    invokeWithMessages: jest.fn(),
  };

  const mockAssistantTools = {
    resolve: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AichatService,
        {
          provide: PreguntasRepository,
          useValue: mockPreguntasRepository,
        },
        {
          provide: ProductsRepository,
          useValue: mockProductsRepository,
        },
        {
          provide: AssistantToolsService,
          useValue: mockAssistantTools,
        },
        ModelRouterService,
        {
          provide: LLAMA_MODEL_TOKEN,
          useValue: mockOllamaModel,
        },
        {
          provide: QWEN_MODEL_TOKEN,
          useValue: mockOllamaModel,
        },
        {
          provide: OllamaModelService,
          useValue: mockOllamaModel,
        },
      ],
    }).compile();

    service = module.get<AichatService>(AichatService);
    preguntasRepository = module.get(PreguntasRepository);
    productsRepository = module.get(ProductsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('obtenerPreguntas', () => {
    it('should return an array of preguntas', async () => {
      preguntasRepository.findAll.mockResolvedValue([mockPregunta]);

      const result = await service.obtenerPreguntas();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mockPregunta.id,
        texto: mockPregunta.texto,
        respuesta: mockPregunta.respuesta,
        estado: mockPregunta.estado,
        errorMessage: mockPregunta.errorMessage,
        errorStatus: mockPregunta.errorStatus,
      });
      expect(typeof result[0].createdAt).toBe('string');
      expect(() => new Date(result[0].createdAt)).not.toThrow();
      expect(preguntasRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('promptAgente', () => {
    it('should return a structured prompt with system and user fields', async () => {
      productsRepository.findAll.mockResolvedValue([mockProduct]);
      mockPreguntasRepository.findRelevant = jest.fn().mockResolvedValue([]);

      const result = await service.promptAgente('quiero comprar un producto');

      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('user');
      expect(result.user).toContain('quiero comprar un producto');
      expect(result.user).toContain('Test Product');
      expect(productsRepository.findAll).toHaveBeenCalled();
    });

    it('should include previous conversation turns for the same session', async () => {
      productsRepository.findAll.mockResolvedValue([]);
      mockPreguntasRepository.findRelevant = jest.fn().mockResolvedValue([]);

      (service as any).sessionContextStore.set('session-1', [
        { role: 'user', content: 'Mi nombre es Ana' },
        { role: 'assistant', content: 'Perfecto, lo voy a recordar.' },
      ]);

      const result = await service.promptAgente('¿cómo me llamo?', 'session-1');

      expect(result.user).toContain('### HILO DE LA CONVERSACIÓN');
      expect(result.user).toContain('Mi nombre es Ana');
      expect(result.user).toContain('¿cómo me llamo?');
    });

    it('should include dynamic metadata and the current date in the system prompt', async () => {
      productsRepository.findAll.mockResolvedValue([]);
      mockPreguntasRepository.findRelevant = jest.fn().mockResolvedValue([]);

      const result = await service.promptAgente('hola');

      expect(result.system).toMatch(/^{"fecha_actual"/);
      expect(result.system).toMatch(/"hora":"\d{2}:\d{2}"/);
      expect(result.system).toMatch(/"ubicacion":"Paraná, Entre Ríos"/);
      expect(result.system).toContain('Hoy es');
      expect(result.system).toContain('Nunca inventes la fecha actual. Si el usuario pregunta por la fecha, usa la fecha proporcionada por el sistema.');
    });
  });

  describe('preguntarOllamaOexternal', () => {
    it('should include a model notice in the user-facing answer', async () => {
      process.env.OLLAMA_MODEL_NAME = 'qwen3.5:4b';
      mockAssistantTools.resolve.mockResolvedValue(null);
      mockOllamaModel.invokeWithMessages.mockResolvedValue({ content: 'Respuesta de prueba' });
      jest.spyOn(service as any, 'persistSuccessfulQuestion').mockResolvedValue(undefined);

      const result = await service.preguntarOllamaOexternal({ pregunta: 'hola' } as any);

      expect(result).toContain('Modelo activo');
      expect(result).toContain('qwen3.5:4b');
      expect(result).toContain('Respuesta de prueba');
    });
  });

  describe('create', () => {
    it('should return expected message', () => {
      const result = service.create();
      expect(result).toBe('This action adds a new aichat');
    });
  });

  describe('findAll', () => {
    it('should return expected message', () => {
      const result = service.findAll();
      expect(result).toBe('This action returns all aichat');
    });
  });

  describe('findOne', () => {
    it('should return expected message', () => {
      const result = service.findOne(1);
      expect(result).toBe('This action returns a #1 aichat');
    });
  });

  describe('update', () => {
    it('should return expected message', () => {
      const result = service.update(1, {} as any);
      expect(result).toBe('This action updates a #1 aichat');
    });
  });

  describe('remove', () => {
    it('should return expected message', () => {
      const result = service.remove(1);
      expect(result).toBe('This action removes a #1 aichat');
    });
  });
});
