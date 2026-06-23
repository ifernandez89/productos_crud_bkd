/*
  Warnings:

  - You are about to drop the column `embeddingId` on the `Chunk` table. All the data in the column will be lost.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- DropIndex
DROP INDEX "Chunk_embeddingId_idx";

-- AlterTable
ALTER TABLE "Chunk" DROP COLUMN "embeddingId",
ADD COLUMN     "embedding" vector(768);
