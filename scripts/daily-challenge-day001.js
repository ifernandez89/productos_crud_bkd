const http = require('http');
const fs = require('fs');

async function sendQuery(message, sessionId, title) {
  console.log(`\n================================================================`);
  console.log(`[CHALLENGE DAY 001] ${title}`);
  console.log(`[SESSION] ${sessionId}`);
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
          const durationSec = (durationMs / 1000).toFixed(2);
          console.log(`[STATUS] HTTP ${res.statusCode} (${durationMs} ms ~ ${durationSec} s)`);
          try {
            const json = JSON.parse(data);
            resolve({ durationMs, durationSec, statusCode: res.statusCode, data: json });
          } catch (e) {
            resolve({ durationMs, durationSec, statusCode: res.statusCode, raw: data });
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
  console.log('[DAY 001] Starting JARBEES — DAILY 5 MINUTE CHALLENGE');
  const results = [];

  // Tarea 1: Investigación
  {
    const id = 'DAY001_TASK1';
    const title = 'Tarea 1: Investigación (William Judge y Mesmerismo)';
    const prompt = 'Buscá en nuestra colección qué plantea William Judge sobre el mesmerismo. Identificá las fuentes utilizadas y separá lo que dice el autor de tus propias interpretaciones';
    const sessionId = `daily-day001-t1-${Date.now()}`;
    const res = await sendQuery(prompt, sessionId, title);
    const answer = res.data?.answer || res.data?.response || res.data?.directAnswer || '';
    results.push({ id, title, prompt, sessionId, statusCode: res.statusCode, durationMs: res.durationMs, durationSec: res.durationSec, answer });
    console.log(`[TASK 1 ANSWER SNIPPET]\n${answer.slice(0, 350)}...\n`);
    await sleep(3000);
  }

  // Tarea 2: Ingeniería
  {
    const id = 'DAY001_TASK2';
    const title = 'Tarea 2: Ingeniería (Arquitectura y Puntos de Fallo)';
    const prompt = 'Analizá la arquitectura actual de JarBees. Identificá un posible punto de fallo entre IntentRouter, ContextSelector y CapabilityExecutor. No modifiques código: explicá cómo comprobarías tu hipótesis';
    const sessionId = `daily-day001-t2-${Date.now()}`;
    const res = await sendQuery(prompt, sessionId, title);
    const answer = res.data?.answer || res.data?.response || res.data?.directAnswer || '';
    results.push({ id, title, prompt, sessionId, statusCode: res.statusCode, durationMs: res.durationMs, durationSec: res.durationSec, answer });
    console.log(`[TASK 2 ANSWER SNIPPET]\n${answer.slice(0, 350)}...\n`);
    await sleep(3000);
  }

  // Tarea 3: Pensamiento crítico
  {
    const id = 'DAY001_TASK3';
    const title = 'Tarea 3: Pensamiento crítico (Razonamiento vs Rendimiento)';
    const prompt = 'Hasta ahora conseguimos mejorar la recuperación RAG y la selección de capacidades. ¿Qué evidencia tenemos de que JarBees realmente está razonando mejor y qué aspectos todavía estamos confundiendo con una mejora de rendimiento?';
    const sessionId = `daily-day001-t3-${Date.now()}`;
    const res = await sendQuery(prompt, sessionId, title);
    const answer = res.data?.answer || res.data?.response || res.data?.directAnswer || '';
    results.push({ id, title, prompt, sessionId, statusCode: res.statusCode, durationMs: res.durationMs, durationSec: res.durationSec, answer });
    console.log(`[TASK 3 ANSWER SNIPPET]\n${answer.slice(0, 350)}...\n`);
  }

  fs.writeFileSync('scripts/daily-challenge-day001-results.json', JSON.stringify(results, null, 2), 'utf8');
  console.log('\n[DAY 001 COMPLETE] Results written to scripts/daily-challenge-day001-results.json');
}

run().catch((err) => {
  console.error('[DAY 001 ERROR]', err);
  process.exit(1);
});

