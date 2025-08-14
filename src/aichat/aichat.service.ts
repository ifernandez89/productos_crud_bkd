import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ModelService } from './models/ollamaModel';
import OpenAI from 'openai';
import { spawn } from 'child_process';
import * as path from 'path';
import { existsSync } from 'fs';

@Injectable()
export class AichatService {
  private readonly openaiClient = new OpenAI({
    apiKey: process.env.API_KEY || '', // Asegurate de tener esta variable cargada
    baseURL: 'https://openrouter.ai/api/v1',
  });

  constructor(
    private prisma: PrismaService,
    //private ollama: ModelService, para modelos locales
  ) { }

  async preguntarOllamaOexternal(texto: string, agente: boolean): Promise<string> {
    const maxAttempts = 6;
    const timeout = 240000; // 4 minutos
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Tiempo de espera de ${timeout}ms excedido`));
          }, timeout);
        });

        const taskPromise = (async () => {
          const response = await this.openaiClient.chat.completions.create({
            model: 'mistralai/mistral-7b-instruct:free',
            messages: [{ role: 'user', content: texto }],
            temperature: 0.7,
            max_tokens: 512,
          });

          const respuesta = response.choices[0]?.message?.content || 'Sin respuesta';
          //intenta ser un poco más conciso y fluido
          await this.prisma.pregunta.create({
            data: {
              texto,
              respuesta,
            },
          });

          return respuesta;
        })();

        const result = await Promise.race([taskPromise, timeoutPromise]) as string;
        return result;

      } catch (error) {
        console.error(`Intento ${attempts} fallido:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempts >= maxAttempts) {
          throw new Error(`Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError.message}`);
        }
      }
    }

    throw new Error(`Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError?.message}`);
  }

  async preguntarHRM(pregunta: string): Promise<any> {
    try {
      console.log('Pregunta recibida:', pregunta);
      // 1. Configuración de rutas
      const pythonExecutable = process.platform === 'win32'
        ? 'python'  // O usa 'C:\\Python311\\python.exe' si es necesario
        : 'python3';

      const scriptPath = path.join(
        process.cwd(),
        'src',
        'hrm',
        'hrm_runner.py'
      );
      console.log('Ruta del script:', scriptPath);
      // 2. Verificación de existencia
      if (!existsSync(scriptPath)) {
        throw new HttpException(`Script no encontrado en: ${scriptPath}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      console.log('Script encontrado, procediendo a ejecutar...');
      // 3. Ejecución con manejo de tiempo de espera
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30 segundos timeout

      const pythonProcess = spawn(pythonExecutable, [scriptPath, `"${pregunta.replace(/"/g, '\\"')}"`], {
        shell: true,
        signal: controller.signal,
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8'
        }
      });
      console.log('Proceso Python iniciado:', pythonProcess.pid);
      // 4. Manejo de streams
      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => output += data.toString());
      pythonProcess.stderr.on('data', (data) => errorOutput += data.toString());
      console.log('Capturando salida del proceso...');
      // 5. Esperar resultado con promesa
      const exitCode = await new Promise<number>((resolve, reject) => {
        pythonProcess.on('close', (code) => {
          clearTimeout(timeout);
          resolve(code || 0);
        });
        pythonProcess.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      console.log('Proceso Python finalizado con código:', exitCode);
      // 6. Validación de respuesta
      if (exitCode !== 0) {
        throw new HttpException(
          `Error en Python (${exitCode}): ${errorOutput || 'Sin detalles'}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      try {
        const result = JSON.parse(output);
        if (!result?.response) {
          throw new Error('Formato de respuesta inválido');
        }
        console.log('Respuesta del modelo:', result.response);
        // 7. Respuesta estructurada
        // Guardar en la base de datos
        const resp = result.response;
        await this.prisma.pregunta.create({
          data: {
            texto: pregunta,
            respuesta: resp,
          },
        });

        return resp;
      } catch (e) {
        console.error('Error al parsear la respuesta:', e);
        throw new HttpException(
          `Error parseando respuesta: ${e.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    } catch (error) {
      console.error('Error en preguntarHRM():', error);
      throw new HttpException(
        error.response || error.message || 'Error al procesar la solicitud',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async obtenerPreguntas(): Promise<any[]> {
    return this.prisma.pregunta.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  create(createAichatDto: CreateAichatDto) {
    return 'This action adds a new aichat';
  }

  findAll() {
    return 'This action returns all aichat';
  }

  findOne(id: number) {
    return `This action returns a #${id} aichat`;
  }

  update(id: number, updateAichatDto: UpdateAichatDto) {
    return `This action updates a #${id} aichat`;
  }

  remove(id: number) {
    return `This action removes a #${id} aichat`;
  }
}
