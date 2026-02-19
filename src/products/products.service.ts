import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsRepository } from './repositories/products.repository';
import { Product } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly productsRepository: ProductsRepository) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      return await this.productsRepository.create(createProductDto);
    } catch (error) {
      this.logger.error(`Error creating product: ${error.message}`);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Producto con name ${createProductDto.name}, ya existe`,
          );
        }

        if (
          error.code === 'P2003' ||
          error.message.includes('must not be null')
        ) {
          throw new BadRequestException(
            `Falta el campo obligatorio: ${error.meta?.field_name || 'desconocido'}`,
          );
        }
      } else if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException(error.message);
      }
      throw new InternalServerErrorException('Error al crear el producto');
    }
  }

  async findAll(): Promise<Product[]> {
    return this.productsRepository.findAll();
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException(`Producto con id ${id}, no fue encontrado`);
    }
    return product;
  }

  async update(
    id: number,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    await this.findOne(id);
    try {
      return await this.productsRepository.update(id, updateProductDto);
    } catch (error) {
      this.logger.error(`Error updating product: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al actualizar el producto');
    }
  }

  async remove(id: number): Promise<Product> {
    await this.findOne(id);
    try {
      return await this.productsRepository.delete(id);
    } catch (error) {
      this.logger.error(`Error deleting product: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Error al eliminar el producto');
    }
  }
}
