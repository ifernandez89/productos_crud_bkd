import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AichatService } from './aichat.service';
import { UpdateAichatDto } from './dto/update-aichat.dto';
import { CreateAichatDto } from './dto/create-aichat.dto';
import { ConverterService } from './utils/converter.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('aichat')
@Controller('aichat')
export class AichatController {
  constructor(
    private readonly aichatService: AichatService,
    private readonly converter: ConverterService,
  ) {}

  @Post('preguntar')
  @ApiOperation({ summary: 'Ask a question to the AI' })
  async preguntar(@Body() createAichatDto: CreateAichatDto) {
    try {
      if (!createAichatDto.pregunta?.trim()) {
        throw new HttpException(
          'La pregunta es requerida',
          HttpStatus.BAD_REQUEST,
        );
      }
      const respuesta =
        await this.aichatService.preguntarOllamaOexternal(createAichatDto);
      return { respuesta };
    } catch (error) {
      throw new HttpException(
        error.response || error.message || 'Error al procesar la solicitud',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
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
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.aichatService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAichatDto: UpdateAichatDto,
  ) {
    return this.aichatService.update(id, updateAichatDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.aichatService.remove(id);
  }
}
