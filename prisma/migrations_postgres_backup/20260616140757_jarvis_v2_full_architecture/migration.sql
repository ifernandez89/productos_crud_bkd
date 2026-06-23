/*
  Warnings:

  - You are about to drop the column `key` on the `Memory` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `Memory` table. All the data in the column will be lost.
  - You are about to drop the column `steps` on the `Task` table. All the data in the column will be lost.
  - Added the required column `content` to the `Memory` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Memory_key_key";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "sourceId" INTEGER;

-- AlterTable
ALTER TABLE "Memory" DROP COLUMN "key",
DROP COLUMN "value",
ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "lastAccessed" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "steps";

-- CreateTable
CREATE TABLE "MemoryChunk" (
    "id" SERIAL NOT NULL,
    "memoryId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embeddingId" TEXT,

    CONSTRAINT "MemoryChunk_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Tool" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
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
    "toolsUsed" JSONB,
    "modelUsed" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "tokensUsed" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryChunk_memoryId_idx" ON "MemoryChunk"("memoryId");

-- CreateIndex
CREATE INDEX "MemoryChunk_embeddingId_idx" ON "MemoryChunk"("embeddingId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSummary_sessionId_key" ON "SessionSummary"("sessionId");

-- CreateIndex
CREATE INDEX "SessionSummary_sessionId_idx" ON "SessionSummary"("sessionId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_type_idx" ON "KnowledgeSource"("type");

-- CreateIndex
CREATE INDEX "KnowledgeSource_active_idx" ON "KnowledgeSource"("active");

-- CreateIndex
CREATE INDEX "TaskStep_taskId_idx" ON "TaskStep"("taskId");

-- CreateIndex
CREATE INDEX "TaskStep_status_idx" ON "TaskStep"("status");

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
CREATE INDEX "Document_sourceId_idx" ON "Document"("sourceId");

-- CreateIndex
CREATE INDEX "Memory_lastAccessed_idx" ON "Memory"("lastAccessed");

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStep" ADD CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
