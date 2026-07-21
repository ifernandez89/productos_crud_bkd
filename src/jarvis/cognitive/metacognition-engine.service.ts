import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EpigeneticExpression } from './epigenetic-regulator.service';
import { PredictionResult } from './predictive-processing.service';

export interface MetacognitiveEvaluation {
  strategyUsed: string;
  selfReflectionSummary: string;
  metacognitiveMarkdown: string;
}

@Injectable()
export class MetacognitionEngineService {
  private readonly logger = new Logger(MetacognitionEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * JarBees 3.0: Auto-reflexión metacognitiva sobre la estrategia elegida y registro persistente.
   */
  async evaluateAndRecord(
    sessionId: string,
    expression: EpigeneticExpression,
    prediction: PredictionResult,
  ): Promise<MetacognitiveEvaluation> {
    const strategyUsed = expression.activeProfileLabel;
    const selfReflectionSummary = `Estrategia evaluada: "${strategyUsed}". Predicción: "${prediction.predictedIntent}" (Error de Predicción: ${(prediction.predictionError * 100).toFixed(0)}%). Expresión Adaptativa: Rigor ${(expression.analyticalRigor * 100).toFixed(0)}%, Creatividad ${(expression.creativeExpression * 100).toFixed(0)}%.`;

    try {
      await this.prisma.metacognitiveRun.create({
        data: {
          sessionId,
          strategyUsed,
          predictedIntent: prediction.predictedIntent,
          predictionError: prediction.predictionError,
          expressionWeights: JSON.stringify({
            analyticalRigor: expression.analyticalRigor,
            creativeExpression: expression.creativeExpression,
            researchDepth: expression.researchDepth,
            functionalDoubt: expression.functionalDoubt,
          }),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Error registrando corrida metacognitiva: ${err.message}`);
    }

    const metacognitiveMarkdown = `
> 🧬 **Perfil Epigenético:** ${expression.activeProfileLabel} (Rigor: ${(expression.analyticalRigor * 100).toFixed(0)}%, Creatividad: ${(expression.creativeExpression * 100).toFixed(0)}%)  
> 🔮 **Procesamiento Predictivo:** Intención "${prediction.predictedIntent}" | Error de Predicción: ${(prediction.predictionError * 100).toFixed(0)}%
`;

    return {
      strategyUsed,
      selfReflectionSummary,
      metacognitiveMarkdown,
    };
  }
}
