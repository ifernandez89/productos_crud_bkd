export type EraType = 'genesis16' | 'genesis-landscape' | 'dreamcast-ocean' | 'threejs-portrait' | 'ps1' | 'ps2' | 'editorial';

export interface PaletteSpec {
  primary: string;      // Color predominante del sujeto (ej: rojo armadura o blanco/negro orca)
  secondary: string;    // Color complementario (ej: dorado u ocre acantilado)
  accent: string;       // Color de acento de energía/agua (ej: cian/azul cascada/mar)
  background: string;   // Tono base del fondo (ej: #080710 o cielo atardecer)
  text: string;         // Color principal del título
  glow: string;         // Color de halos y destellos
  grid: string;         // Color de retículas o detalles retro
}

export interface SubjectSpec {
  archetype: 'armored_hero' | 'cyber_mech' | 'starfighter' | 'dark_warrior' | 'floating_island' | 'fantasy_landscape' | 'marine_creature' | 'orca';
  pose: 'heroic' | 'action' | 'dynamic' | 'panoramic' | 'breaching';
  primaryColor: string;
  secondaryColor: string;
  energyColor: string;
}

export interface ScenerySpec {
  type: 'space_nebula' | 'cyber_grid' | 'planet_horizon' | 'dark_abyss' | 'cloud_sea' | 'celestial_sky' | 'tropical_ocean' | 'dreamcast_sea';
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

export type QualityProfile = 'draft' | 'standard' | 'final';

export interface CameraOrFramingSpec {
  fieldOfView?: number;
  angle?: 'low' | 'eye_level' | 'aerial';
  framing: 'centered' | 'offset_left' | 'offset_right' | 'cinematic';
  horizonY: number; // Rango 0.0 - 1.0 (ej: 0.58)
}

export interface AssetReference {
  id: string;
  role: 'palette' | 'font' | 'texture' | 'model3d' | 'reference_image';
  type: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface PosterProject {
  schemaVersion: number;
  engine: string;
  seed: number;
  output: {
    width: number;
    height: number;
    format: 'png' | 'svg';
    profile: QualityProfile;
  };
  cameraOrFraming: CameraOrFramingSpec;
  palette: PaletteSpec;
  subject: SubjectSpec;
  scenery: ScenerySpec;
  packaging?: PackagingSpec;
  assets: AssetReference[];
  parameters: Record<string, unknown>;
}

export interface TechnicalChecks {
  validPng: boolean;
  fileSizeKb: number;
  widthMatch: boolean;
  heightMatch: boolean;
  errors: string[];
}

export interface DesignQualityBlockReport {
  wcagContrastRatio: number;
  contrastPassed: boolean;
  safeMarginRatio: number;
  safeMarginPassed: boolean;
  visualHierarchyPassed: boolean;
  typographyWarnings: string[];
}

export interface ContentSilhouetteBlockReport {
  vectorComplexityScore: number;
  pathCount: number;
  gradientCount: number;
  subjectElementsDetected: string[];
  sceneryDepthPassed: boolean;
  warnings: string[];
}

export interface PerformanceBlockReport {
  artDirectionMs: number;
  svgGenMs: number;
  renderMs: number;
  qaMs: number;
  totalMs: number;
  heapUsedMb: number;
  gpuRenderer?: string;
  webglAccelerated?: boolean;
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
  // Bloques desacoplados
  technicalChecks: TechnicalChecks;
  design?: DesignQualityBlockReport;
  content?: ContentSilhouetteBlockReport;
  performance?: PerformanceBlockReport;
  compositionChecks: CompositionChecks;
  artisticReview?: ArtisticReview;
  artisticFeedback?: string[];
  profile?: QualityProfile;
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
  profile?: QualityProfile;
}
