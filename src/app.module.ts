import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module';
import { AichatModule } from './aichat/aichat.module';
import { UploadModule } from './upload/upload.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { LoggerModule } from './logger/logger.module';
import { JarvisModule } from './jarvis/jarvis.module';
import { GoogleModule } from './google/google.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './auth/auth.module';
import { BalanceModule } from './modules/balance/balance.module';
import { ReaderModule } from './modules/reader/reader.module';
import { TranslatorModule } from './modules/translator/translator.module';
import { MobileGatewayModule } from './mobile-gateway/mobile-gateway.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt.guard';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { SecurityKernelAuthGuard } from './jarvis/security/security-kernel-auth.guard';
import { SecurityKernelModule } from './jarvis/security/security-kernel.module';

import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    SharedModule,
    SecurityKernelModule,
    LoggerModule,
    PrismaModule,
    ProductsModule,
    AichatModule,
    UploadModule,
    JarvisModule,
    GoogleModule,
    JobsModule,
    AuthModule,
    BalanceModule,
    ReaderModule,
    TranslatorModule,
    MobileGatewayModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 60 segundos
        limit: 100, // 100 requests por minuto
      },
      {
        name: 'strict',
        ttl: 60000,
        limit: 10, // para endpoints específicos (opcional)
      },
    ]),
  ],
  providers: [
    // Guard global JWT — todos los endpoints requieren autenticación
    // excepto los marcados con @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Guard global del Security Kernel — lista blanca estricta de excepciones públicas (A1)
    // y verificación de identidad y scopes de operador
    { provide: APP_GUARD, useClass: SecurityKernelAuthGuard },
    // Rate limiting global — 100 req/min default
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
