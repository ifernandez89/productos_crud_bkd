import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../../../auth/public.decorator';
import { PosterService } from './poster.service';
import { GeneratePosterDto } from './poster.types';

@ApiTags('Jarvis Poster Generator')
@Controller('jarbees/poster')
export class PosterController {
  constructor(private readonly posterService: PosterService) {}

  @Public()
  @Post('generate')
  @ApiOperation({
    summary: 'Generar póster o carátula retro procedural por código con control de calidad (QA)',
  })
  async generatePoster(@Body() body: GeneratePosterDto) {
    const result = await this.posterService.generate(body);
    return {
      success: true,
      data: result,
    };
  }

  @Public()
  @Get('presets')
  @ApiOperation({ summary: 'Obtener presets de consolas y temas' })
  getPresets() {
    return {
      success: true,
      presets: this.posterService.getPresets(),
    };
  }

  @Public()
  @Get('history')
  @ApiOperation({ summary: 'Listar imágenes y carátulas generadas en disco' })
  getHistory() {
    return {
      success: true,
      history: this.posterService.getHistory(),
    };
  }

  @Public()
  @Get('file/:filename')
  @ApiOperation({ summary: 'Descargar o visualizar archivo PNG/SVG generado' })
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    // Sanitizar nombre de archivo para evitar Path Traversal
    const safeName = path.basename(filename);
    const filePath = path.join(process.cwd(), 'storage', 'posters', safeName);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Archivo ${safeName} no encontrado`);
    }

    if (safeName.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (safeName.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (safeName.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }

    return res.sendFile(filePath);
  }
}
