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

async function generateWithOllama(messages, model, maxTokens = 2500) {
  const startTime = Date.now();
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: 0.6,
        num_predict: maxTokens,
      },
    }),
  });

  const data = await res.json();
  const totalMs = Date.now() - startTime;
  const rawContent = data.message?.content || '';

  // Separar monólogo <think> de la respuesta final
  const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/i);
  const thinkContent = thinkMatch ? thinkMatch[1].trim() : '';
  const cleanAnswer = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  return {
    rawContent,
    thinkContent,
    cleanAnswer,
    totalMs,
    evalCount: data.eval_count || 0,
    promptEvalCount: data.prompt_eval_count || 0,
  };
}

async function getRelevantChunks(queryJung, queryGrinberg) {
  console.log('🔍 Recuperando evidencia documental de Jung y Grinberg desde PostgreSQL...');
  const jungVec = await getEmbedding(queryJung);
  const grinbergVec = await getEmbedding(queryGrinberg);

  // Chunks de Jung
  const jungChunks = await prisma.chunk.findMany({
    where: {
      document: {
        OR: [
          { title: { contains: 'Jung', mode: 'insensitive' } },
          { source: { contains: 'Jung', mode: 'insensitive' } }
        ]
      }
    },
    include: { document: { select: { title: true, id: true } } },
    take: 2000,
  });

  // Chunks de Grinberg
  const grinbergChunks = await prisma.chunk.findMany({
    where: {
      document: {
        OR: [
          { title: { contains: 'Grinberg', mode: 'insensitive' } },
          { source: { contains: 'Grinberg', mode: 'insensitive' } },
          { source: { contains: 'Jgz', mode: 'insensitive' } },
          { title: { contains: 'sintergica', mode: 'insensitive' } }
        ]
      }
    },
    include: { document: { select: { title: true, id: true } } },
    take: 2000,
  });

  const scoredJung = [];
  for (const c of jungChunks) {
    if (!c.metadata) continue;
    try {
      const meta = JSON.parse(c.metadata);
      if (meta.vector) {
        scoredJung.push({
          id: c.id,
          docTitle: c.document.title,
          author: 'Carl Gustav Jung',
          content: c.content,
          sim: cosineSimilarity(jungVec, meta.vector)
        });
      }
    } catch {}
  }
  scoredJung.sort((a, b) => b.sim - a.sim);
  const topJung = scoredJung.slice(0, 4);

  const scoredGrinberg = [];
  for (const c of grinbergChunks) {
    if (!c.metadata) continue;
    try {
      const meta = JSON.parse(c.metadata);
      if (meta.vector) {
        scoredGrinberg.push({
          id: c.id,
          docTitle: c.document.title,
          author: 'Jacobo Grinberg-Zylberbaum',
          content: c.content,
          sim: cosineSimilarity(grinbergVec, meta.vector)
        });
      }
    } catch {}
  }
  scoredGrinberg.sort((a, b) => b.sim - a.sim);
  const topGrinberg = scoredGrinberg.slice(0, 4);

  return [...topJung, ...topGrinberg];
}

async function main() {
  console.log('========================================================================');
  console.log('⚖️  BATERÍA DE CALIBRACIÓN EPISTEMOLÓGICA — PREGUNTA 1 DE 15');
  console.log('========================================================================');
  console.log(`• Modelo: ${REASONING_MODEL}`);
  console.log(`• Hardware: NVIDIA GeForce RTX 5070 (12 GB VRAM)`);
  console.log(`• Protocolo: Protocolo de Razonamiento Interdisciplinario JarBees\n`);

  const systemPrompt = `Sos el Motor de Razonamiento Crítico y Calibración Epistemológica de JarBees.
Tu objetivo es producir análisis rigurosos, técnicamente precisos y lógicamente consistentes.

PROTOCOLO DE RAZONAMIENTO INTERDISCIPLINARIO:
1. Prioridad factual: distingue hechos verificables, afirmaciones de los autores, interpretaciones, hipótesis y especulaciones.
2. Fidelidad documental: no inventes citas, experimentos ni atribuciones. Si una fuente no está disponible, declara esa limitación.
3. Separación de disciplinas: no supongas que conceptos que comparten vocabulario describen el mismo mecanismo.
4. Análisis lógico: identifica premisas, inferencias, conclusiones, supuestos ocultos y posibles falacias (ej. falsa equivalencia).
5. Contraste crítico: presenta explicaciones alternativas y considera evidencia que podría debilitar tu hipótesis favorita.
6. Jerarquía de evidencia: diferencia observaciones reproducibles, estudios empíricos, modelos teóricos, testimonios y especulaciones metafísicas.
7. Cruce interdisciplinario: propone conexiones entre autores cuando sean útiles, especificando si son analogías, hipótesis contrastables o relaciones respaldadas por evidencia.
8. Incertidumbre explícita: reconoce qué datos faltan, qué conclusiones son provisionales y qué resultados podrían modificar tu evaluación.
9. Corrección de errores: si detectas una contradicción, corrígela directamente y explica su efecto sobre la conclusión.
10. Resistencia a premisas falsas: evalúa las premisas de la pregunta antes de aceptarlas como verdaderas.

ESTRUCTURA DE RESPUESTA:
- Pregunta central y alcance.
- Fuentes y afirmaciones relevantes.
- Análisis de cada disciplina.
- Conexiones y diferencias conceptuales (ontológicas y epistemológicas).
- Objeciones y explicaciones alternativas.
- Evaluación de evidencia e incertidumbre.
- Conclusión proporcional a la evidencia (¿Es válido inferir que describen la misma estructura real?).
- Datos o evidencia adicional necesaria.`;

  const userQuestion = `La falsa equivalencia:
Compara el inconsciente colectivo de Carl Gustav Jung con el Lattice de Jacobo Grinberg. Identifica semejanzas conceptuales, diferencias ontológicas y diferencias en el tipo de evidencia que respalda cada propuesta. ¿Es válido inferir que ambos describen una misma estructura real? Formula la conclusión más rigurosa posible y señala qué evidencia adicional necesitarías.`;

  // -------------------------------------------------------------------------
  // PRUEBA A: SIN RAG (Conocimiento general + Protocolo)
  // -------------------------------------------------------------------------
  console.log('------------------------------------------------------------------------');
  console.log('🧪 EJECUTANDO PRUEBA A — SIN RAG (Solo Modelo + Protocolo)');
  console.log('------------------------------------------------------------------------');
  const messagesA = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuestion }
  ];
  const resultA = await generateWithOllama(messagesA, REASONING_MODEL, 3000);
  console.log(`✓ Prueba A finalizada en ${(resultA.totalMs / 1000).toFixed(1)}s (${resultA.evalCount} tokens generados)`);
  console.log(`  <think> monólogo: ${resultA.thinkContent.length} chars | Respuesta limpia: ${resultA.cleanAnswer.length} chars`);

  // -------------------------------------------------------------------------
  // PRUEBA B: CON RAG (Fragmentos documentales de PostgreSQL + Protocolo)
  // -------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('🧪 EJECUTANDO PRUEBA B — CON RAG (Fragmentos Documentales de PostgreSQL)');
  console.log('------------------------------------------------------------------------');
  const chunks = await getRelevantChunks(
    'inconsciente colectivo arquetipos instintos psique heredada suenos simbolos',
    'Lattice teoria sintergica estructura preespacial campo neuronal coherencia fisica'
  );

  console.log(`   ✓ Fragmentos seleccionados (${chunks.length}):`);
  chunks.forEach((c, idx) => {
    console.log(`     [${idx + 1}] (${c.author}) "${c.docTitle}": sim=${c.sim.toFixed(3)} | "${c.content.slice(0, 80).replace(/\n/g, ' ')}..."`);
  });

  const formattedEvidence = chunks.map((c, idx) => {
    return `[FRAGMENTO ${idx + 1}]
AUTOR: ${c.author}
OBRA: "${c.docTitle}"
TEXTO:
${c.content}
--------------------------------------------------`;
  }).join('\n\n');

  const userPromptB = `${userQuestion}

EVIDENCIA DOCUMENTAL RECUPERADA DE LA BIBLIOTECA (RAG):
${formattedEvidence}`;

  const messagesB = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPromptB }
  ];

  const resultB = await generateWithOllama(messagesB, REASONING_MODEL, 3000);
  console.log(`✓ Prueba B finalizada en ${(resultB.totalMs / 1000).toFixed(1)}s (${resultB.evalCount} tokens generados)`);
  console.log(`  <think> monólogo: ${resultB.thinkContent.length} chars | Respuesta limpia: ${resultB.cleanAnswer.length} chars`);

  // Guardar resultados para análisis
  const outputData = {
    test: 'Calibración Epistemológica — Pregunta 1: La falsa equivalencia (Jung vs Grinberg)',
    model: REASONING_MODEL,
    timestamp: new Date().toISOString(),
    pruebaA_sinRag: {
      latencyMs: resultA.totalMs,
      evalCount: resultA.evalCount,
      thinkChars: resultA.thinkContent.length,
      thinkSample: resultA.thinkContent.slice(0, 500),
      cleanAnswer: resultA.cleanAnswer,
    },
    pruebaB_conRag: {
      latencyMs: resultB.totalMs,
      evalCount: resultB.evalCount,
      chunksUsed: chunks.map(c => ({ author: c.author, docTitle: c.docTitle, sim: c.sim })),
      thinkChars: resultB.thinkContent.length,
      thinkSample: resultB.thinkContent.slice(0, 500),
      cleanAnswer: resultB.cleanAnswer,
    }
  };

  const resultsPath = path.resolve('scratch/calibration_q1_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(outputData, null, 2), 'utf8');
  console.log(`\n💾 Resultados completos guardados en: ${resultsPath}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
