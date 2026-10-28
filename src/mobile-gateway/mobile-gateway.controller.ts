import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { MobileGatewayService, MobileCommandDto } from './mobile-gateway.service';
import { Public } from '../auth/public.decorator';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';

@ApiTags('mobile-gateway')
@Public()
@Controller('mobile/v1')
export class MobileGatewayController {
  private readonly logger = new Logger(MobileGatewayController.name);

  constructor(private readonly gatewayService: MobileGatewayService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estado de salud del Mobile Gateway' })
  getHealth() {
    return {
      status: 'ok',
      service: 'JarBees Core MobileGateway',
      timestamp: new Date().toISOString(),
      version: '1.2.0',
    };
  }

  @Get('capabilities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Capacidades, comandos y aplicaciones autorizadas' })
  getCapabilities() {
    return this.gatewayService.getCapabilities();
  }

  @Post('command')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Despachar comando móvil seguro con firma HMAC y protección Anti-Replay',
  })
  @ApiHeader({
    name: 'x-jarbees-signature',
    description: 'Firma HMAC-SHA256 opcional o requerida según entorno',
    required: false,
  })
  @ApiHeader({
    name: 'x-jarbees-timestamp',
    description: 'Timestamp de la petición para verificación anti-replay (ISO 8601)',
    required: false,
  })
  async handleCommand(
    @Body() body: MobileCommandDto,
    @Headers('x-jarbees-signature') signature?: string,
    @Headers('x-jarbees-timestamp') headerTimestamp?: string,
  ) {
    const startTime = Date.now();
    this.logger.log(
      `[MobileGateway] Request ${body.requestId} | Intent: ${body.intent} | Device: ${body.deviceId}`,
    );

    const result = await this.gatewayService.dispatchMobileCommand(
      body,
      signature,
      headerTimestamp,
    );
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[MobileGateway] Request ${body.requestId} finalizado en ${durationMs}ms con success=${result.success}`,
    );
    return {
      ...result,
      latencyMs: durationMs,
    };
  }
}
