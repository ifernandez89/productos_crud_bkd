import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ArtDirectionService } from './art-direction.service';
import { GenesisPixelArtEngine } from './engines/genesis-pixel-art.engine';
import { GenesisLandscapePixelEngine } from './engines/genesis-landscape-pixel.engine';
import { DreamcastOceanEngine } from './engines/dreamcast-ocean.engine';
import { PngExporter } from './rendering/png-exporter';
import { PosterQualityAssuranceService } from './qa/poster-qa.service';
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
    private readonly pngExporter: PngExporter,
    private readonly qaService: PosterQualityAssuranceService,
  ) {}

  /**
   * Genera un póster completo, lo renderiza a PNG y evalúa su calidad
   */
  async generate(dto: GeneratePosterDto): Promise<PosterGenerationResult> {
    const startTime = Date.now();
    this.logger.log(`[poster-service] Iniciando generación: "${dto.title || 'Untitled'}"`);

    // 1. Dirección de arte y especificación estructurada
    const spec: PosterDesignSpec = this.artDirection.createSpecFromRequest(dto);

    // 2. Selección del motor por época y temática
    const svgContent =
      spec.era === 'dreamcast-ocean'
        ? this.dreamcastOceanEngine.generateSvg(spec)
        : spec.era === 'genesis-landscape'
        ? this.genesisLandscapeEngine.generateSvg(spec)
        : this.genesisEngine.generateSvg(spec);

    // 3. Renderizado a disco (SVG + PNG)
    const safeTitle = spec.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filename = `${safeTitle}_${spec.era}_seed${spec.seed}`;
    const renderOutput = await this.pngExporter.renderToDisk(
      svgContent,
      filename,
      spec.dimensions.width,
      spec.dimensions.height,
    );

    // 4. Control de Calidad Visual (QA)
    const qaReport = this.qaService.evaluate(
      spec,
      svgContent,
      renderOutput.buffer,
      renderOutput.pngPath,
    );

    const durationMs = Date.now() - startTime;

    // Guardar el informe de calidad JSON junto a las imágenes
    const reportPath = path.join(
      process.cwd(),
      'storage',
      'posters',
      `${filename}_qa_report.json`,
    );
    fs.writeFileSync(reportPath, JSON.stringify(qaReport, null, 2), 'utf-8');

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
}
