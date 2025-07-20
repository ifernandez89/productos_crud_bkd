import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module';
import { PrismaService } from './prisma/prisma.service';
import { AichatModule } from './aichat/aichat.module';

@Module({
  imports: [ProductsModule, AichatModule],
  controllers: [],
  providers: [PrismaService, AichatModule],
})
export class AppModule {}
