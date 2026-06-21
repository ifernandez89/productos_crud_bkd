import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
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

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  agente: boolean;
}
