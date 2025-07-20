import { Injectable } from '@nestjs/common';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import axios from "axios";
import { ModelService } from './models/ollamaModel';

@Injectable()
export class AichatService {
  constructor(private prisma: PrismaService, private ollama: ModelService) { }

  async preguntarGet(texto: string, agente: boolean): Promise<string> {
    const maxAttempts = 6;
    let attempts = 0;
    let lastError: Error | null = null;
    const timeout = 240000; // 4 minutos en milisegundos

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Tiempo de espera de ${timeout}ms excedido`));
          }, timeout);
        });
        const taskPromise = (async () => {
          const model = this.ollama.getModel();
/*           const modelName = `Modelo de lenguaje (LLM): ${await (await model).model}`;
          // Recuperar HISTORIAL últimas 5 o 10 interacciones por ejemplo
          const historial = await this.prisma.pregunta.findMany({
            where: { texto: { contains: 'producto' } },
            orderBy: { createdAt: 'desc' },
            take: 5,
          });
          // Convertir historial a mensajes estilo Chat
          const chatHistoryMessages = historial.map((item) => ([
            { role: "user", content: item.texto },
            { role: "assistant", content: JSON.parse(item.respuesta) },
          ])).flat();
          //const responseClima = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=-31.7311&longitude=-60.5238&current_weather=true&temperature_unit=celsius`);
          //const clima = responseClima.data; 
          const timestamp = new Date().toLocaleString();
          console.log('🧠 Nombre del Modelo:', modelName);
          console.log('🕒 Hora del sistema:', timestamp);
          //console.log('Clima: ', clima);
          const contenido = `${texto} Contexto local: ${timestamp} Nombre del Modelo: ${modelName}`;
          //if (!agente) {
          const res = await (await model).invoke([
            //...chatHistoryMessages,
            { role: "user", content: contenido }
          ]); */
          const res = await (await model).invoke(texto);
          // Guardar pregunta y respuesta en la BD
          await this.prisma.pregunta.create({
            data: {
              texto,
              respuesta: JSON.stringify(res.content),
            },
          });
          return JSON.stringify(res.content);
        })();
        // Usar Promise.race para aplicar el tiempo de espera
        const result = await Promise.race([taskPromise, timeoutPromise]) as string;
        return result;
      } catch (error) {
        console.error(`Intento ${attempts} fallido:`, error instanceof Error ? error.message : error);
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempts >= maxAttempts) {
          throw new Error(`Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError.message}`);
        }
      }
    }

    throw new Error(`Error al procesar la pregunta después de ${maxAttempts} intentos: ${lastError?.message}`);
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
    return 'This action returns a #${ id } aichat';
  }

  update(id: number, updateAichatDto: UpdateAichatDto) {
    return 'This action updates a #${ id } aichat';
  }

  remove(id: number) {
    return 'This action removes a #${ id } aichat';
  }
}
