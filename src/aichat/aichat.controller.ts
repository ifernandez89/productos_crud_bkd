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
      // 1. Configuración de rutas
      const pythonExecutable ='C:\\Users\\usuario\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
      const scriptPath = path.join(
        process.cwd(),
        'src',
        'hrm',
        'hrm_runner.py'
      );

      // 2. Verificar existencia del script
      if (!existsSync(scriptPath)) {
        throw new HttpException(`Archivo no encontrado: ${scriptPath}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      console.log(`Ejecutando script: ${scriptPath} con pregunta: ${pregunta}`);

      // 3. Ejecutar el proceso Python
      const pythonProcess = spawn(pythonExecutable, [scriptPath, pregunta], {
        shell: true,
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      console.log(`Proceso Python iniciado: PID ${pythonProcess.pid}`);

      // 4. Manejo de streams con async/await
      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.setEncoding('utf8');
      pythonProcess.stderr.setEncoding('utf8');

      pythonProcess.stdout.on('data', (data) => output += data);
      pythonProcess.stderr.on('data', (data) => errorOutput += data);

      // 5. Esperar finalización del proceso
      const exitCode = await new Promise<number>((resolve) => {
        pythonProcess.on('close', resolve);
      });
      console.log(`Proceso Python finalizado con código: ${exitCode}`);
      // 6. Validar resultados
      if (exitCode !== 0) {
        throw new HttpException(
          `Error en script Python (${exitCode}): ${errorOutput}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

      try {
        const result = JSON.parse(output);
        if (!result?.respuesta) {
          throw new Error('Formato de respuesta inválido');
        }
        console.log(`Respuesta del script: ${JSON.stringify(result)}`);
        return result;
      } catch (e) {
        throw new HttpException(
          `Error procesando respuesta: ${e.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }

    } catch (error) {
      throw new HttpException(
        error.message || 'Error al procesar la solicitud',
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
