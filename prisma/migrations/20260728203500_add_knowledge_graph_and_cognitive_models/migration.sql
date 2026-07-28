-- CreateEnum
CREATE TYPE "KnowledgeEntityType" AS ENUM ('PERSON', 'CONCEPT', 'WORK', 'PROJECT', 'TECHNOLOGY', 'PLACE', 'EVENT');

-- CreateEnum
CREATE TYPE "KnowledgeRelationType" AS ENUM ('DEVELOPED', 'INFLUENCED', 'CREATED', 'USES', 'RELATED_TO', 'PART_OF', 'BELONGS_TO', 'OPPOSITE_OF');

-- CreateTable
CREATE TABLE IF NOT EXISTS "CognitiveState" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "sessionId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "activation" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "decayRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "contextTags" TEXT NOT NULL DEFAULT '[]',
    "lastActivatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CognitiveState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CognitiveEntanglement" (
    "id" SERIAL NOT NULL,
    "conceptA" TEXT NOT NULL,
    "conceptB" TEXT NOT NULL,
    "correlationStrength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "interactionCount" INTEGER NOT NULL DEFAULT 1,
    "lastCoActivatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CognitiveEntanglement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MetacognitiveRun" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "strategyUsed" TEXT NOT NULL,
    "predictedIntent" TEXT NOT NULL,
    "predictionError" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "expressionWeights" TEXT NOT NULL,
    "userFeedbackScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetacognitiveRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeEntity" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "KnowledgeEntityType" NOT NULL,
    "description" TEXT,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeRelation" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "targetId" INTEGER NOT NULL,
    "relationType" "KnowledgeRelationType" NOT NULL,
    "label" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "bidirectional" BOOLEAN NOT NULL DEFAULT false,
    "sourceDocId" INTEGER,
    "chunkId" INTEGER,
    "quote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PendingRelation" (
    "id" SERIAL NOT NULL,
    "sourceName" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "label" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectedReason" TEXT,
    "sourceDocId" INTEGER,
    "chunkId" INTEGER,
    "quote" TEXT,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "resolvedSourceId" INTEGER,
    "resolvedTargetId" INTEGER,

    CONSTRAINT "PendingRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CognitiveState_sessionId_concept_idx" ON "CognitiveState"("sessionId", "concept");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CognitiveState_activation_idx" ON "CognitiveState"("activation");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CognitiveState_lastActivatedAt_idx" ON "CognitiveState"("lastActivatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CognitiveEntanglement_correlationStrength_idx" ON "CognitiveEntanglement"("correlationStrength");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CognitiveEntanglement_conceptA_idx" ON "CognitiveEntanglement"("conceptA");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CognitiveEntanglement_conceptB_idx" ON "CognitiveEntanglement"("conceptB");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CognitiveEntanglement_conceptA_conceptB_key" ON "CognitiveEntanglement"("conceptA", "conceptB");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetacognitiveRun_sessionId_idx" ON "MetacognitiveRun"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetacognitiveRun_strategyUsed_idx" ON "MetacognitiveRun"("strategyUsed");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetacognitiveRun_createdAt_idx" ON "MetacognitiveRun"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeEntity_type_idx" ON "KnowledgeEntity"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeEntity_name_idx" ON "KnowledgeEntity"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeEntity_confidence_idx" ON "KnowledgeEntity"("confidence");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeEntity_timesUsed_idx" ON "KnowledgeEntity"("timesUsed");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeEntity_name_type_key" ON "KnowledgeEntity"("name", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeRelation_sourceId_idx" ON "KnowledgeRelation"("sourceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeRelation_targetId_idx" ON "KnowledgeRelation"("targetId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeRelation_relationType_idx" ON "KnowledgeRelation"("relationType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeRelation_confidence_idx" ON "KnowledgeRelation"("confidence");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeRelation_strength_idx" ON "KnowledgeRelation"("strength");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeRelation_sourceDocId_idx" ON "KnowledgeRelation"("sourceDocId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeRelation_sourceId_targetId_relationType_key" ON "KnowledgeRelation"("sourceId", "targetId", "relationType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PendingRelation_status_idx" ON "PendingRelation"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PendingRelation_confidence_idx" ON "PendingRelation"("confidence");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PendingRelation_sourceDocId_idx" ON "PendingRelation"("sourceDocId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PendingRelation_extractedAt_idx" ON "PendingRelation"("extractedAt");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeRelation_sourceId_fkey') THEN
        ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeRelation_targetId_fkey') THEN
        ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "KnowledgeEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PendingRelation_resolvedSourceId_fkey') THEN
        ALTER TABLE "PendingRelation" ADD CONSTRAINT "PendingRelation_resolvedSourceId_fkey" FOREIGN KEY ("resolvedSourceId") REFERENCES "KnowledgeEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PendingRelation_resolvedTargetId_fkey') THEN
        ALTER TABLE "PendingRelation" ADD CONSTRAINT "PendingRelation_resolvedTargetId_fkey" FOREIGN KEY ("resolvedTargetId") REFERENCES "KnowledgeEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
