import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ArtDirectionService } from './art-direction.service';
import { GenesisPixelArtEngine } from './engines/genesis-pixel-art.engine';
import { GenesisLandscapePixelEngine } from './engines/genesis-landscape-pixel.engine';
import { DreamcastOceanEngine } from './engines/dreamcast-ocean.engine';
import { ThreePortraitEngine } from './engines/three-portrait.engine';
import { PngExporter } from './rendering/png-exporter';
import { PosterQualityAssuranceService } from './qa/poster-qa.service';
import { AssetCatalogService } from './assets/asset-catalog.service';
import {
  GeneratePosterDto,
  PosterGenerationResult,
  PosterDesignSpec,
} from './poster.types';

@Injectable()
export class PosterService {
  private readonly logger = new Logger(PosterService.name);

  constructor(
    private readonly artDirection: ArtDirectionService,
    private readonly genesisEngine: GenesisPixelArtEngine,
    private readonly genesisLandscapeEngine: GenesisLandscapePixelEngine,
    private readonly dreamcastOceanEngine: DreamcastOceanEngine,
    private readonly threePortraitEngine: ThreePortraitEngine,
    private readonly pngExporter: PngExporter,
    private readonly qaService: PosterQualityAssuranceService,
    private readonly assetCatalog: AssetCatalogService,
  ) {}

  /**
   * Genera un póster completo, lo renderiza a PNG y evalúa su calidad
   */
  async generate(dto: GeneratePosterDto): Promise<PosterGenerationResult> {
    const startTime = Date.now();
    this.logger.log(`[poster-service] Iniciando generación: "${dto.title || 'Untitled'}"`);

    // 1. Dirección de arte y especificación estructurada
    const t0 = Date.now();
    const spec: PosterDesignSpec = this.artDirection.createSpecFromRequest(dto);
    const artDirectionMs = Date.now() - t0;

    const safeTitle = spec.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filename = `${safeTitle}_${spec.era}_seed${spec.seed}`;
    const storageDir = path.join(process.cwd(), 'storage', 'posters');
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    let renderOutput: { svgPath: string; pngPath: string; buffer: Buffer; durationMs: number };
    let svgContent = '';
    let svgGenMs = 0;

    if (spec.era === 'threejs-portrait') {
      const promptLower = (dto.prompt || '').toLowerCase();
      const modelName = promptLower.includes('hatshepsut')
        ? 'hatshepsut.glb'
        : promptLower.includes('olmec')
        ? 'olmec_head.glb'
        : 'akenaton.glb';

      const t1 = Date.now();
      const threeRes = await this.threePortraitEngine.renderPortrait(spec, modelName);
      svgGenMs = Date.now() - t1;

      // Crear SVG de layout tipográfico acompañante
      svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spec.dimensions.width} ${spec.dimensions.height}">
        <g id="3d-portrait-layout">
          <text id="main-title" x="640" y="860" font-family="'Times New Roman', serif" font-size="48" font-weight="900" fill="#FFD700" text-anchor="middle">${spec.title}</text>
          <text id="sub-title" x="640" y="900" font-family="'Arial', sans-serif" font-size="20" fill="#E8D098" text-anchor="middle" letter-spacing="4">${spec.subtitle || 'THREE.JS 3D PORTRAIT'}</text>
        </g>
      </svg>`;

      const svgPath = path.join(storageDir, `${filename}.svg`);
      fs.writeFileSync(svgPath, svgContent, 'utf-8');

      renderOutput = {
        svgPath,
        pngPath: threeRes.pngPath,
        buffer: threeRes.pngBuffer,
        durationMs: threeRes.durationMs,
      };
    } else {
      // 2. Selección del motor por época y temática
      const t1 = Date.now();
      svgContent =
        spec.era === 'dreamcast-ocean'
          ? this.dreamcastOceanEngine.generateSvg(spec)
          : spec.era === 'genesis-landscape'
          ? this.genesisLandscapeEngine.generateSvg(spec)
          : this.genesisEngine.generateSvg(spec);
      svgGenMs = Date.now() - t1;

      // 3. Renderizado a disco (SVG + PNG con aceleración GPU)
      renderOutput = await this.pngExporter.renderToDisk(
        svgContent,
        filename,
        spec.dimensions.width,
        spec.dimensions.height,
      );
    }

    const gpuDiag = await this.pngExporter.getGpuDiagnostics();

    // 4. Control de Calidad Visual Desacoplado (QA)
    const qaReport = this.qaService.evaluate(
      spec,
      svgContent,
      renderOutput.buffer,
      renderOutput.pngPath,
      {
        durationMs: renderOutput.durationMs,
        artDirectionMs,
        svgGenMs,
      },
      gpuDiag,
      dto.profile || 'standard',
    );

    const durationMs = Date.now() - startTime;

    // 5. Guardar Manifiesto de Proyecto Versionado y QA Report en disco
    const projectManifest = {
      schemaVersion: 1,
      engine: spec.era,
      seed: spec.seed,
      output: {
        width: spec.dimensions.width,
        height: spec.dimensions.height,
        format: 'png',
        profile: dto.profile || 'standard',
      },
      cameraOrFraming: {
        framing: spec.era === 'dreamcast-ocean' ? 'cinematic' : 'centered',
        horizonY: spec.era === 'dreamcast-ocean' ? 0.58 : 0.65,
        angle: 'low',
      },
      palette: spec.palette,
      subject: spec.subject,
      scenery: spec.scenery,
      packaging: spec.packaging,
      assets: [
        {
          id: `palette-${spec.era}`,
          role: 'palette',
          type: 'color-scheme',
          metadata: { primary: spec.palette.primary, accent: spec.palette.accent },
        },
      ],
      parameters: {
        genre: spec.genre,
        effects: spec.effects,
      },
      telemetry: {
        artDirectionMs,
        svgGenMs,
        renderDurationMs: renderOutput.durationMs,
        totalDurationMs: durationMs,
        gpu: gpuDiag,
      },
    };

    fs.writeFileSync(
      path.join(storageDir, `${filename}_project.json`),
      JSON.stringify(projectManifest, null, 2),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(storageDir, `${filename}_qa_report.json`),
      JSON.stringify(qaReport, null, 2),
      'utf-8',
    );

    return {
      id: spec.id,
      title: spec.title,
      era: spec.era,
      svgPath: renderOutput.svgPath,
      pngPath: renderOutput.pngPath,
      spec,
      qa: qaReport,
      durationMs,
    };
  }

  /**
   * Listar presets de consolas y temas disponibles
   */
  getPresets() {
    return [
      {
        id: 'threejs-portrait-archeoscope',
        era: 'threejs-portrait',
        name: 'Three.js 3D Realistic Portrait (Akhenaten / Hatshepsut / Olmec Face)',
        description: 'Renderizado tridimensional hiperrealista con Three.js, mallas GLB, iluminación cinematográfica de 3 puntos (Key, Fill, Rim), sombreado PBR y ACES Filmic Tone Mapping en la GPU RTX 5070.',
        defaultDimensions: { width: 1280, height: 960 },
      },
      {
        id: 'dreamcast-ecco-ocean',
        era: 'dreamcast-ocean',
        name: 'Sega Dreamcast 128-Bit Ocean & Cetacean Studio (Ecco/Orca Style)',
        description: 'Atmósfera oceánica tridimensional de 128 bits con superficie de agua Fresnel, sol crepuscular, acantilados tropicales, orca saltando con salpicaduras y HUD Dreamcast.',
        defaultDimensions: { width: 1280, height: 960 },
      },
      {
        id: 'genesis-twinkle-tale',
        era: 'genesis-landscape',
        name: 'Sega Genesis 16-Bit Floating Island (Twinkle Tale Style)',
        description: 'Pantalla de título de fantasía de 16 bits con isla flotante, acantilados estratificados, cascadas, palacio de cristal y tipografía dorada de 1992.',
        defaultDimensions: { width: 1280, height: 960 },
      },
      {
        id: 'genesis-action',
        era: 'genesis16',
        name: 'Sega Genesis 16-Bit Action Poster',
        description: 'Carátula con cuadrícula negra, tipografía metálica en relieve y héroe acorazado con luz de contorno.',
        defaultDimensions: { width: 720, height: 960 },
      },
      {
        id: 'ps1-horror',
        era: 'ps1',
        name: 'PlayStation 1 Retro 3D Jewel Case (Próximamente)',
        description: 'Atmósfera oscura, perspectiva dramática y franja plateada con logo tricolor.',
        defaultDimensions: { width: 800, height: 800 },
      },
      {
        id: 'ps2-cinematic',
        era: 'ps2',
        name: 'PlayStation 2 Cinematic DVD Case (Próximamente)',
        description: 'Iluminación volumétrica, gradientes azul marino y composición cinematográfica.',
        defaultDimensions: { width: 720, height: 1024 },
      },
    ];
  }

  /**
   * Obtiene la lista de pósteres generados en disco
   */
  getHistory() {
    const dir = path.join(process.cwd(), 'storage', 'posters');
    if (!fs.existsSync(dir)) return [];

    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => {
        const stats = fs.statSync(path.join(dir, f));
        return {
          filename: f,
          sizeKb: Math.round(stats.size / 1024),
          createdAt: stats.birthtime,
          pngUrl: `/api/jarbees/poster/file/${f}`,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Obtiene la biblioteca de recursos reutilizables (paletas, materiales, encuadres)
   */
  getAssetCatalog() {
    return this.assetCatalog.getAll();
  }

  /**
   * Obtiene el diagnóstico empírico de aceleración GPU y WebGL
   */
  async getGpuDiagnostics() {
    return this.pngExporter.getGpuDiagnostics();
  }
}
