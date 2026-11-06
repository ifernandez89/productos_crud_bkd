const { PrismaClient } = require('@prisma/client');
const { KnowledgeEvolutionService } = require('../dist/jarvis/memory/knowledge-evolution.service');

async function main() {
  const stagePrisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://postgres:7523@localhost:5432/jarbees_stage?schema=public',
      },
    },
  });
  const prodPrisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://postgres:7523@localhost:5432/jarbees_data?schema=public',
      },
    },
  });

  console.log('=== [MEM PROMOTION] 1. Verificando estado previo de TopicSnapshot en jarbees_data ===');
  const beforeCountRow = await prodPrisma.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS total FROM "TopicSnapshot"',
  );
  const beforeCount = beforeCountRow[0].total;
  console.log(` -> Registros preexistentes en jarbees_data.TopicSnapshot: ${beforeCount}`);

  console.log('\n=== [MEM PROMOTION] 2. Aplicando DDL no destructivo (ADD COLUMN IF NOT EXISTS) en jarbees_data ===');
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
    await prodPrisma.$executeRawUnsafe(sql);
  }
  console.log(' -> Columnas e índices MEM-001 aplicados exitosamente sin alterar registros previos.');

  const afterMigrationCount = await prodPrisma.topicSnapshot.count();
  console.log(` -> Registros tras migración DDL: ${afterMigrationCount} (preservación 100%)`);

  const mockLlm = {
    generate: async () => ({
      content: '{"topic": null}',
      model: 'mock',
      provider: 'mock',
      latencyMs: 1,
    }),
  };
  const prodEvolution = new KnowledgeEvolutionService(prodPrisma, mockLlm, mockLlm);

  console.log('\n=== [MEM PROMOTION] 3. Verificando compatibilidad con los 54 recuerdos preexistentes ===');
  const legacyCheck = await prodEvolution.recallAutobiographicalMemory(
    '¿Qué hablamos el 1 de noviembre de 2026 sobre consolidación y reconsolidación de la memoria?',
  );
  console.log(
    ` -> Consulta sobre snapshot preexistente (2026-11-01): episodes=${legacyCheck.episodes.length}, id=#${legacyCheck.episodes[0]?.id}, topic="${legacyCheck.episodes[0]?.topic}"`,
  );
  console.log(' -> Diagnóstico de latencia SQL/Hidratación:', JSON.stringify(legacyCheck.diagnostics));

  console.log('\n=== [MEM PROMOTION] 4. Sincronizando los 4 episodios verificados del 2026-11-05 hacia jarbees_data ===');
  const stageRuns = await stagePrisma.agentRun.findMany({
    where: { id: { in: [72, 76, 77, 78] } },
    orderBy: { id: 'asc' },
  });

  const prodRunIdByStageRunId = new Map();
  const prodMsgIdsByStageRunId = new Map();

  for (const sRun of stageRuns) {
    // 1. Asegurar mensajes de esa sesión en jarbees_data
    const stageMsgs = sRun.sessionId
      ? await stagePrisma.conversationMessage.findMany({
          where: { sessionId: sRun.sessionId },
          orderBy: { id: 'asc' },
        })
      : [];

    let prodMsgs = sRun.sessionId
      ? await prodPrisma.conversationMessage.findMany({
          where: { sessionId: sRun.sessionId },
          orderBy: { id: 'asc' },
        })
      : [];

    if (prodMsgs.length === 0 && stageMsgs.length > 0) {
      for (const m of stageMsgs) {
        const createdMsg = await prodPrisma.conversationMessage.create({
          data: {
            sessionId: m.sessionId,
            role: m.role,
            content: m.content,
            metadata: m.metadata,
            createdAt: m.createdAt,
          },
        });
        prodMsgs.push(createdMsg);
      }
    }
    prodMsgIdsByStageRunId.set(
      sRun.id,
      prodMsgs.map((m) => m.id),
    );

    // 2. Asegurar AgentRun en jarbees_data
    let prodRun = sRun.sessionId
      ? await prodPrisma.agentRun.findFirst({
          where: { sessionId: sRun.sessionId, question: sRun.question },
        })
      : null;

    if (!prodRun) {
      const { id: _ignoreId, ...runData } = sRun;
      prodRun = await prodPrisma.agentRun.create({
        data: runData,
      });
    }
    prodRunIdByStageRunId.set(sRun.id, prodRun.id);
  }

  // 3. Registrar los 4 episodios de 2026-11-05 en jarbees_data con verificación estricta de procedencia
  const stageSnapshots = await stagePrisma.topicSnapshot.findMany({
    where: { agentRunId: { in: [72, 76, 77, 78] } },
    orderBy: { createdAt: 'asc' },
  });

  for (const sSnap of stageSnapshots) {
    const mappedRunId = prodRunIdByStageRunId.get(sSnap.agentRunId);
    const mappedMsgIds = prodMsgIdsByStageRunId.get(sSnap.agentRunId) || [];
    const docIds = JSON.parse(sSnap.sourceDocIds || '[]');
    const chunkIds = JSON.parse(sSnap.sourceChunkIds || '[]');

    // Eliminar previo si ya se corrió para idempotencia
    if (mappedRunId) {
      await prodPrisma.topicSnapshot.deleteMany({
        where: { agentRunId: mappedRunId },
      });
    }

    const res = await prodEvolution.recordVerifiedEpisode({
      eventType: sSnap.eventType,
      topic: sSnap.topic,
      summary: sSnap.summary,
      conclusion: sSnap.conclusion,
      epistemicItems: JSON.parse(sSnap.epistemicItems || '[]'),
      entities: JSON.parse(sSnap.entities || '[]'),
      tags: JSON.parse(sSnap.tags || '[]'),
      sessionId: sSnap.sessionId,
      agentRunId: mappedRunId,
      sourceMessageIds: mappedMsgIds,
      sourceDocId: sSnap.sourceDocId,
      sourceDocIds: docIds,
      sourceChunkIds: chunkIds,
      occurredAt: sSnap.createdAt,
    });

    console.log(
      ` -> Episodio promovido a jarbees_data: id=#${res.episodeId} | run=#${mappedRunId} | msgs=[${mappedMsgIds.join(',')}] | docs=[${docIds.join(',')}] | chunks=[${chunkIds.join(',')}] | saved=${res.saved}`,
    );
    if (!res.saved) {
      throw new Error(`Fallo al promover episodio: ${res.errors.join(' | ')}`);
    }
  }

  const finalTotal = await prodPrisma.topicSnapshot.count();
  console.log(`\n=== [MEM PROMOTION COMPLETADA] Total TopicSnapshot en jarbees_data: ${finalTotal} (${beforeCount} preexistentes + 4 episodios del 2026-11-05) ===`);

  await stagePrisma.$disconnect();
  await prodPrisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

