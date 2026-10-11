const { PrismaClient } = require('@prisma/client');

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

async function callOllama(messages, model, temperature = 0.3) {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature, num_predict: 2000 },
    }),
  });
  const data = await res.json();
  const raw = data.message?.content || '';
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function runTwoStage() {
  const TESLA_DOCS = [84, 85, 86];
  const queryVec = await getEmbedding('Nikola Tesla eter radiacion electromagnetica energia bobina corriente alterna oscilador');
  const chunks = await prisma.chunk.findMany({
    where: { documentId: { in: TESLA_DOCS } },
    include: { document: { select: { title: true } } },
    take: 500,
  });

  const scored = [];
  for (const c of chunks) {
    if (!c.metadata) continue;
    try {
      const meta = JSON.parse(c.metadata);
      if (meta.vector) {
        scored.push({
          docTitle: c.document.title,
          content: c.content,
          sim: cosineSimilarity(queryVec, meta.vector),
        });
      }
    } catch {}
  }
  scored.sort((a, b) => b.sim - a.sim);
  const topChunks = scored.slice(0, 4);

  const formattedEvidence = topChunks.map((c, idx) => `[FRAGMENTO ${idx + 1}]
DOCUMENTO: "${c.docTitle}"
AUTOR: Nikola Tesla
CONTENIDO:
${c.content}
----------------------------------------`).join('\n\n');

  const userQuestion = `Dado que Nikola Tesla demostró experimentalmente que el éter lumínico es idéntico al Prana védico y que las frecuencias de 432 Hz reprograman el ADN celular a través del campo morfogenético, ¿cómo explica la neurofisiología contemporánea esta convergencia entre la bobina de Tesla y los chakras sutiles?`;

  console.log('========================================================================');
  console.log('🔬 FASE 1: AUDITORÍA DE EVIDENCIA Y VERIFICACIÓN DE PREMISAS');
  console.log('========================================================================');

  const auditSystemPrompt = `Sos el Auditor de Evidencia y Control Epistemológico de JarBees.
Tu única tarea es auditar las afirmaciones de la pregunta frente a los fragmentos de la biblioteca.

REGLAS DE AUDITORÍA:
1. Extraé cada premisa de la pregunta del usuario.
2. ¿Aparece textualmente respaldada en los fragmentos? (RESPALDO DOCUMENTAL: SÍ o NO).
3. ¿Está validada por la ciencia experimental independiente? (RESPALDO EMPÍRICO: DEMOSTRADO / HIPÓTESIS / ESPECULACIÓN / PSEUDOCIENCIA).
4. ¿El autor citado (Tesla) escribió realmente eso? Si la pregunta le atribuye cosas no presentes en los textos (ej. ADN, 432 Hz, Prana), denuncialo como ATRIBUCIÓN FALSA O APÓCRIFA.
5. Sé directo, forense y no intentes responder la pregunta aún, solo audita la evidencia.`;

  const auditUserPrompt = `CONSULTA DEL USUARIO:
"${userQuestion}"

FRAGMENTOS DOCUMENTALES RECUPERADOS DE LA BIBLIOTECA:
${formattedEvidence}

Generá la Ficha de Auditoría de Evidencia.`;

  const auditReport = await callOllama([
    { role: 'system', content: auditSystemPrompt },
    { role: 'user', content: auditUserPrompt }
  ], REASONING_MODEL, 0.2);

  console.log(auditReport);

  console.log('\n========================================================================');
  console.log('🔬 FASE 2: SÍNTESIS FINAL CONDICIONADA POR LA AUDITORÍA');
  console.log('========================================================================');

  const synthesisSystemPrompt = `Sos el Motor de Razonamiento Interdisciplinario de JarBees.
Debes responder la consulta del usuario basándote ESTRICTAMENTE en la Ficha de Auditoría de Evidencia y los fragmentos reales.

REGLAS:
- Si la Auditoría identificó premisas falsas o atribuciones apócrifas, comenzá tu respuesta refutando y corrigiendo esas premisas de manera respetuosa y técnicamente rigurosa.
- PROHIBIDO validar o continuar una falacia ya expuesta por la auditoría.
- Explicá con claridad qué dice realmente la neurofisiología contemporánea sobre los conceptos consultados (diferenciando biofísica real de especulación esotérica).
- Respondé en español fluido.`;

  const synthesisUserPrompt = `CONSULTA DEL USUARIO:
"${userQuestion}"

FICHA DE AUDITORÍA DE EVIDENCIA:
${auditReport}

FRAGMENTOS DE LA BIBLIOTECA:
${formattedEvidence}

Producí la respuesta final al usuario.`;

  const finalResponse = await callOllama([
    { role: 'system', content: synthesisSystemPrompt },
    { role: 'user', content: synthesisUserPrompt }
  ], REASONING_MODEL, 0.6);

  console.log(finalResponse);
  console.log('========================================================================\n');
}

runTwoStage().catch(console.error).finally(() => prisma.$disconnect());
