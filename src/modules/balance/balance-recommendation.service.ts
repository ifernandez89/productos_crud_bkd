import { Injectable, Logger } from '@nestjs/common';

export interface RecommendationInput {
  accionFocalizada: string;
  preguntaReflexion: string;
  semilla: string;
}

@Injectable()
export class BalanceRecommendationService {
  private readonly logger = new Logger(BalanceRecommendationService.name);

  constructor() {}

  /**
   * Procesa, valida y enriquece las recomendaciones generadas por la IA
   */
  async processRecommendations(
    recommendations: RecommendationInput,
    energyDistribution: Record<string, number>,
  ): Promise<RecommendationInput> {
    this.logger.log(
      `[balance-recommendation] Procesando y validando recomendaciones para el reporte`,
    );

    // Enriquecer la semilla con el emoji de plantita si no lo tiene
    let semilla = (recommendations.semilla || '').trim();
    if (semilla && !semilla.startsWith('🌱')) {
      semilla = `🌱 ${semilla}`;
    }

    // Si falta algo por algún problema en el LLM, proveer fallbacks
    return {
      accionFocalizada:
        recommendations.accionFocalizada ||
        'Elegí un aspecto en el cual enfocarte hoy y da un paso concreto.',
      preguntaReflexion:
        recommendations.preguntaReflexion ||
        '¿Qué estás evitando ver en este momento de tu vida?',
      semilla:
        semilla ||
        '🌱 Elegí una sola acción que represente la manifestación de aquello que ya sabés. No busques más información. Construí.',
    };
  }
}
