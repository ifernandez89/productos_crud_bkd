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
  @ApiQuery({
    name: 'agente',
    type: 'boolean',
    description: 'True en caso de necesitar agente',
    required: false,
  })
  async preguntar(
    @Body('pregunta') pregunta: string,
    @Query('agente') agente: boolean
  ) {
    agente = true;
    if (!pregunta || pregunta.trim() === '') {
      throw new HttpException('La pregunta es requerida', HttpStatus.BAD_REQUEST);
    }
    try {
      console.log('Ejecutando script de Python...', pregunta);
      const pythonPath = 'C:\\Users\\usuario\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe'; // o 'python' según tu entorno
      const scriptPath = path.join(__dirname, '../hrm/hrm_runner.py');

      return new Promise((resolve, reject) => {
        const process = spawn(pythonPath, [scriptPath, pregunta]);
        console.log('Ejecutando:', pythonPath, [scriptPath, pregunta]); // Depuración
        let output = '';
        let errorOutput = '';

        process.stdout.on('data', (data) => {
          output += data.toString();
        });

        process.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        process.on('close', (code) => {
          if (code === 0) {
            try {
              resolve(JSON.parse(output));
            } catch (e) {
              reject(new HttpException('Error al parsear respuesta de HRM', HttpStatus.INTERNAL_SERVER_ERROR));
            }
          } else {
            reject(new HttpException(`Error HRM: ${errorOutput}`, HttpStatus.INTERNAL_SERVER_ERROR));
          }
        });
      });
    } catch (error) {
      throw new HttpException('Error al procesar la solicitud', HttpStatus.INTERNAL_SERVER_ERROR);
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
