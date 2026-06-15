import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { PreguntasRepository } from './repositories/preguntas.repository';
import { ProductsRepository } from '../products/repositories/products.repository';
import { OllamaModelService } from './models/ollamaModel';
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
  createdAt: Date;
}

@Injectable()
export class AichatService {
  private readonly logger = new Logger(AichatService.name);

  constructor(
    private readonly preguntasRepository: PreguntasRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly ollamaModel: OllamaModelService,
  ) {}

  async promptAgente(texto: string): Promise<string> {
    const products = await this.productsRepository.findAll();
    const preguntasRelevantes = await this.preguntasRepository.findRelevant(
      texto,
      5,
    );

    const productosFormateados = products.map((product) => ({
      id: product.id,
      nombre: product.name,
      descripcion: product.description,
      precio: product.price,
      stock: product.stock,
      nuevo: product.isNew,
      descuento: product.isOnSale,
      destacado: product.isFeatured,
      marca: product.marca,
    }));

    const productosComoTexto = productosFormateados
      .map(
        (p) =>
          `ID: ${p.id}, Nombre: ${p.nombre}, Marca: ${p.marca}, ` +
          `Descripcion: ${p.descripcion} ` +
          `Stock: ${p.stock} ` +
          `Oferta: ${p.descuento} ` +
          `Destacado: ${p.destacado} ` +
          `Nuevo: ${p.nuevo} ` +
          `Precio: $${p.precio}`,
      )
      .join('\n');

    const preguntasComoTexto = preguntasRelevantes
      .map(
        (pregunta) =>
          `Pregunta: ${pregunta.texto}\nRespuesta: ${pregunta.respuesta}`,
      )
      .join('\n\n');

    return `
**Pregunta del cliente:** ${texto}

**Preguntas previas relevantes (recuperadas del historial):**
${preguntasComoTexto || 'No hay preguntas previas relevantes.'}

**Productos disponibles (para referencia y análisis):**
${productosComoTexto}

**Instrucciones para el modelo:**
1. Responde la pregunta del cliente de manera clara y precisa.
2. Si las preguntas previas aportan contexto útil, úsalas como referencia, pero no inventes datos que no estén respaldados por el historial.
3. Si la pregunta está relacionada con productos, usa la lista de productos disponible para:
   - Recomendar opciones basadas en sus necesidades (ej: en oferta, mejor marca, precio, etc.).
   - Comparar productos si es necesario.
   - Mencionar promociones o características destacadas.
4. Si no hay suficiente información en el historial o en la lista, indícalo y sugiere al cliente que consulte por más detalles.
5. Sé conciso y profesional.
`;
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
        await this.preguntasRepository.create(texto, respuesta);
        return respuesta;
      } catch (error) {
        this.logger.error(`Intento ${attempts} fallido: ${error.message}`);
        throw new HttpException(
          error.response || error.message || 'Error al procesar la solicitud',
          error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
    throw new Error(
      `Error al procesar la pregunta después de ${maxAttempts} intentos`,
    );
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
        const resp = result.response;
        await this.preguntasRepository.create(pregunta, resp);

        return resp;
      } catch (error) {
        this.logger.error(`Intento ${attempts} fallido: ${error.message}`);
        lastError = error;
      }
    }
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
}
