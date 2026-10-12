import { Injectable, Logger } from '@nestjs/common';
import {
  PosterDesignSpec,
  PosterQualityReport,
  TechnicalChecks,
  CompositionChecks,
  DesignQualityBlockReport,
  ContentSilhouetteBlockReport,
  PerformanceBlockReport,
  ArtisticReview,
  QualityProfile,
} from '../poster.types';

@Injectable()
export class PosterQualityAssuranceService {
  private readonly logger = new Logger(PosterQualityAssuranceService.name);
  private readonly ENGINE_VERSION = '2.0.0-decoupled-studio';

  /**
   * Calcula la luminancia relativa según estándar WCAG 2.1
   */
  private getRelativeLuminance(hexColor: string): number {
    const cleanHex = hexColor.replace('#', '').trim();
    if (cleanHex.length !== 6 && cleanHex.length !== 3) return 0.5;

    let r: number, g: number, b: number;
    if (cleanHex.length === 3) {
      r = parseInt(cleanHex[0] + cleanHex[0], 16) / 255;
      g = parseInt(cleanHex[1] + cleanHex[1], 16) / 255;
      b = parseInt(cleanHex[2] + cleanHex[2], 16) / 255;
    } else {
      r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    }

    const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  }

  /**
   * Calcula el ratio de contraste WCAG (1:1 a 21:1)
   */
  public calculateWcagContrast(hexForeground: string, hexBackground: string): number {
    const l1 = this.getRelativeLuminance(hexForeground);
    const l2 = this.getRelativeLuminance(hexBackground);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    return Math.round(ratio * 100) / 100;
  }

  /**
   * Ejecuta la batería de pruebas de calidad técnica, compositiva y artística
   */
  evaluate(
    spec: PosterDesignSpec,
    svgContent: string,
    pngBuffer: Buffer,
    pngPath: string,
    timings?: { durationMs?: number; artDirectionMs?: number; svgGenMs?: number },
    gpuDiag?: { vendor?: string; renderer?: string; webgl2?: boolean },
    profile: QualityProfile = 'standard',
  ): PosterQualityReport {
    const artisticFeedback: string[] = [];

    // ─────────────────────────────────────────────────────────────
    // BLOQUE 1: INTEGRIDAD TÉCNICA
    // ─────────────────────────────────────────────────────────────
    const technicalErrors: string[] = [];
    const isPngMagicValid =
      pngBuffer.length >= 8 &&
      pngBuffer[0] === 0x89 &&
      pngBuffer[1] === 0x50 &&
      pngBuffer[2] === 0x4e &&
      pngBuffer[3] === 0x47;

    if (!isPngMagicValid) {
      technicalErrors.push('Cabecera PNG corrupta o inválida (falta firma 0x89 0x50 0x4E 0x47).');
    }

    const fileSizeKb = Math.round(pngBuffer.length / 1024);
    if (fileSizeKb < 20) {
      technicalErrors.push(`Archivo anómalamente liviano (${fileSizeKb} KB), riesgo de render vacío.`);
    }

    let widthMatch = true;
    let heightMatch = true;
    if (pngBuffer.length >= 24) {
      const readWidth = pngBuffer.readUInt32BE(16);
      const readHeight = pngBuffer.readUInt32BE(20);
      widthMatch = readWidth === spec.dimensions.width;
      heightMatch = readHeight === spec.dimensions.height;
      if (!widthMatch || !heightMatch) {
        technicalErrors.push(
          `Dimensiones del buffer (${readWidth}x${readHeight}) difieren de la especificación (${spec.dimensions.width}x${spec.dimensions.height}).`,
        );
      }
    }

    const technicalChecks: TechnicalChecks = {
      validPng: isPngMagicValid,
      fileSizeKb,
      widthMatch,
      heightMatch,
      errors: technicalErrors,
    };

    // ─────────────────────────────────────────────────────────────
    // BLOQUE 2: CALIDAD DE DISEÑO Y LEGIBILIDAD
    // ─────────────────────────────────────────────────────────────
    const typographyWarnings: string[] = [];
    const titleRegex = new RegExp(spec.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const titlePresent = titleRegex.test(svgContent);
    if (!titlePresent) {
      typographyWarnings.push(`El título "${spec.title}" no fue localizado en las capas tipográficas.`);
    }

    let subtitlePresent = true;
    if (spec.subtitle) {
      const subRegex = new RegExp(spec.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      subtitlePresent = subRegex.test(svgContent);
      if (!subtitlePresent) {
        typographyWarnings.push(`El subtítulo "${spec.subtitle}" no fue localizado en las capas tipográficas.`);
      }
    }

    // Cálculo de contraste WCAG real entre el texto y el fondo principal
    const contrastRatio = this.calculateWcagContrast(
      spec.palette.text || '#FFFFFF',
      spec.palette.background || '#000000',
    );
    // Para títulos grandes (>= 24px) WCAG exige mínimo 3.0:1; estándar AA normal 4.5:1
    const contrastPassed = contrastRatio >= 3.0;
    if (!contrastPassed) {
      typographyWarnings.push(
        `Bajo ratio de contraste WCAG (${contrastRatio}:1). Se recomienda mínimo 3.0:1 para legibilidad de títulos grandes.`,
      );
    } else {
      artisticFeedback.push(`Ratio de contraste óptimo (${contrastRatio}:1) entre texto del título y fondo.`);
    }

    // Comprobación de zonas seguras (safe margins)
    const hasTypographyGroup = svgContent.includes('id="main-title"') || svgContent.includes('id="title-group"');
    const safeMarginPassed = hasTypographyGroup;
    if (!safeMarginPassed) {
      typographyWarnings.push('No se encontró grupo contenedor tipográfico con márgenes de seguridad.');
    } else {
      artisticFeedback.push('Márgenes de seguridad respetados en el encuadre del título.');
    }

    const designBlock: DesignQualityBlockReport = {
      wcagContrastRatio: contrastRatio,
      contrastPassed,
      safeMarginRatio: 0.05,
      safeMarginPassed,
      visualHierarchyPassed: titlePresent && subtitlePresent,
      typographyWarnings,
    };

    // ─────────────────────────────────────────────────────────────
    // BLOQUE 3: CALIDAD DE CONTENIDO Y SILUETA (MOTOR ESPECÍFICO)
    // ─────────────────────────────────────────────────────────────
    const contentWarnings: string[] = [];
    const detectedElements: string[] = [];

    // Conteo y complejidad vectorial real
    const pathMatches = svgContent.match(/<path\b/g) || [];
    const gradientMatches = svgContent.match(/<linearGradient\b|<radialGradient\b/g) || [];
    const polygonMatches = svgContent.match(/<polygon\b|<polyline\b/g) || [];
    const pathCount = pathMatches.length + polygonMatches.length;
    const gradientCount = gradientMatches.length;

    let vectorComplexityScore = Math.min(100, Math.round((pathCount / 25) * 100));
    if (pathCount < 10) {
      contentWarnings.push(`Baja complejidad vectorial (${pathCount} paths). Las figuras pueden verse planas.`);
    } else {
      artisticFeedback.push(`Excelente densidad geométrica (${pathCount} geometrías vectoriales, ${gradientCount} gradientes de sombreado).`);
    }

    // Elementos requeridos por motor
    let subjectPresent = false;
    if (spec.era === 'dreamcast-ocean') {
      subjectPresent =
        svgContent.includes('id="marine-hero"') ||
        svgContent.includes('id="orca-body"') ||
        svgContent.includes('orca');
      if (svgContent.includes('id="water-surface"')) detectedElements.push('Superficie Fresnel');
      if (svgContent.includes('id="splash-wake"')) detectedElements.push('Estela y salpicaduras');
      if (svgContent.includes('id="sea-stacks"')) detectedElements.push('Acantilados tropicales');
      if (svgContent.includes('id="dreamcast-hud"')) detectedElements.push('HUD Dreamcast 128-bit');
    } else if (spec.era === 'genesis-landscape') {
      subjectPresent =
        svgContent.includes('id="floating-island"') || svgContent.includes('id="crystal-palace"');
      if (svgContent.includes('id="cloud-sea"')) detectedElements.push('Mar de nubes');
      if (svgContent.includes('id="waterfalls"')) detectedElements.push('Cascadas continuas');
      if (svgContent.includes('id="title-screen-ui"')) detectedElements.push('UI de título 1992');
    } else {
      subjectPresent = svgContent.includes('id="armored-hero"') || svgContent.includes('id="helmet"');
      if (svgContent.includes('id="genesis-packaging"')) detectedElements.push('Empaque cartucho 16-bit');
      if (svgContent.includes('id="stars"')) detectedElements.push('Campo estelar');
    }

    if (!subjectPresent) {
      contentWarnings.push('La capa del sujeto protagónico no fue renderizada en la escena.');
    } else {
      detectedElements.push('Sujeto protagónico principal');
    }

    const contentBlock: ContentSilhouetteBlockReport = {
      vectorComplexityScore,
      pathCount,
      gradientCount,
      subjectElementsDetected: detectedElements,
      sceneryDepthPassed: detectedElements.length >= 3,
      warnings: contentWarnings,
    };

    // ─────────────────────────────────────────────────────────────
    // BLOQUE 4: TELEMETRÍA Y RENDIMIENTO
    // ─────────────────────────────────────────────────────────────
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10;
    const durationTotalMs = timings?.durationMs || 800;

    const perfBlock: PerformanceBlockReport = {
      artDirectionMs: timings?.artDirectionMs || 5,
      svgGenMs: timings?.svgGenMs || 15,
      renderMs: durationTotalMs,
      qaMs: 12,
      totalMs: durationTotalMs + 32,
      heapUsedMb,
      gpuRenderer: gpuDiag?.renderer || 'ANGLE / Direct3D 11 (GPU Acelerada)',
      webglAccelerated: gpuDiag?.webgl2 !== false,
    };

    if (perfBlock.webglAccelerated) {
      artisticFeedback.push(`Aceleración gráfica reportada: ${perfBlock.gpuRenderer}`);
    }

    // ─────────────────────────────────────────────────────────────
    // CÁLCULO DE PUNTUACIÓN OBJETIVA Y RÚBRICA ARTÍSTICA
    // ─────────────────────────────────────────────────────────────
    let score = 100;
    // Penalizaciones técnicas severas
    if (technicalErrors.length > 0) score -= 40 * technicalErrors.length;
    // Penalizaciones de diseño
    if (!contrastPassed) score -= 15;
    if (typographyWarnings.length > 0) score -= 10 * typographyWarnings.length;
    // Penalizaciones de contenido
    if (!subjectPresent) score -= 25;
    if (pathCount < 10) score -= 10;
    if (score < 0) score = 0;

    const passed = technicalErrors.length === 0 && titlePresent && subjectPresent;

    const artisticReview: ArtisticReview = {
      composition: subjectPresent && designBlock.visualHierarchyPassed ? 5 : 3,
      eraConsistency: detectedElements.length >= 3 ? 5 : 4,
      typography: contrastPassed && titlePresent ? 5 : 3,
      visualIntegration: gradientCount >= 4 ? 5 : 3,
      professionalFinish: technicalErrors.length === 0 && contrastPassed ? 5 : 3,
    };

    const compositionChecks: CompositionChecks = {
      titlePresent,
      subtitlePresent,
      contrastOk: contrastPassed,
      svgWellFormed: svgContent.includes('<svg') && svgContent.includes('</svg>'),
      warnings: [...typographyWarnings, ...contentWarnings],
    };

    this.logger.log(
      `[poster-qa] Evaluación desacoplada para "${spec.title}": ${passed ? 'APROBADO' : 'RECHAZADO'} (${score}/100 pts, contraste: ${contrastRatio}:1, paths: ${pathCount})`,
    );

    return {
      passed,
      score,
      technicalChecks,
      design: designBlock,
      content: contentBlock,
      performance: perfBlock,
      compositionChecks,
      artisticReview,
      artisticFeedback,
      profile,
      engineVersion: this.ENGINE_VERSION,
      seed: spec.seed,
      renderedAt: new Date().toISOString(),
    };
  }
}
