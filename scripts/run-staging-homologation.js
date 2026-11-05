const http = require('http');
const { execSync } = require('child_process');

function getVram() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader,nounits', { stdio: 'pipe' }).toString().trim();
    const [used, free] = out.split(',').map(s => s.trim());
    return { used: `${used} MiB`, free: `${free} MiB` };
  } catch (e) {
    return { used: 'N/A', free: 'N/A' };
  }
}

async function sendQuery(message, sessionId, testLabel) {
  const vramBefore = getVram();
  console.log(`\n================================================================`);
  console.log(`[TEST] ${testLabel}`);
  console.log(`[PROMPT] "${message}"`);
  console.log(`[GPU BEFORE] VRAM Used: ${vramBefore.used} | Free: ${vramBefore.free}`);
  const startTime = Date.now();

  const payload = JSON.stringify({
    message,
    sessionId,
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 4001,
      path: '/api/jarbees/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const durationMs = Date.now() - startTime;
        const vramAfter = getVram();
        console.log(`[STATUS] HTTP ${res.statusCode} (${durationMs} ms)`);
        console.log(`[GPU AFTER] VRAM Used: ${vramAfter.used} | Free: ${vramAfter.free}`);
        try {
          const json = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            durationMs,
            data: json,
            vramBefore,
            vramAfter,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            durationMs,
            raw: data,
            vramBefore,
            vramAfter,
          });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[ERROR] Request failed: ${err.message}`);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runHomologation() {
  console.log('>>> INICIANDO MATRIZ DE HOMOLOGACIÓN REAL EN STAGING (PORT 4001) <<<');
  const results = {};

  // ── T1: Conceptual Puro ───────────────────────────────────────────────────
  try {
    const r1 = await sendQuery('¿Qué es la percepción?', 'stage-session-t1-final', 'T1: Conceptual Puro (Sin RAG, Sin Tools)');
    console.log('[ANSWER]:\n', r1.data?.answer || r1.raw);
    results.T1 = r1;
  } catch (err) {
    results.T1 = { error: err.message };
  }

  await sleep(1500); // cooldown serial

  // ── T2: Anti-Secuestro Léxico (Muldoon & Carrington) ───────────────────────
  try {
    const r2 = await sendQuery('¿Qué opinas de la teoría de Muldoon y Carrington?', 'stage-session-t2-final', 'T2: Anti-Secuestro Léxico (Muldoon & Carrington)');
    console.log('[ANSWER]:\n', r2.data?.answer || r2.raw);
    results.T2 = r2;
  } catch (err) {
    results.T2 = { error: err.message };
  }

  await sleep(1500); // cooldown serial

  // ── T3: Cálculo Determinista (AST Local MathCapability) ────────────────────
  try {
    const r3 = await sendQuery('¿Cuánto es 125 * 8?', 'stage-session-t3-final', 'T3: Cálculo Determinista (Math AST)');
    console.log('[ANSWER]:\n', r3.data?.answer || r3.raw);
    results.T3 = r3;
  } catch (err) {
    results.T3 = { error: err.message };
  }

  await sleep(1500); // cooldown serial

  // ── T4: RAG Documental Explícito con Recuperación de Chunks (Muldoon) ──────
  try {
    const r4 = await sendQuery('Según mis documentos guardados sobre Muldoon y Carrington, ¿qué se dice sobre la proyección del cuerpo astral?', 'stage-session-t4-final', 'T4: RAG Documental Explícito con Recuperación');
    console.log('[ANSWER]:\n', r4.data?.answer || r4.raw);
    results.T4 = r4;
  } catch (err) {
    results.T4 = { error: err.message };
  }

  await sleep(1500); // cooldown serial

  // ── T4-B: RAG Documental sin Coincidencias (Hipnosis -> Anti-Alucinación) ──
  try {
    const r4b = await sendQuery('Según mis documentos guardados, ¿qué se dice sobre hipnosis?', 'stage-session-t4b-final', 'T4-B: RAG Documental sin Coincidencias (Anti-Alucinación)');
    console.log('[ANSWER]:\n', r4b.data?.answer || r4b.raw);
    results.T4B = r4b;
  } catch (err) {
    results.T4B = { error: err.message };
  }

  console.log('\n================================================================');
  console.log('>>> MATRIZ DE HOMOLOGACIÓN EN STAGING FINALIZADA EXITOSAMENTE <<<');
  console.log('================================================================');
}

runHomologation().catch(console.error);
