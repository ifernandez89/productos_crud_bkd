import { Module } from '@nestjs/common';
import { FeedbackRepository } from './repositories/feedback.repository';
import { JarvisService } from './jarvis.service';
import { JarvisController } from './jarvis.controller';
import { MemoryRepository } from './repositories/memory.repository';
import { ConversationRepository } from './repositories/conversation.repository';
import { DocumentRepository } from './repositories/document.repository';
import { CollectionRepository } from './repositories/collection.repository';
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
import { BrowserToolService } from './tools/browser/browser-tool.service';
import { IntentRouterService } from './tools/intent/intent-router.service';
import { SportsTool } from './tools/sports/sports-tool.service';
import { ContentCacheService } from './tools/web/content-cache.service';
import { DocumentIngestService } from './library/document-ingest.service';
import { DashboardService } from './library/dashboard.service';
import { TaskRepository } from './repositories/task.repository';
import { PlannerService } from './planner/planner.service';
import { GoogleModule } from '../google/google.module';
import { GoogleCalendarService } from './tools/google/google-calendar.service';
import { GoogleTasksService } from './tools/google/google-tasks.service';

@Module({
  imports: [PrismaModule, GoogleModule],
  controllers: [JarvisController],
  providers: [
    JarvisService,
    MemoryRepository,
    ConversationRepository,
    DocumentRepository,
    CollectionRepository,
    UserProfileRepository,
    AgentRunRepository,
    SessionSummaryRepository,
    FeedbackRepository,
    BrowserToolService,
    IntentRouterService,
    SportsTool,
    ContentCacheService,
    AssistantToolsService,
    JarvisIdentityService,
    GoogleCalendarService,
    GoogleTasksService,
    CapabilitiesService,
    SkillRegistryService,
    ToolRegistryService,
    OllamaProvider,
    OpenRouterProvider,
    DocumentIngestService,
    DashboardService,
    TaskRepository,
    PlannerService,
  ],
  exports: [JarvisService, FeedbackRepository, ContentCacheService],
})
export class JarvisModule {}
