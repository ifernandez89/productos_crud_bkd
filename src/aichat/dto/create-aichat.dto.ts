import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const PREGUNTA_MAX_LENGTH = 5000;

export class CreateAichatDto {
  @ApiProperty({ maxLength: PREGUNTA_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PREGUNTA_MAX_LENGTH, {
    message: `La pregunta no puede exceder ${PREGUNTA_MAX_LENGTH} caracteres.`,
  })
  pregunta: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  agente: boolean;

  @ApiProperty({ required: false, type: 'number', description: 'Latitud del usuario para clima local' })
  @Type(() => Number)
  @IsNumber({}, { message: 'latitude debe ser un número' })
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false, type: 'number', description: 'Longitud del usuario para clima local' })
  @Type(() => Number)
  @IsNumber({}, { message: 'longitude debe ser un número' })
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false, description: 'Identificador de sesión para mantener el hilo de conversación' })
  @IsString()
  @IsOptional()
  sessionId?: string;
}
