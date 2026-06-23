-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "image" TEXT,
    "stock" INTEGER NOT NULL,
    "isFeatured" BOOLEAN,
    "isOnSale" BOOLEAN,
    "isNew" BOOLEAN,
    "createdAT" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "marca" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "texto" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "errorStatus" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "country" TEXT NOT NULL DEFAULT 'Argentina',
    "language" TEXT NOT NULL DEFAULT 'es-AR',
    "preferences" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserCredential" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userProfileId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiryDate" BIGINT,
    "scope" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserCredential_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "lastAccessed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MemoryChunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memoryId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embeddingId" TEXT,
    CONSTRAINT "MemoryChunk_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SessionSummary" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CollectionDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "collectionId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionDocument_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceId" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "source" TEXT,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embeddingId" TEXT,
    "metadata" JSONB,
    CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaskStep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" INTEGER NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "toolsUsed" JSONB,
    "modelUsed" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "tokensUsed" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Source" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "urlBase" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "ttlHours" INTEGER NOT NULL DEFAULT 6,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScraped" DATETIME,
    "successRate" REAL NOT NULL DEFAULT 1.0,
    "avgResponseTimeMs" INTEGER,
    "scrapingConfig" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScrapedPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "contentHash" TEXT NOT NULL,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" DATETIME,
    CONSTRAINT "ScrapedPage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScrapedContent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "htmlRaw" TEXT,
    "textExtracted" TEXT NOT NULL,
    "jsonExtracted" JSONB,
    "metadata" JSONB,
    CONSTRAINT "ScrapedContent_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ScrapedPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Query" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourcesUsed" JSONB,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "responseTimeMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
