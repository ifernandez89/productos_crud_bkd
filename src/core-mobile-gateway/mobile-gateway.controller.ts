// docs/core-mobile-gateway/mobile-gateway.controller.ts
import { Controller, Post, Get, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { MobileGatewayService } from './mobile-gateway.service';

export interface MobileCommandDto {
  requestId: string;
  deviceId: string;
  timestamp: string;
  intent: string;
  parameters?: Record<string, any>;
  context?: {
    source?: string;
    network?: string;
    battery?: number;
    userCommand?: string;
    [key: string]: any;
  };
}

@Controller('mobile/v1')
export class MobileGatewayController {
  private readonly logger = new Logger(MobileGatewayController.name);

  constructor(private readonly gatewayService: MobileGatewayService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth() {
    return {
      status: 'ok',
      service: 'JarBees Core MobileGateway',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Get('capabilities')
  @HttpCode(HttpStatus.OK)
  getCapabilities() {
    return this.gatewayService.getCapabilities();
  }

  @Post('command')
  @HttpCode(HttpStatus.OK)
  async handleCommand(@Body() body: MobileCommandDto) {
    const startTime = Date.now();
    this.logger.log(`[MobileGateway] Request ${body.requestId} | Intent: ${body.intent} | Device: ${body.deviceId}`);

    const result = await this.gatewayService.dispatchMobileCommand(body);
    const durationMs = Date.now() - startTime;

    this.logger.log(`[MobileGateway] Request ${body.requestId} finished in ${durationMs}ms with success=${result.success}`);
    return {
      ...result,
      latencyMs: durationMs,
    };
  }
}
