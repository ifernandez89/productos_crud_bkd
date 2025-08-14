import { Controller, Get, Post, Body, Patch, Param, Delete, HttpException, HttpStatus, Query } from '@nestjs/common';
import { AichatService } from './aichat.service';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { ChatOllama } from '@langchain/ollama';
import { runIA } from './agents/executor';
import { ModelService } from '../aichat/models/ollamaModel'
import { ApiQuery } from '@nestjs/swagger';
import { ConverterService } from './utils/converter.service';
import { spawn } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import { existsSync } from 'fs';

@Controller('aichat')
export class AichatController {
  private model: ChatOllama;

  constructor(private readonly aichatService: AichatService, private readonly converter: ConverterService) {
    /*     this.model = new ChatOllama({
          model: "gemma3:1b",//gemma:2b //phi //gemma3:1b
          temperature: 0.3,   // creatividad balanceada para naturalidad sin divagar
          topP: 0.9,         // limita un poco la aleatoriedad para coherencia
          topK: 20,           // suficiente para diversidad pero sin dispersarse
          numPredict: 512,    // para respuestas medianas a largas
          repeatPenalty: 1.1, // penaliza repeticiones y mejora fluidez
          stop: [],     
        }); */
  }

  @Post('preguntar')
  async preguntar(@Body('pregunta') pregunta: string) {
    if (!pregunta?.trim()) {
      throw new HttpException('La pregunta es requerida', HttpStatus.BAD_REQUEST);
    }

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
        return {
          pregunta: pregunta,
          respuesta: result.response,
          parametros: result.parameters || {},
          estado: 'éxito'
        };

      } catch (e) {
        console.error('Error al parsear la respuesta:', e);
        throw new HttpException(
          `Error parseando respuesta: ${e.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

    } catch (error) {
      console.error('Error en preguntar():', error);
      throw new HttpException(
        error.response || error.message || 'Error al procesar la solicitud',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('listar')
  async listar() {
    return this.aichatService.obtenerPreguntas();
  }

  @Get()
  findAll() {
    return this.aichatService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aichatService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAichatDto: UpdateAichatDto) {
    return this.aichatService.update(+id, updateAichatDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.aichatService.remove(+id);
  }
}
