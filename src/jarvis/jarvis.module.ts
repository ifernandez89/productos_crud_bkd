import { Module } from '@nestjs/common';
import { JarvisService } from './jarvis.service';
import { JarvisController } from './jarvis.controller';
import { MemoryRepository } from './repositories/memory.repository';
import { ConversationRepository } from './repositories/conversation.repository';
import { DocumentRepository } from './repositories/document.repository';
import { UserProfileRepository } from './repositories/user-profile.repository';
import { AgentRunRepository } from './repositories/agent-run.repository';
import { SessionSummaryRepository } from './repositories/session-summary.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { AssistantToolsService } from '../aichat/utils/assistant-tools.service';
import { OllamaProvider } from './llm/ollama.provider';
import { OpenRouterProvider } from './llm/openrouter.provider';

@Module({
  imports: [PrismaModule],
  controllers: [JarvisController],
  providers: [
    JarvisService,
    MemoryRepository,
    ConversationRepository,
    DocumentRepository,
    UserProfileRepository,
    AgentRunRepository,
    SessionSummaryRepository,
    AssistantToolsService,
    OllamaProvider,
    OpenRouterProvider,
  ],
  exports: [JarvisService],
})
export class JarvisModule {}
