/**
 * Test rápido de resolvers de modelos Ollama.
 * Verifica que cada variable de entorno se lee correctamente
 * y que los modelos responden en Ollama.
 * 
 * Uso: node scratch/test-model-resolvers.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Cargar .env manualmente (sin dependencias) ─────────────────────────────
const envPath = join(__dirname, '../.env');
const envLines = readFileSync(envPath, 'utf-8').split('\n');
for (const line of envLines) {
  const match = line.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?/);
  if (match) process.env[match[1]] = match[2].trim();
}

// ── Replicar los resolvers ─────────────────────────────────────────────────
const resolveOllamaModelName = (def = '') =>
  process.env.OLLAMA_MODEL_NAME?.trim() || process.env.OLLAMA_MODEL?.trim() || def;

const resolveIntentModel = (def = 'llama3.2:3b') => {
  const configured = process.env.OLLAMA_MODEL_TEST2_NAME?.trim();
  // reasoning models no sirven para clasificación de 1 palabra
  if (configured && !configured.includes('reasoning')) return configured;
  return def;
};

const resolveTechModel = (def = 'qwen3:4b') =>
  process.env.OLLAMA_MODEL_TEST3_NAME?.trim() || def;

// ── Mostrar resolución de modelos ──────────────────────────────────────────
console.log('=== Resolución de modelos ===');
console.log(`General (OllamaProvider):    ${resolveOllamaModelName('llama3.2:3b')}`);
console.log(`Intent router (phi4-mini):   ${resolveIntentModel()}`);
console.log(`Tech expert (qwen3):         ${resolveTechModel()}`);
console.log('');

// ── Probar cada modelo contra Ollama ──────────────────────────────────────
const OLLAMA_URL = 'http://localhost:11434/api/generate';

async function testModel(label, model, prompt) {
  process.stdout.write(`[${label}] ${model} → `);
  const start = Date.now();
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 20, temperature: 0 } }),
    });
    const data = await res.json();
    const ms = Date.now() - start;
    if (data.error) {
      console.log(`❌ Error: ${data.error}`);
    } else {
      console.log(`✅ "${data.response?.trim().slice(0, 60)}" (${ms}ms)`);
    }
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }
}

console.log('=== Ping a Ollama por modelo ===');
await testModel('General ', resolveOllamaModelName('llama3.2:3b'), 'Responde solo: OK');
await testModel('Intent  ', resolveIntentModel(),                  'Responde solo: OK');
await testModel('Tech    ', resolveTechModel(),                    'Responde solo: OK');

// ── Test real del clasificador de intents ──────────────────────────────────
console.log('\n=== Test clasificador de intents (phi4-mini) ===');
const intentModel = resolveIntentModel();

async function classifyIntent(question) {
  const prompt = `Clasificá la siguiente pregunta en UNA de estas categorías:
- LOCAL, WEB, SPORTS, RAG, TOOL, ASTROLOGY, SITE_SEARCH
Respondé SOLO con la palabra. Sin explicaciones.
Pregunta: "${question}"
Categoría:`;

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: intentModel, prompt, stream: false, think: false, options: { temperature: 0, num_predict: 20 } }),
  });
  const data = await res.json();
  const raw = (data.response ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim().toUpperCase();
  const valid = ['LOCAL', 'WEB', 'SPORTS', 'RAG', 'TOOL', 'ASTROLOGY', 'SITE_SEARCH'];
  const matched = valid.find(i => raw.startsWith(i)) ?? `❓ (raw: "${raw.slice(0, 40)}")`;
  console.log(`  "${question.slice(0, 50)}" → ${matched}`);
}

await classifyIntent('¿Cuál es la capital de Francia?');
await classifyIntent('¿Cómo está el clima en Paraná hoy?');
await classifyIntent('¿Ganó Argentina el partido de ayer?');
await classifyIntent('Dame 5 noticias de elonce');
