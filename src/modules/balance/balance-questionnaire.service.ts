import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ILLMProvider } from '../../jarvis/llm/llm-provider.interface';
import { OllamaProvider } from '../../jarvis/llm/ollama.provider';
import { OpenRouterProvider } from '../../jarvis/llm/openrouter.provider';
import { AstrologyTool } from '../../jarvis/tools/astrology/astrology-tool.service';

interface GeneratedQuestion {
  question: string;
  dimension: string;
}

@Injectable()
export class BalanceQuestionnaireService {
  private readonly logger = new Logger(BalanceQuestionnaireService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly astrologyTool: AstrologyTool,
    @Inject(OllamaProvider) private readonly ollamaProvider: ILLMProvider,
    @Inject(OpenRouterProvider) private readonly openRouterProvider: ILLMProvider,
  ) {}

  /**
   * Obtiene el proveedor de LLM disponible (OpenRouter si tiene API Key, sino Ollama)
   */
  private getLLMProvider(): ILLMProvider {
    if (process.env.OPENROUTER_API_KEY) {
      return this.openRouterProvider;
    }
    return this.ollamaProvider;
  }

  /**
   * Genera 22 preguntas dinámicas basadas en IA y las persiste en la sesión.
   * También calcula y guarda el contexto astrológico del momento.
   */
  async generateAndSetup(sessionId: number): Promise<any[]> {
    this.logger.log(`[balance-questionnaire] Iniciando generación de preguntas para sesión ${sessionId}`);

    // 1. Obtener preguntas de la última sesión completada para evitar duplicados
    const previousAnswers = await this.prisma.balanceAnswer.findMany({
      where: {
        session: {
          completedAt: { not: null },
        },
      },
      orderBy: {
        id: 'desc',
      },
      take: 40,
    });
    const previousQuestions = previousAnswers.map((a) => a.question);

    // 2. Generar preguntas usando el LLM
    const llm = this.getLLMProvider();
    const prompt = this.buildPrompt(previousQuestions);

    let content = '';
    try {
      const response = await llm.generate({
        messages: [
          {
            role: 'system',
            content: 'Sos un asistente experto en psicología transpersonal, coaching ontológico y dinámicas humanas. Devolvés únicamente JSON estructurado.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        maxTokens: 2000,
      });
      content = response.content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error llamando al LLM para generar cuestionario: ${msg}`);
      throw new BadRequestException('No se pudo generar el cuestionario con IA. Por favor, verificá que el LLM esté disponible.');
    }

    // 3. Parsear las preguntas generadas
    const questions = this.parseQuestions(content);
    if (questions.length === 0) {
      throw new BadRequestException('La IA no devolvió un formato de preguntas válido.');
    }

    // 4. Calcular el contexto astrológico actual
    const today = new Date();
    const skyData = this.astrologyTool.getTodaySkyData(today);
    const planetaryPositions = this.astrologyTool.getPlanetaryPositions(today);
    const astrologicalContext = {
      calculatedAt: today.toISOString(),
      skyData,
      planetaryPositions,
    };

    // 5. Guardar el contexto astrológico en la sesión
    await this.prisma.balanceSession.update({
      where: { id: sessionId },
      data: {
        astrologicalContext,
      },
    });

    // 6. Persistir las preguntas en la base de datos
    const answersData = questions.map((q) => ({
      sessionId,
      question: q.question,
      answer: '',
      metadata: { dimension: q.dimension },
    }));

    await this.prisma.balanceAnswer.createMany({
      data: answersData,
    });

    // 7. Retornar las preguntas creadas
    return this.prisma.balanceAnswer.findMany({
      where: { sessionId },
      select: {
        id: true,
        question: true,
      },
    });
  }

  /**
   * Construye el prompt para la IA
   */
  private buildPrompt(previousQuestions: string[]): string {
    const avoidSection = previousQuestions.length > 0
      ? `\nEVITÁ hacer preguntas iguales o muy similares a las siguientes que ya se hicieron en cuestionarios anteriores:\n${previousQuestions.map((q) => `- ${q}`).join('\n')}\n`
      : '';

    return `
Generá un cuestionario de exactamente 22 preguntas de situaciones cotidianas para evaluar cómo distribuye el usuario su energía actualmente.
El cuestionario debe medir de manera indirecta las siguientes 7 dimensiones (no menciones los nombres de las dimensiones en las preguntas):
1. expansión (búsqueda de nuevas ideas, proyectos, generosidad, explorar horizontes)
2. disciplina (límites, rutinas, orden, constancia, decir que no)
3. armonía (equilibrio emocional, relaciones sanas, mediación, centramiento)
4. perseverancia (resistencia ante dificultades, terminar lo empezado, paciencia)
5. análisis (comprensión profunda, lógica, relacionar conceptos, estudiar)
6. integración (conectar teoría con práctica, asimilación del aprendizaje, coherencia interna)
7. manifestación (acción concreta, materialización de proyectos, llevar las ideas a la realidad física)

Instrucciones críticas de estilo y contenido:
- Escribí las preguntas en español con el modismo argentino ("vos", por ejemplo: "solés", "hacés", "tenés", "sentís").
- No menciones las dimensiones explícitamente en el texto de las preguntas.
- Distribuí las preguntas de forma equitativa: cada una de las 7 dimensiones debe recibir exactamente 3 preguntas, excepto una dimensión elegida al azar que tendrá 4 preguntas, sumando un total exacto de 22 preguntas.
- La pregunta debe invitar a la reflexión personal o ser una situación donde el usuario elija cómo actúa usualmente.
- **EVITÁ LA REPETICIÓN ESTRUCTURAL**: No empieces todas las preguntas con la misma frase (como "¿Qué hacés si...", "Cómo reaccionás cuando..."). Variá el comienzo de las oraciones. Por ejemplo, alterná entre:
  - "Imaginate que estás..."
  - "Te ofrecen un..."
  - "¿Cómo solés manejar..."
  - "Cuando te enfrentás a..."
  - "Si tuvieras que elegir entre..."
  - "En tu día a día, ¿cuánto tiempo le dedicás a..."
- **VARIEDAD DE ESCENARIOS**: Usá situaciones muy variadas de la vida real. No hables solo de trabajo de oficina. Variá entre:
  - Manejo de tareas del hogar y espacio físico (orden del escritorio, limpieza, mudanzas).
  - Finanzas y proyectos (ahorrar, comprar algo importante, iniciar un hobbie).
  - Conversaciones difíciles y límites con amigos, pareja o familia.
  - Gestión de la energía física y descanso (despertarse cansado, hacer ejercicio, comer).
  - Aprendizaje y estudio (leer un libro difícil, tomar un curso, aplicar una teoría).
  - Proactividad vs. Reactividad (esperar indicaciones, tomar la iniciativa).
${avoidSection}

Devolvé la respuesta ÚNICAMENTE como un JSON array de objetos con el siguiente formato exacto, sin texto explicativo antes o después, sin bloques de código markdown (\`\`\`json):
[
  {
    "question": "¿Qué hacés cuando tenés que arrancar un proyecto que te entusiasma pero requiere muchas tareas aburridas?",
    "dimension": "perseverancia"
  },
  {
    "question": "Si alguien te pide un favor que te quita mucho tiempo de tus prioridades, ¿cómo reaccionás?",
    "dimension": "disciplina"
  }
]
`;
  }

  /**
   * Limpia y parsea la respuesta JSON de la IA de manera robusta
   */
  private parseQuestions(rawContent: string): GeneratedQuestion[] {
    try {
      // Remover bloques de código markdown si los hay
      let clean = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      // Buscar el inicio y fin del array JSON por si hay texto extra
      const startIndex = clean.indexOf('[');
      const endIndex = clean.lastIndexOf(']');
      if (startIndex !== -1 && endIndex !== -1) {
        clean = clean.substring(startIndex, endIndex + 1);
      }

      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          question: String(item.question || item.pregunta || '').trim(),
          dimension: String(item.dimension || '').toLowerCase().trim(),
        })).filter((q) => q.question.length > 0 && q.dimension.length > 0);
      }
    } catch (err) {
      this.logger.warn(`Fallo al parsear JSON de preguntas: ${err}`);
      this.logger.debug(`Contenido crudo: ${rawContent}`);
    }
    return [];
  }
}
