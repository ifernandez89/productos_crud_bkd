const http = require('http');
const fs = require('fs');

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
  const sessionId = 'jca002-phase2-' + Date.now();
  const tests = [
    {
      title: 'P2.1 - Conceptual "Explicame qué es la memoria"',
      prompt: 'Explicame qué es la memoria',
    },
    {
      title: 'P2.2 - Conceptual "Resumí cómo funciona la percepción"',
      prompt: 'Resumí cómo funciona la percepción',
    },
    {
      title: 'P2.3 - Conceptual "Quiero conocer la teoría de Jung"',
      prompt: 'Quiero conocer la teoría de Jung',
    },
    {
      title: 'P2.4 - Existente "Resumí el libro William Judge - El mesmerismo"',
      prompt: 'Resumí el libro William Judge - El mesmerismo',
    },
    {
      title: 'P2.5 - Inexistente "Explicá el capítulo 3 de un libro inexistente"',
      prompt: 'Explicá el capítulo 3 de un libro inexistente',
    },
    {
      title: 'P2.6 - Conceptual con palabras de título "Explicame la teoría sintérgica"',
      prompt: 'Explicame la teoría sintérgica',
    },
  ];

  const results = [];

  for (const t of tests) {
    const res = await sendQuery(t.prompt, sessionId, t.title);
    const text = res.data?.response || res.data?.directAnswer || res.data?.answer || '';
    const route = res.data?.resolvedBy || res.data?.source || res.data?.route || 'UNKNOWN';
    console.log(`[ROUTE/RESOLVED_BY] ${route}`);
    console.log(`[DURATION] ${res.durationMs} ms`);
    console.log(`[SNIPPET] ${text.slice(0, 200)}...`);
    results.push({
      test: t.title,
      prompt: t.prompt,
      statusCode: res.statusCode,
      durationMs: res.durationMs,
      route,
      responseSummary: text.slice(0, 300),
      rawResponse: res.data,
    });
    await sleep(2000);
  }

  fs.writeFileSync('scripts/jca002-phase2-results.json', JSON.stringify(results, null, 2), 'utf8');
  console.log('\n[PHASE 2 COMPLETE] Results written to scripts/jca002-phase2-results.json');
}

run().catch((err) => {
  console.error('[PHASE 2 ERROR]', err);
  process.exit(1);
});

