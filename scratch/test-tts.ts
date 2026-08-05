import { TtsService } from '../src/modules/reader/tts.service';

async function runTest() {
  console.log('--- Iniciando prueba de TtsService con sematre/orpheus:it_es-3b ---');
  const ttsService = new TtsService();

  const phrase = 'Hola, esta es una prueba de lectura sintética con JarBees y el modelo Orpheus.';
  console.log(`Texto a generar: "${phrase}"`);
  
  const startTime = Date.now();
  const buffer = await ttsService.generateAudio(phrase);
  const durationMs = Date.now() - startTime;

  console.log(`\nResultados:`);
  console.log(`- Tiempo de procesamiento: ${durationMs} ms`);
  console.log(`- Tamañodel Buffer obtenido: ${buffer.length} bytes`);
  console.log(`- Es formato WAV (Encabezado RIFF): ${buffer.toString('utf8', 0, 4) === 'RIFF'}`);
  console.log(`- Primeros 44 bytes (Header):`, buffer.subarray(0, 44));
  console.log('--- Prueba finalizada exitosamente ---');
}

runTest().catch((err) => {
  console.error('Error durante la prueba de TTS:', err);
});
