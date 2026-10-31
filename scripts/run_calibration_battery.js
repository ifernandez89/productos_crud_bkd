const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { JarvisService } = require('../dist/jarvis/jarvis.service');

const QUESTIONS = [
  // 1. Contexto personal y memoria
  { id: 1, block: '1. Contexto personal y memoria', q: '¿Qué sabes sobre mí?', expected: 'Memoria personal + RAG' },
  { id: 2, block: '1. Contexto personal y memoria', q: '¿Quién soy y a qué me dedico?', expected: 'Memoria personal + RAG' },
  { id: 3, block: '1. Contexto personal y memoria', q: '¿Cuáles son mis principales intereses y áreas de investigación?', expected: 'Memoria personal + RAG' },
  { id: 4, block: '1. Contexto personal y memoria', q: '¿Qué proyectos personales estoy desarrollando actualmente?', expected: 'Memoria personal + RAG' },
  { id: 5, block: '1. Contexto personal y memoria', q: '¿Qué características tiene mi computadora y qué capacidad de hardware posee?', expected: 'Memoria personal + Hardware context' },
  { id: 6, block: '1. Contexto personal y memoria', q: '¿Qué cosas no sabes sobre mí y qué información necesitarías para conocerme mejor?', expected: 'Límites explícitos / Epistemología' },

  // 2. Tiempo, calendario y geografía
  { id: 7, block: '2. Tiempo, calendario y geografía', q: '¿Qué día es hoy y qué hora local tenemos?', expected: 'Servicio temporal' },
  { id: 8, block: '2. Tiempo, calendario y geografía', q: '¿En qué estación del año estamos actualmente en Argentina?', expected: 'Cálculo estacional hemisferio sur' },
  { id: 9, block: '2. Tiempo, calendario y geografía', q: '¿Cuántos días faltan para terminar el año?', expected: 'Cálculo temporal exacto' },
  { id: 10, block: '2. Tiempo, calendario y geografía', q: '¿Qué diferencia horaria existe entre Argentina y Japón?', expected: 'Cálculo de husos horarios' },
  { id: 11, block: '2. Tiempo, calendario y geografía', q: '¿Cuáles son las principales características geográficas de Paraná, Entre Ríos?', expected: 'Geografía regional' },
  { id: 12, block: '2. Tiempo, calendario y geografía', q: 'Si hoy es sábado, ¿qué fecha será dentro de 45 días?', expected: 'Cálculo temporal' },

  // 3. Clima y meteorología
  { id: 13, block: '3. Clima y meteorología', q: '¿Cómo está el clima actualmente en mi ubicación?', expected: 'API meteorológica' },
  { id: 14, block: '3. Clima y meteorología', q: '¿Cuál es la temperatura actual y cuál es la sensación térmica?', expected: 'API meteorológica' },
  { id: 15, block: '3. Clima y meteorología', q: '¿Hay probabilidades de lluvia durante las próximas 24 horas?', expected: 'API meteorológica / Pronóstico' },
  { id: 16, block: '3. Clima y meteorología', q: '¿Qué diferencias existen entre humedad relativa, punto de rocío y presión atmosférica?', expected: 'Explicación física/meteorológica' },
  { id: 17, block: '3. Clima y meteorología', q: '¿Qué condiciones meteorológicas pueden anticipar una tormenta eléctrica?', expected: 'Explicación científica' },
  { id: 18, block: '3. Clima y meteorología', q: '¿Cómo se forma un frente frío y qué cambios produce en el clima?', expected: 'Explicación meteorológica' },

  // 4. Astronomía y astrología
  { id: 19, block: '4. Astronomía y astrología', q: '¿Qué planetas pueden observarse actualmente desde Argentina?', expected: 'Efemérides astronómicas VSOP87' },
  { id: 20, block: '4. Astronomía y astrología', q: '¿Qué fases lunares tenemos y cuándo será la próxima luna llena?', expected: 'Efemérides astronómicas' },
  { id: 21, block: '4. Astronomía y astrología', q: '¿Hay conjunciones, oposiciones o eventos astronómicos destacados próximamente?', expected: 'Motor astronómico de aspectos' },
  { id: 22, block: '4. Astronomía y astrología', q: '¿Qué diferencia existe entre una conjunción astronómica y una conjunción astrológica?', expected: 'Diferenciación epistemológica' },
  { id: 23, block: '4. Astronomía y astrología', q: '¿Qué aspectos planetarios relevantes existen actualmente desde una perspectiva astrológica?', expected: 'Aspectos astrológicos calculados' },
  { id: 24, block: '4. Astronomía y astrología', q: '¿Qué diferencia hay entre astrología tropical, sideral y astronomía científica?', expected: 'Diferenciación epistemológica y astronómica' },

  // 5. Ciencia y física
  { id: 25, block: '5. Ciencia y física', q: '¿Qué es la energía y cuáles son sus principales formas?', expected: 'Conceptos científicos' },
  { id: 26, block: '5. Ciencia y física', q: '¿Cuál es la diferencia entre masa, peso y gravedad?', expected: 'Física fundamental' },
  { id: 27, block: '5. Ciencia y física', q: '¿Cómo funciona el electromagnetismo?', expected: 'Física clásica y unificación' },
  { id: 28, block: '5. Ciencia y física', q: '¿Qué es la mecánica cuántica y por qué resulta diferente de la física clásica?', expected: 'Física cuántica' },
  { id: 29, block: '5. Ciencia y física', q: '¿Qué sabemos actualmente sobre la composición y expansión del universo?', expected: 'Cosmología moderna' },
  { id: 30, block: '5. Ciencia y física', q: '¿Qué diferencia existe entre una teoría científica, una hipótesis y una especulación?', expected: 'Epistemología de la ciencia' },

  // 6. Tecnología e informática
  { id: 31, block: '6. Tecnología e informática', q: '¿Qué diferencia existe entre CPU, GPU, RAM y almacenamiento?', expected: 'Arquitectura de computadoras' },
  { id: 32, block: '6. Tecnología e informática', q: '¿Cómo funciona un modelo de inteligencia artificial basado en redes neuronales?', expected: 'Deep learning' },
  { id: 33, block: '6. Tecnología e informática', q: '¿Qué diferencias existen entre un LLM local y uno ejecutado en la nube?', expected: 'Arquitectura de LLMs y privacidad' },
  { id: 34, block: '6. Tecnología e informática', q: '¿Qué es RAG y qué problemas intenta resolver?', expected: 'Retrieval Augmented Generation' },
  { id: 35, block: '6. Tecnología e informática', q: '¿Qué diferencias existen entre una API, un servidor y una base de datos?', expected: 'Sistemas distribuidos' },
  { id: 36, block: '6. Tecnología e informática', q: '¿Cuáles son las principales limitaciones actuales de los agentes autónomos de inteligencia artificial?', expected: 'Estado del arte en IA' },

  // 7. Energía y electrónica
  { id: 37, block: '7. Energía y electrónica', q: '¿Qué diferencia existe entre voltaje, corriente, resistencia y potencia?', expected: 'Leyes de Ohm y Joule' },
  { id: 38, block: '7. Energía y electrónica', q: '¿Qué significa que una batería tenga 12 V y 60 Ah?', expected: 'Almacenamiento electroquímico y cálculo' },
  { id: 39, block: '7. Energía y electrónica', q: '¿Cómo funciona una fuente de alimentación ATX?', expected: 'Electrónica de potencia conmutada' },
  { id: 40, block: '7. Energía y electrónica', q: '¿Qué diferencias existen entre corriente continua y corriente alterna?', expected: 'Ingeniería eléctrica' },
  { id: 41, block: '7. Energía y electrónica', q: '¿Cómo funciona un panel solar fotovoltaico?', expected: 'Efecto fotoeléctrico y semiconductores' },
  { id: 42, block: '7. Energía y electrónica', q: '¿Qué tecnologías existen para almacenar energía y cuáles son sus ventajas y limitaciones?', expected: 'Sistemas de almacenamiento energético' },

  // 8. Historia, arqueología y cultura
  { id: 43, block: '8. Historia, arqueología y cultura', q: '¿Cuáles fueron las principales civilizaciones de la antigüedad?', expected: 'Historia antigua comparada' },
  { id: 44, block: '8. Historia, arqueología y cultura', q: '¿Qué sabemos sobre la construcción de las pirámides de Egipto?', expected: 'Evidencia arqueológica vs mitos' },
  { id: 45, block: '8. Historia, arqueología y cultura', q: '¿Qué importancia tuvo Göbekli Tepe para nuestra comprensión de la prehistoria?', expected: 'Arqueología del Neolítico' },
  { id: 46, block: '8. Historia, arqueología y cultura', q: '¿Qué diferencias existen entre arqueología, antropología e historia?', expected: 'Metodología de ciencias sociales' },
  { id: 47, block: '8. Historia, arqueología y cultura', q: '¿Qué evidencias existen sobre las antiguas rutas comerciales entre civilizaciones?', expected: 'Historia económica y arqueología' },
  { id: 48, block: '8. Historia, arqueología y cultura', q: '¿Cómo podemos distinguir un descubrimiento arqueológico auténtico de una interpretación pseudohistórica?', expected: 'Método científico y arqueología crítica' },

  // 9. Biología y naturaleza
  { id: 49, block: '9. Biología y naturaleza', q: '¿Cómo funciona la fotosíntesis?', expected: 'Bioquímica celular' },
  { id: 50, block: '9. Biología y naturaleza', q: '¿Cómo se produce la evolución de las especies?', expected: 'Selección natural y genética' },
  { id: 51, block: '9. Biología y naturaleza', q: '¿Cuánto vive una abeja y qué factores determinan su esperanza de vida?', expected: 'Entomología y ecología' },
  { id: 52, block: '9. Biología y naturaleza', q: '¿Cómo se orientan las aves migratorias?', expected: 'Magnetorrecepción y navegación animal' },
  { id: 53, block: '9. Biología y naturaleza', q: '¿Qué importancia tienen los hongos en los ecosistemas?', expected: 'Micología y ciclos biogeoquímicos' },
  { id: 54, block: '9. Biología y naturaleza', q: '¿Qué diferencias existen entre virus, bacterias y células?', expected: 'Biología molecular y microbiología' },

  // 10. Razonamiento y pensamiento crítico
  { id: 55, block: '10. Razonamiento y pensamiento crítico', q: 'Si un dispositivo consume 100 W durante 5 horas, ¿cuánta energía utiliza?', expected: 'Cálculo exacto (500 Wh / 0.5 kWh)' },
  { id: 56, block: '10. Razonamiento y pensamiento crítico', q: 'Si una batería almacena 500 Wh y un dispositivo consume 100 W, ¿cuánto tiempo podría alimentarlo idealmente?', expected: 'Cálculo exacto (5 horas)' },
  { id: 57, block: '10. Razonamiento y pensamiento crítico', q: 'Si dos fenómenos ocurren simultáneamente, ¿significa necesariamente que uno causó el otro?', expected: 'Falacia cum hoc ergo propter hoc' },
  { id: 58, block: '10. Razonamiento y pensamiento crítico', q: '¿Cómo investigarías una afirmación científica que parece contradecir el conocimiento establecido?', expected: 'Metodología de validación científica' },
  { id: 59, block: '10. Razonamiento y pensamiento crítico', q: 'Si dos fuentes confiables presentan información contradictoria, ¿cómo determinarías cuál es más precisa?', expected: 'Crítica de fuentes y contraste' },
  { id: 60, block: '10. Razonamiento y pensamiento crítico', q: 'Si no tienes suficiente información para responder una pregunta, ¿cómo deberías proceder?', expected: 'Reconocimiento de límites / Honestidad epistémica' }
];

const OUTPUT_PATH = path.resolve('benchmark_calibration_60.json');

async function run() {
  console.log('=== BATERÍA DE CALIBRACIÓN GENERAL DE JARBEES (60 PREGUNTAS) ===');
  console.log(`Fecha de ejecución: ${new Date().toISOString()}`);

  // 1. Cargar cache existente
  let results = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      results = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
      console.log(`Cache en disco detectado: ${Object.keys(results).length} preguntas ya registradas.`);
    } catch (err) {
      console.warn('Error leyendo cache anterior, iniciando nuevo:', err.message);
      results = {};
    }
  }

  // 2. Inicializar contexto NestJS
  console.log('Inicializando contexto de JarBees (AppModule)...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const jarvis = app.get(JarvisService);
  console.log('JarBees listo. Iniciando ejecución serial de preguntas...\n');

  const isValidResult = (item) => {
    const r = results[item.id];
    return r && r.success && !r.answer.startsWith('ERROR') && !r.answer.includes('Data Privacy Gate');
  };

  const pendingQuestions = QUESTIONS.filter(item => !isValidResult(item));
  console.log(`Preguntas pendientes por evaluar: ${pendingQuestions.length} de ${QUESTIONS.length}`);

  let successCount = 0;
  let failCount = 0;

  for (const item of QUESTIONS) {
    if (isValidResult(item)) {
      console.log(`[Q${String(item.id).padStart(2, '0')}/60] [CACHE] ${item.block} | "${item.q.slice(0, 40)}..." -> (${results[item.id].durationMs}ms)`);
      continue;
    }

    const t0 = Date.now();
    try {
      // Ejecutar consulta contra JarBees
      const answer = await jarvis.query(item.q, {
        provider: 'gateway',
      });
      const durationMs = Date.now() - t0;

      // Guardar incrementalmente en disco
      results[item.id] = {
        id: item.id,
        block: item.block,
        question: item.q,
        expected: item.expected,
        answer: answer,
        durationMs,
        timestamp: new Date().toISOString(),
        success: true
      };
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');

      successCount++;
      const preview = answer.replace(/\r?\n|\r/g, ' ').slice(0, 75);
      console.log(`[Q${String(item.id).padStart(2, '0')}/60] [OK] (${durationMs}ms) ${item.q.slice(0, 35)}... -> "${preview}..."`);
    } catch (err) {
      const durationMs = Date.now() - t0;
      results[item.id] = {
        id: item.id,
        block: item.block,
        question: item.q,
        expected: item.expected,
        answer: `ERROR: ${err.message}`,
        durationMs,
        timestamp: new Date().toISOString(),
        success: false,
        error: err.message
      };
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');

      failCount++;
      console.error(`[Q${String(item.id).padStart(2, '0')}/60] [FAIL] (${durationMs}ms) ${item.q.slice(0, 35)}... -> Error: ${err.message}`);
    }

    // Pequeño respiro serial para estabilidad de VRAM
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== EJECUCIÓN COMPLETADA ===');
  console.log(`Total procesadas en esta ronda: ${successCount} exitosas, ${failCount} fallidas.`);
  console.log(`Total en cache final: ${Object.keys(results).length} de 60.`);
  console.log(`Resultados persistidos en: ${OUTPUT_PATH}`);

  // Teardown limpio obligatorio
  await app.close();
  console.log('Teardown completado exitosamente.');
}

run().catch(err => {
  console.error('Error fatal durante la calibración:', err);
  process.exit(1);
});

