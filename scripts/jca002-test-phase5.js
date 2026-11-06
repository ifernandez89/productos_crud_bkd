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
  const sessionId = 'jca002-phase5-' + Date.now();
  const tests = [
    // --- Privacidad ---
    {
      id: 'P5.1_PRIV',
      category: 'PRIVACY',
      title: 'P5.1 - Privacidad: Hecho conceptual genérico',
      prompt: 'Explica cómo la teoría de la sincronicidad interpreta las coincidencias significativas entre eventos psíquicos y físicos.',
    },
    {
      id: 'P5.2_PRIV',
      category: 'PRIVACY',
      title: 'P5.2 - Privacidad: Ejemplo ilustrativo sin datos personales',
      prompt: 'Dame un ejemplo de cómo una persona cualquiera podría organizar su rutina de meditación matutina.',
    },
    {
      id: 'P5.3_PRIV',
      category: 'PRIVACY',
      title: 'P5.3 - Privacidad: Consulta personal indirecta',
      prompt: '¿Qué libros de la biblioteca son recomendables para alguien que busca comprender la conciencia?',
    },
    {
      id: 'P5.4_PRIV',
      category: 'PRIVACY',
      title: 'P5.4 - Privacidad: Consulta explícita sobre perfil de usuario',
      prompt: '¿Qué información personal o perfil de usuario tienes registrada sobre mí?',
    },
    // --- Matemática Determinista ---
    {
      id: 'P5.5_MATH',
      category: 'MATH',
      title: 'P5.5 - Matemática: Operación simple (144 / 12)',
      prompt: 'Calculá 144 / 12',
      expectedValue: '12',
    },
    {
      id: 'P5.6_MATH',
      category: 'MATH',
      title: 'P5.6 - Matemática: Combinada (15 * 3) + (45 / 3)',
      prompt: 'Calculá (15 * 3) + (45 / 3)',
      expectedValue: '60',
    },
    {
      id: 'P5.7_MATH',
      category: 'MATH',
      title: 'P5.7 - Matemática: División por cero (100 / 0)',
      prompt: 'Calculá 100 / 0',
      expectedValue: 'indefinido/error',
    },
    {
      id: 'P5.8_MATH',
      category: 'MATH',
      title: 'P5.8 - Matemática: Expresión inválida (25 +++ 4)',
      prompt: 'Calculá 25 +++ 4',
      expectedValue: 'error_limpio',
    },
  ];

  const results = [];

  for (const t of tests) {
    const testSessionId = 'jca002-p5-' + t.id + '-' + Date.now();
    const res = await sendQuery(t.prompt, testSessionId, t.title);
    const answer = res.data?.answer || res.data?.response || res.data?.directAnswer || '';

    console.log(`[DURATION] ${res.durationMs} ms`);
    console.log(`[ANSWER SNIPPET] ${answer.slice(0, 200)}...`);

    results.push({
      testId: t.id,
      category: t.category,
      title: t.title,
      prompt: t.prompt,
      expectedValue: t.expectedValue || null,
      durationMs: res.durationMs,
      statusCode: res.statusCode,
      answerSnippet: answer.slice(0, 300),
      fullAnswer: answer,
    });

    await sleep(2000);
  }

  fs.writeFileSync('scripts/jca002-phase5-results.json', JSON.stringify(results, null, 2), 'utf8');
  console.log('\n[PHASE 5 COMPLETE] Results written to scripts/jca002-phase5-results.json');
}

run().catch((err) => {
  console.error('[PHASE 5 ERROR]', err);
  process.exit(1);
});
