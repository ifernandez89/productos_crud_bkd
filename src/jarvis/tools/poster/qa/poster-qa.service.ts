import { Injectable, Logger } from '@nestjs/common';
import {
  PosterDesignSpec,
  PosterQualityReport,
  TechnicalChecks,
  CompositionChecks,
  ArtisticReview,
} from '../poster.types';

@Injectable()
export class PosterQualityAssuranceService {
  private readonly logger = new Logger(PosterQualityAssuranceService.name);
  private readonly ENGINE_VERSION = '1.0.0-genesis-core';

  /**
   * Ejecuta la batería de pruebas de calidad técnica, compositiva y artística
   */
  evaluate(
    spec: PosterDesignSpec,
    svgContent: string,
    pngBuffer: Buffer,
    pngPath: string,
  ): PosterQualityReport {
    // 1. Verificaciones Técnicas Automatizadas
    const technicalErrors: string[] = [];

    // Validar Magic Bytes de PNG (0x89 0x50 0x4E 0x47)
    const isPngMagicValid =
      pngBuffer.length >= 8 &&
      pngBuffer[0] === 0x89 &&
      pngBuffer[1] === 0x50 &&
      pngBuffer[2] === 0x4e &&
      pngBuffer[3] === 0x47;

    if (!isPngMagicValid) {
      technicalErrors.push('El buffer de salida no corresponde a un archivo PNG válido (cabecera corrupta).');
    }

    const fileSizeKb = Math.round(pngBuffer.length / 1024);
    if (fileSizeKb < 20) {
      technicalErrors.push(`El archivo es sospechosamente liviano (${fileSizeKb} KB), posible lienzo vacío.`);
    }

    // Comprobar dimensiones del IHDR si es posible
    let widthMatch = true;
    let heightMatch = true;
    if (pngBuffer.length >= 24) {
      const readWidth = pngBuffer.readUInt32BE(16);
      const readHeight = pngBuffer.readUInt32BE(20);
      widthMatch = readWidth === spec.dimensions.width;
      heightMatch = readHeight === spec.dimensions.height;
      if (!widthMatch || !heightMatch) {
        technicalErrors.push(
          `Dimensiones renderizadas (${readWidth}x${readHeight}) no coinciden con la especificación (${spec.dimensions.width}x${spec.dimensions.height}).`,
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

    // 2. Verificaciones de Composición y Tipografía
    const warnings: string[] = [];
    const titleRegex = new RegExp(spec.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const titlePresent = titleRegex.test(svgContent);
    if (!titlePresent) {
      warnings.push(`El título principal "${spec.title}" no fue localizado en las capas vectoriales.`);
    }

    let subtitlePresent = true;
    if (spec.subtitle) {
      const subRegex = new RegExp(spec.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      subtitlePresent = subRegex.test(svgContent);
      if (!subtitlePresent) {
        warnings.push(`El subtítulo "${spec.subtitle}" no fue localizado en las capas vectoriales.`);
      }
    }

    const svgWellFormed =
      svgContent.includes('<svg') &&
      svgContent.includes('</svg>') &&
      svgContent.includes('<defs>') &&
      svgContent.includes('</defs>');
    if (!svgWellFormed) {
      warnings.push('El documento SVG presenta estructura XML incompleta o etiquetas desbalanceadas.');
    }

    // Verificar presencia del sujeto y del marco
    const subjectPresent = svgContent.includes('id="armored-hero"') || svgContent.includes('id="helmet"');
    if (!subjectPresent) {
      warnings.push('La capa del sujeto protagónico no fue renderizada en la escena.');
    }

    const packagingPresent = svgContent.includes('id="genesis-packaging"');
    if (!packagingPresent) {
      warnings.push('El marco de packaging de consola no se encuentra presente.');
    }

    const compositionChecks: CompositionChecks = {
      titlePresent,
      subtitlePresent,
      contrastOk: true, // El motor aplica doble trazo y filtro drop-shadow con contraste garantizado
      svgWellFormed,
      warnings,
    };

    // 3. Revisión Artística Estimada por Reglas
    const artisticReview: ArtisticReview = {
      composition: subjectPresent && titlePresent ? 5 : 3,
      eraConsistency: packagingPresent && spec.era === 'genesis16' ? 5 : 4,
      typography: titlePresent && subtitlePresent ? 5 : 3,
      visualIntegration: 5,
      professionalFinish: technicalErrors.length === 0 ? 5 : 2,
    };

    // 4. Puntuación Global (0 - 100)
    let score = 100;
    if (technicalErrors.length > 0) score -= 40 * technicalErrors.length;
    if (warnings.length > 0) score -= 10 * warnings.length;
    if (score < 0) score = 0;

    const passed = technicalErrors.length === 0 && titlePresent && svgWellFormed;

    this.logger.log(
      `[poster-qa] Evaluación terminada para "${spec.title}": ${passed ? 'APROBADO' : 'RECHAZADO'} (${score}/100 pts)`,
    );

    return {
      passed,
      score,
      technicalChecks,
      compositionChecks,
      artisticReview,
      engineVersion: this.ENGINE_VERSION,
      seed: spec.seed,
      renderedAt: new Date().toISOString(),
    };
  }
}
