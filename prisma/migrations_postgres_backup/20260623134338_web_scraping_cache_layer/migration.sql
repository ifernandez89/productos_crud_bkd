-- CreateTable
CREATE TABLE "Source" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "urlBase" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "ttlHours" INTEGER NOT NULL DEFAULT 6,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastScraped" TIMESTAMP(3),
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "avgResponseTimeMs" INTEGER,
    "scrapingConfig" JSONB,
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

    CONSTRAINT "ScrapedPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedContent" (
    "id" SERIAL NOT NULL,
    "pageId" INTEGER NOT NULL,
    "htmlRaw" TEXT,
    "textExtracted" TEXT NOT NULL,
    "jsonExtracted" JSONB,
    "metadata" JSONB,

    CONSTRAINT "ScrapedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Query" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourcesUsed" JSONB,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "responseTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Query_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "ScrapedPage" ADD CONSTRAINT "ScrapedPage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapedContent" ADD CONSTRAINT "ScrapedContent_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ScrapedPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
