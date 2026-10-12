import { Injectable, Logger } from '@nestjs/common';
import { GeneratePosterDto, PosterDesignSpec } from './poster.types';

@Injectable()
export class ArtDirectionService {
  private readonly logger = new Logger(ArtDirectionService.name);

  /**
   * Transforma una solicitud de texto (o especificación) en una dirección de arte estructurada
   */
  createSpecFromRequest(req: GeneratePosterDto): PosterDesignSpec {
    const title = req.title || 'IRON MAN';
    const subtitle = req.subtitle || 'GENESIS PROTOCOL';
    const era = req.era || 'genesis16';
    const seed = req.seed || Math.floor(Math.random() * 1000000);
    const width = req.width || 720;
    const height = req.height || 960;

    // Detectar paleta según temática
    const promptLower = (req.prompt || req.title || '').toLowerCase();

    let palette = {
      primary: '#D1121E',     // Rojo armadura
      secondary: '#FFD700',   // Oro pulido
      accent: '#00FFFF',      // Reactor cian
      background: '#06040A',  // Negro cósmico
      text: '#FFE600',        // Dorado brillante
      glow: '#00E5FF',        // Brillo de energía
      grid: '#1F2438',        // Retícula de horizonte
    };

    if (promptLower.includes('cyber') || promptLower.includes('neon')) {
      palette = {
        primary: '#FF007F',
        secondary: '#00F0FF',
        accent: '#39FF14',
        background: '#050510',
        text: '#00F0FF',
        glow: '#FF007F',
        grid: '#201040',
      };
    } else if (promptLower.includes('terror') || promptLower.includes('horror') || promptLower.includes('dark')) {
      palette = {
        primary: '#4A0E17',
        secondary: '#8B0000',
        accent: '#32CD32',
        background: '#040404',
        text: '#DCDCDC',
        glow: '#00FF00',
        grid: '#1A0505',
      };
    }

    const spec: PosterDesignSpec = {
      id: `poster-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title,
      subtitle,
      era,
      genre: req.genre || 'Action / Mecha / Sci-Fi',
      dimensions: {
        width,
        height,
      },
      palette,
      subject: {
        archetype: 'armored_hero',
        pose: 'heroic',
        primaryColor: palette.primary,
        secondaryColor: palette.secondary,
        energyColor: palette.accent,
      },
      scenery: {
        type: 'space_nebula',
        starCount: 160,
      },
      packaging: {
        brand: era === 'genesis16' ? 'SEGA GENESIS' : 'RETRO CONSOLE',
        badgeText: '16-BIT CARTRIDGE',
        qualitySeal: 'OFFICIAL SEGA SEAL OF QUALITY',
        borderGrid: true,
        barcode: true,
      },
      seed,
      effects: {
        rimLighting: true,
        arcReactorGlow: true,
        retroScanlines: true,
        particleCount: 24,
      },
    };

    this.logger.log(`[art-direction] Especificación generada para "${spec.title}" (era: ${spec.era}, semilla: ${spec.seed})`);
    return spec;
  }
}
