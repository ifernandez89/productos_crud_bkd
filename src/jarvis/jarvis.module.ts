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
import { DomainRouterService } from './tools/intent/domain-router.service';
import { SportsTool } from './tools/sports/sports-tool.service';
import { ContentCacheService } from './tools/web/content-cache.service';
import { DocumentIngestService } from './library/document-ingest.service';
import { RssIngestService } from './library/rss-ingest.service';
import { EmbeddingsService } from './library/embeddings.service';
import { DashboardService } from './library/dashboard.service';
import { TaskRepository } from './repositories/task.repository';
import { PlannerService } from './planner/planner.service';
import { InvestigationService } from './tools/web/investigation.service';
import { GoogleModule } from '../google/google.module';
import { GoogleCalendarService } from './tools/google/google-calendar.service';
import { GoogleTasksService } from './tools/google/google-tasks.service';
import { AstrologyTool } from './tools/astrology/astrology-tool.service';
import { MemoryExtractorService } from './memory/memory-extractor.service';
import { TaskReminderService } from './tools/tasks/task-reminder.service';
import { ExecutionEngine } from './planner/execution-engine.service';
import { KnowledgeEvolutionService } from './memory/knowledge-evolution.service';
import { VisionService } from './tools/vision/vision.service';
import { DocumentEnrichmentService } from './library/document-enrichment.service';
import { CategorySummaryService } from './library/category-summary.service';
import { DocumentSummaryService } from './library/document-summary.service';
import { DocumentCompareService } from './library/document-compare.service';
import { KnowledgeTestService } from './library/knowledge-test.service';
import { PgvectorService } from './repositories/pgvector.service';
import { GoogleGmailService } from './tools/google/google-gmail.service';
import { GoogleDriveService } from './tools/google/google-drive.service';
import { YouTubeService } from './tools/google/youtube.service';
import { JarvisKnowledgeService } from './knowledge/jarvis-knowledge.service';
import { CorpusSelectorService } from './knowledge/corpus-selector.service';
import { JarvisCommandService } from './commands/jarvis-command.service';
import { JarvisWebSearchService } from './tools/web/jarvis-web-search.service';
import { JarvisPromptBuilderService } from './prompt/jarvis-prompt-builder.service';
import { AuditService } from './security/audit.service';

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
    DomainRouterService,
    SportsTool,
    ContentCacheService,
    AssistantToolsService,
    JarvisIdentityService,
    GoogleCalendarService,
    GoogleTasksService,
    GoogleGmailService,
    GoogleDriveService,
    YouTubeService,
    AstrologyTool,
    MemoryExtractorService,
    CapabilitiesService,
    SkillRegistryService,
    ToolRegistryService,
    OllamaProvider,
    OpenRouterProvider,
    EmbeddingsService,
    DocumentIngestService,
    RssIngestService,
    DashboardService,
    TaskRepository,
    PlannerService,
    InvestigationService,
    TaskReminderService,
    ExecutionEngine,
    KnowledgeEvolutionService,
    VisionService,
    DocumentEnrichmentService,
    CategorySummaryService,
    DocumentSummaryService,
    DocumentCompareService,
    KnowledgeTestService,
    PgvectorService,
    JarvisKnowledgeService,
    CorpusSelectorService,
    JarvisCommandService,
    JarvisWebSearchService,
    JarvisPromptBuilderService,
    AuditService,
  ],
  exports: [
    JarvisService,
    FeedbackRepository,
    ContentCacheService,
    RssIngestService,
    JarvisKnowledgeService,
    CorpusSelectorService,
    JarvisCommandService,
    JarvisWebSearchService,
    JarvisPromptBuilderService,
  ],
})
export class JarvisModule {}
