import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TranslatePdfDto {
  @ApiProperty({
    description: 'Categoría del libro (opcional, se detecta automáticamente si no se provee)',
    example: 'espiritualidad',
    required: false,
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({
    description: 'Título personalizado para el libro traducido (opcional, se infiere del PDF)',
    example: 'El Viaje Astral',
    required: false,
  })
  @IsOptional()
  @IsString()
  customTitle?: string;
}
