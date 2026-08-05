import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { ReaderService } from './reader.service';
import { ChunkRequestDto } from './dto/chunk-request.dto';

@ApiTags('reader')
@Controller('reader')
export class ReaderController {
  constructor(private readonly readerService: ReaderService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Listar todos los documentos disponibles en la biblioteca de audiolibros' })
  async listDocuments() {
    const documentos = await this.readerService.listDocuments();
    return { success: true, documentos };
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un documento con sus bloques de lectura' })
  async getDocument(@Param('id') id: string) {
    return this.readerService.getDocument(id);
  }

  @Public()
  @Post(':id/chunk')
  @ApiOperation({ summary: 'Solicitar audio (WAV) de un bloque específico mediante POST' })
  async getChunkAudioPost(
    @Param('id') id: string,
    @Body() body: ChunkRequestDto,
    @Res() res: Response,
  ) {
    const chunkIndex = body?.chunk ?? 0;
    const audioBuffer = await this.readerService.getChunkAudio(id, chunkIndex);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="chunk_${chunkIndex}.wav"`);
    res.status(200).send(audioBuffer);
  }

  @Public()
  @Get(':id/chunk/:chunkIndex')
  @ApiOperation({ summary: 'Obtener audio (WAV) de un bloque mediante GET directo' })
  async getChunkAudioGet(
    @Param('id') id: string,
    @Param('chunkIndex', ParseIntPipe) chunkIndex: number,
    @Res() res: Response,
  ) {
    const audioBuffer = await this.readerService.getChunkAudio(id, chunkIndex);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="chunk_${chunkIndex}.wav"`);
    res.status(200).send(audioBuffer);
  }
}
