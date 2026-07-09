-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "image" TEXT,
    "stock" INTEGER NOT NULL,
    "isFeatured" BOOLEAN,
    "isOnSale" BOOLEAN,
    "isNew" BOOLEAN,
    "createdAT" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "marca" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" SERIAL NOT NULL,
    "texto" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "errorStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pregunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "country" TEXT NOT NULL DEFAULT 'Argentina',
    "language" TEXT NOT NULL DEFAULT 'es-AR',
    "preferences" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCredential" (
    "id" SERIAL NOT NULL,
    "userProfileId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiryDate" BIGINT,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "lastAccessed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryChunk" (
    "id" SERIAL NOT NULL,
    "memoryId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embeddingId" TEXT,

    CONSTRAINT "MemoryChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSummary" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionDocument" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "source" TEXT,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embeddingId" TEXT,
    "metadata" TEXT,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT DEFAULT 'normal',
    "category" TEXT,
    "project" TEXT,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStep" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "toolsUsed" TEXT,
    "modelUsed" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "tokensUsed" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "urlBase" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "ttlHours" INTEGER NOT NULL DEFAULT 6,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "scrapeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "embeddingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastScraped" TIMESTAMP(3),
    "lastEmbedding" TIMESTAMP(3),
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "avgResponseTimeMs" INTEGER,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "scrapingConfig" TEXT,
    "embeddingConfig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedPage" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "contentHash" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "embeddingId" TEXT,

    CONSTRAINT "ScrapedPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedContent" (
    "id" SERIAL NOT NULL,
    "pageId" INTEGER NOT NULL,
    "htmlRaw" TEXT,
    "textExtracted" TEXT NOT NULL,
    "jsonExtracted" TEXT,
    "metadata" TEXT,

    CONSTRAINT "ScrapedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Query" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourcesUsed" TEXT,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "responseTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicSnapshot" (
    "id" SERIAL NOT NULL,
    "topic" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE INDEX "UserCredential_provider_idx" ON "UserCredential"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "UserCredential_userProfileId_provider_key" ON "UserCredential"("userProfileId", "provider");

-- CreateIndex
CREATE INDEX "Memory_category_idx" ON "Memory"("category");

-- CreateIndex
CREATE INDEX "Memory_importance_idx" ON "Memory"("importance");

-- CreateIndex
CREATE INDEX "Memory_lastAccessed_idx" ON "Memory"("lastAccessed");

-- CreateIndex
CREATE INDEX "MemoryChunk_memoryId_idx" ON "MemoryChunk"("memoryId");

-- CreateIndex
CREATE INDEX "MemoryChunk_embeddingId_idx" ON "MemoryChunk"("embeddingId");

-- CreateIndex
CREATE INDEX "ConversationMessage_sessionId_idx" ON "ConversationMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ConversationMessage_createdAt_idx" ON "ConversationMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSummary_sessionId_key" ON "SessionSummary"("sessionId");

-- CreateIndex
CREATE INDEX "SessionSummary_sessionId_idx" ON "SessionSummary"("sessionId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_type_idx" ON "KnowledgeSource"("type");

-- CreateIndex
CREATE INDEX "KnowledgeSource_active_idx" ON "KnowledgeSource"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_name_key" ON "Collection"("name");

-- CreateIndex
CREATE INDEX "Collection_name_idx" ON "Collection"("name");

-- CreateIndex
CREATE INDEX "CollectionDocument_collectionId_idx" ON "CollectionDocument"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionDocument_documentId_idx" ON "CollectionDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionDocument_collectionId_documentId_key" ON "CollectionDocument"("collectionId", "documentId");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE INDEX "Document_sourceId_idx" ON "Document"("sourceId");

-- CreateIndex
CREATE INDEX "Document_timesUsed_idx" ON "Document"("timesUsed");

-- CreateIndex
CREATE INDEX "Document_lastUsed_idx" ON "Document"("lastUsed");

-- CreateIndex
CREATE INDEX "Chunk_documentId_idx" ON "Chunk"("documentId");

-- CreateIndex
CREATE INDEX "Chunk_embeddingId_idx" ON "Chunk"("embeddingId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_sessionId_idx" ON "Task"("sessionId");

-- CreateIndex
CREATE INDEX "Task_priority_idx" ON "Task"("priority");

-- CreateIndex
CREATE INDEX "Task_category_idx" ON "Task"("category");

-- CreateIndex
CREATE INDEX "Task_project_idx" ON "Task"("project");

-- CreateIndex
CREATE INDEX "TaskStep_taskId_idx" ON "TaskStep"("taskId");

-- CreateIndex
CREATE INDEX "TaskStep_status_idx" ON "TaskStep"("status");

-- CreateIndex
CREATE INDEX "Feedback_score_idx" ON "Feedback"("score");

-- CreateIndex
CREATE INDEX "Feedback_sessionId_idx" ON "Feedback"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_name_key" ON "Tool"("name");

-- CreateIndex
CREATE INDEX "Tool_enabled_idx" ON "Tool"("enabled");

-- CreateIndex
CREATE INDEX "Tool_category_idx" ON "Tool"("category");

-- CreateIndex
CREATE INDEX "AgentRun_success_idx" ON "AgentRun"("success");

-- CreateIndex
CREATE INDEX "AgentRun_modelUsed_idx" ON "AgentRun"("modelUsed");

-- CreateIndex
CREATE INDEX "AgentRun_provider_idx" ON "AgentRun"("provider");

-- CreateIndex
CREATE INDEX "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");

-- CreateIndex
CREATE INDEX "Source_category_idx" ON "Source"("category");

-- CreateIndex
CREATE INDEX "Source_active_idx" ON "Source"("active");

-- CreateIndex
CREATE INDEX "Source_priority_idx" ON "Source"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "Source_urlBase_key" ON "Source"("urlBase");

-- CreateIndex
CREATE INDEX "ScrapedPage_sourceId_idx" ON "ScrapedPage"("sourceId");

-- CreateIndex
CREATE INDEX "ScrapedPage_expiresAt_idx" ON "ScrapedPage"("expiresAt");

-- CreateIndex
CREATE INDEX "ScrapedPage_status_idx" ON "ScrapedPage"("status");

-- CreateIndex
CREATE INDEX "ScrapedPage_scrapedAt_idx" ON "ScrapedPage"("scrapedAt");

-- CreateIndex
CREATE INDEX "ScrapedPage_cacheHits_idx" ON "ScrapedPage"("cacheHits");

-- CreateIndex
CREATE INDEX "ScrapedPage_embeddingId_idx" ON "ScrapedPage"("embeddingId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapedPage_url_key" ON "ScrapedPage"("url");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapedContent_pageId_key" ON "ScrapedContent"("pageId");

-- CreateIndex
CREATE INDEX "ScrapedContent_pageId_idx" ON "ScrapedContent"("pageId");

-- CreateIndex
CREATE INDEX "Query_category_idx" ON "Query"("category");

-- CreateIndex
CREATE INDEX "Query_cacheHit_idx" ON "Query"("cacheHit");

-- CreateIndex
CREATE INDEX "Query_createdAt_idx" ON "Query"("createdAt");

-- CreateIndex
CREATE INDEX "TopicSnapshot_topic_idx" ON "TopicSnapshot"("topic");

-- CreateIndex
CREATE INDEX "TopicSnapshot_createdAt_idx" ON "TopicSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "TopicSnapshot_sessionId_idx" ON "TopicSnapshot"("sessionId");

-- AddForeignKey
ALTER TABLE "UserCredential" ADD CONSTRAINT "UserCredential_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionDocument" ADD CONSTRAINT "CollectionDocument_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionDocument" ADD CONSTRAINT "CollectionDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStep" ADD CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapedPage" ADD CONSTRAINT "ScrapedPage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapedContent" ADD CONSTRAINT "ScrapedContent_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ScrapedPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
