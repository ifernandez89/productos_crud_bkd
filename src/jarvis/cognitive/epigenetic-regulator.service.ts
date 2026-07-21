import { Injectable, Logger } from '@nestjs/common';

export interface EpigeneticExpression {
  analyticalRigor: number; // 0.0 a 1.0
  creativeExpression: number; // 0.0 a 1.0
  researchDepth: number; // 0.0 a 1.0
  functionalDoubt: number; // 0.0 a 1.0 (Duda funcional)
  functionalCuriosity: number; // 0.0 a 1.0 (Curiosidad)
  functionalConfidence: number; // 0.0 a 1.0 (Confianza)
  quantumTunnelingRate: number; // 0.05 a 0.35
  activeProfileLabel: string;
}

@Injectable()
export class EpigeneticRegulatorService {
  private readonly logger = new Logger(EpigeneticRegulatorService.name);

  /**
   * JarBees 3.0: Computa la regulación de expresión epigenética del sistema para la consulta.
   */
  computeExpression(query: string, intentCategory?: string): EpigeneticExpression {
    const qLower = query.toLowerCase();

    let analyticalRigor = 0.6;
    let creativeExpression = 0.4;
    let researchDepth = 0.5;
    let functionalDoubt = 0.2;
    let functionalCuriosity = 0.3;
    let functionalConfidence = 0.7;

    // Regulación según intención o keywords
    if (
      qLower.includes('inventa') ||
      qLower.includes('crea') ||
      qLower.includes('cuento') ||
      qLower.includes('novela') ||
      qLower.includes('brainstorm') ||
      qLower.includes('poema')
    ) {
      creativeExpression = 1.0;
      analyticalRigor = 0.2;
      researchDepth = 0.2;
      functionalCuriosity = 0.9;
    } else if (
      qLower.includes('arquitectura') ||
      qLower.includes('código') ||
      qLower.includes('codigo') ||
      qLower.includes('sql') ||
      qLower.includes('prisma') ||
      qLower.includes('bug') ||
      qLower.includes('error') ||
      qLower.includes('seguridad')
    ) {
      analyticalRigor = 0.95;
      creativeExpression = 0.2;
      researchDepth = 0.8;
      functionalDoubt = 0.4; // Eleva el rigor de evidencia RAG
    } else if (
      qLower.includes('investigá') ||
      qLower.includes('investiga') ||
      qLower.includes('busca') ||
      qLower.includes('noticias') ||
      qLower.includes('comparación')
    ) {
      researchDepth = 1.0;
      analyticalRigor = 0.7;
      functionalDoubt = 0.5;
    }

    const quantumTunnelingRate = Math.min(0.35, 0.1 + functionalCuriosity * 0.25);

    let activeProfileLabel = 'Equilibrado';
    if (analyticalRigor >= 0.85) activeProfileLabel = 'Rigor Analítico & Técnico';
    else if (creativeExpression >= 0.85) activeProfileLabel = 'Exploración Creativa Disruptiva';
    else if (researchDepth >= 0.85) activeProfileLabel = 'Investigación Exhaustiva';

    this.logger.log(
      `[JarBees 3.0:Epigenética] Expresión activada: "${activeProfileLabel}" (Análisis: ${(analyticalRigor * 100).toFixed(0)}%, Creatividad: ${(creativeExpression * 100).toFixed(0)}%)`,
    );

    return {
      analyticalRigor,
      creativeExpression,
      researchDepth,
      functionalDoubt,
      functionalCuriosity,
      functionalConfidence,
      quantumTunnelingRate,
      activeProfileLabel,
    };
  }
}
