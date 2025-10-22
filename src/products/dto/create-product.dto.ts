import { IsBoolean, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @IsNotEmpty()
  price: number;

  @IsString()
  @IsNotEmpty()
  image: string;

  @IsString()
  @IsNotEmpty()
  marca: string;

  @IsNumber()
  @IsNotEmpty({ message: 'El campo stock es obligatorio y debe ser un número' })
  stock: number;

  @IsBoolean()
  isFeatured?: boolean;

  @IsBoolean()
  isOnSale?: boolean;

  @IsBoolean()
  isNew?: boolean;
}

