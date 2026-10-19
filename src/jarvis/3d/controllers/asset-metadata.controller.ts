import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { AssetMetadataService, Asset3DMetadata } from '../services/asset-metadata.service';
import * as crypto from 'crypto';

/**
 * 🎨 Asset Metadata API Controller
 * 
 * Endpoints para gestión de metadata de assets 3D en JarBees Studio
 */
@Controller('jarvis/3d/metadata')
export class AssetMetadataController {
  private readonly logger = new Logger(AssetMetadataController.name);

  constructor(private readonly metadataService: AssetMetadataService) {}

  /**
   * 📊 GET /jarvis/3d/metadata/stats
   * Obtener estadísticas del catálogo completo
   */
  @Get('stats')
  async getCatalogStats() {
    try {
      const stats = await this.metadataService.getCatalogStats();
      return {
        success: true,
        stats,
      };
    } catch (error) {
      this.logger.error(`Error fetching catalog stats: ${error.message}`);
      throw new HttpException(
        'Failed to retrieve catalog statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 📖 GET /jarvis/3d/metadata/:packageId
   * Obtener metadata de un asset específico
   */
  @Get(':packageId')
  async getMetadata(@Param('packageId') packageId: string) {
    try {
      const metadata = await this.metadataService.loadMetadata(packageId);
      
      if (!metadata) {
        throw new HttpException(
          `Metadata not found for package: ${packageId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        metadata,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      
      this.logger.error(`Error loading metadata: ${error.message}`);
      throw new HttpException(
        'Failed to load metadata',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 🔍 GET /jarvis/3d/metadata/search
   * Buscar assets por criterios
   * 
   * Query params:
   * - assetType: model | scene | material | texture | hdri
   * - category: string
   * - style: string (comma-separated)
   * - tags: string (comma-separated)
   * - minQuality: number (0-100)
   */
  @Get()
  async searchMetadata(
    @Query('assetType') assetType?: string,
    @Query('category') category?: string,
    @Query('style') style?: string,
    @Query('tags') tags?: string,
    @Query('minQuality') minQuality?: string,
  ) {
    try {
      const query: any = {};

      if (assetType) query.assetType = assetType;
      if (category) query.category = category;
      if (style) query.style = style.split(',').map(s => s.trim());
      if (tags) query.tags = tags.split(',').map(t => t.trim());
      if (minQuality) query.minQuality = parseInt(minQuality, 10);

      const results = await this.metadataService.searchMetadata(query);

      return {
        success: true,
        count: results.length,
        results,
      };
    } catch (error) {
      this.logger.error(`Error searching metadata: ${error.message}`);
      throw new HttpException(
        'Failed to search metadata',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 💾 POST /jarvis/3d/metadata
   * Guardar o actualizar metadata de un asset
   */
  @Post()
  async saveMetadata(@Body() metadata: Asset3DMetadata) {
    try {
      const filepath = await this.metadataService.saveMetadata(metadata);

      return {
        success: true,
        message: 'Metadata saved successfully',
        packageId: metadata.packageId,
        filepath,
      };
    } catch (error) {
      this.logger.error(`Error saving metadata: ${error.message}`);
      throw new HttpException(
        'Failed to save metadata',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 🎨 POST /jarvis/3d/metadata/extract
   * Extraer metadata automáticamente desde un modelo GLB/GLTF
   */
  @Post('extract')
  async extractMetadata(
    @Body('modelPath') modelPath: string,
    @Body('additionalInfo') additionalInfo?: Partial<Asset3DMetadata>,
  ) {
    try {
      if (!modelPath) {
        throw new HttpException(
          'Model path is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const metadata = await this.metadataService.extractMetadataFromModel(
        modelPath,
        additionalInfo,
      );

      const filepath = await this.metadataService.saveMetadata(metadata);

      return {
        success: true,
        message: 'Metadata extracted and saved',
        packageId: metadata.packageId,
        metadata,
        filepath,
      };
    } catch (error) {
      this.logger.error(`Error extracting metadata: ${error.message}`);
      throw new HttpException(
        'Failed to extract metadata',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 📊 POST /jarvis/3d/metadata/report
   * Generar reporte completo de render con análisis de calidad
   */
  @Post('report')
  async generateRenderReport(
    @Body('renderPath') renderPath: string,
    @Body('metadata') metadata: Asset3DMetadata,
    @Body('performance') performance?: {
      renderTime: number;
      gpuModel: string;
      vramUsage: number;
    },
  ) {
    try {
      if (!renderPath || !metadata) {
        throw new HttpException(
          'Render path and metadata are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const report = await this.metadataService.generateRenderReport(
        renderPath,
        metadata,
        performance,
      );

      return {
        success: true,
        message: 'Render report generated',
        report,
      };
    } catch (error) {
      this.logger.error(`Error generating render report: ${error.message}`);
      throw new HttpException(
        'Failed to generate render report',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 🎯 GET /jarvis/3d/metadata/:packageId/similar
   * Encontrar assets similares basados en tags, estilo y categoría
   */
  @Get(':packageId/similar')
  async findSimilarAssets(
    @Param('packageId') packageId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const metadata = await this.metadataService.loadMetadata(packageId);
      
      if (!metadata) {
        throw new HttpException(
          `Metadata not found for package: ${packageId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Buscar por tags y estilo comunes
      const similar = await this.metadataService.searchMetadata({
        category: metadata.category,
        tags: metadata.tags,
        style: metadata.style?.[0],
      });

      // Excluir el asset original
      const filtered = similar
        .filter(m => m.packageId !== packageId)
        .slice(0, limit ? parseInt(limit, 10) : 10);

      return {
        success: true,
        count: filtered.length,
        similar: filtered,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      
      this.logger.error(`Error finding similar assets: ${error.message}`);
      throw new HttpException(
        'Failed to find similar assets',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 🔄 POST /jarvis/3d/metadata/:packageId/clone
   * Clonar configuración de metadata para crear una variante
   */
  @Post(':packageId/clone')
  async cloneMetadata(
    @Param('packageId') packageId: string,
    @Body('overrides') overrides?: Partial<Asset3DMetadata>,
  ) {
    try {
      const original = await this.metadataService.loadMetadata(packageId);
      
      if (!original) {
        throw new HttpException(
          `Metadata not found for package: ${packageId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Crear clon con nuevo ID
      const clone: Asset3DMetadata = {
        ...original,
        packageId: crypto.randomUUID(),
        assetName: `${original.assetName} (Variant)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usage: {
          renderCount: 0,
          lastUsed: new Date().toISOString(),
          variants: [],
        },
        ...overrides,
      };

      // Registrar relación con original
      if (original.usage) {
        original.usage.variants = original.usage.variants || [];
        original.usage.variants.push(clone.packageId);
        await this.metadataService.saveMetadata(original);
      }

      const filepath = await this.metadataService.saveMetadata(clone);

      return {
        success: true,
        message: 'Metadata cloned successfully',
        originalId: packageId,
        cloneId: clone.packageId,
        clone,
        filepath,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      
      this.logger.error(`Error cloning metadata: ${error.message}`);
      throw new HttpException(
        'Failed to clone metadata',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
