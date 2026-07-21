import { Injectable, Logger } from '@nestjs/common';

export interface HypothesisCandidate {
  id: string;
  name: string;
  angle: 'ANALYTICAL' | 'PRAGMATIC' | 'EXPERIMENTAL' | 'CRITICAL' | 'TUNNELING';
  perspectiveDescription: string;
  seedPrompt: string;
  isQuantumTunneling?: boolean;
}

@Injectable()
export class HypothesisEngineService {
  private readonly logger = new Logger(HypothesisEngineService.name);

  /**
   * Genera una superposición de 4 a 5 hipótesis iniciales (incluyendo Tunelamiento Cuántico).
   */
  generateHypothesisSuperposition(query: string, explorationRate = 0.15): HypothesisCandidate[] {
    this.logger.log(`[QICA:Superposición] Generando estados de hipótesis para: "${query.substring(0, 60)}..."`);

    const baseHypotheses: HypothesisCandidate[] = [
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
        id: 'hyp_critical',
        name: 'Perspectiva Crítica y Falsación (Frontera de Seguridad)',
        angle: 'CRITICAL',
        perspectiveDescription: 'Enfoque en identificar cuellos de botella, posibles fallos, contradicciones y limitaciones.',
        seedPrompt: 'Cuestiona los supuestos, busca puntos ciegos, vulnerabilidades de seguridad y limitaciones operativas.',
      },
    ];

    // QICA 2.0: Tunelamiento Cuántico (Exploración para escapar de mínimos locales / respuestas estándar)
    baseHypotheses.push({
      id: 'hyp_tunneling',
      name: 'Perspectiva de Tunelamiento Cuántico (Exploración Disruptiva)',
      angle: 'TUNNELING',
      isQuantumTunneling: true,
      perspectiveDescription: 'Atraviesa barreras convencionales y valles locales para proponer soluciones poco probables pero de alto valor.',
      seedPrompt: 'Explora un enfoque contraintuitivo, lateral o altamente innovador que desafíe el paradigma estándar.',
    });

    return baseHypotheses;
  }
}
