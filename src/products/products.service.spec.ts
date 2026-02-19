import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductsRepository } from './repositories/products.repository';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Product } from '@prisma/client';

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: jest.Mocked<ProductsRepository>;

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

  const mockRepository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: ProductsRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    repository = module.get(ProductsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      name: 'New Product',
      description: 'New Description',
      price: 50,
      stock: 5,
      marca: 'New Brand',
      image: 'https://example.com/new.jpg',
    };

    it('should create a product successfully', async () => {
      repository.create.mockResolvedValue(mockProduct);

      const result = await service.create(createDto);

      expect(result).toEqual(mockProduct);
      expect(repository.create).toHaveBeenCalledWith(createDto);
    });

    it('should throw ConflictException on duplicate name', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Duplicate', {
        code: 'P2002',
        clientVersion: '1',
        meta: { target: ['name'] },
      });
      repository.create.mockRejectedValue(error);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException on validation error', async () => {
      const error = new Prisma.PrismaClientValidationError(
        'Validation failed',
        { clientVersion: '1' },
      );
      repository.create.mockRejectedValue(error);

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of products', async () => {
      repository.findAll.mockResolvedValue([mockProduct]);

      const result = await service.findAll();

      expect(result).toEqual([mockProduct]);
      expect(repository.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      repository.findById.mockResolvedValue(mockProduct);

      const result = await service.findOne(1);

      expect(result).toEqual(mockProduct);
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if product not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = { name: 'Updated Product' };

    it('should update a product successfully', async () => {
      const updatedProduct = { ...mockProduct, ...updateDto };
      repository.findById.mockResolvedValue(mockProduct);
      repository.update.mockResolvedValue(updatedProduct);

      const result = await service.update(1, updateDto);

      expect(result).toEqual(updatedProduct);
      expect(repository.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('should throw NotFoundException if product not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update(999, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a product successfully', async () => {
      repository.findById.mockResolvedValue(mockProduct);
      repository.delete.mockResolvedValue(mockProduct);

      const result = await service.remove(1);

      expect(result).toEqual(mockProduct);
      expect(repository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if product not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
