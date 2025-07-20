import { Global, Module } from '@nestjs/common';
import { AichatService } from './aichat.service';
import { AichatController } from './aichat.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { ModelService } from './models/ollamaModel';
import { ConverterService } from './utils/converter.service';

@Global()
@Module({
  controllers: [AichatController],
  providers: [AichatService,PrismaService,ModelService,ConverterService],
})
export class AichatModule {}
