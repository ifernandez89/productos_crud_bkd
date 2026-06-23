-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "lastUsed" TIMESTAMP(3),
ADD COLUMN     "timesUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Collection" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionDocument" (
    "id" SERIAL NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionDocument_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "Document_timesUsed_idx" ON "Document"("timesUsed");

-- CreateIndex
CREATE INDEX "Document_lastUsed_idx" ON "Document"("lastUsed");

-- AddForeignKey
ALTER TABLE "CollectionDocument" ADD CONSTRAINT "CollectionDocument_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionDocument" ADD CONSTRAINT "CollectionDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
