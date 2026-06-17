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
import { JarvisIdentityService } from './config/jarvis-identity.service';
import { CapabilitiesService } from './config/capabilities.service';
import { SkillRegistryService } from './skills/skill-registry.service';
import { ToolRegistryService } from './tools/registry/tool-registry.service';

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
    JarvisIdentityService,
    CapabilitiesService,
    SkillRegistryService,
    ToolRegistryService,
    OllamaProvider,
    OpenRouterProvider,
  ],
  exports: [JarvisService],
})
export class JarvisModule {}
