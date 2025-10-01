import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AichatService } from './aichat.service';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { ConverterService } from './utils/converter.service';

@Controller('aichat')
export class AichatController {
  constructor(private readonly aichatService: AichatService, private readonly converter: ConverterService) {
  }

  @Post('preguntar')
  async preguntar(@Body('pregunta') pregunta: string) {
    if (!pregunta?.trim()) {
      throw new HttpException('La pregunta es requerida', HttpStatus.BAD_REQUEST);
    }
    try {
      //const respuesta = await this.aichatService.preguntarHRM(pregunta);
      const respuesta = await this.aichatService.preguntarOllamaOexternal(pregunta, true);
      return { respuesta };
    } catch (error) {
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
