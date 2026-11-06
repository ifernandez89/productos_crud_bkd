import { Module } from '@nestjs/common';
import { MobileGatewayController } from './mobile-gateway.controller';
import { MobileGatewayService } from './mobile-gateway.service';
import { JarvisModule } from '../jarvis/jarvis.module';

@Module({
  imports: [JarvisModule],
  controllers: [MobileGatewayController],
  providers: [MobileGatewayService],
  exports: [MobileGatewayService],
})
export class MobileGatewayModule {}
