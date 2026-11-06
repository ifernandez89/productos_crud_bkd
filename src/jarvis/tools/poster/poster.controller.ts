import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Res,
  NotFoundException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { PosterService } from './poster.service';
import { GeneratePosterDto } from './poster.types';
import { PortraitService } from './portrait/portrait.service';
import { GeneratePortraitDto } from './portrait/portrait.types';
import {
  SecurityKernelAuthGuard,
  RequireSecurityPermission,
} from '../../security/security-kernel-auth.guard';

@ApiTags('Jarvis Poster Generator')
@UseGuards(SecurityKernelAuthGuard)
@Controller('jarbees/poster')
export class PosterController {
  constructor(
    private readonly posterService: PosterService,
    private readonly portraitService: PortraitService,
  ) {}

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:poster:mutate' })
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

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:poster:read' })
  @Get('portrait/presets')
  @ApiOperation({ summary: 'Obtener presets de estilos, expresiones y paletas para retratos' })
  getPortraitPresets() {
    return {
      success: true,
      presets: this.portraitService.getPresets(),
    };
  }

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:poster:mutate' })
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

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:poster:read' })
  @Get('presets')
  @ApiOperation({ summary: 'Obtener presets de consolas y temas' })
  getPresets() {
    return {
      success: true,
      presets: this.posterService.getPresets(),
    };
  }

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:poster:read' })
  @Get('assets')
  @ApiOperation({ summary: 'Consultar catálogo de recursos reutilizables (paletas, materiales, encuadres)' })
  getAssets() {
    return {
      success: true,
      assets: this.posterService.getAssetCatalog(),
    };
  }

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:poster:mutate' })
  @Get('diagnostics/gpu')
  @ApiOperation({ summary: 'Comprobar aceleración empírica de GPU y WebGL en el motor headless' })
  async getGpuDiagnostics() {
    const diag = await this.posterService.getGpuDiagnostics();
    return {
      success: true,
      gpu: diag,
    };
  }

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:poster:read' })
  @Get('history')
  @ApiOperation({ summary: 'Listar imágenes y carátulas generadas en disco' })
  getHistory() {
    return {
      success: true,
      history: this.posterService.getHistory(),
    };
  }

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:poster:read' })
  @Get('file/:filename')
  @ApiOperation({ summary: 'Descargar o visualizar archivo PNG/SVG generado' })
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    if (!filename || /[\\/\0]/.test(filename) || filename.includes('..')) {
      throw new ForbiddenException('SecurityKernel: nombre de archivo inválido.');
    }
    const safeName = path.basename(filename);
    const postersDir = path.resolve(process.cwd(), 'storage', 'posters');
    const filePath = path.resolve(postersDir, safeName);

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

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:poster:read' })
  @Get('draco/:file')
  @ApiOperation({ summary: 'Servir decodificadores DRACO para modelos 3D GLB' })
  serveDraco(@Param('file') file: string, @Res() res: Response) {
    if (!file || /[\\/\0]/.test(file) || file.includes('..')) {
      throw new ForbiddenException('SecurityKernel: nombre de archivo inválido.');
    }
    const safeName = path.basename(file);
    const dracoDir = path.resolve(process.cwd(), 'storage', 'assets', 'three', 'draco');
    const filePath = path.resolve(dracoDir, safeName);
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
