-- DropIndex
DROP INDEX "chunk_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "memory_chunk_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ready';

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");
