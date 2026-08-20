// docs/core-mobile-gateway/mobile-gateway.module.ts
import { Module } from '@nestjs/common';
import { MobileGatewayController } from './mobile-gateway.controller';
import { MobileGatewayService } from './mobile-gateway.service';

@Module({
  controllers: [MobileGatewayController],
  providers: [MobileGatewayService],
  exports: [MobileGatewayService],
})
export class MobileGatewayModule {}
