require('dotenv').config({ path: '.env.staging' });

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('jarbees_stage')) {
  throw new Error('CRITICAL: DATABASE_URL is not pointing to jarbees_stage!');
}

const { PrismaClient } = require('@prisma/client');
const { KnowledgeEvolutionService } = require('../dist/jarvis/memory/knowledge-evolution.service');

const prisma = new PrismaClient();

async function main() {
  const mockLlm = {
    generate: async () => ({ content: '{"topic": null}', model: 'mock', provider: 'mock', latencyMs: 1 }),
  };
  const service = new KnowledgeEvolutionService(prisma, mockLlm, mockLlm);

  console.log('=== [MEM-001 / MEM-003] 1. Verificando rechazo de episodios sin procedencia válida ===');
  const invalidCheck = await service.recordVerifiedEpisode({
    topic: 'Episodio Huérfano Falso',
    summary: 'Intento de inyectar un recuerdo sin respaldo en la base de datos',
    conclusion: 'No debe persistirse',
    epistemicItems: [{ type: 'DECISION', content: 'Decisión inventada' }],
    entities: ['Fake'],
    tags: ['fake'],
    agentRunId: 999999,
    sourceMessageIds: [888888],
    sourceDocIds: [777777],
    sourceChunkIds: [],
  });
  console.log('Resultado control negativo (esperado saved=false):', invalidCheck);
  if (invalidCheck.saved) {
    throw new Error('FALLO CRÍTICO: Se permitió guardar un episodio con procedencia inexistente.');
  }

  // Buscar mensajes reales de los AgentRuns 72, 76, 77, 78 en jarbees_stage
  const runs = await prisma.agentRun.findMany({
    where: { id: { in: [72, 76, 77, 78] } },
    orderBy: { id: 'asc' },
  });

  const runMap = new Map(runs.map((r) => [r.id, r]));
  const getMsgIdsForSession = async (sessionId) => {
    if (!sessionId) return [];
    const msgs = await prisma.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return msgs.map((m) => m.id);
  };

  const msgs72 = await getMsgIdsForSession(runMap.get(72)?.sessionId);
  const msgs76 = await getMsgIdsForSession(runMap.get(76)?.sessionId);
  const msgs77 = await getMsgIdsForSession(runMap.get(77)?.sessionId);
  const msgs78 = await getMsgIdsForSession(runMap.get(78)?.sessionId);

  // Limpiar snapshots previos de prueba de estos runs para idempotencia limpia
  await prisma.topicSnapshot.deleteMany({
    where: { agentRunId: { in: [72, 76, 77, 78] } },
  });

  const episodesToRegister = [
    // Episodio previo del día (Smoke Test T5 - Evaluación inicial de razonamiento científico y autónomo)
    {
      eventType: 'conversation_episode',
      topic: 'Evaluación inicial del razonamiento autónomo y científico de JarBees (Smoke Test)',
      summary:
        'Durante el Main Smoke Test del 5 de noviembre de 2026 se evaluó cómo JarBees diferencia entre el marco simbólico/astrológico y la evidencia científica empírica sin caer en complacencia (anti-sycophancy).',
      conclusion:
        'En la etapa inicial (Rapid Cognitive Sweep y Smoke Test), comprobamos que cuando la consulta llega por la ruta correcta, JarBees razona con rigor epistemológico y rechaza premisas falsas, aunque todavía confundíamos mejoras de enrutamiento y guardrails con razonamiento autónomo general.',
      epistemicItems: [
        {
          type: 'USER_STATEMENT',
          content:
            'Se puso a prueba si JarBees acepta una afirmación falsa por orden directa del usuario o si distingue entre tradición simbólica y evidencia empírica.',
        },
        {
          type: 'OBSERVED_FACT',
          content:
            'Tras los guardrails epistémicos (commit 3ae6c9d), JarBees superó las 8 pruebas del Main Smoke Test en staging manteniendo fronteras claras entre ciencia y simbolismo.',
        },
        {
          type: 'HYPOTHESIS',
          content:
            'Inicialmente parecía que el puntaje de 3.65/4 en el barrido cognitivo implicaba un salto en razonamiento puro.',
        },
        {
          type: 'DECISION',
          content:
            'Cerrar la etapa de auditorías masivas y pasar al desafío práctico cotidiano (DAILY 5 MINUTE CHALLENGE) para evaluar el razonamiento real.',
        },
      ],
      entities: ['JarBees', 'Razonamiento Autónomo', 'Main Smoke Test', 'Guardrails Epistémicos'],
      tags: ['razonamiento', 'autonomo', 'evaluacion', 'epistemologia', 'smoke-test'],
      sessionId: runMap.get(72)?.sessionId,
      agentRunId: 72,
      sourceMessageIds: msgs72,
      sourceDocIds: [],
      sourceChunkIds: [],
      occurredAt: runMap.get(72)?.createdAt || new Date('2026-11-05T23:45:00Z'),
    },

    // DAY 001 - Tarea 1 (Investigador: William Judge y el mesmerismo)
    {
      eventType: 'daily_challenge',
      topic: 'William Judge y el mesmerismo — fuentes y separación de interpretaciones',
      summary:
        'En la Tarea 1 del DAY 001 (5 de noviembre de 2026) se investigó en la colección documental qué plantea William Judge sobre el mesmerismo, identificando las fuentes y separando lo que dice el autor de las interpretaciones de JarBees.',
      conclusion:
        'Según el documento "William Judge - El mesmerismo" (Doc #246, chunks 56365 y 56389), Judge define el mesmerismo como un arte de influencia anterior a Anton Mesmer (conocido como hipnotismo, magnetismo o fascinación) donde el operador atrae al sujeto como un imán a la limadura de hierro y, mediante una sensitiva en trance, transmite ideas de un pensador X capaces de alterar la comprensión del sujeto pero no su convicción.',
      epistemicItems: [
        {
          type: 'USER_STATEMENT',
          content:
            'Buscá en nuestra colección qué plantea William Judge sobre el mesmerismo. Identificá las fuentes utilizadas y separá lo que dice el autor de tus propias interpretaciones.',
        },
        {
          type: 'OBSERVED_FACT',
          content:
            'Fuente documental utilizada: libro "William Judge - El mesmerismo" (Documento #246 en PostgreSQL, fragmentos vectoriales #56365 y #56389).',
        },
        {
          type: 'ASSISTANT_STATEMENT',
          content:
            'William Judge expone que el mesmerismo fue popularizado antes de Anton Mesmer bajo nombres como magnetismo, hipnotismo y fascinación, y describe el caso de la sensitiva y el pensador X.',
        },
        {
          type: 'HYPOTHESIS',
          content:
            'Interpretación propia del modelo: el mesmerismo opera como una transmisión de ideas a través de un estado alterado de conciencia donde la sensitiva actúa como intermediaria entre el operador y el sujeto.',
        },
        {
          type: 'DECISION',
          content:
            'Mantener estrictamente separadas las citas textuales del autor (OBSERVED_FACT) de las interpretaciones inferidas por el modelo (HYPOTHESIS).',
        },
        {
          type: 'OPEN_QUESTION',
          content:
            'Ampliar la detección en ContextSelectorService para frases posesivas implícitas como "de nuestra colección" cuando no inician con el verbo "Buscá".',
        },
      ],
      entities: ['William Judge', 'Anton Mesmer', 'El mesmerismo', 'Mesmerismo', 'Sensitiva'],
      tags: ['william judge', 'mesmerismo', 'fuentes', 'rag', 'day001'],
      sessionId: runMap.get(76)?.sessionId,
      agentRunId: 76,
      sourceMessageIds: msgs76,
      sourceDocId: 246,
      sourceDocIds: [246],
      sourceChunkIds: [56365, 56389],
      occurredAt: runMap.get(76)?.createdAt || new Date('2026-11-05T23:56:24.123Z'),
    },

    // DAY 001 - Tarea 2 (Ingeniero: Desacople entre IntentRouter, ContextSelector y CapabilityExecutor)
    {
      eventType: 'daily_challenge',
      topic: 'Posible desacople entre IntentRouter, ContextSelector y CapabilityExecutor',
      summary:
        'En la Tarea 2 del DAY 001 (5 de noviembre de 2026) se analizó la arquitectura cognitiva de JarBees para identificar un posible punto de fallo entre IntentRouter, ContextSelector y CapabilityExecutor sin modificar código.',
      conclusion:
        'Se identificó que cuando IntentRouter clasifica una consulta ambigua bajo una etiqueta general (como LOCAL o SPORTS), puede condicionar a ContextSelector a emitir un ContextPlan restrictivo (UNNEEDED) que desactiva capacidades legítimas como PGVECTOR_RAG.',
      epistemicItems: [
        {
          type: 'USER_STATEMENT',
          content:
            'Analizá la arquitectura actual de JarBees. Identificá un posible punto de fallo entre IntentRouter, ContextSelector y CapabilityExecutor. No modifiques código: explicá cómo comprobarías tu hipótesis.',
        },
        {
          type: 'HYPOTHESIS',
          content:
            'Hipótesis de acoplamiento: una clasificación general o estocástica en IntentRouter (ej. LOCAL) induce a ContextSelector a seleccionar un plan restrictivo que bloquea capacidades necesarias.',
        },
        {
          type: 'ASSISTANT_STATEMENT',
          content:
            'Recomendación metodológica propuesta por JarBees: comprobar primero la hipótesis sin tocar código mediante un plan experimental de 4 pasos: (1) logging estructurado correlacionado entre IntentRouter y ContextSelector, (2) análisis de divergencias donde se asignó UNNEEDED, (3) simulación de entradas sintácticas ambiguas y (4) validación de precedencia determinista.',
        },
        {
          type: 'DECISION',
          content:
            'Decisión acordada con el usuario: aprobar el criterio de no aplicar parches impulsivos de código sin telemetría previa y mantener el selector bajo observación cotidiana mientras se prioriza la Memoria Autobiográfica (MEM-001..003).',
        },
        {
          type: 'OPEN_QUESTION',
          content:
            '¿Cómo fortalecer la evaluación contextual independiente en ContextSelector sin depender ciegamente de la etiqueta previa de IntentRouter?',
        },
      ],
      entities: ['IntentRouter', 'ContextSelector', 'CapabilityExecutor', 'ContextPlan', 'JarBees'],
      tags: ['intentrouter', 'contextselector', 'capabilityexecutor', 'desacople', 'arquitectura', 'decision'],
      sessionId: runMap.get(77)?.sessionId,
      agentRunId: 77,
      sourceMessageIds: msgs77,
      sourceDocIds: [],
      sourceChunkIds: [],
      occurredAt: runMap.get(77)?.createdAt || new Date('2026-11-05T23:56:48.190Z'),
    },

    // DAY 001 - Tarea 3 (Pensador Crítico: Evolución sobre Razonamiento Autónomo vs Rendimiento)
    {
      eventType: 'daily_challenge',
      topic: 'Evaluación crítica sobre el razonamiento autónomo de JarBees frente al rendimiento',
      summary:
        'En la Tarea 3 del DAY 001 (5 de noviembre de 2026) se evaluó críticamente qué evidencia real tenemos de que JarBees razona mejor y qué aspectos estábamos confundiendo con mejoras de rendimiento e infraestructura.',
      conclusion:
        'Nuestra evaluación evolucionó desde medir aciertos superficiales hacia una distinción rigurosa: hoy tenemos evidencia demostrada de mejoras en infraestructura cognitiva (recuperación RAG precisa, gobernanza de capacidades y menor contaminación de contexto), pero reconocemos honestamente que aún NO hay evidencia definitiva de razonamiento lógico-causal autónomo ni de generación de hipótesis científicas inéditas sin apoyo en el corpus.',
      epistemicItems: [
        {
          type: 'USER_STATEMENT',
          content:
            'Hasta ahora conseguimos mejorar la recuperación RAG y la selección de capacidades. ¿Qué evidencia tenemos de que JarBees realmente está razonando mejor y qué aspectos todavía estamos confundiendo con una mejora de rendimiento?',
        },
        {
          type: 'OBSERVED_FACT',
          content:
            'Evidencia confirmada: mejoró la precisión de recuperación documental (BGE-M3 a 0.58), la selección de capacidades deterministas y la reducción de errores de enrutamiento.',
        },
        {
          type: 'ASSISTANT_STATEMENT',
          content:
            'Confundir eficiencia de recuperación y selección de herramientas con razonamiento autónomo es un error: JarBees sintetiza y contrasta muy bien el corpus, pero todavía depende del conocimiento estructurado provisto.',
        },
        {
          type: 'DECISION',
          content:
            'Distinguir en todas las evaluaciones futuras entre gobernanza/rendimiento de orquestación y razonamiento autónomo real, e implementar la Memoria Autobiográfica y Episódica (MEM-001 a MEM-003).',
        },
        {
          type: 'OPEN_QUESTION',
          content:
            '¿Cómo lograr que JarBees formule hipótesis originales y resuelva problemas causales complejos de forma autónoma cuando no existen fragmentos en el corpus?',
        },
      ],
      entities: ['JarBees', 'Razonamiento Autónomo', 'PGVECTOR_RAG', 'Gobernanza Cognitiva'],
      tags: ['razonamiento', 'autonomo', 'rendimiento', 'evaluacion', 'evolucion', 'epistemologia'],
      sessionId: runMap.get(78)?.sessionId,
      agentRunId: 78,
      sourceMessageIds: msgs78,
      sourceDocIds: [],
      sourceChunkIds: [],
      occurredAt: runMap.get(78)?.createdAt || new Date('2026-11-05T23:57:05.551Z'),
    },
  ];

  console.log('\n=== [MEM-001] 2. Registrando los 4 episodios verificados del 5 de noviembre de 2026 ===');
  for (const ep of episodesToRegister) {
    const res = await service.recordVerifiedEpisode(ep);
    console.log(` -> Episodio "${ep.topic.slice(0, 55)}..." | saved=${res.saved} | id=${res.episodeId}`);
    if (!res.saved) {
      throw new Error(`Error guardando episodio: ${res.errors.join(', ')}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

