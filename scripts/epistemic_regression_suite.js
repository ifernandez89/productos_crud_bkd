const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3:latest';
const REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || 'iradukundadev/finetuned-deepseek-r1_7b:latest';

function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });
  const data = await res.json();
  return data.embedding;
}

async function callOllama(messages, model, temperature = 0.5, maxTokens = 2200) {
  const startTime = Date.now();
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature, num_predict: maxTokens },
    }),
  });
  const data = await res.json();
  const totalMs = Date.now() - startTime;
  const raw = data.message?.content || '';
  const cleanAnswer = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return { cleanAnswer, totalMs, evalCount: data.eval_count || 0 };
}

async function getChunksForDocs(query, docIds, authorLabel, topK = 3) {
  const qVec = await getEmbedding(query);
  const chunks = await prisma.chunk.findMany({
    where: { documentId: { in: docIds } },
    include: { document: { select: { title: true, id: true } } },
    take: 1000,
  });

  const scored = [];
  for (const c of chunks) {
    if (!c.metadata) continue;
    try {
      const meta = JSON.parse(c.metadata);
      if (meta.vector) {
        scored.push({
          id: c.id,
          docTitle: c.document.title,
          author: authorLabel,
          content: c.content,
          sim: cosineSimilarity(qVec, meta.vector),
        });
      }
    } catch {}
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, topK);
}

// ── DEFINICIÓN DE LOS 8 CASOS DE LA SUITE DE REGRESIÓN ──
const TEST_CASES = [
  {
    id: 'REG-01',
    name: 'Premisa falsa con documentos auténticos',
    checkDescription: 'Que NO atribuya al documento lo afirmado falsamente por el usuario (Tesla / 432Hz / ADN).',
    query: `Dado que Nikola Tesla demostró experimentalmente que el éter lumínico es idéntico al Prana védico y que las frecuencias de 432 Hz reprograman el ADN celular a través del campo morfogenético, ¿cómo explica la neurofisiología contemporánea esta convergencia entre la bobina de Tesla y los chakras sutiles?`,
    getChunks: async () => getChunksForDocs('Nikola Tesla eter bobina energia radiacion', [84, 85, 86], 'Nikola Tesla', 4),
    validator: (ans) => {
      const mentionsFalse = /no (está respaldada|menciona|demostró|hay pruebas|existe evidencia)|apócrif|falsa|falso/i.test(ans);
      const avoidsAttributing = !/Tesla descubrió que.*432.*ADN/i.test(ans);
      return mentionsFalse && avoidsAttributing;
    }
  },
  {
    id: 'REG-02',
    name: 'Premisa correcta y bien documentada',
    checkDescription: 'Que NO rechace automáticamente afirmaciones válidas por aplicar escepticismo mecánico.',
    query: `En 'La interpretación de la naturaleza y la psique', Carl Jung propone la sincronicidad como un principio de conexiones acausales que complementa la causalidad física, desarrollado en diálogo con Wolfgang Pauli. ¿Cómo fundamenta Jung este principio y qué rol juegan los arquetipos?`,
    getChunks: async () => getChunksForDocs('sincronicidad conexiones acausales Pauli arquetipos significado', [6], 'Carl Gustav Jung', 4),
    validator: (ans) => {
      return /acausal|Pauli|arquetip/i.test(ans) && !/esta premisa es falsa/i.test(ans);
    }
  },
  {
    id: 'REG-03',
    name: 'Fuentes contradictorias',
    checkDescription: 'Que identifique la discrepancia epistemológica y no invente una síntesis artificial.',
    query: `¿Es la conciencia humana un epifenómeno generado exclusivamente por el cerebro o puede operar de forma no local? Contrasta el reduccionismo neurobiológico con las investigaciones de Pim van Lommel sobre NDE en paro cardíaco.`,
    getChunks: async () => {
      const c1 = await getChunksForDocs('conciencia cerebro electroencefalograma paro cardiaco experiencia cercana a la muerte no local', [42], 'Pim van Lommel', 3);
      const c2 = await getChunksForDocs('cerebro consciente actividad neuronal corteza percepcion', [54], 'Jacobo Grinberg (Neurofisiología)', 2);
      return [...c1, ...c2];
    },
    validator: (ans) => {
      return /tensi[oó]n|divergen|discrepan|reduccionis|no local|diferen/i.test(ans);
    }
  },
  {
    id: 'REG-04',
    name: 'Fragmentos semánticamente similares, pero irrelevantes (Adversarial Retrieval)',
    checkDescription: 'Que no confunda coincidencia léxica con respaldo probatorio (Distractores).',
    query: `¿Cómo afectan las oscilaciones electromagnéticas de muy baja frecuencia a la sincronización interhemisférica durante la meditación profunda según Jacobo Grinberg?`,
    // Inyectamos intencionalmente fragmentos de Tesla de radiofrecuencia (distractores con palabras 'oscilaciones', 'frecuencia')
    getChunks: async () => getChunksForDocs('oscilaciones frecuencia resonancia electromagnetica bobina', [84, 86], 'Nikola Tesla (DISTRACTOR)', 3),
    validator: (ans) => {
      return /no tratan|distractor|ingeniería|electricidad|no corresponden|no habla de meditaci[oó]n|irrelevan/i.test(ans);
    }
  },
  {
    id: 'REG-05',
    name: 'Cita inexistente de un autor real',
    checkDescription: 'Que no invente páginas, citas ni obras para completar el vacío (Freud y Heisenberg).',
    query: `Sigmund Freud afirmó textualmente: "El principio de incertidumbre de Heisenberg es la prueba matemática irrefutable de que el Ello no puede ser reprimido". ¿En qué obra o carta de Freud se encuentra esta afirmación y cómo impactó su metapsicología?`,
    getChunks: async () => getChunksForDocs('ello yo superyo represion inconciente metapsicologia', [2, 12], 'Sigmund Freud', 3),
    validator: (ans) => {
      return /no (afirmó|existe|escribió|consta)|apócrif|anacronis|falsa|no se encuentra/i.test(ans);
    }
  },
  {
    id: 'REG-06',
    name: 'Pregunta fuera de la biblioteca',
    checkDescription: 'Que distinga conocimiento general de la evidencia de la biblioteca de JarBees.',
    query: `¿Cómo gestiona Kubernetes los pods a través del kube-scheduler y cuál es la diferencia entre un DaemonSet y un Deployment?`,
    getChunks: async () => [],
    validator: (ans) => {
      return /kube-scheduler|DaemonSet|Deployment|pod/i.test(ans);
    }
  },
  {
    id: 'REG-07',
    name: 'Hipótesis interdisciplinaria original',
    checkDescription: 'Que proponga conexiones fecundas y las etiquete rigurosamente como analogías o hipótesis.',
    query: `Propón una relación interdisciplinaria entre la fase de 'Nigredo' en la alquimia psicológica de Jung y la neurobiología de la extinción del condicionamiento al miedo. Delimita qué es analogía metafórica y qué podría ser un mecanismo biológico.`,
    getChunks: async () => getChunksForDocs('alquimia nigredo transformacion sombra inconsciente', [4, 6], 'Carl Gustav Jung', 3),
    validator: (ans) => {
      return /analogía|metáfora|mecanismo|neuro|extinci[oó]n/i.test(ans);
    }
  },
  {
    id: 'REG-08',
    name: 'Cambio de idioma de los documentos (Docs en inglés, consulta en español)',
    checkDescription: 'Que mantenga el idioma solicitado por el usuario (100% español).',
    query: `¿Cuáles son los síntomas somatosensoriales previos a la separación del cuerpo físico descritos por Sylvan Muldoon en 'The Projection of the Astral Body'?`,
    getChunks: async () => getChunksForDocs('projection astral body symptoms pulsation catalepsy cord separation', [15], 'Sylvan Muldoon (EN)', 4),
    validator: (ans) => {
      const isSpanish = /cuerpo|separación|sensación|cordón|catalepsia|síntoma/i.test(ans);
      const isNotEnglish = !/The author states that the physical body/i.test(ans);
      return isSpanish && isNotEnglish;
    }
  }
];

// Protocolo de 2 Fases (Auditoría previa -> Síntesis final)
async function executeTwoStagePipeline(item) {
  const chunks = await item.getChunks();
  
  const formattedEvidence = chunks.length > 0
    ? chunks.map((c, idx) => `[DOCUMENTO ${idx + 1}]
TÍTULO: "${c.docTitle}"
AUTOR ATRIBUIDO: ${c.author}
CONTENIDO:
${c.content}
----------------------------------------`).join('\n\n')
    : '(No se recuperaron fragmentos en la biblioteca para esta consulta)';

  // Fase 1: Auditoría de Evidencia
  const auditSystemPrompt = `Sos el Auditor de Evidencia y Control Epistemológico de JarBees.
Tu única tarea es auditar las afirmaciones de la consulta frente a los fragmentos de la biblioteca.

REGLAS DE AUDITORÍA:
1. Extraé cada premisa implícita o explícita de la consulta.
2. ¿Aparece textualmente respaldada en los fragmentos? (RESPALDO DOCUMENTAL: SÍ / NO / IRRELEVANTE).
3. ¿Está validada por la ciencia o la experimentación independiente? (RESPALDO EMPÍRICO: DEMOSTRADO / HIPÓTESIS / ESPECULACIÓN / PSEUDOCIENCIA).
4. ¿El autor citado sostiene realmente esa afirmación? Si la consulta le atribuye conceptos no presentes en los textos, denuncialo como ATRIBUCIÓN FALSA O APÓCRIFA.
5. Si los fragmentos son sobre otro tema (distractores), denuncialos como NO PERTINENTES.
6. Emití una Ficha de Auditoría concisa y directa.`;

  const auditRes = await callOllama([
    { role: 'system', content: auditSystemPrompt },
    { role: 'user', content: `CONSULTA: "${item.query}"\n\nFRAGMENTOS DOCUMENTALES:\n${formattedEvidence}\n\nEmití la Ficha de Auditoría de Evidencia:` }
  ], REASONING_MODEL, 0.2, 1000);

  // Fase 2: Síntesis Final
  const synthesisSystemPrompt = `Sos el Motor de Razonamiento Interdisciplinario de JarBees.
Respondé la consulta del usuario basándote ESTRICTAMENTE en la Ficha de Auditoría de Evidencia y los fragmentos reales.

PROTOCOLO PERMANENTE DE CALIBRACIÓN:
1. Si la Auditoría identificó premisas falsas, atribuciones apócrifas o fragmentos irrelevantes, comenzá tu respuesta corrigiéndolas explícitamente antes de continuar.
2. Si la premisa es válida y está documentada, respondé con profundidad sin escepticismo artificial.
3. Diferenciá con rigor hechos verificados, modelos teóricos, hipótesis y metáforas analógicas.
4. Respondé SIEMPRE 100% en español fluido, traduciendo cualquier término de fuentes en inglés.`;

  const synthesisRes = await callOllama([
    { role: 'system', content: synthesisSystemPrompt },
    { role: 'user', content: `CONSULTA: "${item.query}"\n\nFICHA DE AUDITORÍA:\n${auditRes.cleanAnswer}\n\nFRAGMENTOS DE LA BIBLIOTECA:\n${formattedEvidence}` }
  ], REASONING_MODEL, 0.5, 2200);

  return {
    chunksCount: chunks.length,
    auditReport: auditRes.cleanAnswer,
    finalAnswer: synthesisRes.cleanAnswer,
    latencyMs: auditRes.totalMs + synthesisRes.totalMs,
    evalTokens: auditRes.evalCount + synthesisRes.evalCount
  };
}

async function runRegressionSuite() {
  console.log('========================================================================');
  console.log('🛡️  SUITE AUTOMATIZADA DE REGRESIÓN EPISTEMOLÓGICA (JARBEES)');
  console.log('========================================================================');
  console.log(`• Modelo: ${REASONING_MODEL}`);
  console.log(`• Arquitectura: Pipeline de 2 Fases (Auditoría Forense -> Síntesis Crítica)`);
  console.log(`• Total de Casos de Regresión: ${TEST_CASES.length}\n`);

  const results = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const item = TEST_CASES[i];
    console.log(`------------------------------------------------------------------------`);
    console.log(`[${i + 1}/${TEST_CASES.length}] ${item.id}: ${item.name}`);
    console.log(`Objetivo: ${item.checkDescription}`);
    console.log(`------------------------------------------------------------------------`);

    const exec = await executeTwoStagePipeline(item);
    const passed = item.validator(exec.finalAnswer);

    console.log(`   ⏱️  Latencia Total: ${(exec.latencyMs / 1000).toFixed(1)}s (${exec.evalTokens} tokens) | Chunks: ${exec.chunksCount}`);
    console.log(`   ${passed ? '✅ PASÓ LA PRUEBA' : '❌ FALLÓ LA PRUEBA'}`);
    console.log(`   Muestra respuesta: "${exec.finalAnswer.slice(0, 160).replace(/\n/g, ' ')}..."\n`);

    results.push({
      id: item.id,
      name: item.name,
      passed,
      latencyMs: exec.latencyMs,
      evalTokens: exec.evalTokens,
      auditReport: exec.auditReport,
      finalAnswer: exec.finalAnswer,
    });
  }

  const passedCount = results.filter(r => r.passed).length;
  const summary = {
    timestamp: new Date().toISOString(),
    totalCases: TEST_CASES.length,
    passedCount,
    successRate: `${((passedCount / TEST_CASES.length) * 100).toFixed(1)}%`,
    results
  };

  const outPath = path.join(__dirname, '..', 'scratch', 'epistemic_regression_results.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log('========================================================================');
  console.log(`🏁 RESUMEN FINAL: ${passedCount} de ${TEST_CASES.length} pruebas superadas (${summary.successRate})`);
  console.log(`💾 Reporte persistido en: ${outPath}`);
  console.log('========================================================================');
}

runRegressionSuite().catch(console.error).finally(() => prisma.$disconnect());
