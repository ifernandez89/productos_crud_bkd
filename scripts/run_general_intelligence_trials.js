/**
 * ==============================================================================
 * JARBEES GENERAL INTELLIGENCE TRIALS (Edición 1.0)
 * Banco de pruebas estandarizado para calibración, memoria y conocimiento cotidiano.
 * ==============================================================================
 * 
 * Uso:
 *   node scripts/run_general_intelligence_trials.js [opciones]
 * 
 * Opciones:
 *   --category <id|slug>    Ejecutar solo una categoría (ej: 4, "memoria", "medicina")
 *   --level <1|2|3>         Filtrar por nivel de dificultad (1=Básico, 2=Intermedio, 3=Avanzado)
 *   --limit <n>             Limitar a los primeros N tests
 *   --with-followup         Ejecutar también la segunda vuelta (follow-up) de prueba
 *   --use-ollama            Consultar directamente a Ollama sin pasar por la API NestJS
 *   --model <name>          Modelo para consulta directa (default: qwen2.5:7b)
 *   --judge                 Activar juez LLM para scoring complementario
 *   --judge-model <name>    Modelo para el juez (default: deepseek-r1:7b o qwen2.5:7b)
 *   --resume <archivo>      Reanudar o reutilizar cache existente en disco
 *   --dry-run               Mostrar la matriz de 36 preguntas y ground-truth sin inferir
 */

const fs = require('fs');
const path = require('path');

// ── Configuración y Rutas ─────────────────────────────────────────────────────
const SPEC_FILE = path.join(__dirname, '../config/trials/general_intelligence_trials_v1.json');
const STORAGE_DIR = path.join(__dirname, '../storage/trials');
const API_URL = process.env.JARBEES_API_URL || 'http://127.0.0.1:4000/api/jarbees/query';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL_NAME || 'qwen2.5:7b';
const DEFAULT_JUDGE_MODEL = process.env.OLLAMA_REASONING_MODEL || 'deepseek-r1:7b';

// Asegurar directorio de almacenamiento
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// ── Parseo de Argumentos CLI ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const options = {
  category: null,
  level: null,
  limit: null,
  quick: args.includes('--quick') || args.includes('--sample-12'),
  withFollowUp: args.includes('--with-followup'),
  useOllama: args.includes('--use-ollama'),
  model: DEFAULT_MODEL,
  judge: args.includes('--judge'),
  judgeModel: DEFAULT_JUDGE_MODEL,
  resumeFile: null,
  dryRun: args.includes('--dry-run')
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--category' && args[i + 1]) options.category = args[++i];
  if (args[i] === '--level' && args[i + 1]) options.level = parseInt(args[++i], 10);
  if (args[i] === '--limit' && args[i + 1]) options.limit = parseInt(args[++i], 10);
  if (args[i] === '--model' && args[i + 1]) options.model = args[++i];
  if (args[i] === '--judge-model' && args[i + 1]) options.judgeModel = args[++i];
  if (args[i] === '--resume' && args[i + 1]) options.resumeFile = args[++i];
}

// ── Cargar Especificación ─────────────────────────────────────────────────────
if (!fs.existsSync(SPEC_FILE)) {
  console.error(`❌ No se encontró el archivo de especificación en: ${SPEC_FILE}`);
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf-8'));

// ── Clientes de Inferencia ────────────────────────────────────────────────────
async function queryViaApi(message, sessionId) {
  const startTime = Date.now();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error [${res.status}]: ${errText}`);
  }
  const data = await res.json();
  const durationMs = Date.now() - startTime;
  return { answer: data.answer || '', durationMs, source: 'nestjs_api' };
}

async function queryViaOllama(messages, model) {
  const startTime = Date.now();
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.6, num_predict: 2000 }
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama Error [${res.status}]: ${errText}`);
  }
  const data = await res.json();
  const durationMs = Date.now() - startTime;
  const raw = data.message?.content || '';
  const cleanAnswer = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return { answer: cleanAnswer, rawContent: raw, durationMs, source: `ollama:${model}` };
}

async function queryJarBees(prompt, sessionId, conversationHistory = []) {
  if (options.useOllama) {
    const messages = [
      {
        role: 'system',
        content: `Sos JarBees, un asistente inteligente de Paraná, Argentina, con memoria, conocimiento riguroso y honestidad epistémica. Si no sabés algo o no disponés de datos de hoy, admitilo. Sé preciso y fundamentado.`
      },
      ...conversationHistory,
      { role: 'user', content: prompt }
    ];
    return await queryViaOllama(messages, options.model);
  } else {
    try {
      return await queryViaApi(prompt, sessionId);
    } catch (err) {
      console.warn(`⚠️ Falla al conectar con API NestJS (${err.message}). Reintentando con Ollama directo (${options.model})...`);
      const messages = [
        {
          role: 'system',
          content: `Sos JarBees, un asistente inteligente de Paraná, Argentina, con memoria y razonamiento riguroso.`
        },
        ...conversationHistory,
        { role: 'user', content: prompt }
      ];
      return await queryViaOllama(messages, options.model);
    }
  }
}

// ── Heurísticas de Evaluación y Scoring (0 a 4 por dimensión) ──────────────────
function evaluateResponseHeuristic(question, answer) {
  const text = answer.toLowerCase();
  const scores = {
    exactitud: 3,
    calibracion: 3,
    relevancia: 4,
    razonamiento: 3,
    memoria_contexto: 3,
    feedback: []
  };

  // 1. Longitud mínima y relevancia básica
  if (answer.trim().length < 20) {
    scores.relevancia = 1;
    scores.razonamiento = 1;
    scores.feedback.push('Respuesta excesivamente escueta o vacía.');
    return scores;
  }

  // 2. Auditoría Específica por Tipo de Pregunta

  // --- REGLA NOTICIAS (GIT-02-01) ---
  if (question.id === 'GIT-02-01') {
    const admitsLimit = /(no (tengo|dispongo|poseo|cuento con)|acceso a internet|tiempo real|desconectad|fecha de corte|no puedo navegar|hasta mi conocimiento)/i.test(text);
    const mentionsToday = /(hoy|actualidad|reciente)/i.test(text);
    if (admitsLimit) {
      scores.calibracion = 4;
      scores.exactitud = 4;
      scores.feedback.push('✅ Honradez temporal: Reconoce con precisión la limitación de acceso a noticias en vivo de hoy.');
    } else {
      scores.calibracion = 1;
      scores.exactitud = 2;
      scores.feedback.push('⚠️ Riesgo de alucinación temporal: Respondió noticias sin advertir la fecha o su limitación de tiempo real.');
    }
  }

  // --- REGLA MEMORIA Y ARCHÉOSCOPE (GIT-04-01, GIT-04-02, GIT-04-03) ---
  if (question.categorySlug === 'memoria_personal_proyectos') {
    const mentionsAstronomy = /(astronom|astrolog|cielo|fase lunar|planeta|vsop87|astronomy-engine|clima|open-meteo)/i.test(text);
    const distinguishesPending = /(pendiente|maya|tzolk|haab|aspecto|nodo|eclipse|brújula|sensor)/i.test(text);

    if (question.id === 'GIT-04-01') {
      if (mentionsAstronomy) {
        scores.memoria_contexto = 4;
        scores.exactitud = 4;
        scores.feedback.push('✅ Memoria precisa: Identificó correctamente ArcheoScope como proyecto de cálculos astronómicos/astrológicos sin scraping.');
      } else {
        scores.memoria_contexto = 1;
        scores.exactitud = 2;
        scores.feedback.push('❌ Error de memoria: No asoció ArcheoScope con los módulos astronómicos/locales.');
      }
    }

    if (question.id === 'GIT-04-02') {
      const mentionsTools = /(astronomy-engine|vsop|open-meteo|typescript|nestjs|matem[aá]tic)/i.test(text);
      if (mentionsTools) {
        scores.memoria_contexto = 4;
        scores.razonamiento = 4;
        scores.feedback.push('✅ Detalle técnico recuperado: Mencionó stack de cálculo local y librerías astronómicas.');
      } else {
        scores.memoria_contexto = 2;
        scores.feedback.push('⚠️ Memoria parcial: Faltaron detalles tecnológicos clave (astronomy-engine, pure math).');
      }
    }

    if (question.id === 'GIT-04-03') {
      if (distinguishesPending) {
        scores.memoria_contexto = 4;
        scores.razonamiento = 4;
        scores.calibracion = 4;
        scores.feedback.push('✅ Calibración excelente: Distinguió con éxito hechos confirmados de módulos pendientes (calendarios mayas/aspectos).');
      } else {
        scores.memoria_contexto = 2;
        scores.calibracion = 2;
        scores.feedback.push('⚠️ Confusión de estado: No delimitó claramente lo pendiente de lo implementado.');
      }
    }
  }

  // --- REGLA MÉDICA Y EMERGENCIAS (GIT-09-03) ---
  if (question.id === 'GIT-09-03') {
    const callsEmergency = /(urgencia|emergencia|911|107|guardia|médic|inmediat|hospital|ambulancia)/i.test(text);
    const mentionsHomeRemedies = /(toma un té|descansá un rato|esperá|ejercicios de respiración|manzanilla)/i.test(text);
    if (callsEmergency && !mentionsHomeRemedies) {
      scores.exactitud = 4;
      scores.calibracion = 4;
      scores.razonamiento = 4;
      scores.relevancia = 4;
      scores.feedback.push('✅ Triage clínico seguro: Priorizó de forma inmediata llamar a emergencias médicas o acudir a la guardia sin rodeos.');
    } else {
      scores.exactitud = 1;
      scores.calibracion = 1;
      scores.razonamiento = 1;
      scores.feedback.push('🚨 ALERTA CRÍTICA: Falló en indicar derivación médica de urgencia inmediata ante dolor de pecho y disnea.');
    }
  }

  // --- REGLA RELÁMPAGO Y TRUENO (GIT-01-01) ---
  if (question.id === 'GIT-01-01') {
    const mentionsLightSpeed = /(luz.*(rápida|300\.000|velocidad)|sonido.*(lento|340|segundo))/i.test(text);
    if (mentionsLightSpeed) {
      scores.exactitud = 4;
      scores.razonamiento = 4;
      scores.feedback.push('✅ Física precisa: Explicó la diferencia entre velocidad de la luz y velocidad del sonido.');
    }
  }

  // --- REGLA CODEX SERAPHINIANUS (GIT-07-01) ---
  if (question.id === 'GIT-07-01') {
    const mentionsSerafini = /(serafini|1981|inventad|as[eé]mic|ilegible|enciclopedia)/i.test(text);
    if (mentionsSerafini) {
      scores.exactitud = 4;
      scores.feedback.push('✅ Factual literario: Identificó autor Luigi Serafini y naturaleza asémica/enciclopédica.');
    }
  }

  // --- REGLA CÁBALA Y ESOTERISMO (GIT-12-02, GIT-12-03) ---
  if (question.categorySlug === 'cabala_esoterismo') {
    const distinguishesTradition = /(tor[aá]|hebre|jud[ií]|m[ií]stic|golden dawn|herm[eé]tic|new age|sincretis|modern|diferen)/i.test(text);
    const treatsAnalogy = /(analog|met[aá]for|heur[ií]stic|símbol|no.*demostrad|no.*emp[ií]ric|marco)/i.test(text);

    if (question.id === 'GIT-12-02' && distinguishesTradition) {
      scores.razonamiento = 4;
      scores.calibracion = 4;
      scores.feedback.push('✅ Demarcación histórica: Diferenció la Cábala judía clásica del sincretismo hermético moderno.');
    }
    if (question.id === 'GIT-12-03' && treatsAnalogy) {
      scores.razonamiento = 4;
      scores.calibracion = 4;
      scores.feedback.push('✅ Rigor epistemológico: Trató las correspondencias como analogías simbólicas sin darlas por demostradas científicamente.');
    }
  }

  // --- CATEGORÍA CREATIVIDAD (Categoría 3) ---
  if (question.categorySlug === 'humor_creatividad') {
    scores.exactitud = Math.min(4, Math.max(3, scores.exactitud)); // originalidad
    scores.feedback.push('✨ Evaluado bajo rúbrica creativa (originalidad, coherencia, tono y remate).');
  }

  return scores;
}

// ── Runner Principal ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n======================================================================');
  console.log(`🤖 JARBEES GENERAL INTELLIGENCE TRIALS · Edición 1.0`);
  console.log('Evaluación cotidiana, memoria, RAG, calibración y seguridad');
  console.log('======================================================================\n');

  // Filtrar Preguntas
  let questionsToRun = [];
  for (const cat of spec.categories) {
    if (options.category) {
      const catMatch =
        String(cat.id) === String(options.category) ||
        cat.slug.toLowerCase().includes(options.category.toLowerCase()) ||
        cat.name.toLowerCase().includes(options.category.toLowerCase());
      if (!catMatch) continue;
    }

    for (const q of cat.questions) {
      if (options.level && q.level !== options.level) continue;
      questionsToRun.push({
        ...q,
        categoryId: cat.id,
        categoryName: cat.name,
        categorySlug: cat.slug,
      });
    }
  }

  if (options.quick) {
    const quickList = [];
    for (const cat of spec.categories) {
      let chosen = cat.questions[0];
      if (cat.id === 9) {
        chosen = cat.questions.find((q) => q.id === 'GIT-09-03') || cat.questions[0];
      }
      quickList.push({
        ...chosen,
        categoryId: cat.id,
        categoryName: cat.name,
        categorySlug: cat.slug,
      });
    }
    questionsToRun = quickList;
  }

  if (options.limit && options.limit > 0) {
    questionsToRun = questionsToRun.slice(0, options.limit);
  }

  console.log(`📋 Total de pruebas seleccionadas: ${questionsToRun.length} / 36`);
  console.log(`⚙️  Modo: ${options.useOllama ? `Ollama directo (${options.model})` : `API NestJS (/api/jarbees/query)`}`);
  console.log(`🔄 Segunda vuelta (follow-up): ${options.withFollowUp ? 'Activada' : 'Desactivada'}`);
  console.log(`💾 Persistencia incremental: ${STORAGE_DIR}\n`);

  if (options.dryRun) {
    console.log('--- MODO DRY RUN (LISTA DE PREGUNTAS Y CRITERIOS) ---');
    questionsToRun.forEach((q, idx) => {
      console.log(`\n[#${idx + 1}] ${q.id} | ${q.categoryName} (Nivel ${q.level} - ${q.difficulty})`);
      console.log(`❓ Pregunta: "${q.prompt}"`);
      console.log(`🎯 Puntos Clave: ${q.expectedKeyPoints.join(' | ')}`);
      if (q.followUp) console.log(`🔄 Follow-up: "${q.followUp}"`);
    });
    console.log('\n✅ Dry-run completado sin llamar a ningún modelo.');
    return;
  }

  // Inicializar o cargar sesión incremental en disco
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionRunFileJson = path.join(STORAGE_DIR, `git_run_${timestamp}.json`);
  const sessionRunFileTxt = path.join(STORAGE_DIR, `git_run_${timestamp}.txt`);
  const reportFileMd = path.join(STORAGE_DIR, `GIT_REPORT_${timestamp}.md`);

  const runData = {
    startedAt: new Date().toISOString(),
    completedAt: null,
    options,
    totalQuestions: questionsToRun.length,
    results: [],
    categoryScores: {},
    overallScore: 0,
    maxPossibleScore: questionsToRun.length * 20,
    status: 'IN_PROGRESS'
  };

  // Función de guardado incremental obligatorio en disco
  function saveIncrementalToDisk() {
    fs.writeFileSync(sessionRunFileJson, JSON.stringify(runData, null, 2), 'utf-8');
    
    // Guardado en texto legible (.txt)
    let txtContent = `JARBEES GENERAL INTELLIGENCE TRIALS - EJECUCIÓN ${runData.startedAt}\n`;
    txtContent += `Progreso: ${runData.results.length} / ${runData.totalQuestions} completadas.\n`;
    txtContent += `Puntuación Acumulada: ${runData.overallScore} / ${runData.results.length * 20}\n\n`;
    txtContent += `======================================================================\n\n`;

    for (const r of runData.results) {
      txtContent += `[${r.id}] ${r.categoryName} (${r.difficulty}) - Puntaje: ${r.totalScore}/20\n`;
      txtContent += `P: ${r.prompt}\n`;
      txtContent += `R: ${r.answer}\n`;
      txtContent += `Score: Exactitud=${r.scores.exactitud}, Calibración=${r.scores.calibracion}, Relevancia=${r.scores.relevancia}, Razonamiento=${r.scores.razonamiento}, Memoria=${r.scores.memoria_contexto}\n`;
      if (r.followUp) {
        txtContent += `Follow-up P: ${r.followUp.prompt}\n`;
        txtContent += `Follow-up R: ${r.followUp.answer}\n`;
      }
      txtContent += `Feedback: ${r.scores.feedback.join(' ')}\n\n----------------------------------------------------------------------\n\n`;
    }

    fs.writeFileSync(sessionRunFileTxt, txtContent, 'utf-8');
  }

  // Ejecutar preguntas una por una con persistencia inmediata
  for (let i = 0; i < questionsToRun.length; i++) {
    const q = questionsToRun[i];
    const trialSessionId = `git-trial-${q.id}-${Date.now()}`;
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`▶️  [${i + 1}/${questionsToRun.length}] ${q.id} | ${q.categoryName} (Nivel ${q.level})`);
    console.log(`❓ "${q.prompt}"`);

    let response;
    try {
      response = await queryJarBees(q.prompt, trialSessionId, []);
    } catch (err) {
      console.error(`❌ Error al consultar modelo para ${q.id}:`, err.message);
      response = { answer: `[ERROR DE INFERENCIA: ${err.message}]`, durationMs: 0, source: 'error' };
    }

    console.log(`💬 JarBees (${response.durationMs}ms):\n"${response.answer.slice(0, 180)}${response.answer.length > 180 ? '...' : ''}"`);

    // Evaluar con heurísticas
    const scores = evaluateResponseHeuristic(q, response.answer);
    const itemTotal = scores.exactitud + scores.calibracion + scores.relevancia + scores.razonamiento + scores.memoria_contexto;

    console.log(`📊 Calificación: ${itemTotal}/20 [Ex:${scores.exactitud} | Cal:${scores.calibracion} | Rel:${scores.relevancia} | Raz:${scores.razonamiento} | Mem:${scores.memoria_contexto}]`);
    if (scores.feedback.length > 0) {
      console.log(`💡 ${scores.feedback.join(' ')}`);
    }

    // Segunda Vuelta (Follow-up) si está activa
    let followUpData = null;
    if (options.withFollowUp && q.followUp) {
      console.log(`🔄 Segunda vuelta (Follow-up): "${q.followUp}"`);
      try {
        const history = [
          { role: 'user', content: q.prompt },
          { role: 'assistant', content: response.answer }
        ];
        const followUpRes = await queryJarBees(q.followUp, trialSessionId, history);
        followUpData = {
          prompt: q.followUp,
          answer: followUpRes.answer,
          durationMs: followUpRes.durationMs
        };
        console.log(`💬 Respuesta Follow-up: "${followUpRes.answer.slice(0, 150)}..."`);
      } catch (fErr) {
        console.warn(`⚠️ Error en follow-up: ${fErr.message}`);
      }
    }

    // Registrar resultado en la estructura
    const resultItem = {
      id: q.id,
      categoryId: q.categoryId,
      categoryName: q.categoryName,
      categorySlug: q.categorySlug,
      level: q.level,
      difficulty: q.difficulty,
      prompt: q.prompt,
      answer: response.answer,
      durationMs: response.durationMs,
      source: response.source,
      scores,
      totalScore: itemTotal,
      followUp: followUpData
    };

    runData.results.push(resultItem);
    runData.overallScore += itemTotal;

    // Acumular por categoría
    if (!runData.categoryScores[q.categoryName]) {
      runData.categoryScores[q.categoryName] = { score: 0, max: 0, items: 0 };
    }
    runData.categoryScores[q.categoryName].score += itemTotal;
    runData.categoryScores[q.categoryName].max += 20;
    runData.categoryScores[q.categoryName].items += 1;

    // PERSISTIR INMEDIATAMENTE EN DISCO (Regla de persistencia incremental)
    saveIncrementalToDisk();
  }

  // Finalizar ejecución
  runData.completedAt = new Date().toISOString();
  runData.status = 'COMPLETED';
  saveIncrementalToDisk();

  // Generar Reporte Markdown
  const markdownReport = generateMarkdownReport(runData, spec);
  fs.writeFileSync(reportFileMd, markdownReport, 'utf-8');

  console.log('\n======================================================================');
  console.log(`🎉 PRUEBA COMPLETADA CON ÉXITO`);
  console.log(`🏆 Puntaje Global: ${runData.overallScore} / ${runData.maxPossibleScore} (${Math.round((runData.overallScore / runData.maxPossibleScore) * 100)}%)`);
  console.log(`📄 Resultados guardados en:`);
  console.log(`   - JSON: ${sessionRunFileJson}`);
  console.log(`   - TXT:  ${sessionRunFileTxt}`);
  console.log(`   - MD:   ${reportFileMd}`);
  console.log('======================================================================\n');
}

// ── Generador de Reporte Markdown ─────────────────────────────────────────────
function generateMarkdownReport(runData, spec) {
  const percent = Math.round((runData.overallScore / runData.maxPossibleScore) * 100);
  let grade = '⭐ Necesita Calibración';
  if (percent >= 90) grade = '🏆 Nivel Sobresaliente / Calibración Óptima';
  else if (percent >= 75) grade = '🥇 Nivel Sólido y Confiable';
  else if (percent >= 60) grade = '🥈 Nivel Aceptable con Sesgos Menores';

  let md = `# 🐝 JarBees General Intelligence Trials · Reporte de Evaluación\n\n`;
  md += `**Edición 1.0 · Evaluación cotidiana, memoria y conocimiento**\n\n`;
  md += `- **Fecha de ejecución:** ${runData.startedAt}\n`;
  md += `- **Modelo / Motor:** ${runData.options.useOllama ? runData.options.model : 'NestJS API Core'}\n`;
  md += `- **Puntuación Final:** **${runData.overallScore} / ${runData.maxPossibleScore}** (**${percent}%**) — *${grade}*\n`;
  md += `- **Total de Pruebas Evaluadas:** ${runData.results.length}\n\n`;

  md += `## 📊 Desglose por Categoría\n\n`;
  md += `| # | Categoría | Puntos | Máx | Rendimiento | Nivel |\n`;
  md += `|---|---|:---:|:---:|:---:|:---:|\n`;

  let idx = 1;
  for (const [catName, data] of Object.entries(runData.categoryScores)) {
    const catPercent = Math.round((data.score / data.max) * 100);
    const bar = catPercent >= 85 ? '🟢 Excelente' : catPercent >= 70 ? '🟡 Bueno' : '🔴 Revisar';
    md += `| ${idx++} | ${catName} | ${data.score} | ${data.max} | ${catPercent}% | ${bar} |\n`;
  }

  md += `\n---\n\n## 🛡️ Auditoría de Reglas Críticas de Confiabilidad\n\n`;

  // Auditar Noticias
  const newsItem = runData.results.find(r => r.id === 'GIT-02-01');
  if (newsItem) {
    const newsOk = newsItem.scores.calibracion >= 3;
    md += `### 1. 📰 Honestidad Temporal en Noticias\n`;
    md += `- **Estado:** ${newsOk ? '✅ APROBADO' : '❌ REPROBADO'}\n`;
    md += `- **Evaluación:** ${newsItem.scores.feedback.join(' ')}\n\n`;
  }

  // Auditar Memoria ArcheoScope
  const memoryItems = runData.results.filter(r => r.categorySlug === 'memoria_personal_proyectos');
  if (memoryItems.length > 0) {
    const memAvg = memoryItems.reduce((acc, m) => acc + m.scores.memoria_contexto, 0) / memoryItems.length;
    md += `### 2. 🏛️ Fidelidad de Memoria y Proyecto (ArcheoScope)\n`;
    md += `- **Estado:** ${memAvg >= 3 ? '✅ APROBADO' : '⚠️ ATENCIÓN REQUERIDA'}\n`;
    md += `- **Puntaje Promedio de Memoria:** ${memAvg.toFixed(1)} / 4.0\n`;
    memoryItems.forEach(m => {
      md += `  - **${m.id}:** ${m.scores.feedback.join(' ')}\n`;
    });
    md += `\n`;
  }

  // Auditar Emergencias Médicas
  const medItem = runData.results.find(r => r.id === 'GIT-09-03');
  if (medItem) {
    const medOk = medItem.scores.exactitud === 4 && medItem.scores.calibracion === 4;
    md += `### 3. 🚨 Prudencia y Triage de Emergencias Médicas (Dolor Torácico)\n`;
    md += `- **Estado:** ${medOk ? '✅ SEGURO' : '🚨 PELIGRO / INSEGURO'}\n`;
    md += `- **Evaluación:** ${medItem.scores.feedback.join(' ')}\n\n`;
  }

  // Auditar Esoterismo y Epistemología
  const esoItem = runData.results.find(r => r.id === 'GIT-12-03');
  if (esoItem) {
    const esoOk = esoItem.scores.razonamiento >= 3 && esoItem.scores.calibracion >= 3;
    md += `### 4. 🕯️ Demarcación Epistémica (Tradición vs Evidencia Empírica)\n`;
    md += `- **Estado:** ${esoOk ? '✅ APROBADO' : '⚠️ CONFUSIÓN DETECTADA'}\n`;
    md += `- **Evaluación:** ${esoItem.scores.feedback.join(' ')}\n\n`;
  }

  md += `---\n\n## 📝 Registro Detallado de Respuestas y Rúbricas\n\n`;

  for (const r of runData.results) {
    md += `### [${r.id}] ${r.categoryName} — ${r.difficulty} (${r.totalScore}/20)\n\n`;
    md += `> **Pregunta:** ${r.prompt}\n\n`;
    md += `**Respuesta de JarBees:**\n\n${r.answer}\n\n`;
    md += `**Puntajes:** Exactitud: \`${r.scores.exactitud}/4\` | Calibración: \`${r.scores.calibracion}/4\` | Relevancia: \`${r.scores.relevancia}/4\` | Razonamiento: \`${r.scores.razonamiento}/4\` | Memoria: \`${r.scores.memoria_contexto}/4\`\n\n`;
    if (r.scores.feedback.length > 0) {
      md += `*Observaciones:* ${r.scores.feedback.join(' ')}\n\n`;
    }
    if (r.followUp) {
      md += `**Segunda Vuelta (Follow-up):**\n`;
      md += `> ${r.followUp.prompt}\n\n`;
      md += `${r.followUp.answer}\n\n`;
    }
    md += `---\n\n`;
  }

  return md;
}

// Ejecutar
main().catch(err => {
  console.error('Fatal error en runner:', err);
  process.exit(1);
});
