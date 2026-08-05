import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ChunkRequestDto {
  @ApiProperty({ description: 'Índice del bloque de audio a solicitar (0-indexed)', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chunk?: number;
}
