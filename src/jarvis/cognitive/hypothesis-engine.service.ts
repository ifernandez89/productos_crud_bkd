import { Injectable, Logger } from '@nestjs/common';

export interface HypothesisCandidate {
  id: string;
  name: string;
  angle: 'ANALYTICAL' | 'PRAGMATIC' | 'EXPERIMENTAL' | 'CRITICAL';
  perspectiveDescription: string;
  seedPrompt: string;
}

@Injectable()
export class HypothesisEngineService {
  private readonly logger = new Logger(HypothesisEngineService.name);

  /**
   * Genera una superposición de 3 a 4 hipótesis iniciales para consultas de alta complejidad.
   */
  generateHypothesisSuperposition(query: string): HypothesisCandidate[] {
    this.logger.log(`[QICA:Superposición] Generando estados de hipótesis para: "${query.substring(0, 60)}..."`);

    return [
      {
        id: 'hyp_analytical',
        name: 'Perspectiva Analítica y Estructural',
        angle: 'ANALYTICAL',
        perspectiveDescription: 'Enfoque en arquitectura sólida, principios de diseño, modularidad y fundamentación teórica.',
        seedPrompt: 'Prioriza la estructura formal, escalabilidad, buenas prácticas y patrones de diseño comprobados.',
      },
      {
        id: 'hyp_pragmatic',
        name: 'Perspectiva Pragmática y de Riesgo Contenido',
        angle: 'PRAGMATIC',
        perspectiveDescription: 'Enfoque en simplicidad, menor esfuerzo de mantenimiento, seguridad e impacto inmediato.',
        seedPrompt: 'Prioriza la viabilidad directa, minimizar la complejidad, evitar sobre-ingeniería y reducir riesgos.',
      },
      {
        id: 'hyp_experimental',
        name: 'Perspectiva Innovadora y de Frontera',
        angle: 'EXPERIMENTAL',
        perspectiveDescription: 'Enfoque en soluciones de vanguardia, automatización avanzada y patrones emergentes.',
        seedPrompt: 'Explora ideas disruptivas, autonomía de agentes, integraciones modernas y optimización de frontera.',
      },
      {
        id: 'hyp_critical',
        name: 'Perspectiva Crítica y Falsación (Frontera de Seguridad)',
        angle: 'CRITICAL',
        perspectiveDescription: 'Enfoque en identificar cuellos de botella, posibles fallos, contradicciones y limitaciones.',
        seedPrompt: 'Cuestiona los supuestos, busca puntos ciegos, vulnerabilidades de seguridad y limitaciones operativas.',
      },
    ];
  }
}
