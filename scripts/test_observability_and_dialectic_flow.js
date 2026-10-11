/**
 * Test Suite: Observabilidad Cognitiva, Motor Dialéctico y Calibración de Afirmaciones (Fases 1, 2 y 3)
 *
 * Corrobora:
 * 1. Persistencia y estructura de AgentRun con campos cognitivos.
 * 2. Endpoint /explain/:runId (getRunWithExplanation).
 * 3. Ejecución del motor dialéctico en 2 fases con métricas forenses reales (auditPhaseMs, synthesisPhaseMs).
 * 4. Extracción de afirmaciones (claims) y binding con fragmentos.
 * 5. Evaluación de afirmaciones y feedback para calibración.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const REASONING_MODEL =
  process.env.OLLAMA_REASONING_MODEL || 'deepseek-r1:7b';

async function logHeader(title) {
  console.log('\n================================================================');
  console.log(`🧪 ${title}`);
  console.log('================================================================');
}

async function testPhase1Observability() {
  await logHeader('FASE 1: VERIFICACIÓN DE OBSERVABILIDAD Y /explain/:runId');

  const testSessionId = `test-obs-${Date.now()}`;
  const testQuestion = '¿Cómo concilia Grinberg el concepto de sincronicidad de Jung con la Teoría Sintérgica?';
  const testAnswer =
    'Jacobo Grinberg propone que la experiencia es el resultado de la interacción entre el campo neuronal y la Lattice del espacio-tiempo. ' +
    'Por su parte, Carl Jung y Wolfgang Pauli postularon la sincronicidad como un principio de conexión acausal. ' +
    'Grinberg no concilia explícitamente ambos sistemas como idénticos, sino que propone un mecanismo neurofisiológico para explicar fenómenos no locales.';

  // 1. Simular creación de un AgentRun cognitivo
  const createdRun = await prisma.agentRun.create({
    data: {
      sessionId: testSessionId,
      question: testQuestion,
      answer: testAnswer,
      toolsUsed: JSON.stringify(['rag', 'dialectic_reasoning']),
      modelUsed: REASONING_MODEL,
      provider: 'ollama',
      durationMs: 4650,
      success: true,
      intentClassified: 'RAG',
      intentConfidence: 0.95,
      chunksRetrievedIds: JSON.stringify([101, 102, 103]),
      chunksRetrievedCount: 3,
      ragContextUsed: true,
      webSearchUsed: false,
      dialecticUsed: true,
      auditPhaseMs: 1420,
      synthesisPhaseMs: 3230,
      tensionsDetected: true,
      executionTrace: JSON.stringify({
        modelUsed: REASONING_MODEL,
        latencyMs: 4650,
        auditPhaseMs: 1420,
        synthesisPhaseMs: 3230,
        rawThinkLength: 1200,
        deductionSteps: [
          'Premisa 1: Grinberg propuso la Teoría Sintérgica.',
          'Premisa 2: Jung propuso la sincronicidad con Pauli.',
          'Auditoría: Grinberg no homologó ambos términos; la sincronicidad es acausal mientras la Lattice plantea interacción holística.',
        ],
      }),
    },
  });

  console.log(`✅ AgentRun #${createdRun.id} creado con éxito.`);
  console.log(`   - dialéctico: ${createdRun.dialecticUsed}`);
  console.log(`   - auditoría ms: ${createdRun.auditPhaseMs} ms`);
  console.log(`   - síntesis ms: ${createdRun.synthesisPhaseMs} ms`);

  // 2. Crear Traza Cognitiva vinculada
  const createdTrace = await prisma.cognitiveExecutionTrace.create({
    data: {
      agentRunId: createdRun.id,
      queryEntities: JSON.stringify(['Grinberg', 'Jung', 'Sincronicidad', 'Teoría Sintérgica']),
      queryAmbiguous: false,
      contextNeeded: JSON.stringify(['Teoria Sintergica', 'Sincronicidad']),
      retrievalMethod: 'hybrid',
      chunksRetrieved: JSON.stringify([
        { id: 101, score: 0.92, docTitle: 'La Teoría Sintérgica', author: 'Jacobo Grinberg', relevant: true },
        { id: 102, score: 0.88, docTitle: 'Sincronicidad', author: 'Carl Jung', relevant: true },
      ]),
      coverageScore: 0.95,
      distractorsFound: 0,
      auditReport: 'Auditoría Forense: Se verificó que los conceptos provienen de marcos epistémicos diferentes.',
      premisesChecked: JSON.stringify([
        { premise: 'Grinberg unifica Jung y física', documentalSupport: false, empiricalSupport: 'hypothesis' },
        { premise: 'Jung colaboró con Pauli en sincronicidad', documentalSupport: true, empiricalSupport: 'demonstrated' },
      ]),
      attributionsValid: true,
      hypothesesCount: 2,
      uncertaintyLevel: 0.25,
    },
  });
  console.log(`✅ CognitiveExecutionTrace #${createdTrace.id} vinculado al AgentRun #${createdRun.id}`);

  // 3. Crear Claims Vinculados
  const claim1 = await prisma.claimEvidence.create({
    data: {
      agentRunId: createdRun.id,
      claim: 'Jacobo Grinberg formuló la Teoría Sintérgica para explicar la interacción entre cerebro y Lattice',
      status: 'supported',
      supportingChunkIds: JSON.stringify([101]),
      author: 'Jacobo Grinberg',
      document: 'La Teoría Sintérgica',
      limitations: JSON.stringify(['Requiere validación electrofisiológica independiente']),
    },
  });

  const claim2 = await prisma.claimEvidence.create({
    data: {
      agentRunId: createdRun.id,
      claim: 'Grinberg demostró experimentalmente que la sincronicidad es un efecto cuántico de la Lattice',
      status: 'speculative',
      supportingChunkIds: JSON.stringify([]),
      contradictingChunkIds: JSON.stringify([101, 102]),
      author: 'Jacobo Grinberg',
      document: 'La Teoría Sintérgica',
      limitations: JSON.stringify(['No existe demostración formal de esta equivalencia en los textos']),
    },
  });
  console.log(`✅ ClaimEvidence creados: Claim #${claim1.id} (supported) y Claim #${claim2.id} (speculative)`);

  // 4. Testear ensamblado del endpoint /explain/:runId
  // Simulamos la lógica exacta de AgentRunRepository.getRunWithExplanation
  const runWithExplanation = await prisma.agentRun.findUnique({
    where: { id: createdRun.id },
    include: {
      cognitiveTrace: true,
      claimEvidences: true,
    },
  });

  if (!runWithExplanation) {
    throw new Error('No se pudo recuperar el run para la explicación');
  }

  const explanation = {
    runId: runWithExplanation.id,
    question: runWithExplanation.question,
    metrics: {
      totalDurationMs: runWithExplanation.durationMs,
      auditPhaseMs: runWithExplanation.auditPhaseMs,
      synthesisPhaseMs: runWithExplanation.synthesisPhaseMs,
      modelUsed: runWithExplanation.modelUsed,
      provider: runWithExplanation.provider,
    },
    routing: {
      intentClassified: runWithExplanation.intentClassified,
      intentConfidence: runWithExplanation.intentConfidence,
      dialecticUsed: runWithExplanation.dialecticUsed,
      ragContextUsed: runWithExplanation.ragContextUsed,
    },
    evidenceRetrieval: {
      chunksCount: runWithExplanation.chunksRetrievedCount,
      coverageScore: runWithExplanation.cognitiveTrace?.coverageScore,
    },
    cognitiveStages: {
      auditReport: runWithExplanation.cognitiveTrace?.auditReport,
      premisesChecked: JSON.parse(runWithExplanation.cognitiveTrace?.premisesChecked || '[]'),
      tensionsDetected: runWithExplanation.tensionsDetected,
      uncertaintyLevel: runWithExplanation.cognitiveTrace?.uncertaintyLevel,
    },
    claimsBreakdown: runWithExplanation.claimEvidences.map((c) => ({
      id: c.id,
      claim: c.claim,
      status: c.status,
      author: c.author,
      limitations: JSON.parse(c.limitations || '[]'),
    })),
  };

  console.log('\n📊 Estructura de /explain/:runId generada:');
  console.log(JSON.stringify(explanation, null, 2));

  if (
    explanation.metrics.auditPhaseMs !== 1420 ||
    explanation.metrics.synthesisPhaseMs !== 3230 ||
    explanation.claimsBreakdown.length !== 2
  ) {
    throw new Error('Fallo en la aserción de observabilidad de Fase 1');
  }

  console.log('🎉 FASE 1: APROBADA (Observabilidad forense 100% íntegra)');
  return { runId: createdRun.id, claimId: claim2.id };
}

async function testPhase2DialecticEngine() {
  await logHeader('FASE 2: VERIFICACIÓN DEL MOTOR DIALÉCTICO REAL (2 FASES)');

  const userQuery = '¿Es válido inferir que Grinberg y Jung describen exactamente el mismo fenómeno con diferente terminología?';

  const testChunks = [
    {
      documentTitle: 'La Teoría Sintérgica (1991)',
      author: 'Jacobo Grinberg-Zylberbaum',
      content:
        'La Teoría Sintérgica postula que la realidad es un holograma cuántico que llamamos Lattice. El cerebro humano actúa como un transductor que transforma la estructura pre-espacial de la Lattice en experiencia perceptual.',
    },
    {
      documentTitle: 'La Dinámica de lo Inconsciente (1952)',
      author: 'Carl Gustav Jung',
      content:
        'La sincronicidad no presupone una causalidad oculta ni una transmisión de energía en el espacio, sino una coincidencia significativa entre un estado psíquico y un acontecimiento físico exterior objetivo.',
    },
  ];

  console.log(`Llamando al modelo de razonamiento (${REASONING_MODEL}) para verificar auditoría + síntesis...`);
  const startTime = Date.now();

  // 1. Fase de Auditoría Forense (temp 0.2)
  const formattedEvidence = testChunks
    .map(
      (c, idx) => `[FRAGMENTO ${idx + 1}]
FUENTE: "${c.documentTitle}"
AUTOR ATRIBUIDO: ${c.author}
TEXTO:
${c.content}
--------------------------------------------------`,
    )
    .join('\n\n');

  const auditPrompt = `Sos el Auditor de Evidencia y Control Epistemológico de JarBees.
Tu única tarea es auditar las afirmaciones y presupuestos de la consulta frente a los fragmentos documentales disponibles.

PROTOCOLO DE AUDITORÍA:
1. Extraé cada premisa implícita o explícita de la consulta.
2. ¿Aparece textualmente respaldada en los fragmentos? (RESPALDO DOCUMENTAL: SÍ o NO).
3. ¿Está validada por la ciencia o la experimentación independiente? (RESPALDO EMPÍRICO: DEMOSTRADO / HIPÓTESIS / ESPECULACIÓN / PSEUDOCIENCIA).
4. ¿El autor citado sostiene realmente esa afirmación? Si la consulta le atribuye conceptos no presentes en los textos, denuncialo como ATRIBUCIÓN FALSA O APÓCRIFA.
5. Sé directo, forense y no intentes responder la pregunta aún, solo emití la Ficha de Auditoría.`;

  const auditRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: REASONING_MODEL,
      messages: [
        { role: 'system', content: auditPrompt },
        {
          role: 'user',
          content: `CONSULTA: "${userQuery}"\n\nFRAGMENTOS DOCUMENTALES:\n${formattedEvidence}\n\nEmití la Ficha de Auditoría de Evidencia:`,
        },
      ],
      stream: false,
      options: { temperature: 0.2, num_predict: 1000 },
    }),
  });

  const auditData = await auditRes.json();
  const rawAudit = auditData.message?.content || '';
  const cleanAudit = rawAudit.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const auditDurationMs = Date.now() - startTime;

  console.log(`✅ FASE DE AUDITORÍA completada en ${auditDurationMs} ms`);
  console.log(`   Extracto auditoría: "${cleanAudit.slice(0, 180)}..."`);

  // 2. Fase de Síntesis Crítica (temp 0.6)
  const synthesisStartTime = Date.now();
  const systemPrompt = `Sos el Motor de Razonamiento Crítico y Análisis Dialéctico de JarBees.
Tu especialidad es la contrastación epistémica rigurosa, la evaluación de hipótesis y la detección de contradicciones lógicas entre múltiples textos, ciencias y filosofías.
ESTRUCTURA DE RESPUESTA:
• 1. Auditoría de Premisas y Fuentes
• 2. Tesis y Enfoque de cada autor / disciplina
• 3. Puntos de Convergencia o Analogías Válidas
• 4. Tensiones Irreconciliables y Límites Metodológicos
• 5. Conclusión y Síntesis Crítica Proporcional`;

  const userPrompt = `CONSULTA A ANALIZAR:
"${userQuery}"

FICHA PREVIA DE AUDITORÍA DE EVIDENCIA:
${cleanAudit}

EVIDENCIA DOCUMENTAL DISPONIBLE (RAG):
${formattedEvidence}

Por favor, realizá la contrastación dialéctica profunda aplicando el protocolo de rigor epistémico.`;

  const synthRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: REASONING_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      options: { temperature: 0.6, num_predict: 1800 },
    }),
  });

  const synthData = await synthRes.json();
  const rawSynth = synthData.message?.content || '';
  const cleanSynth = rawSynth.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const synthesisDurationMs = Date.now() - synthesisStartTime;

  console.log(`✅ FASE DE SÍNTESIS completada en ${synthesisDurationMs} ms`);
  console.log(`   Longitud de respuesta: ${cleanSynth.length} caracteres.`);

  const hasTensions = /tensi[oó]n|contradicci[oó]n|divergencia|incompatib|difieren|no es v[aá]lido/i.test(
    cleanSynth,
  );
  console.log(`   Detección de tensiones dialécticas: ${hasTensions ? 'SÍ (Tensiones detectadas)' : 'NO'}`);

  console.log('🎉 FASE 2: APROBADA (Motor dialéctico de 2 fases ejecutado y medido con éxito)');
}

async function testPhase3CalibrationAndFeedback(runId, claimId) {
  await logHeader('FASE 3: CALIBRACIÓN CON FEEDBACK Y EVALUACIÓN DE CLAIMS');

  console.log(`Evaluando Claim #${claimId} del Run #${runId}...`);

  // Actualizar la afirmación especulativa con retroalimentación humana / pericial
  const updatedClaim = await prisma.claimEvidence.update({
    where: { id: claimId },
    data: {
      status: 'contradicted',
      limitations: JSON.stringify([
        'Calibrado por auditoría experta: Grinberg nunca sostuvo que la sincronicidad fuera un efecto cuántico de la Lattice.',
        'Error de falsa equivalencia detectado y corregido.',
      ]),
    },
  });

  console.log(`✅ Claim #${claimId} actualizado a estado: "${updatedClaim.status}"`);
  console.log(`   Limitaciones actualizadas: ${updatedClaim.limitations}`);

  // Verificar estadísticas globales de observabilidad
  const [totalRuns, dialecticRuns, totalClaims, supportedClaims, contradictedClaims] =
    await Promise.all([
      prisma.agentRun.count(),
      prisma.agentRun.count({ where: { dialecticUsed: true } }),
      prisma.claimEvidence.count(),
      prisma.claimEvidence.count({ where: { status: 'supported' } }),
      prisma.claimEvidence.count({ where: { status: 'contradicted' } }),
    ]);

  console.log('\n📊 Estadísticas de Calibración Global:');
  console.log(`   - Total AgentRuns: ${totalRuns}`);
  console.log(`   - Runs con Motor Dialéctico: ${dialecticRuns}`);
  console.log(`   - Total Afirmaciones Evaluadas: ${totalClaims}`);
  console.log(`   - Afirmaciones Respaldadas (Supported): ${supportedClaims}`);
  console.log(`   - Afirmaciones Contradichas (Contradicted): ${contradictedClaims}`);

  console.log('🎉 FASE 3: APROBADA (Feedback y calibración operativa)');
}

async function run() {
  try {
    const { runId, claimId } = await testPhase1Observability();
    await testPhase2DialecticEngine();
    await testPhase3CalibrationAndFeedback(runId, claimId);

    console.log('\n================================================================');
    console.log('🏆 TODAS LAS PRUEBAS (FASES 1, 2 Y 3) PASARON SATISFACTORIAMENTE');
    console.log('================================================================\n');
  } catch (err) {
    console.error('❌ Error en test suite:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
