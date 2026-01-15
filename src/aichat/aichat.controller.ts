import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AichatService } from './aichat.service';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { ConverterService } from './utils/converter.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { create } from 'domain';
import { CreateAichatDto } from './dto/create-aichat.dto';

@ApiTags('aichat')
@Controller('aichat')
export class AichatController {
  constructor(private readonly aichatService: AichatService, private readonly converter: ConverterService) {
  }

  @Post('preguntar')
  @ApiOperation({ summary: 'Ask a question to the AI', description: `` })
  async preguntar(@Body() createAichatDto: CreateAichatDto) {
    try {
      if (!createAichatDto.pregunta?.trim()) {
        throw new HttpException('La pregunta es requerida', HttpStatus.BAD_REQUEST);
      }
      //const respuesta = await this.aichatService.preguntarHRM(pregunta);
      const respuesta = await this.aichatService.preguntarOllamaOexternal(createAichatDto);
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
