import { Controller, Get, Post, Body, Patch, Param, Delete, HttpException, HttpStatus, Query } from '@nestjs/common';
import { AichatService } from './aichat.service';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { ChatOllama } from '@langchain/ollama';
import { runIA } from './agents/executor';
import { ModelService } from '../aichat/models/ollamaModel'
import { ApiQuery } from '@nestjs/swagger';
import { ConverterService } from './utils/converter.service';

@Controller('aichat')
export class AichatController {
  //private model: ChatOllama;

  constructor(private readonly aichatService: AichatService, private readonly converter: ConverterService) {
    /*  this.model = new ChatOllama({
       model: "phi",
       temperature: 0,
       topP: 1,
       topK: 1,
       numPredict: 10,
       repeatPenalty: 1,
       stop: ["\n\n"], // opcional: cortar después de una respuesta
     }); */
  }

  @Post('preguntar')
  @ApiQuery({
    name: 'agente',
    type: 'boolean',
    description: 'True en caso de necesitar agente',
    required: false,
  })
  async preguntar(@Body('pregunta') pregunta: string, @Query('agente') agente: boolean) {
    if (!pregunta || pregunta.trim() === '') {
      throw new HttpException('La pregunta es requerida', HttpStatus.BAD_REQUEST);
    }
    try {
      //const res = await this.model.invoke(texto)
      const res = await this.aichatService.preguntarGet(pregunta, this.converter.toBoolean(agente));
      return { respuesta: res };
      //return { respuesta: res.content };
    } catch (error) {
      throw new HttpException(
        `Error al procesar la pregunta: ${error.message || error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
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
