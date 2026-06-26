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
import { Public } from '../auth/public.decorator';

@ApiTags('aichat')
@Controller('aichat')
export class AichatController {
  constructor(
    private readonly aichatService: AichatService,
    private readonly converter: ConverterService,
  ) {}

  @Public()
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
      const lastMessage = this.aichatService.getLastAssistantMessage();
      return { respuesta, lastMessage };
    } catch (error) {
      throw new HttpException(
        error.response || error.message || 'Error al procesar la solicitud',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Get('listar')
  async listar() {
    return this.aichatService.obtenerPreguntas();
  }

  @Public()
  @Get()
  findAll() {
    return this.aichatService.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.aichatService.findOne(id);
  }

  @Public()
  @Get('session/ultimo-mensaje')
  @ApiOperation({ summary: 'Get the last assistant message' })
  getLastAssistantMessage() {
    const mensaje = this.aichatService.getLastAssistantMessage();
    if (!mensaje) {
      throw new HttpException(
        'No hay un mensaje anterior',
        HttpStatus.NOT_FOUND,
      );
    }
    return { mensaje };
  }
}
