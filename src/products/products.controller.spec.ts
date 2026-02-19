import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Product } from '@prisma/client';

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: jest.Mocked<ProductsService>;

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

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    service = module.get(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a product', async () => {
      const createDto = {
        name: 'New Product',
        description: 'New Description',
        price: 50,
        stock: 5,
        marca: 'New Brand',
        image: 'https://example.com/new.jpg',
      };
      service.create.mockResolvedValue(mockProduct);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockProduct);
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return an array of products', async () => {
      service.findAll.mockResolvedValue([mockProduct]);

      const result = await controller.findAll();

      expect(result).toEqual([mockProduct]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      service.findOne.mockResolvedValue(mockProduct);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockProduct);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should update a product', async () => {
      const updateDto = { name: 'Updated Product' };
      const updatedProduct = { ...mockProduct, ...updateDto };
      service.update.mockResolvedValue(updatedProduct);

      const result = await controller.update(1, updateDto);

      expect(result).toEqual(updatedProduct);
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });
  });

  describe('remove', () => {
    it('should delete a product', async () => {
      service.remove.mockResolvedValue(mockProduct);

      const result = await controller.remove(1);

      expect(result).toEqual(mockProduct);
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });
});
