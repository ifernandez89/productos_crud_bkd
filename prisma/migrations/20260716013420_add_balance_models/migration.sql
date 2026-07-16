-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "status" SET DEFAULT 'not_indexed';

-- CreateTable
CREATE TABLE "BalanceSession" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "type" TEXT NOT NULL DEFAULT 'manual',
    "astrologicalContext" JSONB,
    "summary" TEXT,
    "scoreGeneral" DOUBLE PRECISION,
    "nextRecommendedAt" TIMESTAMP(3),

    CONSTRAINT "BalanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceAnswer" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "BalanceAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceReport" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "analysis" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL,
    "energyDistribution" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BalanceAnswer" ADD CONSTRAINT "BalanceAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BalanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceReport" ADD CONSTRAINT "BalanceReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BalanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
