import { Controller, Post, Get, Body, Param, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { BalanceService } from './balance.service';
import { Public } from '../../auth/public.decorator';

export class StartSessionDto {
  @IsString()
  @IsOptional()
  type?: string;
}

export class AnswerDto {
  @IsNumber()
  @IsNotEmpty()
  questionId: number;

  @IsString()
  @IsNotEmpty()
  answer: string;
}

@ApiTags('balance')
@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Public()
  @Post('start')
  @ApiOperation({ summary: 'Inicia un nuevo cuestionario de balance energético y calcula tránsitos astrológicos' })
  async start(@Body() dto: StartSessionDto) {
    return this.balanceService.start(dto.type);
  }

  @Public()
  @Post(':id/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envía la respuesta a una pregunta de la sesión' })
  async answer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnswerDto,
  ) {
    return this.balanceService.submitAnswer(id, dto.questionId, dto.answer);
  }

  @Public()
  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finaliza el cuestionario y genera el informe de balance con IA' })
  async finish(@Param('id', ParseIntPipe) id: number) {
    return this.balanceService.finish(id);
  }

  @Public()
  @Get('latest')
  @ApiOperation({ summary: 'Obtiene el último informe de balance energético completado con sus detalles' })
  async latest() {
    return this.balanceService.getLatest();
  }

  @Public()
  @Get('history')
  @ApiOperation({ summary: 'Obtiene el historial de informes de balance completados' })
  async history() {
    return this.balanceService.getHistory();
  }

  @Public()
  @Get('trends')
  @ApiOperation({ summary: 'Obtiene las tendencias de evolución histórica de las 7 dimensiones' })
  async trends() {
    return this.balanceService.getTrends();
  }
}
