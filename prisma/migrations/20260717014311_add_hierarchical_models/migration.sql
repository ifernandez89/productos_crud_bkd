-- AlterTable
ALTER TABLE "Chunk" ADD COLUMN     "sectionId" INTEGER;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "progressEmbed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "progressIndex" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "progressSummary" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "Chapter" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "summary" TEXT,
    "embedding" vector(1024),

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" SERIAL NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "embedding" vector(1024),

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chapter_documentId_idx" ON "Chapter"("documentId");

-- CreateIndex
CREATE INDEX "Section_chapterId_idx" ON "Section"("chapterId");

-- CreateIndex
CREATE INDEX "Chunk_sectionId_idx" ON "Chunk"("sectionId");

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
