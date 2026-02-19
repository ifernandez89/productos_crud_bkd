import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class Product {
  @ApiProperty({ description: 'ID del producto', example: 1 })
  id: number;

  @ApiProperty({ description: 'Nombre del producto', example: 'iPhone 15' })
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción del producto',
    example: 'Smartphone de última generación',
  })
  description?: string;

  @ApiProperty({ description: 'Precio del producto', example: 999.99 })
  price: number;

  @ApiPropertyOptional({
    description: 'URL de la imagen del producto',
    example: 'https://example.com/image.jpg',
  })
  image?: string;

  @ApiProperty({ description: 'Stock disponible', example: 100 })
  stock: number;

  @ApiPropertyOptional({
    description: 'Si el producto está destacado',
    default: false,
  })
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'Si el producto está en oferta',
    default: false,
  })
  isOnSale?: boolean;

  @ApiPropertyOptional({
    description: 'Si el producto es nuevo',
    default: false,
  })
  isNew?: boolean;

  @ApiProperty({ description: 'Marca del producto', example: 'Apple' })
  marca: string;

  @ApiProperty({ description: 'Fecha de creación' })
  createdAT: Date;

  @ApiProperty({ description: 'Fecha de actualización' })
  updatedAt: Date;
}
