import { Test, TestingModule } from '@nestjs/testing';
import { AichatService } from './aichat.service';
import { PreguntasRepository } from './repositories/preguntas.repository';
import { ProductsRepository } from '../products/repositories/products.repository';
import { OllamaModelService } from './models/ollamaModel';
import { AssistantToolsService } from './utils/assistant-tools.service';
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
          provide: OllamaModelService,
          useValue: mockOllamaModel,
        },
        {
          provide: AssistantToolsService,
          useValue: mockAssistantTools,
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

      expect(result).toEqual([mockPregunta]);
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
