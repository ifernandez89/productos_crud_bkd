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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    LoggerModule,
    PrismaModule,
    ProductsModule,
    AichatModule,
    UploadModule,
    JarvisModule,
    GoogleModule,
    JobsModule,
  ],
})
export class AppModule {}
