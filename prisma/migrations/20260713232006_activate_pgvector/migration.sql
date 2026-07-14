-- Nota: pgvector debe estar instalado en PostgreSQL
-- Instalación manual en Windows:
--   1. Descargar desde: https://github.com/pgvector/pgvector/releases
--   2. Ejecutar como superusuario en pgAdmin:
--      CREATE EXTENSION IF NOT EXISTS vector;

-- Asegurarse de que la extensión esté disponible en la base (importante para shadow DB)
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Chunk" ADD COLUMN "embedding" vector(768);

-- AlterTable
ALTER TABLE "MemoryChunk" ADD COLUMN "embedding" vector(768);

-- Crear índices HNSW para búsqueda aproximada rápida (coseno)
-- m=16, ef_construction=64 son buenos defaults para 768 dims
CREATE INDEX "chunk_embedding_hnsw_idx"
  ON "Chunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX "memory_chunk_embedding_hnsw_idx"
  ON "MemoryChunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
