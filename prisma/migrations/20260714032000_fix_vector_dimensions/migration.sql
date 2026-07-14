-- Drop indexes that depend on the embedding column
DROP INDEX IF EXISTS "chunk_embedding_hnsw_idx";
DROP INDEX IF EXISTS "memory_chunk_embedding_hnsw_idx";

-- Alter column types to vector(1024)
ALTER TABLE "Chunk" ALTER COLUMN "embedding" TYPE vector(1024);
ALTER TABLE "MemoryChunk" ALTER COLUMN "embedding" TYPE vector(1024);

-- Recreate HNSW indexes with 1024 dimensions
CREATE INDEX IF NOT EXISTS "chunk_embedding_hnsw_idx"
  ON "Chunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "memory_chunk_embedding_hnsw_idx"
  ON "MemoryChunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
