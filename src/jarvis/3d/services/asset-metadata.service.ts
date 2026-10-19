import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * 🎨 JarBees Asset Metadata Service
 * 
 * Gestiona metadata estructurada de assets 3D para:
 * - Catalogación automática de modelos y escenas
 * - Reutilización de configuraciones de render exitosas
 * - Análisis de rendimiento GPU
 * - Generación de variantes procedurales
 * 
 * Compatible con formatos: GLB, GLTF, FBX, OBJ, Blender (.blend)
 */

export interface Asset3DMetadata {
  // Identificación única
  packageId: string;
  assetName: string;
  assetType: 'model' | 'scene' | 'material' | 'texture' | 'hdri';
  
  // Origen del asset
  sourcePath: string;
  sourceFormat: string;
  fileSize: number;
  checksum: string;
  
  // Información geométrica
  geometry?: {
    vertices: number;
    faces: number;
    boundingBox: {
      min: [number, number, number];
      max: [number, number, number];
      center: [number, number, number];
      dimensions: [number, number, number];
    };
    hasArmature: boolean;
    hasMorphTargets: boolean;
  };
  
  // Materiales y texturas
  materials?: {
    name: string;
    type: string;
    textures: {
      type: 'baseColor' | 'normal' | 'roughness' | 'metallic' | 'emission' | 'ao';
      path: string;
      resolution: [number, number];
    }[];
    properties: Record<string, any>;
  }[];
  
  // Configuración de iluminación
  lighting?: {
    type: 'hdri' | 'threePoint' | 'studio' | 'cinematic' | 'volumetric';
    hdriPath?: string;
    hdriStrength?: number;
    sunStrength?: number;
    ambientOcclusion?: boolean;
    volumetrics?: {
      density: number;
      anisotropy: number;
      scatterColor: [number, number, number];
    };
    godRays?: {
      enabled: boolean;
      samples: number;
      threshold: number;
    };
    caustics?: {
      enabled: boolean;
      pattern: 'voronoi' | 'waves' | 'glass';
      intensity: number;
    };
  };
  
  // Configuración de cámara
  camera?: {
    type: 'perspective' | 'orthographic';
    focalLength: number;
    sensor: number;
    fStop: number;
    focusDistance: number;
    position: [number, number, number];
    rotation: [number, number, number];
    target?: [number, number, number];
  };
  
  // Configuración de render
  renderConfig?: {
    engine: 'cycles' | 'eevee' | 'eevee-next';
    resolution: [number, number];
    samples: number;
    denoiser: 'openimagedenoise' | 'optix' | 'none';
    colorManagement: 'agx' | 'filmic' | 'standard';
    exposure: number;
    gamma: number;
    dof: {
      enabled: boolean;
      fStop: number;
      focusDistance: number;
    };
    motionBlur: boolean;
    bloom: {
      enabled: boolean;
      threshold: number;
      intensity: number;
    };
  };
  
  // Efectos procedurales
  proceduralEffects?: {
    particles?: {
      type: string;
      count: number;
      size: number;
      emissive: boolean;
    }[];
    weathering?: {
      rust: number;
      dirt: number;
      scratches: number;
      moss: number;
    };
    atmosphere?: {
      fog: boolean;
      fogDensity: number;
      fogColor: [number, number, number];
    };
  };
  
  // Métricas de rendimiento
  performance?: {
    renderTime: number; // segundos
    gpuModel: string;
    vramUsage: number; // MB
    cpuUsage: number; // porcentaje
    timestamp: string;
    blenderVersion: string;
  };
  
  // Tags y clasificación
  tags: string[];
  category: string;
  style: string[];
  
  // Historial de uso
  usage?: {
    renderCount: number;
    lastUsed: string;
    variants: string[]; // IDs de renders derivados
  };
  
  // Notas y comentarios
  notes?: string;
  artistNotes?: string;
  
  // Metadatos de creación
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface RenderReport {
  packageId: string;
  renderPath: string;
  thumbnail: string;
  metadata: Asset3DMetadata;
  quality: {
    isEmpty: boolean;
    hasArtifacts: boolean;
    averageBrightness: number;
    dynamicRange: number;
    score: number; // 0-100
  };
  recommendations?: string[];
}

@Injectable()
export class AssetMetadataService {
  private readonly logger = new Logger(AssetMetadataService.name);
  private readonly metadataDir = path.join(process.cwd(), 'storage', 'assets', 'metadata');
  private readonly catalogPath = path.join(process.cwd(), 'storage', 'assets', 'catalog.json');

  constructor() {
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.metadataDir, { recursive: true });
    } catch (error) {
      this.logger.error(`Error creating metadata directory: ${error.message}`);
    }
  }

  /**
   * 📝 Guardar metadata de un paquete 3D
   */
  async saveMetadata(metadata: Asset3DMetadata): Promise<string> {
    const filename = `${metadata.packageId}_info.json`;
    const filepath = path.join(this.metadataDir, filename);

    metadata.updatedAt = new Date().toISOString();
    if (!metadata.createdAt) {
      metadata.createdAt = metadata.updatedAt;
    }

    await fs.writeFile(filepath, JSON.stringify(metadata, null, 2), 'utf-8');
    
    // Actualizar catálogo
    await this.updateCatalog(metadata);

    this.logger.log(`✅ Metadata saved: ${filename}`);
    return filepath;
  }

  /**
   * 📖 Leer metadata de un paquete
   */
  async loadMetadata(packageId: string): Promise<Asset3DMetadata | null> {
    const filename = `${packageId}_info.json`;
    const filepath = path.join(this.metadataDir, filename);

    try {
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warn(`Metadata not found: ${packageId}`);
      return null;
    }
  }

  /**
   * 🔍 Buscar metadata por criterios
   */
  async searchMetadata(query: {
    assetType?: string;
    category?: string;
    style?: string | string[];
    tags?: string[];
    minQuality?: number;
  }): Promise<Asset3DMetadata[]> {
    const files = await fs.readdir(this.metadataDir);
    const results: Asset3DMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith('_info.json')) continue;

      const filepath = path.join(this.metadataDir, file);
      const content = await fs.readFile(filepath, 'utf-8');
      const metadata: Asset3DMetadata = JSON.parse(content);

      // Filtros
      if (query.assetType && metadata.assetType !== query.assetType) continue;
      if (query.category && metadata.category !== query.category) continue;
      if (query.style) {
        const styles = Array.isArray(query.style) ? query.style : [query.style];
        if (!styles.some(s => metadata.style?.includes(s))) continue;
      }
      if (query.tags && !query.tags.some(t => metadata.tags.includes(t))) continue;

      results.push(metadata);
    }

    return results;
  }

  /**
   * 🎨 Generar metadata desde archivo GLB/GLTF
   */
  async extractMetadataFromModel(
    modelPath: string,
    additionalInfo?: Partial<Asset3DMetadata>
  ): Promise<Asset3DMetadata> {
    const stats = await fs.stat(modelPath);
    const checksum = await this.calculateChecksum(modelPath);
    const packageId = additionalInfo?.packageId || crypto.randomUUID();

    const metadata: Asset3DMetadata = {
      packageId,
      assetName: path.basename(modelPath, path.extname(modelPath)),
      assetType: 'model',
      sourcePath: modelPath,
      sourceFormat: path.extname(modelPath).toLowerCase(),
      fileSize: stats.size,
      checksum,
      tags: [],
      category: 'uncategorized',
      style: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...additionalInfo,
    };

    return metadata;
  }

  /**
   * 📊 Generar reporte de render completo
   */
  async generateRenderReport(
    renderPath: string,
    metadata: Asset3DMetadata,
    performanceData?: {
      renderTime: number;
      gpuModel: string;
      vramUsage: number;
    }
  ): Promise<RenderReport> {
    // Generar thumbnail (reducir a 512px)
    const thumbnailPath = renderPath.replace('.png', '_thumb.png');

    // Análisis de calidad básico (expandir con sharp/jimp)
    const quality = await this.analyzeRenderQuality(renderPath);

    const report: RenderReport = {
      packageId: metadata.packageId,
      renderPath,
      thumbnail: thumbnailPath,
      metadata: {
        ...metadata,
        performance: performanceData ? {
          ...performanceData,
          cpuUsage: 0,
          timestamp: new Date().toISOString(),
          blenderVersion: '5.2',
        } : undefined,
      },
      quality,
      recommendations: this.generateRecommendations(metadata, quality),
    };

    // Guardar reporte
    const reportPath = path.join(
      this.metadataDir,
      `${metadata.packageId}_render_report.json`
    );
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    return report;
  }

  /**
   * 🔄 Actualizar catálogo global
   */
  private async updateCatalog(metadata: Asset3DMetadata): Promise<void> {
    try {
      let catalogObj: { assets: any[]; lastUpdated: string | null } = { assets: [], lastUpdated: null };
      let isArrayFormat = false;
      let arrayCatalog: any[] = [];

      try {
        const content = await fs.readFile(this.catalogPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          isArrayFormat = true;
          arrayCatalog = parsed;
        } else if (parsed && typeof parsed === 'object') {
          catalogObj = {
            assets: Array.isArray(parsed.assets) ? parsed.assets : [],
            lastUpdated: parsed.lastUpdated || null,
            ...parsed,
          };
        }
      } catch {
        // Catálogo nuevo o inexistente
      }

      const entry = {
        id: metadata.packageId,
        packageId: metadata.packageId,
        name: metadata.assetName,
        assetName: metadata.assetName,
        category: metadata.category,
        tags: metadata.tags,
        style: metadata.style,
        sourcePath: metadata.sourcePath,
        updatedAt: metadata.updatedAt,
      };

      if (isArrayFormat) {
        const index = arrayCatalog.findIndex(
          (a: any) => a.packageId === metadata.packageId || a.id === metadata.packageId
        );
        if (index >= 0) {
          arrayCatalog[index] = { ...arrayCatalog[index], ...entry };
        } else {
          arrayCatalog.push(entry);
        }
        await fs.writeFile(this.catalogPath, JSON.stringify(arrayCatalog, null, 2), 'utf-8');
      } else {
        if (!Array.isArray(catalogObj.assets)) {
          catalogObj.assets = [];
        }
        const index = catalogObj.assets.findIndex(
          (a: any) => a.packageId === metadata.packageId || a.id === metadata.packageId
        );
        if (index >= 0) {
          catalogObj.assets[index] = entry;
        } else {
          catalogObj.assets.push(entry);
        }
        catalogObj.lastUpdated = new Date().toISOString();
        await fs.writeFile(this.catalogPath, JSON.stringify(catalogObj, null, 2), 'utf-8');
      }
    } catch (err: any) {
      this.logger.warn(`Could not update catalog index: ${err.message}`);
    }
  }

  /**
   * 🎯 Calcular checksum SHA-256
   */
  private async calculateChecksum(filepath: string): Promise<string> {
    const buffer = await fs.readFile(filepath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * 📊 Análisis de calidad de render (placeholder)
   */
  private async analyzeRenderQuality(renderPath: string): Promise<any> {
    // Implementar con sharp o jimp
    return {
      isEmpty: false,
      hasArtifacts: false,
      averageBrightness: 0.5,
      dynamicRange: 0.8,
      score: 85,
    };
  }

  /**
   * 💡 Generar recomendaciones
   */
  private generateRecommendations(
    metadata: Asset3DMetadata,
    quality: any
  ): string[] {
    const recommendations: string[] = [];

    if (quality.score < 70) {
      recommendations.push('Considerar aumentar samples de render para mejor calidad');
    }

    if (metadata.renderConfig?.samples && metadata.renderConfig.samples < 128) {
      recommendations.push('Samples bajos detectados, puede haber ruido en volumétricos');
    }

    if (metadata.performance?.renderTime && metadata.performance.renderTime > 60) {
      recommendations.push('Tiempo de render elevado, considerar optimizar geometría o usar EEVEE');
    }

    if (!metadata.renderConfig?.denoiser || metadata.renderConfig.denoiser === 'none') {
      recommendations.push('Activar denoiser OptiX para reducir ruido sin aumentar samples');
    }

    return recommendations;
  }

  /**
   * 📈 Obtener estadísticas del catálogo
   */
  async getCatalogStats(): Promise<{
    totalAssets: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    totalRenders: number;
    averageRenderTime: number;
  }> {
    const files = await fs.readdir(this.metadataDir);
    const metadataFiles = files.filter(f => f.endsWith('_info.json'));

    const stats = {
      totalAssets: metadataFiles.length,
      byType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      totalRenders: 0,
      averageRenderTime: 0,
    };

    let totalTime = 0;
    let renderCount = 0;

    for (const file of metadataFiles) {
      const filepath = path.join(this.metadataDir, file);
      const content = await fs.readFile(filepath, 'utf-8');
      const metadata: Asset3DMetadata = JSON.parse(content);

      // Contadores por tipo
      stats.byType[metadata.assetType] = (stats.byType[metadata.assetType] || 0) + 1;
      stats.byCategory[metadata.category] = (stats.byCategory[metadata.category] || 0) + 1;

      // Estadísticas de render
      if (metadata.performance?.renderTime) {
        totalTime += metadata.performance.renderTime;
        renderCount++;
      }

      if (metadata.usage?.renderCount) {
        stats.totalRenders += metadata.usage.renderCount;
      }
    }

    if (renderCount > 0) {
      stats.averageRenderTime = totalTime / renderCount;
    }

    return stats;
  }
}
