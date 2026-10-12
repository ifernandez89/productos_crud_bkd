import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface CatalogItem {
  id: string;
  name: string;
  category: 'palette' | 'shader_material' | 'framing_preset' | 'model3d_slot';
  tags: string[];
  data: Record<string, any>;
}

@Injectable()
export class AssetCatalogService {
  private readonly logger = new Logger(AssetCatalogService.name);
  private catalog: Map<string, CatalogItem> = new Map();

  constructor() {
    this.seedDefaultAssets();
    this.persistCatalog();
  }

  private seedDefaultAssets() {
    const assets: CatalogItem[] = [
      // Paletas
      {
        id: 'palette-dreamcast-ocean-sapphire',
        name: 'Dreamcast Ocean Sapphire Sunset',
        category: 'palette',
        tags: ['dreamcast', 'ocean', 'fresnel', 'sunset', 'ecco'],
        data: {
          primary: '#162232',
          secondary: '#F0F6FC',
          accent: '#00E5FF',
          background: '#7B93CC',
          text: '#FFD700',
          glow: '#66E5FF',
          grid: '#183B64',
          wcagTarget: 4.5,
        },
      },
      {
        id: 'palette-genesis-twinkle-tale',
        name: 'Genesis 16-Bit Fantasy Emerald',
        category: 'palette',
        tags: ['genesis', 'fantasy', 'island', 'twinkle-tale'],
        data: {
          primary: '#388820',
          secondary: '#B87830',
          accent: '#58A8F0',
          background: '#285890',
          text: '#FFD700',
          glow: '#FFFFFF',
          grid: '#C89848',
          wcagTarget: 5.0,
        },
      },
      // Materiales Ópticos (Fresnel & PBR)
      {
        id: 'mat-ocean-water-fresnel',
        name: '128-Bit Water Surface Optical Fresnel',
        category: 'shader_material',
        tags: ['water', 'fresnel', 'optics', 'reflection', 'threejs_ready'],
        data: {
          refractiveIndexAir: 1.0,
          refractiveIndexWater: 1.333,
          fresnelPower: 5.0,
          normalDistortion: 0.08,
          specularShininess: 64,
          foamThreshold: 0.72,
        },
      },
      {
        id: 'mat-cetacean-satin-skin',
        name: 'Cetacean Satin Organic Skin Material',
        category: 'shader_material',
        tags: ['orca', 'dolphin', 'organic', 'skin', 'specular'],
        data: {
          roughness: 0.28,
          metalness: 0.05,
          subsurfaceScattering: 0.15,
          wetSheenMultiplier: 1.8,
        },
      },
      // Presets de Encuadre y Composición
      {
        id: 'framing-ocean-001',
        name: 'Ocean Benchmark 001: Sujeto Centrado / Horizonte Bajo',
        category: 'framing_preset',
        tags: ['benchmark', 'framing', 'golden_case'],
        data: {
          horizonY: 0.62,
          subjectX: 0.5,
          subjectY: 0.45,
          titleZone: 'top_center',
          hudZone: 'bottom_corners',
        },
      },
      {
        id: 'framing-ocean-002',
        name: 'Ocean Benchmark 002: Sujeto Lateral / Reserva Tipográfica',
        category: 'framing_preset',
        tags: ['benchmark', 'framing', 'magazine_layout'],
        data: {
          horizonY: 0.58,
          subjectX: 0.68,
          subjectY: 0.48,
          titleZone: 'top_left',
          hudZone: 'bottom_left',
        },
      },
      {
        id: 'framing-ocean-003',
        name: 'Ocean Benchmark 003: Contraluz y Cielo Dominante',
        category: 'framing_preset',
        tags: ['benchmark', 'sunset', 'silhouette'],
        data: {
          horizonY: 0.70,
          subjectX: 0.45,
          subjectY: 0.52,
          titleZone: 'top_center',
          hudZone: 'minimal_bottom',
        },
      },
      // Slots para Modelos 3D GLB (Preparación Three.js & ArcheoScope)
      {
        id: 'model-slot-orca-highpoly',
        name: 'Orcinus Orca Anatomical GLB Mesh Slot',
        category: 'model3d_slot',
        tags: ['glb', 'threejs', 'archeoscope_pipeline', 'cetacean'],
        data: {
          format: 'glb',
          recommendedScale: 1.0,
          bones: ['spine_01', 'spine_02', 'fluke', 'pectoral_fin_L', 'pectoral_fin_R'],
          status: 'ready_for_threejs_stage',
        },
      },
    ];

    for (const item of assets) {
      this.catalog.set(item.id, item);
    }
  }

  private persistCatalog() {
    try {
      const dir = path.join(process.cwd(), 'storage', 'assets');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const outPath = path.join(dir, 'catalog.json');
      fs.writeFileSync(outPath, JSON.stringify(Array.from(this.catalog.values()), null, 2), 'utf-8');
      this.logger.log(`[asset-catalog] Catálogo indexado en ${outPath} (${this.catalog.size} recursos)`);
    } catch (e: any) {
      this.logger.error(`[asset-catalog] Error persistiendo catálogo: ${e.message}`);
    }
  }

  getItem(id: string): CatalogItem | undefined {
    return this.catalog.get(id);
  }

  getItemsByCategory(category: CatalogItem['category']): CatalogItem[] {
    return Array.from(this.catalog.values()).filter((item) => item.category === category);
  }

  getAll(): CatalogItem[] {
    return Array.from(this.catalog.values());
  }
}
