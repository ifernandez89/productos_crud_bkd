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
import { PortraitService } from './portrait/portrait.service';
import { GeneratePortraitDto } from './portrait/portrait.types';

@ApiTags('Jarvis Poster Generator')
@Controller('jarbees/poster')
export class PosterController {
  constructor(
    private readonly posterService: PosterService,
    private readonly portraitService: PortraitService,
  ) {}

  @Public()
  @Post('portrait/generate')
  @ApiOperation({
    summary: 'Generar retrato paramétrico 2.5D con control de calidad anatómico (QA) y exportación hasta 2048x2048',
  })
  async generatePortrait(@Body() body: GeneratePortraitDto) {
    const result = await this.portraitService.generatePortrait(body);
    return {
      success: true,
      data: result,
    };
  }

  @Public()
  @Get('portrait/presets')
  @ApiOperation({ summary: 'Obtener presets de estilos, expresiones y paletas para retratos' })
  getPortraitPresets() {
    return {
      success: true,
      presets: this.portraitService.getPresets(),
    };
  }

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
  @Get('assets')
  @ApiOperation({ summary: 'Consultar catálogo de recursos reutilizables (paletas, materiales, encuadres)' })
  getAssets() {
    return {
      success: true,
      assets: this.posterService.getAssetCatalog(),
    };
  }

  @Public()
  @Get('diagnostics/gpu')
  @ApiOperation({ summary: 'Comprobar aceleración empírica de GPU y WebGL en el motor headless' })
  async getGpuDiagnostics() {
    const diag = await this.posterService.getGpuDiagnostics();
    return {
      success: true,
      gpu: diag,
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

  @Public()
  @Get('draco/:file')
  @ApiOperation({ summary: 'Servir decodificadores DRACO para modelos 3D GLB' })
  serveDraco(@Param('file') file: string, @Res() res: Response) {
    const safeName = path.basename(file);
    const filePath = path.join(process.cwd(), 'storage', 'assets', 'three', 'draco', safeName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Draco decoder file ${safeName} not found`);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (safeName.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    } else if (safeName.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    return res.sendFile(filePath);
  }
}
