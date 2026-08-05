import { Module } from '@nestjs/common';
import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';
import { TtsService } from './tts.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReaderController],
  providers: [ReaderService, TtsService],
  exports: [ReaderService, TtsService],
})
export class ReaderModule {}
