require('dotenv').config({ path: '.env.staging' });

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('jarbees_stage')) {
  throw new Error('CRITICAL: DATABASE_URL is not pointing to jarbees_stage!');
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const statements = [
    `ALTER TABLE "TopicSnapshot" ADD COLUMN IF NOT EXISTS "eventType" TEXT NOT NULL DEFAULT 'conversation_episode'`,
    `ALTER TABLE "TopicSnapshot" ADD COLUMN IF NOT EXISTS "summary" TEXT`,
    `ALTER TABLE "TopicSnapshot" ADD COLUMN IF NOT EXISTS "epistemicItems" TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE "TopicSnapshot" ADD COLUMN IF NOT EXISTS "entities" TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE "TopicSnapshot" ADD COLUMN IF NOT EXISTS "agentRunId" INTEGER`,
    `ALTER TABLE "TopicSnapshot" ADD COLUMN IF NOT EXISTS "sourceMessageIds" TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE "TopicSnapshot" ADD COLUMN IF NOT EXISTS "sourceDocIds" TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE "TopicSnapshot" ADD COLUMN IF NOT EXISTS "sourceChunkIds" TEXT NOT NULL DEFAULT '[]'`,
    `CREATE INDEX IF NOT EXISTS "TopicSnapshot_agentRunId_idx" ON "TopicSnapshot"("agentRunId")`,
    `CREATE INDEX IF NOT EXISTS "TopicSnapshot_eventType_idx" ON "TopicSnapshot"("eventType")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  console.log('[MEM-001] TopicSnapshot columns added to jarbees_stage successfully (production untouched).');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

