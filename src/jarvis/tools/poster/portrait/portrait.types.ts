export type PortraitStyle =
  | 'comic'
  | 'pixel_art'
  | 'digital_painting'
  | 'fantasy'
  | 'semi_realistic';

export type PortraitExpression =
  | 'neutral'
  | 'determined'
  | 'serene'
  | 'intense'
  | 'contemplative'
  | 'smiling';

export type HairStyle =
  | 'flowing'
  | 'undercut'
  | 'short_textured'
  | 'cosmic_ethereal'
  | 'braided'
  | 'spiky_anime';

export interface FacialProportions {
  /** Relación altura/ancho de la cabeza (típicamente 1.3 a 1.45) */
  faceRatio: number;
  /** Conicidad de la mandíbula: 0 (cuadrada/fuerte) a 1 (afilada/triangular) */
  jawTaper: number;
  /** Posición vertical relativa de los ojos (0.45 a 0.52 del alto de la cabeza) */
  eyeLevelY: number;
  /** Separación interpupilar relativa al ancho del rostro (0.38 a 0.46) */
  eyeSpacing: number;
  /** Tamaño del ojo (ancho y alto relativos) */
  eyeWidth: number;
  eyeHeight: number;
  /** Inclinación o ángulo de cejas (-10 a +15 grados para expresión) */
  browAngleDeg: number;
  /** Posición vertical de la base de la nariz (relativa, típicamente tercio medio) */
  noseBaseY: number;
  /** Ancho de la aleta nasal (relativo a la separación de ojos) */
  noseWidth: number;
  /** Posición vertical de la comisura de la boca (típicamente tercio inferior) */
  mouthLevelY: number;
  /** Ancho de la boca (relativo) */
  mouthWidth: number;
}

export interface PortraitLightingSpec {
  keyLightAngleDeg: number; // Ángulo de luz principal (ej: 45° lateral)
  keyLightIntensity: number; // 0.5 a 1.5
  ambientColor: string;     // Luz ambiental de relleno (ej: azul frío oscuro)
  fillColor: string;        // Color secundario opuesto a la key light
  rimColor: string;         // Color de contraluz/recorte (ej: cian o dorado)
  rimIntensity: number;     // Fuerza del rim light en el contorno
}

export interface PortraitPaletteSpec {
  skinBase: string;
  skinShadow: string;
  skinHighlight: string;
  skinSubsurface: string; // Tono cálido en bordes de sombra (sub-surface scattering simulado)
  hairBase: string;
  hairHighlight: string;
  irisPrimary: string;
  irisSecondary: string;
  accent: string;
  backgroundGradient: [string, string];
}

export interface HairSpec {
  style: HairStyle;
  volume: number; // 1.0 a 1.4
  strandsCount: number;
  hasFringe: boolean;
}

export interface PortraitDesignSpec {
  id: string;
  seed: number;
  name: string;
  style: PortraitStyle;
  expression: PortraitExpression;
  dimensions: {
    width: number;
    height: number;
  };
  proportions: FacialProportions;
  lighting: PortraitLightingSpec;
  palette: PortraitPaletteSpec;
  hair: HairSpec;
  features: {
    addEarrings: boolean;
    addCyberMarkings: boolean;
    ambientParticles: boolean;
    halftoneDots: boolean; // Para estilo comic
  };
}

export interface AnatomicalQACheck {
  name: string;
  passed: boolean;
  score: number; // 0 a 100
  measuredValue: number | string;
  acceptableRange: string;
  details: string;
}

export interface PortraitQAReport {
  passed: boolean;
  overallScore: number; // 0 a 100
  anatomicalValidity: {
    eyeSymmetryScore: number;
    facialThirdsScore: number;
    eyeToMouthRatioScore: number;
    checks: AnatomicalQACheck[];
  };
  visualContrast: {
    contrastRatio: number;
    sufficientContrast: boolean;
  };
  performance: {
    renderDurationMs: number;
    resolution: string;
  };
  recommendations: string[];
}

export interface GeneratePortraitDto {
  name?: string;
  style?: PortraitStyle;
  expression?: PortraitExpression;
  hairStyle?: HairStyle;
  palettePreset?: 'cyber_neon' | 'renaissance_warm' | 'nordic_cool' | 'golden_hour' | 'ethereal_cosmic';
  seed?: number;
  resolution?: number; // 1024 o 2048 (default 2048)
  addCyberMarkings?: boolean;
}

export interface PortraitResult {
  spec: PortraitDesignSpec;
  qa: PortraitQAReport;
  svgPath: string;
  pngPath: string;
  telemetry: {
    renderTimeMs: number;
    fileSizeKb: number;
    resolution: string;
  };
}
