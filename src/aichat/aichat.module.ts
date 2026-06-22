import { Module } from '@nestjs/common';
import { AichatService } from './aichat.service';
import { AichatController } from './aichat.controller';
import { OllamaModelService } from './models/ollamaModel';
import { OllamaQwenModelService } from './models/ollamaModel_2';
import { PreguntasRepository } from './repositories/preguntas.repository';
import { ProductsRepository } from '../products/repositories/products.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { ConverterService } from './utils/converter.service';
import { AssistantToolsService } from './utils/assistant-tools.service';
import { ModelRouterService } from './utils/model-router.service';
import { BrowserToolService } from '../jarvis/tools/browser/browser-tool.service';

import { LLAMA_MODEL_TOKEN, QWEN_MODEL_TOKEN } from './aichat.tokens';

// Re-export para compatibilidad con código externo que importe desde el módulo
export { LLAMA_MODEL_TOKEN, QWEN_MODEL_TOKEN };

@Module({
  imports: [PrismaModule],
  controllers: [AichatController],
  providers: [
    // Modelo 1: llama3.2:3b — general (OLLAMA_MODEL en .env)
    {
      provide: LLAMA_MODEL_TOKEN,
      useClass: OllamaModelService,
    },
    // Modelo 2: qwen3:4b — experto técnico (OLLAMA_MODEL_2 en .env)
    {
      provide: QWEN_MODEL_TOKEN,
      useClass: OllamaQwenModelService,
    },
    // Servicios
    AichatService,
    PreguntasRepository,
    ProductsRepository,
    ConverterService,
    BrowserToolService,
    AssistantToolsService,
    ModelRouterService,
  ],
  exports: [AichatService],
})
export class AichatModule {}
