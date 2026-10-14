/**
 * benchmark_dialectic_r1.js
 * Banco de pruebas de laboratorio para contrastación dialéctica profunda con Qwen3:8b / Reasoning.
 * Evalúa:
 *  - Aislamiento de premisas por autor
 *  - Detección de tensiones y contradicciones
 *  - Supresión y resumen del monólogo <think>
 *  - Control de alucinaciones contra fragmentos reales de pgvector
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { DialecticReasoningService } = require('../dist/jarvis/cognitive/dialectic-reasoning.service');
const { DocumentRepository } = require('../dist/jarvis/repositories/document.repository');
const { EmbeddingsService } = require('../dist/jarvis/library/embeddings.service');

async function main() {
  console.log('================================================================');
  console.log('🧠 BENCHMARK DE RAZONAMIENTO DIALÉCTICO: QWEN3 (8B)');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const dialecticService = app.get(DialecticReasoningService);
  const docRepo = app.get(DocumentRepository);
  const embService = app.get(EmbeddingsService);

  const query = '¿Cómo concibe Nikola Tesla la energía radiante y el éter en contraste con las enseñanzas de Sri Sankaracharya sobre la materia y Maya?';
  console.log(`📌 Consulta Dialéctica: "${query}"\n`);

  console.log('1. Recuperando fragmentos semánticos en pgvector (bge-m3)...');
  const vec = await embService.generateEmbedding(query);
  const chunks = await docRepo.searchChunksSemantic(vec, 6);

  console.log(`   ✓ Recuperados ${chunks.length} fragmentos de la base de datos.`);
  chunks.forEach((c, idx) => {
    console.log(`     • [Chunk ${c.id}] Doc: "${c.document?.title || 'Doc'}" (${c.content.slice(0, 90)}...)`);
  });

  const formattedChunks = chunks.map(c => ({
    id: c.id,
    content: c.content,
    documentTitle: c.document?.title,
    author: c.metadata?.author || c.document?.title,
  }));

  console.log('\n2. Ejecutando análisis dialéctico en DeepSeek-R1:7b (vía Ollama)...');
  const startTime = Date.now();
  const result = await dialecticService.analyzeDialecticContrasts(query, formattedChunks);
  const totalMs = Date.now() - startTime;

  console.log('\n================================================================');
  console.log('📊 RESULTADOS DEL BENCHMARK');
  console.log('================================================================');
  console.log(`• Modelo utilizado:         ${result.auditTrail.modelUsed}`);
  console.log(`• Latencia total:            ${totalMs} ms`);
  console.log(`• Caracteres de <think>:     ${result.auditTrail.rawThinkLength} chars`);
  console.log(`• Tensiones detectadas:      ${result.hasTensionsDetected ? 'SÍ (Tensiones lógicas encontradas)' : 'NO'}`);
  console.log(`• Pasos de deducción extraídos: ${result.auditTrail.deductionSteps.length}`);
  
  if (result.auditTrail.deductionSteps.length > 0) {
    console.log('\n📋 TRAZABILIDAD DEL RAZONAMIENTO (AUDITORÍA RESUMIDA):');
    result.auditTrail.deductionSteps.forEach((s, idx) => {
      console.log(`  ${idx + 1}. ${s}`);
    });
  }

  console.log('\n----------------------------------------------------------------');
  console.log('📝 RESPUESTA FINAL LIMPIA (SIN RUIDO DE MONÓLOGO INTERNO):');
  console.log('----------------------------------------------------------------');
  console.log(result.cleanMarkdownAnswer);
  console.log('\n================================================================');

  await app.close();
}

main().catch(err => {
  console.error('Error en el benchmark:', err);
  process.exit(1);
});
