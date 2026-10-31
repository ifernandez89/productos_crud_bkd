const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { JarvisService } = require('../dist/jarvis/jarvis.service');

const TARGET_QUESTIONS = [
  { id: 9, block: '2. Tiempo, calendario y geografía', q: '¿Cuántos días faltan para terminar el año?', expected: 'DateMathTool determinista' },
  { id: 12, block: '2. Tiempo, calendario y geografía', q: 'Si hoy es sábado, ¿qué fecha será dentro de 45 días?', expected: 'DateMathTool proyección determinista' },
  { id: 15, block: '3. Clima y meteorología', q: '¿Hay probabilidades de lluvia durante las próximas 24 horas?', expected: 'WeatherTool con precipitación horaria 24h' },
  { id: 18, block: '3. Clima y meteorología', q: '¿Cómo se forma un frente frío y qué cambios produce en el clima?', expected: 'Explicación física/meteorológica LLM (LOCAL)' },
  { id: 21, block: '4. Astronomía y astrología', q: '¿Hay conjunciones, oposiciones o eventos astronómicos destacados próximamente?', expected: 'AstrologyTool / VSOP87' },
  { id: 25, block: '5. Ciencia y física', q: '¿Qué es la energía y cuáles son sus principales formas?', expected: 'Concepto físico/científico LLM (LOCAL)' },
  { id: 26, block: '5. Ciencia y física', q: '¿Cuál es la diferencia entre masa, peso y gravedad?', expected: 'Física fundamental LLM (LOCAL sin dialéctica pesada)' },
];

const OUTPUT_PATH = path.resolve(__dirname, '..', 'benchmark_calibration_60.json');

async function run() {
  console.log('=== VERIFICACIÓN FOCALIZADA DE 7 PREGUNTAS CALIBRADAS ===');
  
  let existingResults = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existingResults = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
      console.log(`Leídos ${Object.keys(existingResults).length} registros previos de benchmark_calibration_60.json`);
    } catch (err) {
      console.warn('Error leyendo benchmark anterior:', err.message);
    }
  }

  console.log('Inicializando contexto NestJS...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const jarvis = app.get(JarvisService);
  console.log('JarBees listo. Ejecutando pruebas serialmente...\n');

  for (const item of TARGET_QUESTIONS) {
    console.log(`\n--------------------------------------------------`);
    console.log(`▶ [Q${item.id}] ${item.q}`);
    console.log(`  Esperado: ${item.expected}`);
    const t0 = Date.now();
    try {
      const answer = await jarvis.query(item.q, { provider: 'gateway' });
      const durationMs = Date.now() - t0;
      console.log(`  Latencia: ${durationMs} ms`);
      console.log(`  Respuesta:\n${answer}\n`);

      existingResults[String(item.id)] = {
        id: item.id,
        block: item.block,
        question: item.q,
        expected: item.expected,
        answer: answer,
        durationMs,
        timestamp: new Date().toISOString(),
        success: true
      };
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existingResults, null, 2), 'utf8');
    } catch (err) {
      const durationMs = Date.now() - t0;
      console.error(`  ERROR (${durationMs} ms):`, err.message);
    }
    // Pequeño descanso
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n==================================================');
  console.log('Verificación completada. benchmark_calibration_60.json actualizado.');
  await app.close();
  console.log('Teardown exitoso.');
}

run().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

