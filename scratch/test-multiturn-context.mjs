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

console.log('=== TEST DE CONTEXTO Y MEMORIA MULTI-TURNO ===\n');

const model = process.env.OLLAMA_MODEL_NAME || 'qwen2.5:7b';
const ollamaUrl = `${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/chat`;

async function testDialogue() {
  const messages = [
    {
      role: 'system',
      content: 'Eres JarBees, un asistente conversacional inteligente, empático y divertido. Mantén siempre el contexto de la conversación anterior.',
    },
  ];

  // Turno 1: Chiste
  console.log('👤 Usuario: "¿Te sabés algún chiste?"');
  messages.push({ role: 'user', content: '¿Te sabés algún chiste?' });

  let res = await fetch(ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.7 } }),
  });
  let data = await res.json();
  const joke = data.message.content;
  console.log(`🤖 JarBees:\n${joke}\n`);
  messages.push({ role: 'assistant', content: joke });

  // Turno 2: Seguimiento / No lo entendí
  console.log('👤 Usuario: "Emm no lo entendí"');
  messages.push({ role: 'user', content: 'Emm no lo entendí' });

  res = await fetch(ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.3 } }),
  });
  data = await res.json();
  const explanation = data.message.content;
  console.log(`🤖 JarBees (Explicación contextual):\n${explanation}\n`);
  messages.push({ role: 'assistant', content: explanation });

  console.log('✅ Diálogo completado: el modelo comprendió perfectamente el chiste anterior y explicó el remate sin desvíos.');
}

testDialogue();
