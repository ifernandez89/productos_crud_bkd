const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { JarvisService } = require('../dist/jarvis/jarvis.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

const QUESTIONS = [
  // Bloque 1 — Memoria, identidad y contexto
  { id: 1, block: 'Bloque 1 — Memoria, identidad y contexto', q: 'Si una información que tienes guardada sobre mí contradice algo que acabo de decirte, ¿cuál deberías considerar vigente y por qué?', expected: 'Principio de actualización epistémica / Primacía del input del usuario en tiempo real' },
  { id: 2, block: 'Bloque 1 — Memoria, identidad y contexto', q: '¿Qué diferencias existen entre recordar un dato, inferirlo y suponerlo?', expected: 'Distinción epistemológica: recuperación factual vs deducción lógica vs hipótesis sin evidencia' },
  { id: 3, block: 'Bloque 1 — Memoria, identidad y contexto', q: '¿Cómo distinguirías mis proyectos activos de aquellos que solamente mencioné alguna vez?', expected: 'Heurística de frecuencia, persistencia temporal, detalle y estado de desarrollo' },
  { id: 4, block: 'Bloque 1 — Memoria, identidad y contexto', q: 'Si te pregunto algo sobre mi computadora y no tienes acceso a una inspección de hardware, ¿qué puedes afirmar y qué no?', expected: 'Límites explícitos / Reconocimiento de falta de telemetría de hardware' },
  { id: 5, block: 'Bloque 1 — Memoria, identidad y contexto', q: '¿Qué información personal sería útil recordar a largo plazo y cuál sería innecesario conservar?', expected: 'Criterio de persistencia: preferencias, proyectos y contexto estable vs estados efímeros o datos triviales' },

  // Bloque 2 — Tiempo, calendario y geografía
  { id: 6, block: 'Bloque 2 — Tiempo, calendario y geografía', q: '¿Por qué algunos años tienen 366 días y cómo se determina un año bisiesto?', expected: 'Regla del calendario gregoriano (divisible por 4, no por 100 salvo que sea divisible por 400) y año solar (365.2422 días)' },
  { id: 7, block: 'Bloque 2 — Tiempo, calendario y geografía', q: 'Si un evento comienza a las 23:30 y dura 150 minutos, ¿a qué hora termina?', expected: 'Cálculo temporal exacto: 23:30 + 2h 30m = 02:00 del día siguiente' },
  { id: 8, block: 'Bloque 2 — Tiempo, calendario y geografía', q: '¿Por qué dos ciudades pueden tener la misma hora aunque estén en países diferentes?', expected: 'Husos horarios / Zonas horarias civiles compartidas por longitud o decisión política' },
  { id: 9, block: 'Bloque 2 — Tiempo, calendario y geografía', q: '¿Qué diferencia existe entre hora solar, hora civil y tiempo universal coordinado (UTC)?', expected: 'Astronomía y metrología: cenit solar local vs huso horario administrativo vs estándar atómico coordinado' },
  { id: 10, block: 'Bloque 2 — Tiempo, calendario y geografía', q: 'Si una actividad se repite cada 17 días desde el 1 de noviembre, ¿cuáles serán sus tres próximas fechas?', expected: 'Aritmética de calendario: 18 de noviembre, 5 de diciembre y 22 de diciembre' },

  // Bloque 3 — Clima y meteorología
  { id: 11, block: 'Bloque 3 — Clima y meteorología', q: '¿Por qué puede llover en un lugar mientras a pocos kilómetros no cae una sola gota?', expected: 'Meteorología: lluvias convectivas locales, nubes de desarrollo vertical (cumulonimbus) y microclimas' },
  { id: 12, block: 'Bloque 3 — Clima y meteorología', q: '¿Qué diferencia existe entre temperatura, sensación térmica y temperatura aparente?', expected: 'Termodinámica vs biometeorología: energía cinética molecular vs efecto del viento (wind chill) y humedad (humindex/heat index)' },
  { id: 13, block: 'Bloque 3 — Clima y meteorología', q: '¿Qué información necesitamos para determinar si existe riesgo de granizo?', expected: 'Identificación de variables críticas (CAPE, nivel de congelación/isocero, corrientes ascendentes, radar Doppler)' },
  { id: 14, block: 'Bloque 3 — Clima y meteorología', q: '¿Por qué la presión atmosférica suele cambiar antes de una tormenta?', expected: 'Dinámica de fluidos y frentes: convergencia de masas de aire, ascenso convectivo y centros de baja presión' },
  { id: 15, block: 'Bloque 3 — Clima y meteorología', q: 'Si el pronóstico indica un 70% de probabilidad de lluvia, ¿significa que lloverá durante el 70% del día?', expected: 'Comprensión probabilística de PoP (Probability of Precipitation = Confianza x Área de cobertura, no duración temporal)' },

  // Bloque 4 — Astronomía y astrología
  { id: 16, block: 'Bloque 4 — Astronomía y astrología', q: '¿Por qué vemos siempre prácticamente la misma cara de la Luna desde la Tierra?', expected: 'Mecánica celeste: acoplamiento de marea (rotación sincrónica, período orbital = período de rotación)' },
  { id: 17, block: 'Bloque 4 — Astronomía y astrología', q: '¿Qué diferencia existe entre rotación, traslación y precesión?', expected: 'Cinemática planetaria: giro sobre eje propio vs órbita alrededor del Sol vs bamboleo del eje en el espacio (ciclo de ~25.772 años)' },
  { id: 18, block: 'Bloque 4 — Astronomía y astrología', q: '¿Por qué una conjunción planetaria no significa necesariamente que dos planetas estén físicamente cerca?', expected: 'Perspectiva geométrica y profundidad celeste: alineación visual en la misma línea de visión bidimensional vs millones de km de distancia real' },
  { id: 19, block: 'Bloque 4 — Astronomía y astrología', q: '¿Qué factores determinan si un planeta es visible a simple vista?', expected: 'Magnitud aparente, distancia Tierra-Sol-planeta, albedo, elongación angular respecto al Sol, atmósfera y polución lumínica' },
  { id: 20, block: 'Bloque 4 — Astronomía y astrología', q: '¿Qué diferencia existe entre calcular una posición planetaria y atribuirle un significado astrológico?', expected: 'Distinción epistemológica: cálculo astronómico físico verificable vs sistema simbólico interpretativo cultural' },

  // Bloque 5 — Ciencia, física y método científico
  { id: 21, block: 'Bloque 5 — Ciencia, física y método científico', q: '¿Por qué un objeto pesado no necesariamente cae más rápido que uno liviano?', expected: 'Física newtoniana / Principio de equivalencia: la aceleración de gravedad g es independiente de la masa (resistencia del aire como factor diferenciador real)' },
  { id: 22, block: 'Bloque 5 — Ciencia, física y método científico', q: '¿Qué diferencia existe entre temperatura y cantidad de calor?', expected: 'Termodinámica: temperatura = promedio de energía cinética por partícula; calor = energía térmica total en tránsito' },
  { id: 23, block: 'Bloque 5 — Ciencia, física y método científico', q: '¿Cómo puede la energía transformarse sin desaparecer?', expected: 'Primer principio de la termodinámica / Ley de conservación de la energía y conversión a entropía/calor residual' },
  { id: 24, block: 'Bloque 5 — Ciencia, física y método científico', q: '¿Qué significa que una medición tenga un margen de incertidumbre?', expected: 'Metrología: limitaciones instrumentales, error sistemático y aleatorio, límites del conocimiento experimental' },
  { id: 25, block: 'Bloque 5 — Ciencia, física y método científico', q: '¿Cómo investigarías experimentalmente si un material conduce mejor el calor que otro?', expected: 'Diseño experimental controlado: variables fijas (longitud, sección, gradiente térmico), medición de tasa de transferencia térmica dQ/dt' },

  // Bloque 6 — Tecnología e informática
  { id: 26, block: 'Bloque 6 — Tecnología e informática', q: '¿Qué ocurre cuando una aplicación necesita más memoria RAM de la que tiene disponible?', expected: 'Sistemas operativos: memoria virtual, paging, swap, thrashing y eventualmente OOM killer' },
  { id: 27, block: 'Bloque 6 — Tecnología e informática', q: '¿Por qué una GPU potente puede quedarse sin memoria VRAM aunque todavía tenga capacidad de procesamiento?', expected: 'Desacoplamiento entre throughput computacional (CUDA cores / TFLOPS) y capacidad de almacenamiento de tensores/pesos/activaciones/KV cache en VRAM' },
  { id: 28, block: 'Bloque 6 — Tecnología e informática', q: '¿Qué diferencias existen entre aumentar los parámetros de un modelo y mejorar su contexto RAG?', expected: 'Arquitectura de IA: conocimiento paramétrico implícito congelado vs recuperación dinámica no paramétrica fundamentada en fuentes externas' },
  { id: 29, block: 'Bloque 6 — Tecnología e informática', q: 'Si una API deja de responder temporalmente, ¿cómo debería actuar un sistema robusto?', expected: 'Patrones de resiliencia: retry con backoff exponencial, jitter, circuit breaker, timeout, fallbacks y colas' },
  { id: 30, block: 'Bloque 6 — Tecnología e informática', q: '¿Qué ventajas y riesgos tiene permitir que un agente de IA ejecute comandos directamente en una computadora?', expected: 'Automatización y autonomía vs riesgos de seguridad: inyección de prompts, ejecución destructiva, necesidad de sandboxing y HITL' },

  // Bloque 7 — Energía y electrónica
  { id: 31, block: 'Bloque 7 — Energía y electrónica', q: '¿Qué diferencia existe entre conectar dos baterías en serie y conectarlas en paralelo?', expected: 'Electrónica de potencia: serie suma voltajes (misma capacidad Ah); paralelo suma capacidad Ah (mismo voltaje)' },
  { id: 32, block: 'Bloque 7 — Energía y electrónica', q: '¿Por qué un inversor de corriente tiene pérdidas de eficiencia?', expected: 'Pérdidas Joule en conmutación de MOSFETs/IGBTs, pérdidas en el núcleo del transformador, armónicos y consumo propio' },
  { id: 33, block: 'Bloque 7 — Energía y electrónica', q: '¿Qué sucede si conectamos una carga que necesita más corriente de la que puede entregar una fuente?', expected: 'Caída de tensión (voltage sag), sobrecalentamiento, disparo de protecciones (OCP) o daño térmico' },
  { id: 34, block: 'Bloque 7 — Energía y electrónica', q: '¿Cómo calcularías el tamaño aproximado de una instalación solar para alimentar un dispositivo que consume 200 W durante 8 horas diarias?', expected: 'Reconocimiento de necesidad de variables (HSP locales, pérdidas del sistema, autonomía) y cálculo base: 1600 Wh/día' },
  { id: 35, block: 'Bloque 7 — Energía y electrónica', q: '¿Por qué una batería de automóvil no es ideal para alimentar continuamente un equipo eléctrico?', expected: 'Baterías de arranque (SLI) diseñadas para picos altos breves vs ciclo profundo (deep cycle) diseñadas para descargas sostenidas' },

  // Bloque 8 — Historia, arqueología y cultura
  { id: 36, block: 'Bloque 8 — Historia, arqueología y cultura', q: '¿Cómo pueden los arqueólogos determinar la antigüedad de un objeto sin conocer su fecha de fabricación?', expected: 'Métodos de datación relativa (estratigrafía, tipología) y absoluta (Carbono-14, termoluminiscencia, dendrocronología)' },
  { id: 37, block: 'Bloque 8 — Historia, arqueología y cultura', q: '¿Por qué encontrar un objeto antiguo fuera de su contexto arqueológico original dificulta su interpretación?', expected: 'Pérdida de tafonomía, estratigrafía, asociaciones materiales y riesgo de anacronismo o falsificación' },
  { id: 38, block: 'Bloque 8 — Historia, arqueología y cultura', q: '¿Qué información puede aportar el estudio de los restos de una antigua ciudad?', expected: 'Urbanismo, estratificación social, demografía, tecnología constructiva, dieta, comercio y saneamiento' },
  { id: 39, block: 'Bloque 8 — Historia, arqueología y cultura', q: '¿Cómo se puede demostrar que dos civilizaciones mantuvieron contacto comercial sin disponer de documentos escritos?', expected: 'Materiales exógenos / no autóctonos (obsidiana, lapislázuli, ámbar), análisis de isótopos, estilos cerámicos y tecnología compartida' },
  { id: 40, block: 'Bloque 8 — Historia, arqueología y cultura', q: '¿Por qué las reconstrucciones históricas pueden cambiar cuando aparecen nuevos descubrimientos?', expected: 'Naturaleza provisional y científica del conocimiento histórico y arqueológico ante nueva evidencia empírica' },

  // Bloque 9 — Biología y naturaleza
  { id: 41, block: 'Bloque 9 — Biología y naturaleza', q: '¿Por qué las abejas son consideradas organismos fundamentales para numerosos ecosistemas?', expected: 'Polinización de angiospermas, sostenimiento de biodiversidad vegetal y cadenas tróficas agrícolas y silvestres' },
  { id: 42, block: 'Bloque 9 — Biología y naturaleza', q: '¿Qué consecuencias puede tener la desaparición de una especie dentro de una cadena alimentaria?', expected: 'Efecto cascada trófica, desequilibrio en poblaciones de presas/depredadores y pérdida de resiliencia ecológica' },
  { id: 43, block: 'Bloque 9 — Biología y naturaleza', q: '¿Cómo puede un organismo adaptarse a un ambiente sin que esa adaptación implique una decisión consciente?', expected: 'Mecanismo evolutivo de selección natural: mutación genética aleatoria y reproducción diferencial no teleológica' },
  { id: 44, block: 'Bloque 9 — Biología y naturaleza', q: '¿Qué diferencias existen entre simbiosis, parasitismo y mutualismo?', expected: 'Interacciones biológicas: simbiosis (término paraguas de convivencia cercana), mutualismo (+/+ beneficio mutuo), parasitismo (+/- daño al hospedador)' },
  { id: 45, block: 'Bloque 9 — Biología y naturaleza', q: '¿Por qué dos organismos de la misma especie pueden desarrollar características diferentes según su ambiente?', expected: 'Plasticidad fenotípica, expresión epigenética y presiones selectivas divergentes' },

  // Bloque 10 — Razonamiento interdisciplinario
  { id: 46, block: 'Bloque 10 — Razonamiento interdisciplinario', q: 'Un panel solar produce menos electricidad de la esperada. ¿Qué variables investigarías antes de concluir que está defectuoso?', expected: 'Descarte metódico: radiación solar/irradiancia, sombras parciales, ángulo/inclinación, temperatura del panel, suciedad/polvo, cableado e inversor' },
  { id: 47, block: 'Bloque 10 — Razonamiento interdisciplinario', q: 'Dos sensores miden temperaturas diferentes en el mismo lugar. ¿Cómo determinarías cuál proporciona el valor más confiable?', expected: 'Metodología metrológica: calibración con patrón de referencia, verificación de microambiente (radiación directa, corrientes de aire), tiempo de respuesta e historial' },
  { id: 48, block: 'Bloque 10 — Razonamiento interdisciplinario', q: 'Una batería tiene 600 Wh de capacidad nominal y alimenta una carga de 120 W mediante un inversor con eficiencia del 90%. ¿Cuál sería la autonomía ideal aproximada, ignorando otras pérdidas?', expected: 'Cálculo exacto: Consumo efectivo = 120 W / 0.90 = 133.33 W; Autonomía = 600 Wh / 133.33 W = 4.5 horas (4h 30m)' },
  { id: 49, block: 'Bloque 10 — Razonamiento interdisciplinario', q: 'Alguien afirma haber construido un dispositivo que produce más energía de la que consume. ¿Cómo diseñarías un experimento para verificar esa afirmación?', expected: 'Prueba experimental rigurosa de conservación de energía: sistema cerrado (caja negra), calorimetría completa, medición de potencia activa con vatímetros calibrados, descarte de fuentes ocultas, integración temporal de energía entrada vs salida' },
  { id: 50, block: 'Bloque 10 — Razonamiento interdisciplinario', q: 'Si tuvieras que investigar un fenómeno desconocido utilizando conocimientos de física, electrónica, informática y biología, ¿cómo organizarías la investigación desde cero?', expected: 'Arquitectura de investigación interdisciplinaria: definición ontológica del fenómeno, sensado biofísico, adquisición de datos embebida, modelado computacional y contrastación experimental de hipótesis' }
];

const OUTPUT_PATH = path.resolve('benchmark_calibration_round2_50.json');

async function run() {
  console.log('=== SEGUNDA RONDA: JARBEES GENERAL INTELLIGENCE CALIBRATION (50 PREGUNTAS) ===');
  console.log(`Fecha de inicio: ${new Date().toISOString()}`);

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
  const prisma = app.get(PrismaService);
  console.log('JarBees listo. Iniciando ejecución serial de 50 preguntas...\n');

  const isValidResult = (item) => {
    const r = results[item.id];
    return r && r.success && r.answer && !r.answer.startsWith('ERROR');
  };

  const pendingQuestions = QUESTIONS.filter(item => !isValidResult(item));
  console.log(`Preguntas pendientes por evaluar: ${pendingQuestions.length} de ${QUESTIONS.length}`);

  let successCount = 0;
  let failCount = 0;

  try {
    for (const item of QUESTIONS) {
      if (isValidResult(item)) {
        console.log(`[Q${String(item.id).padStart(2, '0')}/50] [CACHE] (${results[item.id].durationMs}ms) "${item.q.slice(0, 35)}..."`);
        continue;
      }

      const sessionId = `calib_rnd2_q${item.id}_${Date.now()}`;
      const t0 = Date.now();

      try {
        // Ejecución de la consulta
        const answer = await jarvis.query(item.q, {
          sessionId,
          provider: 'gateway',
        });
        const durationMs = Date.now() - t0;

        // Recuperar telemetría de agentRun
        let runRecord = null;
        try {
          runRecord = await prisma.agentRun.findFirst({
            where: { sessionId },
            orderBy: { id: 'desc' }
          });
        } catch (dbErr) {
          // ignore db retrieval error
        }

        let toolsUsed = [];
        try {
          toolsUsed = runRecord && runRecord.toolsUsed ? JSON.parse(runRecord.toolsUsed) : [];
        } catch {}

        // Comprobar si solicitó aclaraciones o reconoció falta de datos
        const hasMissingDataRecognition = 
          /(falta|faltan|necesitar|necesito|depende de|para calcular|sin conocer|sin saber|variables|especificaciones|informacion adicional|datos adicionales|no es posible determinar|no se puede afirmar)/i.test(answer);

        const entry = {
          id: item.id,
          block: item.block,
          question: item.q,
          expected: item.expected,
          answer: answer,
          durationMs,
          timestamp: new Date().toISOString(),
          success: true,
          executionRoute: {
            intentClassified: runRecord ? runRecord.intentClassified : 'N/A',
            intentConfidence: runRecord ? runRecord.intentConfidence : null,
            modelUsed: runRecord ? runRecord.modelUsed : 'unknown',
            provider: runRecord ? runRecord.provider : 'unknown',
            toolsUsed: toolsUsed,
            tokensUsed: runRecord ? runRecord.tokensUsed : null,
            sources: {
              ragContextUsed: runRecord ? runRecord.ragContextUsed : false,
              chunksRetrievedCount: runRecord ? runRecord.chunksRetrievedCount : 0,
              webSearchUsed: runRecord ? runRecord.webSearchUsed : false,
              dialecticUsed: runRecord ? runRecord.dialecticUsed : false,
            },
            recognizedMissingDataOrClarification: hasMissingDataRecognition
          }
        };

        results[item.id] = entry;
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');

        successCount++;
        const preview = answer.replace(/\r?\n|\r/g, ' ').slice(0, 75);
        console.log(`[Q${String(item.id).padStart(2, '0')}/50] [OK] (${durationMs}ms) "${item.q.slice(0, 35)}..." -> "${preview}..."`);
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
        console.error(`[Q${String(item.id).padStart(2, '0')}/50] [FAIL] (${durationMs}ms) "${item.q.slice(0, 35)}..." -> Error: ${err.message}`);
      }

      // Descanso serial entre preguntas para enfriamiento de GPU y estabilidad
      await new Promise(r => setTimeout(r, 600));
    }
  } finally {
    console.log('\n=== CIERRE Y TEARDOWN ===');
    console.log(`Procesadas: ${successCount} exitosas, ${failCount} fallidas.`);
    console.log(`Total acumulado en cache: ${Object.keys(results).length} de 50.`);
    console.log(`Archivo persistido: ${OUTPUT_PATH}`);

    // Teardown limpio obligatorio
    await app.close();
    console.log('Teardown completado exitosamente.');
  }
}

run().catch(err => {
  console.error('Error fatal durante la calibración de segunda ronda:', err);
  process.exit(1);
});

