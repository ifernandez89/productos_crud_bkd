const http = require('http');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.staging' });

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function sendQuery(message, sessionId, title) {
  console.log(`\n================================================================`);
  console.log(`[TEST] ${title}`);
  console.log(`[PROMPT] "${message}"`);
  const startTime = Date.now();

  const payload = JSON.stringify({ message, sessionId });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4001,
        path: '/api/jarbees/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          console.log(`[STATUS] HTTP ${res.statusCode} (${durationMs} ms)`);
          try {
            const json = JSON.parse(data);
            resolve({ durationMs, statusCode: res.statusCode, data: json });
          } catch (e) {
            resolve({ durationMs, statusCode: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const sessionId = 'jca002-phase3-' + Date.now();
  const tests = [
    {
      id: 'P3.1',
      author: 'Muldoon',
      type: 'POSITIVE',
      title: 'P3.1 - Muldoon Positivo: Cordón de plata',
      prompt: '¿Qué explica Sylvan Muldoon sobre el cordón de plata y sus características durante la proyección astral?',
      expectedRag: true,
    },
    {
      id: 'P3.2',
      author: 'Judge',
      type: 'POSITIVE',
      title: 'P3.2 - Judge Positivo: Voluntad y fluido en mesmerismo',
      prompt: 'Según William Judge en El mesmerismo, ¿cuál es la relación entre la voluntad del operador y el fluido magnético?',
      expectedRag: true,
    },
    {
      id: 'P3.3',
      author: 'Zweig',
      type: 'POSITIVE',
      title: 'P3.3 - Zweig Positivo: Mesmer en Viena y París',
      prompt: '¿Cómo relata Stefan Zweig los experimentos iniciales de Franz Anton Mesmer en Viena y su posterior traslado a París?',
      expectedRag: true,
    },
    {
      id: 'P3.4',
      author: 'Erickson',
      type: 'NEGATIVE_AUTHOR',
      title: 'P3.4 - Erickson Negativo: Ausencia de libro específico de Erickson',
      prompt: 'Detalla el protocolo de tres fases para inducción hipnótica rápida según el libro de Milton Erickson de nuestra colección.',
      expectedRag: false, // May search but should not retrieve spurious chunks or hallucinate book
    },
    {
      id: 'P3.5',
      author: 'Control',
      type: 'ORTHOGONAL_NEGATIVE',
      title: 'P3.5 - Control Ortogonal: Ciclo de Carnot y termodinámica',
      prompt: 'Explica la ecuación termodinámica del ciclo de Carnot y el rendimiento máximo de una máquina térmica ideal.',
      expectedRag: false,
    },
    {
      id: 'P3.6',
      author: 'Cross-Contamination',
      type: 'CROSS_NEGATIVE',
      title: 'P3.6 - Control Cruzado: Zweig vs Cordón Astral de Judge/Muldoon',
      prompt: '¿Qué escribió Stefan Zweig sobre el cordón de plata astral según los textos teosóficos de Judge?',
      expectedRag: false, // Must not conflate Zweig with Judge/Muldoon concepts
    },
  ];

  const results = [];

  for (const t of tests) {
    const res = await sendQuery(t.prompt, sessionId, t.title);
    const answer = res.data?.answer || res.data?.response || res.data?.directAnswer || '';

    // Inspect last AgentRun from staging DB
    const lastRun = await prisma.agentRun.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    const toolsUsed = lastRun?.toolsUsed || [];
    const modelUsed = lastRun?.modelUsed || 'unknown';
    const ragUsed = toolsUsed.includes('rag') || toolsUsed.includes('dialectic_reasoning');

    console.log(`[TOOLS USED] ${JSON.stringify(toolsUsed)}`);
    console.log(`[MODEL USED] ${modelUsed}`);
    console.log(`[RAG TRIGGERED] ${ragUsed} (Expected: ${t.expectedRag})`);
    console.log(`[ANSWER SNIPPET] ${answer.slice(0, 200)}...`);

    results.push({
      testId: t.id,
      title: t.title,
      author: t.author,
      type: t.type,
      prompt: t.prompt,
      expectedRag: t.expectedRag,
      actualRag: ragUsed,
      toolsUsed,
      modelUsed,
      durationMs: res.durationMs,
      statusCode: res.statusCode,
      answerSnippet: answer.slice(0, 400),
      fullAnswer: answer,
    });

    await sleep(2500);
  }

  await prisma.$disconnect();

  fs.writeFileSync('scripts/jca002-phase3-results.json', JSON.stringify(results, null, 2), 'utf8');
  console.log('\n[PHASE 3 COMPLETE] Results written to scripts/jca002-phase3-results.json');
}

run().catch((err) => {
  console.error('[PHASE 3 ERROR]', err);
  process.exit(1);
});

