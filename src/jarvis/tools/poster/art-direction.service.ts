import { Injectable, Logger } from '@nestjs/common';
import { GeneratePosterDto, PosterDesignSpec, EraType } from './poster.types';

@Injectable()
export class ArtDirectionService {
  private readonly logger = new Logger(ArtDirectionService.name);

  /**
   * Transforma una solicitud de texto (o especificación) en una dirección de arte estructurada
   */
  createSpecFromRequest(req: GeneratePosterDto): PosterDesignSpec {
    const promptLower = (req.prompt || req.title || '').toLowerCase();
    const isOcean =
      req.era === 'dreamcast-ocean' ||
      (!req.era &&
        (/\b(mar|oceano|ocean|orca|ecco|dolphin|ballena|cetaceo)\b/i.test(promptLower) ||
          promptLower.includes('marino')));

    const isLandscape =
      req.era === 'genesis-landscape' ||
      (!req.era &&
        !isOcean &&
        (/\b(isla|flotante|floating|landscape|twinkle|aetheria|cascada|montaña|temple)\b/i.test(promptLower) ||
          promptLower.includes('flotant')));

    const era: EraType = req.era || (isOcean ? 'dreamcast-ocean' : isLandscape ? 'genesis-landscape' : 'genesis16');

    const title = req.title || (isOcean ? 'ORCA' : isLandscape ? 'AETHERIA' : 'IRON MAN');
    const subtitle =
      req.subtitle ||
      (isOcean ? 'DEFENDER OF THE SEAS' : isLandscape ? 'THE CELESTIAL REALM' : 'GENESIS PROTOCOL');
    const seed = req.seed || Math.floor(Math.random() * 1000000);
    const width = req.width || (isOcean || isLandscape ? 1280 : 720);
    const height = req.height || 960;

    let palette = {
      primary: '#D1121E',     // Rojo armadura
      secondary: '#FFD700',   // Oro pulido
      accent: '#00FFFF',      // Reactor cian
      background: '#06040A',  // Negro cósmico
      text: '#FFE600',        // Dorado brillante
      glow: '#00E5FF',        // Brillo de energía
      grid: '#1F2438',        // Retícula de horizonte
    };

    if (isOcean) {
      palette = {
        primary: '#162232',     // Piel cetácea dorsal
        secondary: '#F0F6FC',   // Vientre y manchas blancas
        accent: '#00E5FF',      // Resplandor sonar / cian Dreamcast
        background: '#0C1E34',  // Fondo de la zona tipográfica (profundidades marinas)
        text: '#FFF000',        // Dorado luminoso con serifa
        glow: '#66E5FF',        // Espuma y refracción
        grid: '#183B64',        // Capas abisales
      };
    } else if (isLandscape) {
      palette = {
        primary: '#388820',     // Verde bosque
        secondary: '#B87830',   // Ocre acantilado
        accent: '#58A8F0',      // Azul cascada
        background: '#285890',  // Cielo 16-bit
        text: '#FFD700',        // Dorado fantástico
        glow: '#FFFFFF',        // Espuma y nubes
        grid: '#C89848',        // Sendas de tierra
      };
    } else if (promptLower.includes('cyber') || promptLower.includes('neon')) {
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
      genre:
        req.genre ||
        (isOcean
          ? '128-Bit Action Adventure / Dreamcast Era'
          : isLandscape
          ? 'Fantasy RPG / 16-Bit Title Screen'
          : 'Action / Mecha / Sci-Fi'),
      dimensions: {
        width,
        height,
      },
      palette,
      subject: {
        archetype: isOcean ? 'orca' : isLandscape ? 'floating_island' : 'armored_hero',
        pose: isOcean ? 'breaching' : isLandscape ? 'panoramic' : 'heroic',
        primaryColor: palette.primary,
        secondaryColor: palette.secondary,
        energyColor: palette.accent,
      },
      scenery: {
        type: isOcean ? 'tropical_ocean' : isLandscape ? 'cloud_sea' : 'space_nebula',
        starCount: isOcean ? 12 : isLandscape ? 0 : 160,
      },
      packaging: {
        brand: isOcean ? 'SEGA DREAMCAST' : 'SEGA GENESIS',
        badgeText: isOcean ? '128-BIT GD-ROM' : isLandscape ? 'TITLE SCREEN 1992' : '16-BIT CARTRIDGE',
        qualitySeal: isOcean ? 'OFFICIAL SEGA DREAMCAST QUALITY' : 'OFFICIAL SEGA SEAL OF QUALITY',
        borderGrid: !isOcean && !isLandscape,
        barcode: !isOcean && !isLandscape,
      },
      seed,
      effects: {
        rimLighting: true,
        arcReactorGlow: !isOcean && !isLandscape,
        retroScanlines: !isOcean, // Dreamcast 128-bit entrega salida VGA nítida sin scanlines analógicos
        particleCount: isOcean ? 40 : isLandscape ? 0 : 24,
      },
    };

    this.logger.log(`[art-direction] Especificación generada para "${spec.title}" (era: ${spec.era}, semilla: ${spec.seed})`);
    return spec;
  }
}
