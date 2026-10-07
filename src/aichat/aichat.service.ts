import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { PreguntasRepository } from './repositories/preguntas.repository';
import { ProductsRepository } from '../products/repositories/products.repository';
import { OllamaModelService, StructuredPrompt } from './models/ollamaModel';
import { AssistantToolsService } from './utils/assistant-tools.service';
import { ModelRouterService } from './utils/model-router.service';
import { LLAMA_MODEL_TOKEN, QWEN_MODEL_TOKEN } from './aichat.tokens';
import { SafeExecService } from '../jarvis/security/safe-exec.service';
import * as path from 'path';
import { existsSync } from 'fs';
import axios from 'axios';
import { DateTime } from 'luxon';
import { resolveOllamaModelName } from '../shared/ollama-config';
import { normalizeDiscipline } from '../shared/disciplines';

// ── Caché simple de productos para evitar DB roundtrip en cada mensaje ──────────
interface ProductCache {
  data: Awaited<ReturnType<ProductsRepository['findAll']>>;
  expiresAt: number;
}
const PRODUCT_CACHE_TTL_MS = 30_000; // 30 segundos

interface AIContentPart {
  text?: string;
}

export interface PreguntaRecord {
  id: number;
  texto: string;
  respuesta: string;
  estado: string;
  errorMessage: string | null;
  errorStatus: number | null;
  createdAt: string;
}

@Injectable()
export class AichatService {
  private readonly logger = new Logger(AichatService.name);

  // ── Almacenamiento del último mensaje de IA ───────────────────────────────────
  private lastAssistantMessage: string | null = null;
  private readonly sessionContextStore = new Map<
    string,
    Array<{ role: 'user' | 'assistant'; content: string }>
  >();

  constructor(
    private readonly preguntasRepository: PreguntasRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly assistantTools: AssistantToolsService,
    private readonly modelRouter: ModelRouterService,
    @Inject(LLAMA_MODEL_TOKEN)
    private readonly ollamaModel: OllamaModelService,
    private readonly safeExecService: SafeExecService,
    @Optional()
    @Inject(QWEN_MODEL_TOKEN)
    private readonly qwenModel?: OllamaModelService,
  ) {}

  // ── Caché de productos ────────────────────────────────────────────────────────
  private productCache: ProductCache | null = null;

  private async getProducts() {
    const now = Date.now();
    if (this.productCache && now < this.productCache.expiresAt) {
      return this.productCache.data;
    }
    const data = await this.productsRepository.findAll();
    this.productCache = { data, expiresAt: now + PRODUCT_CACHE_TTL_MS };
    return data;
  }

  private getSessionContext(sessionId?: string, limit = 8) {
    if (!sessionId) return [];
    const turns = this.sessionContextStore.get(sessionId) ?? [];
    return turns.slice(-limit);
  }

  private rememberSessionTurn(
    sessionId: string | undefined,
    role: 'user' | 'assistant',
    content: string,
  ) {
    if (!sessionId) return;
    const turns = this.sessionContextStore.get(sessionId) ?? [];
    turns.push({ role, content });
    if (turns.length > 12) {
      turns.splice(0, turns.length - 12);
    }
    this.sessionContextStore.set(sessionId, turns);
  }

  private rememberSessionPair(
    sessionId: string | undefined,
    userText: string,
    assistantText: string,
  ) {
    this.rememberSessionTurn(sessionId, 'user', userText);
    this.rememberSessionTurn(sessionId, 'assistant', assistantText);
  }

  /**
   * Construye el prompt estructurado { system, user } para Ollama según la disciplina.
   */
  async promptAgente(
    texto: string,
    sessionId?: string,
    explicitMode?: string,
  ): Promise<StructuredPrompt> {
    const discipline = normalizeDiscipline(explicitMode);
    const textoNorm = texto.toLowerCase();
    const esPreguntaProductos =
      /(producto|precio|stock|oferta|marca|comprar|recomendar|disponible|barato|caro|nuevo|descuento)/i.test(
        textoNorm,
      );

    // ── Cargar productos solo si es relevante a productos ─────────────────────
    let catalogoTexto = '';
    if (esPreguntaProductos) {
      const products = await this.getProducts();
      const palabrasClave = textoNorm.split(/\s+/).filter((w) => w.length >= 4);

      let filtrados = products.filter((p) =>
        palabrasClave.some(
          (kw) =>
            p.name.toLowerCase().includes(kw) ||
            p.marca.toLowerCase().includes(kw),
        ),
      );

      if (filtrados.length === 0) {
        filtrados = products.filter((p) => p.stock > 0).slice(0, 15);
      }

      catalogoTexto = filtrados
        .slice(0, 15)
        .map(
          (p) =>
            `• ${p.name} | ${p.marca} | $${p.price} | stock:${p.stock}` +
            (p.isOnSale ? ' | OFERTA' : '') +
            (p.isNew ? ' | NUEVO' : '') +
            (p.isFeatured ? ' | DEST' : ''),
        )
        .join('\n');
    }

    const now = DateTime.now()
      .setZone('America/Argentina/Buenos_Aires')
      .setLocale('es');
    const sessionHistoryText = this.getSessionContext(sessionId, 6)
      .map(
        (turn) =>
          `${turn.role === 'user' ? 'Usuario' : 'Asistente'}: ${turn.content}`,
      )
      .join('\n');
    const fechaActual = now.toFormat('yyyy-MM-dd');
    const horaActual = now.toFormat('HH:mm');
    const metadata = JSON.stringify({
      fecha_actual: fechaActual,
      hora: horaActual,
    });
    const fechaTexto = now.toFormat("dd 'de' LLLL 'de' yyyy");

    // ── System prompt personalizado por disciplina ───────────────────────────
    let system = '';

    if (discipline === 'coder') {
      system = [
        metadata,
        'Eres un Desarrollador Senior y Arquitecto de Software Experto impulsado por Qwen2.5-Coder.',
        'Responde siempre con código limpio, bien tipado y explicaciones técnicas claras.',
        'Genera ejemplos prácticos y enfocados a producción en TypeScript, Python, SQL u otros lenguajes según se requiera.',
      ].join('\n');
    } else if (discipline === 'traductor') {
      system = [
        'Eres un Traductor Profesional Especializado.',
        'Traduce el contenido de manera precisa y fluida conservando el formato y la terminología.',
        'Devuelve únicamente la traducción limpia, sin preámbulos.',
      ].join('\n');
    } else if (discipline === 'reader') {
      system = [
        metadata,
        'Eres un Asistente de Lectura y Síntesis de Texto para TTS.',
        'Prepara el texto con buena cadencia, puntuación y claridad para ser narrado o leído en voz alta.',
      ].join('\n');
    } else if (discipline === 'ocr') {
      system = [
        'Eres un Especialista en Procesamiento de Documentos y OCR.',
        'Extrae y resume la información estructurada de documentos de manera concisa y exacta.',
      ].join('\n');
    } else {
      // Chatbot general / Auto
      system = [
        metadata,
        `Hoy es ${fechaTexto}.`,
        'Eres un asistente conversacional inteligente, empático y versátil impulsado por Qwen2.5.',
        'Respondés siempre en español de forma natural, clara y tan detallada como el usuario lo solicite.',
        'Directrices:',
        '1. Si te preguntan sobre productos, utilizá el catálogo provisto.',
        '2. Para consultas generales, razonamiento cotidiano o asistencia, brindá respuestas completas y fluidas sin limitaciones artificiales.',
        '3. Si no sabés algo, indicalo honestamente sin inventar datos.',
      ].join('\n');
    }

    // ── User prompt (contexto + pregunta) ────────────────────────────────────
    const contextBlocks: string[] = [];

    if (sessionHistoryText) {
      contextBlocks.push(`### HILO DE LA CONVERSACIÓN\n${sessionHistoryText}`);
    }
    if (catalogoTexto) {
      contextBlocks.push(`### CATÁLOGO DE PRODUCTOS\n${catalogoTexto}`);
    }

    const user = contextBlocks.length
      ? `${contextBlocks.join('\n\n')}\n\n### MENSAJE\n${texto}`
      : texto;

    return { system, user };
  }

  async preguntarOllamaOexternal(
    createAichatDto: CreateAichatDto,
  ): Promise<string> {
    const {
      pregunta: texto,
      agente,
      latitude,
      longitude,
      sessionId,
      mode,
      discipline,
      specialist,
    } = createAichatDto;

    const selectedMode = mode || discipline || specialist;

    // ── Detectar comandos especiales para repetir el último mensaje ─────────────
    if (this.isRepeatCommand(texto)) {
      if (!this.lastAssistantMessage) {
        throw new HttpException(
          'No hay un mensaje anterior para repetir',
          HttpStatus.BAD_REQUEST,
        );
      }
      return this.lastAssistantMessage;
    }

    const maxAttempts = 1;
    const timeout = 60000;
    let attempts = 0;
    let respuesta = '';

    while (attempts < maxAttempts) {
      attempts++;
      try {
        // Si no es un modo especializado que requiere LLM directo, revisar tools
        const normalized = normalizeDiscipline(selectedMode);
        if (normalized === 'auto' || normalized === 'tools' || normalized === 'chatbot') {
          const toolAnswer = await this.assistantTools.resolve(texto, {
            latitude,
            longitude,
          });
          if (toolAnswer) {
            const finalToolAnswer = this.validateAnswerContent(toolAnswer, texto);
            const activeModel = this.getActiveModelName();
            const finalAnswerWithNotice = this.formatAnswerWithModelNotice(
              finalToolAnswer,
              activeModel,
            );
            this.rememberSessionPair(
              sessionId,
              texto,
              finalAnswerWithNotice,
            );
            this.lastAssistantMessage = finalAnswerWithNotice;
            await this.persistSuccessfulQuestion(
              texto,
              finalAnswerWithNotice,
            );
            return finalAnswerWithNotice;
          }
        }

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Tiempo de espera de ${timeout}ms excedido`));
          }, timeout);
        });

        let taskPromise: Promise<string>;
        if (agente) {
          this.logger.log('Ejecución con agente externo');
          const prompt = await this.promptAgente(texto, sessionId, selectedMode);
          const textoParaIA = `${prompt.system}\n\n${prompt.user}`;
          taskPromise = this.callExternalAI(textoParaIA);
        } else {
          const prompt = await this.promptAgente(texto, sessionId, selectedMode);
          taskPromise = this.callOllamaModel(prompt, texto, selectedMode);
        }
        respuesta = (await Promise.race([
          taskPromise,
          timeoutPromise,
        ])) as string;
        const finalAnswer = this.validateAnswerContent(respuesta, texto);
        this.rememberSessionPair(sessionId, texto, finalAnswer);
        this.lastAssistantMessage = finalAnswer;
        await this.persistSuccessfulQuestion(texto, finalAnswer);
        return finalAnswer;
      } catch (error) {
        this.logger.error(
          `Intento ${attempts} fallido: ${this.getErrorMessage(error)}`,
        );
        await this.persistFailedQuestion(texto, error);
        throw new HttpException(
          this.getErrorMessage(error),
          this.getErrorStatus(error),
        );
      }
    }
    throw new Error(
      `Error al procesar la pregunta después de ${maxAttempts} intentos`,
    );
  }

  private async persistFailedQuestion(
    texto: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.preguntasRepository.create({
        texto,
        respuesta: '',
        estado: 'error',
        errorMessage: this.getErrorMessage(error),
        errorStatus: this.getErrorStatus(error),
      });
    } catch (persistError) {
      this.logger.error(
        `No se pudo guardar el error de la pregunta: ${this.getErrorMessage(persistError)}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (response && typeof response === 'object') {
        const responseObject = response as Record<string, unknown>;
        const message = responseObject.message;
        if (typeof message === 'string') {
          return message;
        }
        if (Array.isArray(message)) {
          return message.join(', ');
        }
      }
      return error.message;
    }

    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      if (typeof responseData === 'string') {
        return responseData;
      }
      if (responseData && typeof responseData === 'object') {
        const responseObject = responseData as Record<string, unknown>;
        const message = responseObject.message;
        if (typeof message === 'string') {
          return message;
        }
        if (Array.isArray(message)) {
          return message.join(', ');
        }
      }
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Error desconocido al procesar la pregunta';
  }

  private getErrorStatus(error: unknown): number {
    if (error instanceof HttpException) {
      return error.getStatus();
    }

    if (axios.isAxiosError(error)) {
      return error.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    }

    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status?: unknown }).status;
      if (typeof status === 'number') {
        return status;
      }
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private async callExternalAI(prompt: string): Promise<string> {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 512,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'productos-crud-bkd',
          'Content-Type': 'application/json',
        },
      },
    );
    return response.data.choices[0]?.message?.content || 'Sin respuesta';
  }

  private async callOllamaModel(
    prompt: StructuredPrompt,
    preguntaOriginal: string,
    explicitMode?: string,
  ): Promise<string> {
    // 🔀 Specialist Router: elige modelo según el selector explícito o el contenido
    const routing = this.modelRouter.routeToModel(preguntaOriginal, explicitMode);
    this.modelRouter.logRouting(routing, preguntaOriginal);

    let model: OllamaModelService;
    if (routing.discipline === 'coder' && this.qwenModel) {
      this.logger.log(`💻 Invocando Coder (${routing.model})`);
      model = this.qwenModel;
    } else {
      this.logger.log(`💬 Invocando Chatbot (${routing.model})`);
      model = this.ollamaModel;
    }

    const aiMessageChunk = await model.invokeWithMessages(prompt);
    const content =
      typeof aiMessageChunk.content === 'string'
        ? aiMessageChunk.content
        : Array.isArray(aiMessageChunk.content)
          ? aiMessageChunk.content
              .map((part: AIContentPart) => part.text || '')
              .join(' ')
          : 'Sin respuesta';

    return this.formatAnswerWithModelNotice(content, routing.model);
  }

  private getActiveModelName(): string {
    return resolveOllamaModelName('qwen2.5:7b');
  }

  private formatAnswerWithModelNotice(
    answer: string,
    modelName: string,
  ): string {
    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      return normalizedAnswer;
    }

    return `${modelName} \n\n${normalizedAnswer}`;
  }

  async preguntarHRM(pregunta: string): Promise<string> {
    const maxAttempts = 6;
    let attempts = 0;
    let lastError: Error | null = null;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        this.logger.log('Hierarchical Reasoning Model');
        this.logger.log(`Pregunta recibida: ${pregunta}`);
        const scriptPath = path.join(
          process.cwd(),
          'src',
          'hrm',
          'hrm_runner.py',
        );
        this.logger.log(`Ruta del script: ${scriptPath}`);
        if (!existsSync(scriptPath)) {
          throw new HttpException(
            `Script no encontrado en: ${scriptPath}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        this.logger.log('Script encontrado, procediendo a ejecutar...');
        const { stdout, stderr, code } =
          await this.safeExecService.runPythonScript(
            scriptPath,
            [pregunta],
            30000,
          );
        this.logger.log(`Proceso Python finalizado con código: ${code}`);
        if (code !== 0) {
          throw new HttpException(
            `Error en Python (${code}): ${stderr || 'Sin detalles'}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        const result = JSON.parse(stdout);
        if (!result?.response) {
          throw new Error('Formato de respuesta inválido');
        }
        this.logger.log(`Respuesta del modelo: ${result.response}`);
        const resp = this.validateAnswerContent(result.response, pregunta);
        this.lastAssistantMessage = resp;
        await this.persistSuccessfulQuestion(pregunta, resp);

        return resp;
      } catch (error) {
        this.logger.error(`Intento ${attempts} fallido: ${error.message}`);
        lastError = error;
      }
    }
    await this.persistFailedQuestion(pregunta, lastError);
    throw new Error(
      `Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError?.message}`,
    );
  }

  async obtenerPreguntas(): Promise<PreguntaRecord[]> {
    const rows = await this.preguntasRepository.findAll();
    return rows.map((r) => ({
      id: r.id,
      texto: r.texto,
      respuesta: r.respuesta,
      estado: r.estado,
      errorMessage: r.errorMessage ?? null,
      errorStatus: r.errorStatus ?? null,
      createdAt: DateTime.fromJSDate(r.createdAt)
        .setZone('America/Argentina/Buenos_Aires')
        .toISO(),
    }));
  }

  create(): string {
    return 'This action adds a new aichat';
  }

  findAll(): string {
    return 'This action returns all aichat';
  }

  findOne(id: number): string {
    return `This action returns a #${id} aichat`;
  }

  update(id: number, _updateAichatDto: UpdateAichatDto): string {
    return `This action updates a #${id} aichat`;
  }

  remove(id: number): string {
    return `This action removes a #${id} aichat`;
  }

  private async persistSuccessfulQuestion(
    texto: string,
    respuesta: string,
  ): Promise<void> {
    try {
      const payload = {
        texto,
        respuesta,
        estado: 'success',
      };
      this.logger.log(`Persistiendo pregunta exitosa: ${texto.slice(0, 120)}`);
      this.logger.debug(`DATABASE_URL set: ${!!process.env.DATABASE_URL}`);
      const rec = await this.preguntasRepository.create(payload);
      this.logger.log(`Pregunta persistida id=${rec.id}`);
    } catch (err) {
      this.logger.error(
        `Error al persistir pregunta exitosa: ${this.getErrorMessage(err)}`,
      );
      // No propagar el error para no bloquear la respuesta al usuario
    }
  }

  private validateAnswerContent(answer: string, question: string): string {
    const normalizedAnswer = answer.trim();

    if (!normalizedAnswer) {
      throw new Error('La IA devolvió una respuesta vacía');
    }

    if (
      this.isPlaceholderAnswer(normalizedAnswer) &&
      !this.isGreetingQuestion(question)
    ) {
      throw new Error('La IA devolvió una respuesta placeholder no válida');
    }

    return normalizedAnswer;
  }

  private isPlaceholderAnswer(answer: string): boolean {
    const normalized = answer.toLowerCase();
    return (
      /^hola[!\s.]*$/.test(normalized) ||
      /^sin respuesta[!\s.]*$/.test(normalized) ||
      /^no response[!\s.]*$/.test(normalized) ||
      /^hello[!\s.]*$/.test(normalized)
    );
  }

  private isGreetingQuestion(question: string): boolean {
    const normalized = question
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return /(\bhola\b|\bbuenas\b|\bbuen dia\b|\bbuenos dias\b|\bbuenas tardes\b|\bbuenas noches\b)/i.test(
      normalized,
    );
  }

  /**
   * Detecta si el texto es un comando para repetir el último mensaje.
   * Soporta variaciones como: "repíteme eso", "léelo en voz alta", "repite", etc.
   */
  private isRepeatCommand(texto: string): boolean {
    const normalized = texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const repeatPatterns = [
      /^repite(me)?\s*(eso)?\s*[.!?]*$/,
      /^repiteme\s*(eso)?\s*[.!?]*$/,
      /^vuelve\s*a\s*repetir[.!?]*$/,
      /^lee(lo)?\s*(en\s+)?voz\s+alta[.!?]*$/,
      /^leelo\s*en\s*voz\s*alta[.!?]*$/,
      /^read\s*(it)?\s*again[.!?]*$/,
      /^say\s*that\s*again[.!?]*$/,
      /^repet(ir)?\s*(eso|lo)?[.!?]*$/,
      /^que\s*(lo\s+)?repita[.!?]*$/,
      /^lo\s+mismo[.!?]*$/,
    ];

    return repeatPatterns.some((pattern) => pattern.test(normalized));
  }

  /**
   * Obtiene el último mensaje de la IA.
   */
  getLastAssistantMessage(): string | null {
    return this.lastAssistantMessage;
  }
}
