import { Module } from '@nestjs/common';
import { AichatService } from './aichat.service';
import { AichatController } from './aichat.controller';
import { OllamaModelService } from './models/ollamaModel';
import { PreguntasRepository } from './repositories/preguntas.repository';
import { ProductsRepository } from '../products/repositories/products.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { ConverterService } from './utils/converter.service';
import { AssistantToolsService } from './utils/assistant-tools.service';

@Module({
  imports: [PrismaModule],
  controllers: [AichatController],
  providers: [
    AichatService,
    OllamaModelService,
    PreguntasRepository,
    ProductsRepository,
    ConverterService,
    AssistantToolsService,
  ],
  exports: [AichatService],
})
export class AichatModule {}
