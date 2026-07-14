-- Activar extensión pgvector (ya instalada en el sistema)
CREATE EXTENSION IF NOT EXISTS vector;

-- Agregar columna embedding a Chunk (bge-m3 = 1024 dimensiones)
ALTER TABLE "Chunk" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);

-- Agregar columna embedding a MemoryChunk
ALTER TABLE "MemoryChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);

-- Índice HNSW en Chunk para búsqueda aproximada por similitud coseno
-- m=16, ef_construction=64 son buenos defaults para 1024 dims y <100k chunks
CREATE INDEX IF NOT EXISTS "chunk_embedding_hnsw_idx"
  ON "Chunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice HNSW en MemoryChunk
CREATE INDEX IF NOT EXISTS "memory_chunk_embedding_hnsw_idx"
  ON "MemoryChunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
