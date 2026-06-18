import { HttpException, HttpStatus, Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { PreguntasRepository } from './repositories/preguntas.repository';
import { ProductsRepository } from '../products/repositories/products.repository';
import { OllamaModelService, StructuredPrompt } from './models/ollamaModel';
import { AssistantToolsService } from './utils/assistant-tools.service';
import { ModelRouterService } from './utils/model-router.service';
import { LLAMA_MODEL_TOKEN, QWEN_MODEL_TOKEN } from './aichat.tokens';
import { spawn } from 'child_process';
import * as path from 'path';
import { existsSync } from 'fs';
import axios from 'axios';
import { DateTime } from 'luxon';

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

  constructor(
    private readonly preguntasRepository: PreguntasRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly assistantTools: AssistantToolsService,
    private readonly modelRouter: ModelRouterService,
    @Inject(LLAMA_MODEL_TOKEN)
    private readonly ollamaModel: OllamaModelService,
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

  /**
   * Construye el prompt estructurado { system, user } para Ollama.
   * - system: rol + reglas estrictas (no cambia por pregunta → token cacheado)
   * - user:   contexto RAG + pregunta del usuario
   */
  async promptAgente(texto: string): Promise<StructuredPrompt> {
    const [products, preguntasRelevantes] = await Promise.all([
      this.getProducts(),
      this.preguntasRepository.findRelevant(texto, 3),
    ]);

    const textoNorm = texto.toLowerCase();
    const esPreguntaProductos =
      /(producto|precio|stock|oferta|marca|comprar|recomendar|disponible|barato|caro|nuevo|descuento)/i.test(
        textoNorm,
      );

    // ── Catálogo filtrado ─────────────────────────────────────────────────────
    let catalogoTexto = '';
    if (esPreguntaProductos) {
      // Intentar filtrar por marca o término mencionado en la pregunta
      const palabrasClave = textoNorm
        .split(/\s+/)
        .filter((w) => w.length >= 4);

      let filtrados = products.filter((p) =>
        palabrasClave.some(
          (kw) =>
            p.name.toLowerCase().includes(kw) ||
            p.marca.toLowerCase().includes(kw),
        ),
      );

      // Si no hay coincidencias específicas, usar los primeros 15 con stock
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

    // ── Historial relevante ───────────────────────────────────────────────────
    const historialTexto = preguntasRelevantes
      .map((p) => {
        // Truncar en el último espacio antes de los 250 chars (no cortar palabras)
        const resp =
          p.respuesta.length > 250
            ? p.respuesta.slice(0, 250).replace(/\s\S+$/, '') + '…'
            : p.respuesta;
        return `Q: ${p.texto}\nA: ${resp}`;
      })
      .join('\n---\n');

    // ── System prompt (rol + reglas) ──────────────────────────────────────────
    const system = [
      'Eres un asistente conversacional general, basado en el modelo Ollama. Respondés siempre en español, de forma clara y directa.',
      'Reglas:',
      '1. Si la pregunta es sobre productos, usá solo el catálogo provisto. Para otras preguntas, contestá con la información general que tengas disponible.',
      '2. Si el historial tiene una respuesta relevante, tomala como referencia.',
      '3. No inventes datos. Si no tenés la información, decilo claramente.',
      '4. Nunca incluyas en tu respuesta frases como "Según el contexto" o "De acuerdo al historial".',
      '5. Respondé en máximo 3 oraciones a menos que se pidan detalles.',
      '6. Si el usuario pregunta por tu identidad, decí que sos un asistente de chat inteligente impulsado por el modelo Ollama, orientado a brindar información y ayuda general.',
    ].join('\n');

    // ── User prompt (contexto + pregunta) ────────────────────────────────────
    const contextBlocks: string[] = [];

    if (historialTexto) {
      contextBlocks.push(`### HISTORIAL RELEVANTE\n${historialTexto}`);
    }
    if (catalogoTexto) {
      contextBlocks.push(`### CATÁLOGO DE PRODUCTOS\n${catalogoTexto}`);
    }

    const user = contextBlocks.length
      ? `${contextBlocks.join('\n\n')}\n\n### PREGUNTA\n${texto}`
      : texto;

    return { system, user };
  }

  async preguntarOllamaOexternal(
    createAichatDto: CreateAichatDto,
  ): Promise<string> {
    const { pregunta: texto, agente } = createAichatDto;
    
    // ── Detectar comandos especiales para repetir el último mensaje ─────────────
    if (this.isRepeatCommand(texto)) {
      if (!this.lastAssistantMessage) {
        throw new HttpException(
          'No hay un mensaje anterior para repetir',
          HttpStatus.BAD_REQUEST,
        );
      }
      this.logger.log(`Comando de repetición detectado. Devolviendo: ${this.lastAssistantMessage.slice(0, 50)}...`);
      return this.lastAssistantMessage;
    }

    const maxAttempts = 1;
    const timeout = 60000;
    let attempts = 0;
    let respuesta = '';

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const toolAnswer = await this.assistantTools.resolve(texto);
        if (toolAnswer) {
          const finalToolAnswer = this.validateAnswerContent(toolAnswer, texto);
          this.lastAssistantMessage = finalToolAnswer;
          await this.persistSuccessfulQuestion(texto, finalToolAnswer);
          return finalToolAnswer;
        }

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Tiempo de espera de ${timeout}ms excedido`));
          }, timeout);
        });

        let taskPromise: Promise<string>;
        if (agente) {
          this.logger.log('Ejecución con agente');
          const prompt = await this.promptAgente(texto);
          // External AI recibe el prompt como string plano concatenado
          const textoParaIA = `${prompt.system}\n\n${prompt.user}`;
          taskPromise = this.callExternalAI(textoParaIA);
        } else {
          this.logger.log('Ejecución modelo local con Ollama');
          const prompt = await this.promptAgente(texto);
          taskPromise = this.callOllamaModel(prompt, texto);
        }
        respuesta = (await Promise.race([
          taskPromise,
          timeoutPromise,
        ])) as string;
        const finalAnswer = this.validateAnswerContent(respuesta, texto);
        this.lastAssistantMessage = finalAnswer;
        await this.persistSuccessfulQuestion(texto, finalAnswer);
        return finalAnswer;
      } catch (error) {
        this.logger.error(`Intento ${attempts} fallido: ${this.getErrorMessage(error)}`);
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

  private async callOllamaModel(prompt: StructuredPrompt, preguntaOriginal: string): Promise<string> {
    // 🔀 Router inteligente: elige modelo según el contenido
    const routing = this.modelRouter.routeToModel(preguntaOriginal);
    const modelToUse = routing.model;

    this.modelRouter.logRouting(routing, preguntaOriginal);

    // Seleccionar el modelo correcto
    let model: OllamaModelService;
    if (modelToUse === 'qwen3:4b' && this.qwenModel) {
      this.logger.log('🧠 Usando Qwen3:4b (Experto Técnico)');
      model = this.qwenModel;
    } else {
      if (modelToUse === 'qwen3:4b' && !this.qwenModel) {
        this.logger.warn('⚠️ Qwen3:4b no disponible, usando fallback llama3.2:3b');
      }
      this.logger.log('🧠 Usando Llama3.2:3b (General)');
      model = this.ollamaModel;
    }

    // Invocar el modelo seleccionado
    const aiMessageChunk = await model.invokeWithMessages(prompt);
    if (typeof aiMessageChunk.content === 'string') {
      return aiMessageChunk.content;
    } else if (Array.isArray(aiMessageChunk.content)) {
      return aiMessageChunk.content
        .map((part: AIContentPart) => part.text || '')
        .join(' ');
    }
    return 'Sin respuesta';
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
        const pythonExecutable =
          process.platform === 'win32' ? 'python' : 'python3';

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
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), 30000);

        const pythonProcess = spawn(
          pythonExecutable,
          [scriptPath, `"${pregunta.replace(/"/g, '\\"')}"`],
          {
            shell: true,
            signal: controller.signal,
            env: {
              ...process.env,
              PYTHONUTF8: '1',
              PYTHONIOENCODING: 'utf-8',
            },
          },
        );
        this.logger.log(`Proceso Python iniciado: ${pythonProcess.pid}`);
        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => (output += data.toString()));
        pythonProcess.stderr.on(
          'data',
          (data) => (errorOutput += data.toString()),
        );
        this.logger.log('Capturando salida del proceso...');
        const exitCode = await new Promise<number>((resolve, reject) => {
          pythonProcess.on('close', (code) => {
            clearTimeout(timeoutHandle);
            resolve(code || 0);
          });
          pythonProcess.on('error', (err) => {
            clearTimeout(timeoutHandle);
            reject(err);
          });
        });
        this.logger.log(`Proceso Python finalizado con código: ${exitCode}`);
        if (exitCode !== 0) {
          throw new HttpException(
            `Error en Python (${exitCode}): ${errorOutput || 'Sin detalles'}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        const result = JSON.parse(output);
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
      createdAt: DateTime.fromJSDate(r.createdAt).setZone('America/Argentina/Buenos_Aires').toISO(),
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
      this.logger.error(`Error al persistir pregunta exitosa: ${this.getErrorMessage(err)}`);
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
