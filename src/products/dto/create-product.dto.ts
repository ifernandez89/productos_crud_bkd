import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ description: 'Nombre del producto', example: 'iPhone 15' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Descripción del producto',
    example: 'Smartphone de última generación',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Precio del producto', example: 999.99 })
  @IsNumber()
  @IsNotEmpty()
  price: number;

  @ApiProperty({
    description: 'URL de la imagen del producto',
    example: 'https://example.com/image.jpg',
  })
  @IsString()
  @IsNotEmpty()
  image: string;

  @ApiProperty({ description: 'Marca del producto', example: 'Apple' })
  @IsString()
  @IsNotEmpty()
  marca: string;

  @ApiProperty({ description: 'Stock disponible', example: 100 })
  @IsNumber()
  @IsNotEmpty({ message: 'El campo stock es obligatorio y debe ser un número' })
  stock: number;

  @ApiPropertyOptional({
    description: 'Si el producto está destacado',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'Si el producto está en oferta',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isOnSale?: boolean;

  @ApiPropertyOptional({
    description: 'Si el producto es nuevo',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isNew?: boolean;
}
