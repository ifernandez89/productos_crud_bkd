import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JarvisPromptBuilderService } from '../src/jarvis/prompt/jarvis-prompt-builder.service';

async function bootstrap() {
  console.log('🚀 Iniciando verificación del pipeline completo de prompts...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const promptBuilder = app.get(JarvisPromptBuilderService);

  const query = '¿Qué opina Freud sobre los sueños?';
  console.log(`1. Construyendo contexto de RAG para la consulta: "${query}"...`);
  
  const startTime = Date.now();
  const context = await promptBuilder.buildJarvisContext(
    query,
    'session-test-id',
    false, // useMemory
    true,  // useDocuments
    10,    // maxHistoryMessages
  );
  const duration = Date.now() - startTime;

  console.log(`\n📊 Contexto construido en ${duration}ms.`);
  console.log(`- Usó documentos (usedDocs): ${context.usedDocs}`);
  
  console.log('\n--- SYSTEM PROMPT (Primeras 15 líneas y reglas críticas) ---');
  const systemLines = context.systemPrompt.split('\n');
  systemLines.slice(0, 15).forEach((line) => console.log(line));
  console.log('...');
  // Mostrar las reglas del prompt
  const rulesStartIndex = systemLines.findIndex((line) => line.includes('Reglas generales:'));
  if (rulesStartIndex !== -1) {
    console.log('\n[REGLAS GENERALES DETECTADAS]');
    systemLines.slice(rulesStartIndex, rulesStartIndex + 10).forEach((line) => console.log(line));
  }

  console.log('\n--- USER PROMPT / CONTEXTO INYECTADO (Primeros 1200 caracteres) ---');
  console.log(context.userPrompt.slice(0, 1200) + '\n...');

  await app.close();
}

bootstrap().catch((e) => console.error('❌ Error:', e));
