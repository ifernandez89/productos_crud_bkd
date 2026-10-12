import { Injectable, Logger } from '@nestjs/common';
import {
  GeneratePortraitDto,
  PortraitDesignSpec,
  PortraitPaletteSpec,
  PortraitLightingSpec,
  FacialProportions,
  HairSpec,
} from './portrait.types';

@Injectable()
export class PortraitDirectionService {
  private readonly logger = new Logger(PortraitDirectionService.name);

  // Generador pseudo-aleatorio determinista (Mulberry32)
  private createRng(seed: number) {
    let s = seed >>> 0;
    return () => {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Construye una especificación de diseño facial matemáticamente proporcionada y reproducible
   */
  createDesignSpec(dto: GeneratePortraitDto): PortraitDesignSpec {
    const seed = dto.seed ?? Math.floor(Math.random() * 900000 + 100000);
    const rng = this.createRng(seed);

    const style = dto.style || (['digital_painting', 'semi_realistic', 'comic', 'fantasy', 'pixel_art'][Math.floor(rng() * 5)] as any);
    const expression = dto.expression || (['determined', 'serene', 'intense', 'contemplative', 'neutral'][Math.floor(rng() * 5)] as any);
    const hairStyle = dto.hairStyle || (['flowing', 'undercut', 'short_textured', 'cosmic_ethereal', 'spiky_anime'][Math.floor(rng() * 5)] as any);
    const palettePreset = dto.palettePreset || (['renaissance_warm', 'cyber_neon', 'golden_hour', 'nordic_cool', 'ethereal_cosmic'][Math.floor(rng() * 5)] as any);
    const resolution = dto.resolution && dto.resolution >= 1024 ? dto.resolution : 2048;

    const palette = this.resolvePalette(palettePreset, rng);
    const proportions = this.computeAnatomicalProportions(expression, rng);
    const lighting = this.computeLighting(style, rng);
    const hair = this.computeHair(hairStyle, rng);

    return {
      id: `portrait-${seed}`,
      seed,
      name: dto.name || `Portrait Seed #${seed}`,
      style,
      expression,
      dimensions: {
        width: resolution,
        height: resolution,
      },
      proportions,
      lighting,
      palette,
      hair,
      features: {
        addEarrings: rng() > 0.45,
        addCyberMarkings: dto.addCyberMarkings ?? (style === 'comic' || palettePreset === 'cyber_neon' || rng() > 0.6),
        ambientParticles: style === 'fantasy' || style === 'digital_painting' || rng() > 0.5,
        halftoneDots: style === 'comic',
      },
    };
  }

  /**
   * Calcula proporciones faciales clásicas (método Loomis) con variación orgánica controlada
   */
  private computeAnatomicalProportions(
    expression: string,
    rng: () => number,
  ): FacialProportions {
    // Expresión modula el ángulo de las cejas y apertura
    let browAngle = 0;
    if (expression === 'determined') browAngle = 6 + rng() * 4;
    else if (expression === 'intense') browAngle = 10 + rng() * 5;
    else if (expression === 'serene') browAngle = -2 - rng() * 3;
    else if (expression === 'contemplative') browAngle = 2 + rng() * 2;

    return {
      faceRatio: 1.34 + rng() * 0.12,          // Alto / Ancho de cabeza
      jawTaper: 0.35 + rng() * 0.35,           // Conicidad de mandíbula
      eyeLevelY: 0.485 + (rng() - 0.5) * 0.03, // Regla de oro: Ojos en el centro vertical
      eyeSpacing: 0.42 + (rng() - 0.5) * 0.03, // Distancia interpupilar
      eyeWidth: 0.115 + (rng() - 0.5) * 0.015, // Ancho de cada ojo
      eyeHeight: 0.052 + (rng() - 0.5) * 0.008,
      browAngleDeg: browAngle,
      noseBaseY: 0.635 + (rng() - 0.5) * 0.025,// Base nasal en ~2/3 del rostro
      noseWidth: 0.105 + (rng() - 0.5) * 0.015,// Ancho alar de la nariz
      mouthLevelY: 0.765 + (rng() - 0.5) * 0.025, // Labio inferior en el tercio inferior
      mouthWidth: 0.175 + (rng() - 0.5) * 0.025, // Ancho de labios
    };
  }

  private computeLighting(style: string, rng: () => number): PortraitLightingSpec {
    return {
      keyLightAngleDeg: 35 + rng() * 25,
      keyLightIntensity: 0.95 + rng() * 0.3,
      ambientColor: '#0a0d18',
      fillColor: '#1a263f',
      rimColor: style === 'comic' ? '#00e5ff' : '#ffd580',
      rimIntensity: 0.8 + rng() * 0.4,
    };
  }

  private computeHair(style: any, rng: () => number): HairSpec {
    return {
      style,
      volume: 1.1 + rng() * 0.2,
      strandsCount: 8 + Math.floor(rng() * 8),
      hasFringe: rng() > 0.4,
    };
  }

  private resolvePalette(preset: string, rng: () => number): PortraitPaletteSpec {
    switch (preset) {
      case 'cyber_neon':
        return {
          skinBase: '#e2d5cb',
          skinShadow: '#7d6174',
          skinHighlight: '#fff5f0',
          skinSubsurface: '#c94d78',
          hairBase: '#0a101f',
          hairHighlight: '#00f0ff',
          irisPrimary: '#00e5ff',
          irisSecondary: '#ff007f',
          accent: '#00f0ff',
          backgroundGradient: ['#04060d', '#11182c'],
        };
      case 'golden_hour':
        return {
          skinBase: '#f4d2b2',
          skinShadow: '#a86745',
          skinHighlight: '#fff0d8',
          skinSubsurface: '#e65c36',
          hairBase: '#291811',
          hairHighlight: '#e5a158',
          irisPrimary: '#6b8e23',
          irisSecondary: '#d4af37',
          accent: '#ffaa33',
          backgroundGradient: ['#1c100b', '#3d2016'],
        };
      case 'nordic_cool':
        return {
          skinBase: '#f2e8de',
          skinShadow: '#8a8b9f',
          skinHighlight: '#ffffff',
          skinSubsurface: '#ba7382',
          hairBase: '#1f242e',
          hairHighlight: '#829ab1',
          irisPrimary: '#3a7bd5',
          irisSecondary: '#68d8d6',
          accent: '#70a1ff',
          backgroundGradient: ['#0d1117', '#1b2230'],
        };
      case 'ethereal_cosmic':
        return {
          skinBase: '#ebd5cb',
          skinShadow: '#68507b',
          skinHighlight: '#fbf0ff',
          skinSubsurface: '#a8438f',
          hairBase: '#150f24',
          hairHighlight: '#bd72ff',
          irisPrimary: '#a855f7',
          irisSecondary: '#38bdf8',
          accent: '#c084fc',
          backgroundGradient: ['#07040d', '#1c102e'],
        };
      case 'renaissance_warm':
      default:
        return {
          skinBase: '#edd0b7',
          skinShadow: '#8f573c',
          skinHighlight: '#fff3e8',
          skinSubsurface: '#c24a2e',
          hairBase: '#231710',
          hairHighlight: '#96603a',
          irisPrimary: '#4a3728',
          irisSecondary: '#8a6843',
          accent: '#d4af37',
          backgroundGradient: ['#120c09', '#2d1c14'],
        };
    }
  }
}
