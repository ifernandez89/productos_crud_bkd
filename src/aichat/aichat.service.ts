import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { PreguntasRepository } from './repositories/preguntas.repository';
import { ProductsRepository } from '../products/repositories/products.repository';
import { OllamaModelService } from './models/ollamaModel';
import { AssistantToolsService } from './utils/assistant-tools.service';
import { spawn } from 'child_process';
import * as path from 'path';
import { existsSync } from 'fs';
import axios from 'axios';

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
  createdAt: Date;
}

@Injectable()
export class AichatService {
  private readonly logger = new Logger(AichatService.name);

  constructor(
    private readonly preguntasRepository: PreguntasRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly ollamaModel: OllamaModelService,
    private readonly assistantTools: AssistantToolsService,
  ) {}

  async promptAgente(texto: string): Promise<string> {
    const [products, preguntasRelevantes] = await Promise.all([
      this.productsRepository.findAll(),
      this.preguntasRepository.findRelevant(texto, 3),
    ]);

    const textoNorm = texto.toLowerCase();
    const esPreguntaProductos = /(producto|precio|stock|oferta|marca|comprar|recomendar|disponible|barato|caro|nuevo|descuento)/i.test(textoNorm);

    // Solo incluir productos si la pregunta es sobre productos
    const productosComoTexto = esPreguntaProductos
      ? products
          .slice(0, 15)
          .map(
            (p) =>
              `${p.name} (${p.marca}) $${p.price} stock:${p.stock}` +
              (p.isOnSale ? ' OFERTA' : '') +
              (p.isNew ? ' NUEVO' : '') +
              (p.isFeatured ? ' DEST' : ''),
          )
          .join('\n')
      : '';

    const historialTexto = preguntasRelevantes
      .map((p) => `Q: ${p.texto}\nA: ${p.respuesta.slice(0, 200)}`)
      .join('\n');

    const contextoProductos = productosComoTexto
      ? `\nProductos:\n${productosComoTexto}`
      : '';

    const contextoHistorial = historialTexto
      ? `\nHistorial relevante:\n${historialTexto}`
      : '';

    return `Eres un asistente de ventas. Responde en español, de forma concisa y directa.${contextoHistorial}${contextoProductos}\n\nPregunta: ${texto}`;
  }

  async preguntarOllamaOexternal(
    createAichatDto: CreateAichatDto,
  ): Promise<string> {
    const { pregunta: texto, agente } = createAichatDto;
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
          const textoParaIA = await this.promptAgente(texto);

          taskPromise = this.callExternalAI(textoParaIA);
        } else {
          this.logger.log('Ejecución modelo local con Ollama');
          const textoParaIA = await this.promptAgente(texto);
          taskPromise = this.callOllamaModel(textoParaIA);
        }
        respuesta = (await Promise.race([
          taskPromise,
          timeoutPromise,
        ])) as string;
        const finalAnswer = this.validateAnswerContent(respuesta, texto);
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

  private async callOllamaModel(prompt: string): Promise<string> {
    const aiMessageChunk = await this.ollamaModel.invoke(prompt);
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
    return this.preguntasRepository.findAll();
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
    await this.preguntasRepository.create({
      texto,
      respuesta,
      estado: 'success',
    });
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
}
