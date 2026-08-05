-- CreateTable
CREATE TABLE "DocumentInsight" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "collection" TEXT,
    "executiveSummary" TEXT NOT NULL,
    "centralThesis" TEXT,
    "highlightedStories" TEXT NOT NULL DEFAULT '[]',
    "keyCharacters" TEXT NOT NULL DEFAULT '[]',
    "coreConcepts" TEXT NOT NULL DEFAULT '[]',
    "notableQuotes" TEXT NOT NULL DEFAULT '[]',
    "controversialIdeas" TEXT NOT NULL DEFAULT '[]',
    "practicalTechniques" TEXT NOT NULL DEFAULT '[]',
    "contradictions" TEXT NOT NULL DEFAULT '[]',
    "synthesisVersion" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentInsight_documentId_key" ON "DocumentInsight"("documentId");

-- CreateIndex
CREATE INDEX "DocumentInsight_author_idx" ON "DocumentInsight"("author");

-- CreateIndex
CREATE INDEX "DocumentInsight_collection_idx" ON "DocumentInsight"("collection");

-- CreateIndex
CREATE INDEX "DocumentInsight_generatedAt_idx" ON "DocumentInsight"("generatedAt");

-- AddForeignKey
ALTER TABLE "DocumentInsight" ADD CONSTRAINT "DocumentInsight_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
