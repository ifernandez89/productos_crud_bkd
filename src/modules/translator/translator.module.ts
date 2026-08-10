import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TranslatorController } from './translator.controller';
import { TranslatorService } from './translator.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    // Usar memoria para el buffer del PDF (no guardar el original en disco)
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024, // 100 MB máximo
      },
    }),
  ],
  controllers: [TranslatorController],
  providers: [TranslatorService],
  exports: [TranslatorService],
})
export class TranslatorModule {}
