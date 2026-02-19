import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module';
import { AichatModule } from './aichat/aichat.module';
import { UploadModule } from './upload/upload.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ProductsModule,
    AichatModule,
    UploadModule,
  ],
})
export class AppModule {}
