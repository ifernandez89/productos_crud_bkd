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
   * Determina el ciclo actual basado en la cantidad de sesiones de balance ya completadas
   * por el usuario, y configura la primera pregunta de la entrevista adaptativa.
   * También calcula y guarda el contexto astrológico del momento.
   */
  async generateAndSetup(sessionId: number): Promise<any[]> {
    this.logger.log(`[balance-questionnaire] Iniciando entrevista adaptativa para sesión ${sessionId}`);

    // 1. Obtener la cantidad de sesiones de balance ya completadas
    const completedCount = await this.prisma.balanceSession.count({
      where: {
        completedAt: { not: null },
      },
    });

    // Determinar el ciclo (1 a 4)
    const cycle = (completedCount % 4) + 1;
    const cycleThemes = {
      1: { theme: 'mapa_general', name: '¿Dónde está yendo tu energía?' },
      2: { theme: 'bloqueos', name: '¿Qué está bloqueando tu energía?' },
      3: { theme: 'crecimiento', name: '¿Qué merece crecer?' },
      4: { theme: 'cierre', name: '¿Qué necesita cerrarse?' },
    };
    const currentCycle = cycleThemes[cycle] || cycleThemes[1];

    // 2. Calcular el contexto astrológico actual
    const today = new Date();
    const skyData = this.astrologyTool.getTodaySkyData(today);
    const planetaryPositions = this.astrologyTool.getPlanetaryPositions(today);
    const astrologicalContext = {
      calculatedAt: today.toISOString(),
      skyData,
      planetaryPositions,
      cycle,
      cycleTheme: currentCycle.theme,
      cycleName: currentCycle.name,
    };

    // 3. Guardar el contexto astrológico y de ciclo en la sesión
    await this.prisma.balanceSession.update({
      where: { id: sessionId },
      data: {
        astrologicalContext,
      },
    });

    // 4. Crear la primera pregunta (Capa 1: Estado General)
    const firstQuestionText = 'Si tuvieras que describir estas últimas dos semanas con una sola palabra, ¿cuál sería? ¿Por qué?';
    const firstAnswer = await this.prisma.balanceAnswer.create({
      data: {
        sessionId,
        question: firstQuestionText,
        answer: '',
        metadata: {
          layer: 1,
          step: 1,
          dimension: 'general',
        },
      },
    });

    // 5. Retornar las preguntas creadas (que en este caso es solo la primera)
    return [
      {
        id: firstAnswer.id,
        question: firstAnswer.question,
      },
    ];
  }

  /**
   * Genera la siguiente pregunta (adaptativa) basada en el historial de la conversación y el ciclo actual.
   */
  async generateNextQuestion(sessionId: number, allAnswers: any[]): Promise<any> {
    const session = await this.prisma.balanceSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new BadRequestException(`No se encontró la sesión de balance con ID ${sessionId}`);
    }

    const astrologicalContext = (session.astrologicalContext as any) || {};
    const cycle = astrologicalContext.cycle || 1;
    const cycleName = astrologicalContext.cycleName || '¿Dónde está yendo tu energía?';

    const formattedHistory = allAnswers
      .map((a, index) => {
        const dim = a.metadata && typeof a.metadata === 'object' ? (a.metadata as any).dimension : 'desconocida';
        return `Pregunta ${index + 1} (Dimensión: ${dim}): ${a.question}\nRespuesta ${index + 1}: ${a.answer || '(Sin respuesta)'}`;
      })
      .join('\n\n');

    const llm = this.getLLMProvider();
    const prompt = `
Vos sos un mentor empático, un terapeuta transpersonal y coach ontológico especializado en la integración de la psicología profunda, arquetipos de energía y el Árbol de la Vida.
Estás llevando a cabo una **entrevista adaptativa** para descubrir cómo el usuario distribuye su energía psíquica durante las últimas semanas.

CRÍTICO: No menciones nunca conceptos de la Kabbalah (como Sefirot, Chesed, Gevurah, Tiferet, etc.) ni tampoco los nombres de las 7 dimensiones internas dentro de la pregunta. Todo esto debe ser interno para vos.

El ciclo actual de esta entrevista es:
Ciclo ${cycle}: "${cycleName}"

Las 7 dimensiones internas que evaluamos a lo largo del tiempo son:
1. expansión (corresponde a Chesed: crecimiento, nuevas ideas, generosidad, explorar, optimismo)
2. disciplina (corresponde a Gevurah: orden, límites, decir que no, enfoque, estructura)
3. armonía (corresponde a Tiferet: equilibrio emocional, paz, mediación, centramiento, relaciones)
4. perseverancia (corresponde a Netzach: constancia, resistencia, terminar lo empezado, resiliencia)
5. análisis (corresponde a Hod: estudio, lógica, comprensión profunda, estructuración mental)
6. integración (corresponde a Yesod: asimilar aprendizajes, conectar teoría con práctica, coherencia interna)
7. manifestación (corresponde a Malkhut: acción concreta, realización material, bajar ideas a la tierra)

Aquí está la conversación que tuviste con el usuario hasta el momento:
${formattedHistory}

Tu objetivo es decidir y formular la SIGUIENTE pregunta (Pregunta número ${allAnswers.length + 1}).

Pautas para formular la pregunta:
1. **Enfoque Adaptativo**:
   - Analizá la última respuesta del usuario. Si detectás contradicciones, incoherencias o algo profundo e inesperado, **profundizá en eso** en lugar de cambiar abruptamente de tema. Por ejemplo, si el usuario expresa conflicto o evasión en un área, formula una pregunta directa y compasiva para explorar ese punto (ej: "¿Qué estabas evitando construir mientras investigabas?" o "¿Qué era más incómodo: terminarlo o aceptar que todavía podía mejorar?").
   - Si no hay contradicciones obvias, seleccioná una de las 7 dimensiones que todavía no haya sido explorada a fondo en las preguntas previas y formula una pregunta al respecto.
2. **Ángulo del Ciclo**:
   - Asegurate de que la pregunta esté alineada con el ciclo actual:
     - Ciclo 1 (¿Dónde está yendo tu energía?): Foco en la distribución actual y hacia dónde fluye de manera natural.
     - Ciclo 2 (¿Qué está bloqueando tu energía?): Foco en resistencias, miedos, límites y lo que frena al usuario.
     - Ciclo 3 (¿Qué merece crecer?): Foco en el potencial de expansión, sueños, áreas que se quieren desarrollar.
     - Ciclo 4 (¿Qué necesita cerrarse?): Foco en la finalización, la manifestación concreta y el desapego/cierre.
3. **Estilo**:
   - Formulá la pregunta en español, usando el modismo argentino ("vos", "solés", "hacés", "tenés", "sentís").
   - Que sea situacional, abierta y profunda. Evitá preguntas binarias (de sí/no).
   - Indagá tanto en emociones como en acciones. Preguntá por la atención (¿en qué pensás en momentos cotidianos?) y por fugas/ganancias de energía.
   - Variá los escenarios (no hables solo de trabajo: incluí descanso, relaciones, tareas cotidianas, etc.).
4. **Sin Duplicaciones ni Repeticiones**:
   - Analizá detenidamente las preguntas previas en el historial. Está terminantemente prohibido formular preguntas que repitan la misma idea, temática, palabras clave o el mismo enfoque de indagación que ya se haya presentado. Cada pregunta debe explorar una faceta nueva, complementaria o profundizar genuinamente en un punto nuevo de valor.

Devolvé la respuesta ÚNICAMENTE como un objeto JSON con el siguiente formato exacto, sin bloques de código markdown (\`\`\`json) ni texto explicativo antes o después:
{
  "question": "Escribí acá la siguiente pregunta profunda y adaptativa",
  "dimension": "especificá qué dimensión evalúa principalmente (expansion, disciplina, armonia, perseverancia, analisis, integracion, manifestacion, o general)",
  "reasoning": "Breve explicación técnica de por qué elegiste esta pregunta"
}
`;

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
        maxTokens: 1000,
      });

      const parsed = this.parseNextQuestion(response.content);
      if (!parsed || !parsed.question) {
        throw new Error('Formato de pregunta generado inválido.');
      }
      return parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error generando pregunta adaptativa: ${msg}`);
      // Fallback si falla el LLM: seleccionar una dimensión al azar
      const dimensions = ['expansion', 'disciplina', 'armonia', 'perseverancia', 'analisis', 'integracion', 'manifestacion'];
      const randomDim = dimensions[Math.floor(Math.random() * dimensions.length)];
      return {
        question: '¿Cómo sentís tu nivel de energía hoy y qué creés que podrías hacer para equilibrarlo?',
        dimension: randomDim,
        reasoning: 'Fallback debido a error en la llamada al LLM',
      };
    }
  }

  /**
   * Limpia y parsea la respuesta JSON de la IA de manera robusta
   */
  private parseNextQuestion(rawContent: string): any {
    try {
      let clean = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
      const startIndex = clean.indexOf('{');
      const endIndex = clean.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1) {
        clean = clean.substring(startIndex, endIndex + 1);
      }
      return JSON.parse(clean);
    } catch (err) {
      this.logger.warn(`Fallo al parsear JSON de pregunta adaptativa: ${err}`);
      return null;
    }
  }
}

