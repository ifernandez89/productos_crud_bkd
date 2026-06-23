import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module';
import { AichatModule } from './aichat/aichat.module';
import { UploadModule } from './upload/upload.module';
import { PrismaModule } from './prisma/prisma.module';
import { LoggerModule } from './logger/logger.module';
import { JarvisModule } from './jarvis/jarvis.module';
import { GoogleModule } from './google/google.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    PrismaModule,
    ProductsModule,
    AichatModule,
    UploadModule,
    JarvisModule,
    GoogleModule,
  ],
})
export class AppModule {}
