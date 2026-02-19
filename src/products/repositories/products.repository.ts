import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Product } from '@prisma/client';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';

export interface IProductsRepository {
  create(data: CreateProductDto): Promise<Product>;
  findAll(): Promise<Product[]>;
  findById(id: number): Promise<Product | null>;
  update(id: number, data: UpdateProductDto): Promise<Product>;
  delete(id: number): Promise<Product>;
}

@Injectable()
export class ProductsRepository implements IProductsRepository {
  private readonly logger = new Logger(ProductsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({ data });
  }

  async findAll(): Promise<Product[]> {
    return this.prisma.product.findMany();
  }

  async findById(id: number): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async update(id: number, data: UpdateProductDto): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data });
  }

  async delete(id: number): Promise<Product> {
    return this.prisma.product.delete({ where: { id } });
  }
}
