const http = require('http');
const fs = require('fs');

function sendQuery(message, sessionId, code, label) {
  console.log(`\n================================================================`);
  console.log(`[HOMOLOGACIÓN ${code}] ${label}`);
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
            resolve({ code, label, prompt: message, sessionId, durationMs, durationSec, statusCode: res.statusCode, answer: json.reply || json.answer || data });
          } catch {
            resolve({ code, label, prompt: message, sessionId, durationMs, durationSec, statusCode: res.statusCode, answer: data });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const tests = [
    {
      code: 'M1',
      label: 'Fecha',
      prompt: '¿Qué investigamos el 5 de noviembre de 2026?',
    },
    {
      code: 'M2',
      label: 'Tema',
      prompt: '¿Cuándo hablamos de William Judge y qué fuentes utilizamos?',
    },
    {
      code: 'M3',
      label: 'Decisión',
      prompt: '¿Qué decidimos respecto al posible desacople entre IntentRouter y ContextSelector?',
    },
    {
      code: 'M4',
      label: 'Evolución',
      prompt: '¿Cómo evolucionó nuestra evaluación sobre el razonamiento autónomo de JarBees?',
    },
    {
      code: 'M5',
      label: 'Honestidad',
      prompt: '¿Qué decidimos el 5 de noviembre de 2025 sobre un tema del que no tenemos registros?',
    },
  ];

  const results = [];
  for (const t of tests) {
    const sessionId = `mem-homologation-${t.code.toLowerCase()}-${Date.now()}`;
    const r = await sendQuery(t.prompt, sessionId, t.code, t.label);
    console.log(`[RESPUESTA ${t.code}]:\n${r.answer}\n`);
    results.push(r);
    await new Promise((res) => setTimeout(res, 3000));
  }

  fs.writeFileSync(
    'scripts/mem-homologation-m1-m5-results.json',
    JSON.stringify(results, null, 2),
    'utf8',
  );
  console.log('\n[OK] Resultados guardados en scripts/mem-homologation-m1-m5-results.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

