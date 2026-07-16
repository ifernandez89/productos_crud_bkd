import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ILLMProvider } from '../../jarvis/llm/llm-provider.interface';
import { OllamaProvider } from '../../jarvis/llm/ollama.provider';
import { OpenRouterProvider } from '../../jarvis/llm/openrouter.provider';

export interface AnalysisOutput {
  energyDistribution: Record<string, number>;
  scoreGeneral: number;
  summary: string;
  analysisDetails: {
    fortalezas: string[];
    enCrecimiento: string[];
    necesitanAtencion: string[];
    loQueObservo: string;
    puntoCiego: string;
    fortalezaDetalle: string;
    astrologyConnection: string;
  };
  recommendations: {
    accionFocalizada: string;
    preguntaReflexion: string;
    semilla: string;
  };
}

@Injectable()
export class BalanceAnalysisService {
  private readonly logger = new Logger(BalanceAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OllamaProvider) private readonly ollamaProvider: ILLMProvider,
    @Inject(OpenRouterProvider) private readonly openRouterProvider: ILLMProvider,
  ) {}

  private getLLMProvider(): ILLMProvider {
    if (process.env.OPENROUTER_API_KEY) {
      return this.openRouterProvider;
    }
    return this.ollamaProvider;
  }

  /**
   * Analiza las respuestas de la sesión, integra la astrología e historia, y calcula los puntajes.
   */
  async generateAnalysis(
    sessionId: number,
    answers: any[],
    astrologicalContext: any,
    previousReports: any[],
  ): Promise<AnalysisOutput> {
    this.logger.log(`[balance-analysis] Generando análisis para sesión ${sessionId}`);

    const llm = this.getLLMProvider();
    const prompt = this.buildAnalysisPrompt(answers, astrologicalContext, previousReports);

    let content = '';
    try {
      const response = await llm.generate({
        messages: [
          {
            role: 'system',
            content: 'Sos un analista transpersonal de la personalidad, especializado en la integración de psicología profunda, coaching existencial y arquetipos de energía. Tu salida es estrictamente JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Temperatura baja para consistencia en estructura JSON
        maxTokens: 2500,
      });
      content = response.content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error en LLM durante generación de análisis: ${msg}`);
      throw new BadRequestException('No se pudo analizar el cuestionario con IA.');
    }

    const parsed = this.parseAnalysis(content);
    if (!parsed) {
      throw new BadRequestException('El formato del reporte devuelto por el LLM no es válido.');
    }

    return parsed;
  }

  private buildAnalysisPrompt(answers: any[], astrologicalContext: any, previousReports: any[]): string {
    const formattedAnswers = answers
      .map((a) => {
        const dim = a.metadata && typeof a.metadata === 'object' ? a.metadata['dimension'] : 'desconocida';
        return `- Dimensión: ${dim}\n  Pregunta: ${a.question}\n  Respuesta: ${a.answer}`;
      })
      .join('\n\n');

    const formattedHistory = previousReports.length > 0
      ? previousReports
          .map((r, idx) => {
            return `Reporte ${idx + 1} (${r.createdAt.toISOString()}):
- Distribución: ${JSON.stringify(r.energyDistribution)}
- Análisis previo: ${r.analysis}
- Recomendaciones previas: ${r.recommendations}`;
          })
          .join('\n\n')
      : 'No hay reportes previos.';

    return `
Analizá las respuestas de un usuario al cuestionario de Balance Energético. Tu tarea es calcular las puntuaciones de energía del usuario en las 7 dimensiones y generar un reporte profundo, poético e integrado al estilo de "JarBees".

Las 7 dimensiones evaluadas y sus motores internos correspondientes son:
- expansión (corresponde a Chesed: crecimiento, nuevas ideas, generosidad, explorar, optimismo)
- disciplina (corresponde a Gevurah: orden, límites, decir que no, enfoque, estructura)
- armonía (corresponde a Tiferet: equilibrio emocional, paz, mediación, centramiento, relaciones)
- perseverancia (corresponde a Netzach: constancia, resistencia, terminar lo empezado, resiliencia)
- análisis (corresponde a Hod: estudio, lógica, comprensión profunda, estructuración mental)
- integración (corresponde a Yesod: asimilar aprendizajes, conectar teoría con práctica, coherencia interna)
- manifestación (corresponde a Malkhut: acción concreta, realización material, bajar ideas a la tierra)

Respuestas del cuestionario:
${formattedAnswers}

Contexto astrológico actual (transito de hoy):
${JSON.stringify(astrologicalContext || 'No disponible')}

Historial de balances anteriores (para comparar evolución y detectar patrones recurrentes):
${formattedHistory}

Instrucciones críticas:
1. Devolvé una distribución de energía del 1 al 10 para cada dimensión (valores numéricos enteros o decimales con un decimal, ej: 8.5).
2. Calculá un scoreGeneral (promedio de las 7 dimensiones) entre 1.0 y 10.0.
3. Escribí en español con el modismo argentino ("vos", "tenés", "hacés").
4. El tono debe ser poético, profundo y maduro.
5. NO uses palabras de la Kabbalah (como Chesed, Gevurah, Tiferet, etc.) en los textos visibles para el usuario. Deben quedar internos. Usá siempre los nombres traducidos (expansión, disciplina, armonía, perseverancia, análisis, integración, manifestación).
6. En la sección "astrologyConnection", relacioná de forma elegante el contexto astrológico (ej. fases de la luna, planetas en signos) con los resultados de las respuestas del usuario, mostrando cómo ambos sistemas se complementan o reflejan el mismo momento vital.
7. Evitá usar porcentajes en el texto. Hablá de tendencias, patrones y estados de flujo.

Devolvé la respuesta ÚNICAMENTE como un objeto JSON válido, sin bloques de código markdown (\`\`\`json) ni explicaciones previas/posteriores:
{
  "energyDistribution": {
    "expansion": 7.5,
    "disciplina": 6.0,
    "armonia": 5.0,
    "perseverancia": 8.0,
    "analisis": 4.5,
    "integracion": 7.0,
    "manifestacion": 5.5
  },
  "scoreGeneral": 6.2,
  "summary": "Resumen ejecutivo del balance actual del usuario en relación a su momento vital...",
  "analysisDetails": {
    "fortalezas": ["análisis", "integración"],
    "enCrecimiento": ["disciplina"],
    "necesitanAtencion": ["manifestación", "perseverancia"],
    "loQueObservo": "Aquí detallás una observación profunda y cercana sobre un patrón del usuario. Ej: 'Noté un patrón. Cuando aparece una idea nueva dedicás mucho tiempo a comprenderla, pero poco a transformarla en acciones concretas.'",
    "puntoCiego": "Identificación de su punto ciego conductual. Ej: 'Es posible que estés utilizando el análisis como sustituto de la acción.'",
    "fortalezaDetalle": "Detalle de su mayor fortaleza y cómo destaca. Ej: 'Tu capacidad para relacionar conceptos es muy superior al promedio de tus propias evaluaciones anteriores.'",
    "astrologyConnection": "Conexión poética y elegante de sincronías entre astrología y el cuestionario. Ej: 'El modelo astrológico sugiere una etapa favorable para revisar proyectos. Curiosamente, el cuestionario también muestra una necesidad de cerrar ciclos. Ambos modelos apuntan hacia la misma dirección.'"
  },
  "recommendations": {
    "accionFocalizada": "Recomendación de comportamiento para los próximos 15 días. Ej: 'Durante los próximos 15 días. No busques nuevos proyectos. Elegí uno. Terminá una pequeña parte.'",
    "preguntaReflexion": "Una pregunta abierta y movilizante. Ej: '¿Qué proyecto merece realmente convertirse en realidad durante las próximas semanas, aunque tengas que dejar otros en pausa?'",
    "semilla": "🌱 Semilla de los próximos 15 días: Una invitación reflexiva final. Ej: 'Elegí una sola acción que represente la manifestación de aquello que ya sabés. No busques más información. Construí.'"
  }
}
`;
  }

  private parseAnalysis(rawContent: string): AnalysisOutput | null {
    try {
      let clean = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
      const startIndex = clean.indexOf('{');
      const endIndex = clean.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1) {
        clean = clean.substring(startIndex, endIndex + 1);
      }

      const parsed = JSON.parse(clean);
      if (
        parsed.energyDistribution &&
        typeof parsed.scoreGeneral === 'number' &&
        parsed.summary &&
        parsed.analysisDetails &&
        parsed.recommendations
      ) {
        return parsed as AnalysisOutput;
      }
    } catch (err) {
      this.logger.warn(`Fallo al parsear JSON de análisis: ${err}`);
      this.logger.debug(`Contenido crudo: ${rawContent}`);
    }
    return null;
  }
}
