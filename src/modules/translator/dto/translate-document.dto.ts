import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TranslateDocumentDto {
  @ApiProperty({
    description: 'Título personalizado para la versión traducida (opcional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  customTitle?: string;

  @ApiProperty({
    description: 'Categoría para el documento traducido (opcional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  category?: string;
}
