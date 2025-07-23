import { Injectable } from '@nestjs/common';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ModelService } from './models/ollamaModel';
import OpenAI from 'openai';

@Injectable()
export class AichatService {
  private readonly openaiClient = new OpenAI({
    apiKey: process.env.API_KEY || '', // Asegurate de tener esta variable cargada
    baseURL: 'https://openrouter.ai/api/v1',
  });

  constructor(
    private prisma: PrismaService,
    //private ollama: ModelService,
  ) {}

  async preguntarGet(texto: string, agente: boolean): Promise<string> {
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

  async connectionIA() {
    // Podrías usar esto para probar conectividad
    try {
      const response = await this.openaiClient.models.list();
      return response.data.map(model => model.id);
    } catch (err) {
      console.error('Error al conectar con OpenRouter:', err);
      return [];
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
