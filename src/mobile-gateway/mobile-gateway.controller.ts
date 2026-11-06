import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MobileGatewayService, MobileCommandDto } from './mobile-gateway.service';
import { Public } from '../auth/public.decorator';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  SecurityKernelAuthGuard,
  RequireSecurityPermission,
} from '../jarvis/security/security-kernel-auth.guard';

@ApiTags('mobile-gateway')
@UseGuards(SecurityKernelAuthGuard)
@Controller('mobile/v1')
export class MobileGatewayController {
  private readonly logger = new Logger(MobileGatewayController.name);

  constructor(private readonly gatewayService: MobileGatewayService) {}

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estado básico de disponibilidad del Mobile Gateway' })
  getHealth() {
    return {
      status: 'ok',
      service: 'JarBees Core MobileGateway',
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 1, requiredScope: 'jarbees:read' })
  @Get('capabilities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Capacidades, comandos y aplicaciones autorizadas' })
  getCapabilities() {
    return this.gatewayService.getCapabilities();
  }

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:mutate' })
  @Post('command')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Despachar comando móvil seguro con firma HMAC obligatoria y protección Anti-Replay',
  })
  @ApiHeader({
    name: 'x-jarbees-signature',
    description: 'Firma HMAC-SHA256 obligatoria vinculada a método, ruta, requestId, timestamp y payload',
    required: true,
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
    @Req() req?: any,
  ) {
    const startTime = Date.now();
    this.logger.log(
      `[MobileGateway] Request ${body?.requestId} | Intent: ${body?.intent} | Device: ${body?.deviceId}`,
    );

    const result = await this.gatewayService.dispatchMobileCommand(
      body,
      signature,
      headerTimestamp,
      {
        method: req?.method || 'POST',
        path: req?.originalUrl || req?.url || '/mobile/v1/command',
      },
    );
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[MobileGateway] Request ${body?.requestId} finalizado en ${durationMs}ms con success=${result.success}`,
    );
    return {
      ...result,
      latencyMs: durationMs,
    };
  }
}
