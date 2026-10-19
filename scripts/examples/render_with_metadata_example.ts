/**
 * 🎨 Ejemplo Completo: Render con Sistema de Metadata Automático
 * 
 * Demuestra el flujo completo de:
 * 1. Extraer metadata base de un modelo GLB
 * 2. Configurar iluminación, cámara y render settings
 * 3. Ejecutar render con BlenderService
 * 4. Generar reporte de calidad
 * 5. Clonar configuración para crear variantes
 */

import { Injectable, Logger } from '@nestjs/common';
import { BlenderService } from '../../src/jarvis/3d/blender.service';
import { AssetMetadataService, Asset3DMetadata } from '../../src/jarvis/3d/services/asset-metadata.service';
import * as crypto from 'crypto';

@Injectable()
export class MetadataRenderPipelineExample {
  private readonly logger = new Logger(MetadataRenderPipelineExample.name);

  constructor(
    private readonly blenderService: BlenderService,
    private readonly metadataService: AssetMetadataService,
  ) {}

  /**
   * 🌊 Pipeline Completo: Render Oceánico con Metadata
   */
  async renderOceanicSceneWithMetadata(modelPath: string): Promise<{
    renderPath: string;
    metadata: Asset3DMetadata;
    report: any;
  }> {
    this.logger.log('🎬 Iniciando pipeline de render con metadata...');
    const startTime = Date.now();

    // ──────────────────────────────────────────────────────────────
    // 1. Extraer metadata base del modelo
    // ──────────────────────────────────────────────────────────────
    const packageId = crypto.randomUUID();
    
    const baseMetadata: Asset3DMetadata = {
      packageId,
      assetName: 'Ballena Jorobada - Abismo Oceánico Ecco Style',
      assetType: 'scene',
      sourcePath: modelPath,
      sourceFormat: '.glb',
      fileSize: 45678901,
      checksum: 'auto-generated',
      
      // Información geométrica (se puede extraer con GLTF parser)
      geometry: {
        vertices: 156789,
        faces: 124567,
        boundingBox: {
          min: [-12.5, -8.3, -25.7],
          max: [12.5, 8.3, 5.2],
          center: [0.0, 0.0, -10.25],
          dimensions: [25.0, 16.6, 30.9],
        },
        hasArmature: true,
        hasMorphTargets: false,
      },
      
      // ──────────────────────────────────────────────────────────────
      // 2. Configuración de Iluminación Cinematográfica
      // ──────────────────────────────────────────────────────────────
      lighting: {
        type: 'cinematic',
        hdriPath: 'G:\\HDRIs\\Ocean_Surface_Daylight_8K.exr',
        hdriStrength: 1.2,
        sunStrength: 3.5,
        ambientOcclusion: true,
        
        // Volumetría marina
        volumetrics: {
          density: 0.008,
          anisotropy: 0.70,
          scatterColor: [0.15, 0.28, 0.42], // Azul océano
        },
        
        // God Rays / Rayos de Dios
        godRays: {
          enabled: true,
          samples: 64,
          threshold: 0.15,
        },
        
        // Cáusticas proyectadas
        caustics: {
          enabled: true,
          pattern: 'voronoi',
          intensity: 2.8,
        },
      },
      
      // ──────────────────────────────────────────────────────────────
      // 3. Configuración de Cámara Cinematográfica
      // ──────────────────────────────────────────────────────────────
      camera: {
        type: 'perspective',
        focalLength: 35,
        sensor: 36,
        fStop: 2.8,
        focusDistance: 18.5,
        position: [-8.2, 3.5, -15.7],
        rotation: [1.15, 0.0, -0.35],
        target: [0.0, 0.0, -10.0],
      },
      
      // ──────────────────────────────────────────────────────────────
      // 4. Configuración de Render (EEVEE Next)
      // ──────────────────────────────────────────────────────────────
      renderConfig: {
        engine: 'eevee-next',
        resolution: [2560, 1440],
        samples: 256,
        denoiser: 'optix',
        colorManagement: 'agx',
        exposure: 0.0,
        gamma: 1.0,
        dof: {
          enabled: true,
          fStop: 2.8,
          focusDistance: 18.5,
        },
        motionBlur: false,
        bloom: {
          enabled: true,
          threshold: 0.85,
          intensity: 0.35,
        },
      },
      
      // ──────────────────────────────────────────────────────────────
      // 5. Efectos Procedurales
      // ──────────────────────────────────────────────────────────────
      proceduralEffects: {
        particles: [
          {
            type: 'bioluminescent_plankton',
            count: 65,
            size: 0.08,
            emissive: true,
          },
          {
            type: 'fish_school',
            count: 120,
            size: 0.15,
            emissive: false,
          },
        ],
        atmosphere: {
          fog: true,
          fogDensity: 0.012,
          fogColor: [0.08, 0.15, 0.28],
        },
      },
      
      tags: [
        'whale',
        'humpback',
        'ocean',
        'underwater',
        'cinematic',
        'dreamcast',
        'ecco',
        'volumetric',
        'god-rays',
        'caustics',
        'bioluminescent',
        'abyss',
        'marine-life',
      ],
      category: 'cinematic-render',
      style: [
        'dreamcast-aesthetic',
        'ecco-the-dolphin',
        'underwater-photography',
        'volumetric-lighting',
        'photorealistic',
      ],
      
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'JarBees Procedural 3D Studio',
    };

    // ──────────────────────────────────────────────────────────────
    // 6. Guardar metadata antes de render
    // ──────────────────────────────────────────────────────────────
    await this.metadataService.saveMetadata(baseMetadata);
    this.logger.log(`✅ Metadata guardada: ${packageId}`);

    // ──────────────────────────────────────────────────────────────
    // 7. Ejecutar render con Blender (aquí iría la integración real)
    // ──────────────────────────────────────────────────────────────
    const renderPath = `storage/assets/renders/${packageId}.png`;
    
    // Simular render (en producción, usar BlenderService.render())
    this.logger.log('🎨 Renderizando escena...');
    // const result = await this.blenderService.renderOceanicAbyss({
    //   modelPath,
    //   outputPath: renderPath,
    //   ...baseMetadata.renderConfig,
    //   ...baseMetadata.lighting,
    //   ...baseMetadata.camera,
    // });

    const renderTime = (Date.now() - startTime) / 1000;

    // ──────────────────────────────────────────────────────────────
    // 8. Generar reporte de calidad con métricas de rendimiento
    // ──────────────────────────────────────────────────────────────
    const report = await this.metadataService.generateRenderReport(
      renderPath,
      baseMetadata,
      {
        renderTime,
        gpuModel: 'NVIDIA GeForce RTX 5070',
        vramUsage: 7840,
      },
    );

    this.logger.log('✅ Render completo con reporte de calidad');
    this.logger.log(`   - Tiempo de render: ${renderTime}s`);
    this.logger.log(`   - Calidad score: ${report.quality.score}/100`);
    this.logger.log(`   - Recomendaciones: ${report.recommendations.length}`);

    return {
      renderPath,
      metadata: baseMetadata,
      report,
    };
  }

  /**
   * 🔄 Crear Variante "Amanecer Dorado"
   */
  async createGoldenSunriseVariant(originalPackageId: string): Promise<string> {
    this.logger.log('🌅 Creando variante "Amanecer Dorado"...');

    // Obtener metadata original
    const original = await this.metadataService.loadMetadata(originalPackageId);
    
    if (!original) {
      throw new Error(`Metadata not found: ${originalPackageId}`);
    }

    // Crear variante con overrides
    const variantId = crypto.randomUUID();
    
    const variant: Asset3DMetadata = {
      ...original,
      packageId: variantId,
      assetName: 'Ballena Jorobada - Amanecer Dorado',
      
      // Override: Iluminación de amanecer
      lighting: {
        ...original.lighting!,
        hdriPath: 'G:\\HDRIs\\Sunrise_8K.exr',
        hdriStrength: 1.8,
        volumetrics: {
          density: 0.008,
          anisotropy: 0.70,
          scatterColor: [0.95, 0.75, 0.35], // Tonos dorados cálidos
        },
      },
      
      // Override: Cámara más dramática
      camera: {
        ...original.camera!,
        focalLength: 50, // Más tele
        fStop: 1.8, // Bokeh más pronunciado
        position: [-12, 5, -20], // Ángulo más alto y dramático
      },
      
      // Override: Tags adicionales
      tags: [
        ...original.tags,
        'sunrise',
        'golden-hour',
        'warm-tones',
      ],
      
      style: [
        'dreamcast-aesthetic',
        'golden-hour-photography',
        'volumetric-lighting',
      ],
      
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Guardar variante
    await this.metadataService.saveMetadata(variant);

    // Actualizar original con referencia a variante
    if (!original.usage) {
      original.usage = { renderCount: 1, lastUsed: original.updatedAt, variants: [] };
    }
    original.usage.variants.push(variantId);
    await this.metadataService.saveMetadata(original);

    this.logger.log(`✅ Variante creada: ${variantId}`);
    this.logger.log(`   - Original: ${originalPackageId}`);
    this.logger.log(`   - Variante: ${variantId}`);

    return variantId;
  }

  /**
   * 🔍 Buscar Configuraciones Rápidas (< 10s)
   */
  async findFastRenderConfigs(): Promise<Asset3DMetadata[]> {
    this.logger.log('⚡ Buscando configuraciones de render rápido...');

    const allScenes = await this.metadataService.searchMetadata({
      assetType: 'scene',
    });

    const fastRenders = allScenes.filter(
      (scene) =>
        scene.performance?.renderTime && scene.performance.renderTime < 10,
    );

    this.logger.log(`✅ Encontrados ${fastRenders.length} renders rápidos:`);
    
    fastRenders.slice(0, 5).forEach((scene, idx) => {
      this.logger.log(
        `   ${idx + 1}. ${scene.assetName}: ${scene.performance?.renderTime}s (${scene.renderConfig?.engine})`,
      );
    });

    return fastRenders;
  }

  /**
   * 📊 Análisis de Rendimiento por GPU
   */
  async analyzePerformanceByGPU(): Promise<Record<string, any>> {
    const allScenes = await this.metadataService.searchMetadata({
      assetType: 'scene',
    });

    const byGPU: Record<string, { count: number; avgTime: number; totalTime: number }> = {};

    allScenes.forEach((scene) => {
      if (!scene.performance?.gpuModel || !scene.performance?.renderTime) return;

      const gpu = scene.performance.gpuModel;
      
      if (!byGPU[gpu]) {
        byGPU[gpu] = { count: 0, avgTime: 0, totalTime: 0 };
      }

      byGPU[gpu].count++;
      byGPU[gpu].totalTime += scene.performance.renderTime;
    });

    // Calcular promedios
    Object.keys(byGPU).forEach((gpu) => {
      byGPU[gpu].avgTime = byGPU[gpu].totalTime / byGPU[gpu].count;
    });

    this.logger.log('📊 Análisis de rendimiento por GPU:');
    Object.entries(byGPU).forEach(([gpu, stats]) => {
      this.logger.log(`   ${gpu}: ${stats.avgTime.toFixed(2)}s promedio (${stats.count} renders)`);
    });

    return byGPU;
  }
}

/**
 * 🚀 Ejemplo de Uso
 */
export async function runMetadataExample() {
  // Simular instancias de servicios (en producción usar NestJS DI)
  const blenderService = new BlenderService();
  const metadataService = new AssetMetadataService();
  const pipeline = new MetadataRenderPipelineExample(blenderService, metadataService);

  // 1. Renderizar con metadata completa
  const { renderPath, metadata, report } = await pipeline.renderOceanicSceneWithMetadata(
    'G:\\new models\\Ballena jorobada.glb',
  );

  console.log('\n✅ Render Completado:');
  console.log(`   - Path: ${renderPath}`);
  console.log(`   - Package ID: ${metadata.packageId}`);
  console.log(`   - Calidad: ${report.quality.score}/100`);

  // 2. Crear variante
  const variantId = await pipeline.createGoldenSunriseVariant(metadata.packageId);
  console.log(`\n✅ Variante Creada: ${variantId}`);

  // 3. Buscar renders rápidos
  await pipeline.findFastRenderConfigs();

  // 4. Análisis de rendimiento
  await pipeline.analyzePerformanceByGPU();
}

// Descomentar para ejecutar
// runMetadataExample().catch(console.error);
