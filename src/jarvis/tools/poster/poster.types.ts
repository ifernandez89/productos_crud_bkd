export type EraType = 'genesis16' | 'ps1' | 'ps2' | 'editorial';

export interface PaletteSpec {
  primary: string;      // Color predominante del sujeto (ej: rojo armadura)
  secondary: string;    // Color complementario (ej: dorado)
  accent: string;       // Color de acento de energía (ej: cian/azul reactor)
  background: string;   // Tono base del fondo (ej: #080710)
  text: string;         // Color principal del título
  glow: string;         // Color de halos y destellos
  grid: string;         // Color de retículas o detalles retro
}

export interface SubjectSpec {
  archetype: 'armored_hero' | 'cyber_mech' | 'starfighter' | 'dark_warrior';
  pose: 'heroic' | 'action' | 'dynamic';
  primaryColor: string;
  secondaryColor: string;
  energyColor: string;
}

export interface ScenerySpec {
  type: 'space_nebula' | 'cyber_grid' | 'planet_horizon' | 'dark_abyss';
  starCount?: number;
  horizonCurvature?: number;
}

export interface PackagingSpec {
  brand: string;        // ej: "SEGA GENESIS", "PLAYSTATION", "MEGA DRIVE"
  badgeText?: string;   // ej: "16-BIT CARTRIDGE", "COMPACT DISC"
  qualitySeal?: string; // ej: "OFFICIAL QUALITY SEAL"
  borderGrid: boolean;  // Cuadrícula clásica de cartuchos de los 90
  barcode: boolean;     // Código de barras lateral
}

export interface PosterDesignSpec {
  id: string;
  title: string;
  subtitle?: string;
  era: EraType;
  genre: string;
  dimensions: {
    width: number;
    height: number;
  };
  palette: PaletteSpec;
  subject: SubjectSpec;
  scenery: ScenerySpec;
  packaging: PackagingSpec;
  seed: number;
  effects: {
    rimLighting: boolean;
    arcReactorGlow: boolean;
    retroScanlines?: boolean;
    particleCount?: number;
  };
}

export interface TechnicalChecks {
  validPng: boolean;
  fileSizeKb: number;
  widthMatch: boolean;
  heightMatch: boolean;
  errors: string[];
}

export interface CompositionChecks {
  titlePresent: boolean;
  subtitlePresent: boolean;
  contrastOk: boolean;
  svgWellFormed: boolean;
  warnings: string[];
}

export interface ArtisticReview {
  composition: number;       // 1 - 5
  eraConsistency: number;    // 1 - 5
  typography: number;        // 1 - 5
  visualIntegration: number; // 1 - 5
  professionalFinish: number;// 1 - 5
}

export interface PosterQualityReport {
  passed: boolean;
  score: number; // 0 - 100
  technicalChecks: TechnicalChecks;
  compositionChecks: CompositionChecks;
  artisticReview?: ArtisticReview;
  engineVersion: string;
  seed: number;
  renderedAt: string;
}

export interface PosterGenerationResult {
  id: string;
  title: string;
  era: EraType;
  svgPath: string;
  pngPath: string;
  spec: PosterDesignSpec;
  qa: PosterQualityReport;
  durationMs: number;
}

export interface GeneratePosterDto {
  title: string;
  subtitle?: string;
  prompt?: string;
  era?: EraType;
  genre?: string;
  width?: number;
  height?: number;
  seed?: number;
}
