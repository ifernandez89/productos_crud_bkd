import { Injectable, Logger } from '@nestjs/common';
import {
  PortraitDesignSpec,
  PortraitQAReport,
  AnatomicalQACheck,
} from './portrait.types';

@Injectable()
export class PortraitQaService {
  private readonly logger = new Logger(PortraitQaService.name);

  /**
   * Ejecuta la batería de pruebas de QA anatómico y contraste para el retrato generado
   */
  evaluate(spec: PortraitDesignSpec, renderDurationMs: number): PortraitQAReport {
    const checks: AnatomicalQACheck[] = [];

    // 1. Alineación Horizontal y Simetría de Ojos
    const eyeSpacing = spec.proportions.eyeSpacing;
    const isEyeSpacingNormal = eyeSpacing >= 0.35 && eyeSpacing <= 0.48;
    checks.push({
      name: 'Eye Interpupillary Spacing',
      passed: isEyeSpacingNormal,
      score: isEyeSpacingNormal ? 100 : 70,
      measuredValue: Number(eyeSpacing.toFixed(3)),
      acceptableRange: '0.350 - 0.480',
      details: isEyeSpacingNormal
        ? 'Separación interpupilar anatómica correcta (regla de los cinco quintos)'
        : 'Separación interpupilar fuera de tolerancia anatómica estándar',
    });

    // 2. Tercios Faciales (Loomis: ceja-nariz vs nariz-mentón)
    const browToNose = spec.proportions.noseBaseY - spec.proportions.eyeLevelY;
    const noseToChin = 1.0 - spec.proportions.noseBaseY;
    const thirdsRatio = browToNose / (noseToChin * 0.5); // Normalizado
    const isThirdsValid = thirdsRatio >= 0.75 && thirdsRatio <= 1.35;
    checks.push({
      name: 'Facial Thirds Proportions',
      passed: isThirdsValid,
      score: isThirdsValid ? 95 : 65,
      measuredValue: Number(thirdsRatio.toFixed(3)),
      acceptableRange: '0.750 - 1.350',
      details: isThirdsValid
        ? 'Distribución equilibrada entre tercio nasal y tercio inferior'
        : 'Desproporción entre la longitud nasal y la distancia al mentón',
    });

    // 3. Proporción del Triángulo Ojos-Boca
    const eyeLevel = spec.proportions.eyeLevelY;
    const mouthLevel = spec.proportions.mouthLevelY;
    const verticalDist = mouthLevel - eyeLevel;
    const triangleRatio = verticalDist / eyeSpacing;
    const isTriangleValid = triangleRatio >= 0.60 && triangleRatio <= 0.85;
    checks.push({
      name: 'Eye-to-Mouth Triangle Balance',
      passed: isTriangleValid,
      score: isTriangleValid ? 95 : 70,
      measuredValue: Number(triangleRatio.toFixed(3)),
      acceptableRange: '0.600 - 0.850',
      details: isTriangleValid
        ? 'Triángulo facial áureo armónico (proporción ojos-boca)'
        : 'La posición vertical de la boca se aleja de la simetría facial armónica',
    });

    // 4. Conicidad Mandibular y Relación de Cabeza
    const faceRatio = spec.proportions.faceRatio;
    const isFaceRatioValid = faceRatio >= 1.25 && faceRatio <= 1.55;
    checks.push({
      name: 'Cranial Aspect Ratio',
      passed: isFaceRatioValid,
      score: isFaceRatioValid ? 100 : 75,
      measuredValue: Number(faceRatio.toFixed(3)),
      acceptableRange: '1.250 - 1.550',
      details: isFaceRatioValid
        ? 'Relación altura-ancho del cráneo dentro de la normal antropométrica'
        : 'Cráneo excesivamente alargado o comprimido',
    });

    // 5. Contraste de Luminancia Sujeto / Fondo
    const contrastRatio = this.calculateContrastRatio(
      spec.palette.skinBase,
      spec.palette.backgroundGradient[0],
    );
    const sufficientContrast = contrastRatio >= 3.0; // WCAG AA large text / graphic elements
    checks.push({
      name: 'Subject-Background Visual Contrast',
      passed: sufficientContrast,
      score: sufficientContrast ? 100 : 60,
      measuredValue: `${contrastRatio.toFixed(2)}:1`,
      acceptableRange: '>= 3.0:1',
      details: sufficientContrast
        ? 'Contraste visual suficiente para recorte nítido de la silueta'
        : 'Bajo contraste entre el tono de piel y el fondo atmosférico',
    });

    // Cálculo general
    const passedChecks = checks.filter((c) => c.passed).length;
    const overallScore = Math.round(
      checks.reduce((acc, c) => acc + c.score, 0) / checks.length,
    );
    const passed = passedChecks >= 4;

    const recommendations: string[] = [];
    if (!isThirdsValid) recommendations.push('Ajustar el parámetro noseBaseY para acercarse a la regla de los tercios.');
    if (!isTriangleValid) recommendations.push('Calibrar la altura de la comisura de la boca (mouthLevelY).');
    if (!sufficientContrast) recommendations.push('Aumentar la saturación o luminancia del fondo para destacar el sujeto.');

    return {
      passed,
      overallScore,
      anatomicalValidity: {
        eyeSymmetryScore: checks[0].score,
        facialThirdsScore: checks[1].score,
        eyeToMouthRatioScore: checks[2].score,
        checks,
      },
      visualContrast: {
        contrastRatio,
        sufficientContrast,
      },
      performance: {
        renderDurationMs,
        resolution: `${spec.dimensions.width}x${spec.dimensions.height}`,
      },
      recommendations,
    };
  }

  /**
   * Cálculo de contraste WCAG relativo
   */
  private calculateContrastRatio(hex1: string, hex2: string): number {
    const l1 = this.relativeLuminance(hex1);
    const l2 = this.relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  private relativeLuminance(hex: string): number {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return 0.5;
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;

    const transform = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
  }
}
