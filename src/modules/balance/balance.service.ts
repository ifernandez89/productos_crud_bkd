import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BalanceQuestionnaireService } from './balance-questionnaire.service';
import { BalanceAnalysisService } from './balance-analysis.service';
import { BalanceRecommendationService } from './balance-recommendation.service';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionnaireService: BalanceQuestionnaireService,
    private readonly analysisService: BalanceAnalysisService,
    private readonly recommendationService: BalanceRecommendationService,
  ) {}

  /**
   * Inicia un nuevo cuestionario de balance energético
   */
  async start(type: string = 'manual'): Promise<any> {
    this.logger.log(
      `[balance-service] Iniciando nueva sesión de balance de tipo: ${type}`,
    );

    // Crear la sesión en la base de datos
    const session = await this.prisma.balanceSession.create({
      data: {
        type,
      },
    });

    try {
      // Generar y guardar las preguntas
      const questions = await this.questionnaireService.generateAndSetup(
        session.id,
      );
      return {
        sessionId: session.id,
        type: session.type,
        createdAt: session.createdAt,
        questions,
      };
    } catch (err) {
      // Si falla la generación de preguntas, eliminamos la sesión creada para limpiar la DB
      await this.prisma.balanceSession
        .delete({ where: { id: session.id } })
        .catch(() => {});
      throw err;
    }
  }

  /**
   * Responde una pregunta específica dentro de una sesión y genera la siguiente si corresponde
   */
  async submitAnswer(
    sessionId: number,
    questionId: number,
    answer: string,
  ): Promise<any> {
    this.logger.log(
      `[balance-service] Guardando respuesta para sesión ${sessionId}, pregunta ID ${questionId}`,
    );

    // Verificar que exista la sesión y la pregunta
    const dbAnswer = await this.prisma.balanceAnswer.findFirst({
      where: {
        id: questionId,
        sessionId,
      },
    });

    if (!dbAnswer) {
      throw new NotFoundException(
        `No se encontró la pregunta con ID ${questionId} para la sesión ${sessionId}`,
      );
    }

    // Actualizar la respuesta
    const updated = await this.prisma.balanceAnswer.update({
      where: { id: questionId },
      data: { answer },
    });

    // Obtener todas las preguntas/respuestas de la sesión actual hasta el momento
    const allAnswers = await this.prisma.balanceAnswer.findMany({
      where: { sessionId },
      orderBy: { id: 'asc' },
    });

    const MAX_QUESTIONS = 10;
    const answeredCount = allAnswers.filter(
      (a) => a.answer && a.answer.trim().length > 0,
    ).length;

    // Si aún quedan preguntas por hacer en la entrevista
    if (allAnswers.length < MAX_QUESTIONS) {
      let nextQuestionText = '';
      let metadata: any = {};

      if (allAnswers.length === 1) {
        // Pregunta 2 de Capa 1 (fija)
        nextQuestionText =
          '¿Qué ocupó la mayor parte de tu energía mental durante estos días?';
        metadata = { layer: 1, step: 2, dimension: 'general' };
      } else if (allAnswers.length === 2) {
        // Pregunta 3 de Capa 1 (fija)
        nextQuestionText = '¿Qué sentís que descuidaste más?';
        metadata = { layer: 1, step: 3, dimension: 'general' };
      } else {
        // A partir de la pregunta 4 en adelante (Capa 2: exploración adaptativa y dimensional)
        const nextQuestionData =
          await this.questionnaireService.generateNextQuestion(
            sessionId,
            allAnswers,
          );
        nextQuestionText = nextQuestionData.question;
        metadata = {
          layer: 2,
          step: allAnswers.length + 1,
          dimension: nextQuestionData.dimension,
          reasoning: nextQuestionData.reasoning,
        };
      }

      // Crear y guardar la siguiente pregunta en la base de datos
      const nextAnswer = await this.prisma.balanceAnswer.create({
        data: {
          sessionId,
          question: nextQuestionText,
          answer: '',
          metadata,
        },
      });

      return {
        success: true,
        message: 'Respuesta guardada con éxito',
        questionId: updated.id,
        nextQuestion: {
          id: nextAnswer.id,
          question: nextAnswer.question,
        },
      };
    }

    // Si ya llegamos al límite de preguntas
    return {
      success: true,
      message: 'Preguntas completadas. Ya podés finalizar la entrevista.',
      questionId: updated.id,
    };
  }

  /**
   * Finaliza el cuestionario y genera el informe de balance energético
   */
  async finish(sessionId: number): Promise<any> {
    this.logger.log(
      `[balance-service] Finalizando sesión ${sessionId} y generando reporte`,
    );

    // 1. Obtener la sesión con sus respuestas
    const session = await this.prisma.balanceSession.findUnique({
      where: { id: sessionId },
      include: { answers: true },
    });

    if (!session) {
      throw new NotFoundException(
        `No se encontró la sesión de balance con ID ${sessionId}`,
      );
    }

    if (session.completedAt) {
      throw new BadRequestException(
        `La sesión con ID ${sessionId} ya fue completada anteriormente.`,
      );
    }

    const answeredAnswers = session.answers.filter(
      (a) => a.answer && a.answer.trim().length > 0,
    );
    if (answeredAnswers.length < 5) {
      throw new BadRequestException(
        `Para generar un balance preciso, debés responder al menos 5 preguntas (respondiste ${answeredAnswers.length}).`,
      );
    }

    // 2. Obtener reportes anteriores para el análisis comparativo e histórico
    const previousReports = await this.prisma.balanceReport.findMany({
      where: {
        session: {
          completedAt: { not: null },
          id: { not: sessionId },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    // 3. Generar análisis por IA utilizando solo las preguntas con respuestas válidas
    const rawAnalysis = await this.analysisService.generateAnalysis(
      sessionId,
      answeredAnswers,
      session.astrologicalContext,
      previousReports,
    );

    // 4. Procesar y enriquecer recomendaciones
    const processedRecs =
      await this.recommendationService.processRecommendations(
        rawAnalysis.recommendations,
        rawAnalysis.energyDistribution,
      );

    // 5. Crear el reporte en la base de datos
    const report = await this.prisma.balanceReport.create({
      data: {
        sessionId,
        analysis: JSON.stringify(rawAnalysis.analysisDetails),
        recommendations: JSON.stringify(processedRecs),
        energyDistribution: rawAnalysis.energyDistribution,
      },
    });

    // 6. Actualizar la sesión a completada
    const nextRecommended = new Date();
    nextRecommended.setDate(nextRecommended.getDate() + 15); // Recomendar hacer otro en 15 días

    await this.prisma.balanceSession.update({
      where: { id: sessionId },
      data: {
        completedAt: new Date(),
        scoreGeneral: rawAnalysis.scoreGeneral,
        summary: rawAnalysis.summary,
        nextRecommendedAt: nextRecommended,
      },
    });

    return {
      reportId: report.id,
      sessionId: report.sessionId,
      summary: rawAnalysis.summary,
      scoreGeneral: rawAnalysis.scoreGeneral,
      energyDistribution: report.energyDistribution,
      analysis: rawAnalysis.analysisDetails,
      recommendations: processedRecs,
      createdAt: report.createdAt,
    };
  }

  /**
   * Obtiene el último estado de balance del usuario
   */
  async getLatest(): Promise<any> {
    this.logger.log(`[balance-service] Obteniendo último reporte de balance`);

    const latestSession = await this.prisma.balanceSession.findFirst({
      where: {
        completedAt: { not: null },
      },
      orderBy: {
        completedAt: 'desc',
      },
      include: {
        reports: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
        answers: true,
      },
    });

    if (!latestSession || latestSession.reports.length === 0) {
      return {
        message:
          'Aún no completaste ningún cuestionario de balance energético.',
      };
    }

    const report = latestSession.reports[0];
    let analysisObj = {};
    let recommendationsObj = {};

    try {
      analysisObj =
        typeof report.analysis === 'string'
          ? JSON.parse(report.analysis)
          : report.analysis;
      recommendationsObj =
        typeof report.recommendations === 'string'
          ? JSON.parse(report.recommendations)
          : report.recommendations;
    } catch (e) {
      this.logger.warn(
        `Error al parsear campos JSON del reporte: ${e.message}`,
      );
    }

    return {
      sessionId: latestSession.id,
      completedAt: latestSession.completedAt,
      nextRecommendedAt: latestSession.nextRecommendedAt,
      type: latestSession.type,
      scoreGeneral: latestSession.scoreGeneral,
      summary: latestSession.summary,
      astrologicalContext: latestSession.astrologicalContext,
      energyDistribution: report.energyDistribution,
      analysis: analysisObj,
      recommendations: recommendationsObj,
      answers: latestSession.answers.map((a) => ({
        id: a.id,
        question: a.question,
        answer: a.answer,
        dimension:
          a.metadata && typeof a.metadata === 'object'
            ? a.metadata['dimension']
            : 'desconocida',
      })),
    };
  }

  /**
   * Obtiene el historial de sesiones completadas
   */
  async getHistory(): Promise<any[]> {
    this.logger.log(`[balance-service] Obteniendo historial de balances`);

    const sessions = await this.prisma.balanceSession.findMany({
      where: {
        completedAt: { not: null },
      },
      orderBy: {
        completedAt: 'desc',
      },
      include: {
        reports: true,
      },
    });

    return sessions.map((session) => {
      const report = session.reports[0];
      let analysisObj = {};
      let recommendationsObj = {};

      if (report) {
        try {
          if (report.analysis) {
            analysisObj =
              typeof report.analysis === 'string'
                ? JSON.parse(report.analysis)
                : report.analysis;
          }
          if (report.recommendations) {
            recommendationsObj =
              typeof report.recommendations === 'string'
                ? JSON.parse(report.recommendations)
                : report.recommendations;
          }
        } catch (e) {
          this.logger.warn(
            `Error al parsear campos JSON en historial: ${e.message}`,
          );
        }
      }

      return {
        sessionId: session.id,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        type: session.type,
        scoreGeneral: session.scoreGeneral,
        summary: session.summary,
        energyDistribution: report ? report.energyDistribution : {},
        analysis: analysisObj,
        recommendations: recommendationsObj,
      };
    });
  }

  /**
   * Obtiene las tendencias y evolución de cada dimensión a lo largo del tiempo
   */
  async getTrends(): Promise<any[]> {
    this.logger.log(`[balance-service] Calculando tendencias históricas`);

    const sessions = await this.prisma.balanceSession.findMany({
      where: {
        completedAt: { not: null },
      },
      orderBy: {
        completedAt: 'asc', // Orden cronológico para las series de tiempo
      },
      include: {
        reports: {
          select: {
            energyDistribution: true,
          },
          take: 1,
        },
      },
    });

    return sessions.map((session) => {
      const report = session.reports[0];
      return {
        sessionId: session.id,
        completedAt: session.completedAt,
        scoreGeneral: session.scoreGeneral,
        energyDistribution: report ? report.energyDistribution : {},
      };
    });
  }
}
