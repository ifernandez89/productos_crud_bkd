import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Cargar .env
const envPath = join(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?/);
  if (match) process.env[match[1]] = match[2].trim();
}

console.log('--- Configuración Detectada ---');
console.log('OLLAMA_CODER_MODEL:', process.env.OLLAMA_CODER_MODEL);
console.log('OLLAMA_MODEL_TEST3_NAME:', process.env.OLLAMA_MODEL_TEST3_NAME);
console.log('OLLAMA_HOST:', process.env.OLLAMA_HOST || 'http://localhost:11434');

const coderModel = process.env.OLLAMA_CODER_MODEL || 'qwen2.5-coder:7b';
const ollamaUrl = `${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/generate`;

async function runTest() {
  console.log(`\n🧪 Probando modelo coder: [${coderModel}] con una tarea simple de código...\n`);
  const prompt = `Escribe una función en TypeScript llamada 'sumArray(numbers: number[]): number' que reciba un arreglo de números y retorne la suma total. Incluye tipado estricto y un ejemplo de uso breve.`;
  
  const start = Date.now();
  try {
    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: coderModel,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 256,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const elapsed = Date.now() - start;

    console.log('--- RESPUESTA GENERADA ---');
    console.log(data.response);
    console.log('---------------------------');
    console.log(`✅ Prueba completada con éxito en ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);
    console.log(`📊 Tokens evaluados: ${data.eval_count || 'N/A'}, Velocidad: ${data.eval_count ? ((data.eval_count / (data.eval_duration / 1e9)).toFixed(1) + ' tokens/s') : 'N/A'}`);
  } catch (err) {
    console.error('❌ Error al probar el modelo:', err);
    process.exit(1);
  }
}

runTest();
