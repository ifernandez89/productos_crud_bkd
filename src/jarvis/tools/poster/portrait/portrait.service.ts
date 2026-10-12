import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PortraitDirectionService } from './portrait-direction.service';
import { VectorPortraitEngine } from './vector-portrait.engine';
import { PortraitQaService } from './portrait-qa.service';
import { PngExporter } from '../rendering/png-exporter';
import { GeneratePortraitDto, PortraitResult } from './portrait.types';

@Injectable()
export class PortraitService {
  private readonly logger = new Logger(PortraitService.name);

  constructor(
    private readonly directionService: PortraitDirectionService,
    private readonly vectorEngine: VectorPortraitEngine,
    private readonly qaService: PortraitQaService,
    private readonly pngExporter: PngExporter,
  ) {}

  /**
   * Genera un retrato paramétrico 2.5D de alta resolución (hasta 2048x2048) con QA anatómico
   */
  async generatePortrait(dto: GeneratePortraitDto): Promise<PortraitResult> {
    const startTime = Date.now();
    this.logger.log(`Iniciando generación de retrato paramétrico: estilo=${dto.style || 'auto'}, seed=${dto.seed || 'random'}`);

    // 1. Construir especificación de diseño y proporciones anatómicas
    const spec = this.directionService.createDesignSpec(dto);

    // 2. Renderizar SVG vectorial paramétrico
    const svgContent = this.vectorEngine.renderSvg(spec);

    // 3. Exportar a PNG usando Playwright y GPU física (RTX 5070)
    const baseFilename = `portrait_${spec.style}_seed${spec.seed}`;
    const renderResult = await this.pngExporter.renderToDisk(
      svgContent,
      baseFilename,
      spec.dimensions.width,
      spec.dimensions.height,
    );

    const renderTimeMs = Date.now() - startTime;

    // 4. Evaluar QA anatómico y contraste
    const qaReport = this.qaService.evaluate(spec, renderTimeMs);

    // 5. Guardar metadata JSON del proyecto
    const metaPath = path.join(process.cwd(), 'storage', 'posters', `${baseFilename}.json`);
    const projectData = {
      spec,
      qa: qaReport,
      timestamp: new Date().toISOString(),
      renderTimeMs,
      fileSizeKb: Math.round(renderResult.buffer.length / 1024),
    };
    fs.writeFileSync(metaPath, JSON.stringify(projectData, null, 2), 'utf-8');

    this.logger.log(`Retrato generado exitosamente: ${baseFilename}.png (QA Score: ${qaReport.overallScore}/100, tiempo: ${renderTimeMs}ms)`);

    return {
      spec,
      qa: qaReport,
      svgPath: renderResult.svgPath,
      pngPath: renderResult.pngPath,
      telemetry: {
        renderTimeMs,
        fileSizeKb: Math.round(renderResult.buffer.length / 1024),
        resolution: `${spec.dimensions.width}x${spec.dimensions.height}`,
      },
    };
  }

  /**
   * Obtiene los estilos, expresiones y paletas predefinidas para retratos
   */
  getPresets() {
    return {
      styles: [
        { id: 'semi_realistic', name: 'Semi-Realista', description: 'Proporciones antropométricas ricas, sombras volumétricas y oclusión sutil' },
        { id: 'digital_painting', name: 'Pintura Digital', description: 'Transiciones suaves de color, halos y atmósfera cinematográfica' },
        { id: 'comic', name: 'Cómic / Tinta Gráfica', description: 'Trazo definido, alto contraste, semitonos y marcas cyberpunk' },
        { id: 'fantasy', name: 'Fantasía Épica', description: 'Partículas celestiales, reflejos dorados y paletas místicas' },
        { id: 'pixel_art', name: 'Pixel Art Estilizado', description: 'Sensibilidad retro con paletas indexadas' },
      ],
      expressions: [
        { id: 'determined', name: 'Determinado / Firme' },
        { id: 'serene', name: 'Sereno / Pacífico' },
        { id: 'intense', name: 'Intenso / Combativo' },
        { id: 'contemplative', name: 'Contemplativo / Filosófico' },
        { id: 'neutral', name: 'Neutral / Clásico' },
        { id: 'smiling', name: 'Sonrisa Sutil' },
      ],
      hairStyles: [
        { id: 'flowing', name: 'Cabello Ondulado Largo' },
        { id: 'undercut', name: 'Corte Moderno / Undercut' },
        { id: 'short_textured', name: 'Corto con Textura' },
        { id: 'cosmic_ethereal', name: 'Etéreo / Cósmico' },
        { id: 'spiky_anime', name: 'Estilo Anime Marcado' },
      ],
      palettePresets: [
        { id: 'renaissance_warm', name: 'Cálido Renacentista (Ocre, terracota y ámbar)' },
        { id: 'cyber_neon', name: 'Cyber Neon (Cian, magenta y sombras profundas)' },
        { id: 'golden_hour', name: 'Golden Hour (Luz solar dorada al atardecer)' },
        { id: 'nordic_cool', name: 'Nórdico Frío (Piel clara, azul zafiro y plata)' },
        { id: 'ethereal_cosmic', name: 'Cósmico Etéreo (Violeta, púrpura y polvo estelar)' },
      ],
      resolutions: [1024, 2048],
    };
  }
}
