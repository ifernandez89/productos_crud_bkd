import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    //necesita el async porque debe await para que se resuelva la peticion antes de asignarla
    try {
      return await this.prismaService.product.create({
        data: createProductDto,
      });
    } catch (error) {
      console.error('Error al crear el producto:', error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Producto con name ${createProductDto.name}, ya existe`,
          );
        }
      }
      throw new InternalServerErrorException();
    }
  }

  findAll() {
   return this.prismaService.product.findMany().then((products) => {
    products.forEach((product) => {
      //console.log("Producto obtenido:", product);
    });
    return products;
  });
  }

  async findOne(id: number) {
    //debe ser asincrono para terminar de darme la respuesta antes de asignarla
    const productFound = await this.prismaService.product.findUnique({
      where: { id: id },
    });
    if (!productFound) {
      throw new NotFoundException(`Producto con id ${id}, no fue encontrado`);
    }
    return productFound;
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    //return `This action updates a #${id} product`;
    const productUpdated = await this.prismaService.product.update({
      where: {
        id,
      },
      data: updateProductDto,
    });

    if (!productUpdated) {
      throw new NotFoundException(`Producto con id ${id}, no fue encontrado`);
    }
    return productUpdated;
  }

  async remove(id: number) {
    const deletedProduct = await this.prismaService.product.delete({
      where: { id },
    });
    if (!deletedProduct) {
      throw new NotFoundException(`Producto con id ${id}, no fue encontrado`);
    }
    return deletedProduct;
  }
}
