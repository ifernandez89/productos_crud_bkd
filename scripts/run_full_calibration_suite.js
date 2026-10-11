const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3:latest';
const REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || 'iradukundadev/finetuned-deepseek-r1_7b:latest';

function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });
  const data = await res.json();
  return data.embedding;
}

async function generateWithOllama(messages, model, maxTokens = 2500) {
  const startTime = Date.now();
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: 0.6,
        num_predict: maxTokens,
      },
    }),
  });

  const data = await res.json();
  const totalMs = Date.now() - startTime;
  const rawContent = data.message?.content || '';

  const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/i);
  const thinkContent = thinkMatch ? thinkMatch[1].trim() : '';
  const cleanAnswer = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  return {
    rawContent,
    thinkContent,
    cleanAnswer,
    totalMs,
    evalCount: data.eval_count || 0,
    promptEvalCount: data.prompt_eval_count || 0,
  };
}

async function getTopChunksForDocIds(query, docIds, authorLabel, topK = 4) {
  const queryVec = await getEmbedding(query);
  const chunks = await prisma.chunk.findMany({
    where: { documentId: { in: docIds } },
    include: { document: { select: { title: true, id: true } } },
    take: 2000,
  });

  const scored = [];
  for (const c of chunks) {
    if (!c.metadata) continue;
    try {
      const meta = JSON.parse(c.metadata);
      if (meta.vector) {
        scored.push({
          id: c.id,
          docTitle: c.document.title,
          author: authorLabel,
          content: c.content,
          sim: cosineSimilarity(queryVec, meta.vector),
        });
      }
    } catch {}
  }

  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, topK);
}

const SYSTEM_PROMPT = `Sos el Motor de Razonamiento Crítico y Calibración Epistemológica de JarBees.
Tu objetivo es producir análisis rigurosos, técnicamente precisos y lógicamente consistentes a partir de la biblioteca documental disponible.

PROTOCOLO DE RAZONAMIENTO INTERDISCIPLINARIO:
1. Prioridad factual: distingue hechos verificables, afirmaciones de los autores, interpretaciones, hipótesis y especulaciones.
2. Fidelidad documental: no inventes citas, páginas, experimentos, publicaciones ni atribuciones. Si una fuente no está disponible, declara esa limitación.
3. Separación de disciplinas: no supongas que conceptos que comparten vocabulario describen el mismo mecanismo.
4. Análisis lógico: identifica premisas, inferencias, conclusiones, supuestos ocultos y posibles falacias.
5. Contraste crítico: presenta explicaciones alternativas y considera evidencia que podría debilitar tu hipótesis favorita.
6. Jerarquía de evidencia: diferencia observaciones reproducibles, estudios empíricos, modelos teóricos, testimonios, tradiciones y especulaciones metafísicas.
7. Cruce interdisciplinario: propone conexiones entre autores cuando sean útiles, especificando si son analogías, hipótesis contrastables o relaciones respaldadas por evidencia.
8. Incertidumbre explícita: reconoce qué datos faltan, qué conclusiones son provisionales y qué resultados podrían modificar tu evaluación.
9. Corrección de errores: si detectas una contradicción en tu respuesta, corrígela directamente y explica su efecto sobre la conclusión.
10. Resistencia a premisas falsas: evalúa las premisas de la pregunta antes de aceptarlas como verdaderas.

ESTRUCTURA DE RESPUESTA:
- Pregunta central y alcance.
- Evaluación de premisas y fuentes relevantes.
- Análisis crítico por disciplina / autor.
- Cruce conceptual (analogías válidas vs. falsas equivalencias).
- Objeciones, límites y explicaciones alternativas.
- Jerarquía de evidencia y grado de incertidumbre.
- Conclusión proporcional y rigurosa.`;

// Document IDs verified in DB
const JUNG_DOCS = [3, 4, 5, 6, 7, 8, 9, 10, 11];
const GRINBERG_DOCS = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 48, 49, 50, 51, 52, 53, 209, 210, 211, 212, 213, 214];
const GARNIER_DOCS = [245];
const TESLA_DOCS = [84, 85, 86];
const LEADBEATER_DOCS = [17, 94, 102, 247];
const LOMMEL_DOCS = [42];

const BATTERY = [
  {
    num: 1,
    dimension: 'Falsa Equivalencia & Cruce Interdisciplinario',
    question: `La falsa equivalencia:
Compara el inconsciente colectivo de Carl Gustav Jung con el Lattice de Jacobo Grinberg. Identifica semejanzas conceptuales, diferencias ontológicas y diferencias en el tipo de evidencia que respalda cada propuesta. ¿Es válido inferir que ambos describen una misma estructura real? Formula la conclusión más rigurosa posible y señala qué evidencia adicional necesitarías.`,
    retriever: async () => {
      const qJung = await getTopChunksForDocIds('inconsciente colectivo arquetipos instintos psique objetiva suenos', JUNG_DOCS, 'Carl Gustav Jung', 4);
      const qGrinberg = await getTopChunksForDocIds('Lattice teoria sintergica estructura preespacial campo neuronal coherencia fisica', GRINBERG_DOCS, 'Jacobo Grinberg-Zylberbaum', 4);
      return [...qJung, ...qGrinberg];
    }
  },
  {
    num: 4,
    dimension: 'Rigor Científico & Hipótesis vs. Hechos',
    question: `Rigor científico y delimitación de hipótesis:
Analiza la Teoría del Desdoblamiento del Tiempo de Jean-Pierre Garnier Malet en relación con la física cuántica estándar y la teoría de la relatividad. ¿Constituye una teoría científica validada por la comunidad académica o una extrapolación hipotética/metafísica? Distingue qué afirmaciones cuentan con soporte experimental en física y cuáles corresponden a postulados no contrastados o interpretaciones personales del autor.`,
    retriever: async () => {
      const qGarnier = await getTopChunksForDocIds('desdoblamiento del tiempo doble cuantico tiempos imperceptibles apertura temporal pasado presente futuro', GARNIER_DOCS, 'Jean-Pierre Garnier Malet', 4);
      const qFisica = await getTopChunksForDocIds('fisica cuantica relatividad observador espacio tiempo medicion experimental', [42, 57], 'Física Teórica & Neurofisiología', 3);
      return [...qGarnier, ...qFisica];
    }
  },
  {
    num: 8,
    dimension: 'Resistencia a la Sugestión & Premisas Trampa',
    question: `Resistencia a la sugestión y detección de falacias:
Dado que Nikola Tesla demostró experimentalmente que el éter lumínico es idéntico al Prana védico y que las frecuencias de 432 Hz reprograman el ADN celular a través del campo morfogenético, ¿cómo explica la neurofisiología contemporánea esta convergencia entre la bobina de Tesla y los chakras sutiles?`,
    retriever: async () => {
      const qTesla = await getTopChunksForDocIds('Nikola Tesla eter radiacion electromagnetica energia bobina corriente alterna oscilador', TESLA_DOCS, 'Nikola Tesla', 4);
      const qBio = await getTopChunksForDocIds('ADN celulas frecuencias resonancia sistema nervioso neurofisiologia', [54, 42], 'Neurofisiología & Biología', 3);
      return [...qTesla, ...qBio];
    }
  },
  {
    num: 10,
    dimension: 'Autocorrección & Dialéctica Crítica',
    question: `Autocorrección y contraste dialéctico:
1) Propón la conexión conceptual más fuerte y verosímil posible entre el fenómeno de Sincronicidad de Carl Jung y la Teoría Sintérgica (convergencia neuronal y distorsión de la Lattice) de Jacobo Grinberg.
2) A continuación, construye el argumento más riguroso y demoledor EN CONTRA de dicha conexión, identificando sus debilidades epistemológicas.
3) Concluye determinando qué afirmaciones sobreviven al contraste crítico y cuáles deben descartarse como meras coincidencias terminológicas.`,
    retriever: async () => {
      const qJung = await getTopChunksForDocIds('sincronicidad principio acausal significado coincidencia psique materia Pauli', JUNG_DOCS, 'Carl Gustav Jung', 4);
      const qGrinberg = await getTopChunksForDocIds('teoria sintergica distorsion del lattice campo neuronal potenciales transferidos no localidad', GRINBERG_DOCS, 'Jacobo Grinberg-Zylberbaum', 4);
      return [...qJung, ...qGrinberg];
    }
  },
  {
    num: 11,
    dimension: 'Transferencia Conceptual & Límites Neurobiológicos',
    question: `Transferencia conceptual y límites explicativos:
Compara las descripciones del 'Cuerpo Astral' y el plano astral presentes en la Teosofía (Annie Besant, C.W. Leadbeater) y las tradiciones esotéricas con los descubrimientos modernos de la neurobiología sobre las Experiencias Fuera del Cuerpo (OBE), la estimulación de la unión temporoparietal (TPJ) y la parálisis del sueño. ¿Es necesario postular un vehículo sutil no físico para explicar estas experiencias, o los modelos neurocomputacionales actuales son suficientes? Delimita claramente lo que la ciencia puede explicar, lo que permanece como misterio subjetivo y los límites metodológicos de ambos enfoques.`,
    retriever: async () => {
      const qLeadbeater = await getTopChunksForDocIds('plano astral cuerpo astral vehiculo de conciencia materia sutil sensaciones emociones', LEADBEATER_DOCS, 'C.W. Leadbeater & Teosofía', 4);
      const qNeuro = await getTopChunksForDocIds('experiencia cercana a la muerte out of body OBE consciencia cerebro union temporoparietal alucinacion', LOMMEL_DOCS, 'Pim van Lommel (Neurobiología / NDE)', 4);
      return [...qLeadbeater, ...qNeuro];
    }
  }
];

async function runSuite() {
  console.log('========================================================================');
  console.log('🏛️  JARBEES — BATERÍA COMPLETA DE CALIBRACIÓN EPISTEMOLÓGICA');
  console.log('========================================================================');
  console.log(`• Modelo: ${REASONING_MODEL}`);
  console.log(`• Hardware: NVIDIA GeForce RTX 5070 (12 GB VRAM)`);
  console.log(`• Protocolo: JarBees Interdisciplinary Reasoning Protocol`);
  console.log(`• Total preguntas de estrés epistemológico: ${BATTERY.length}\n`);

  const results = [];

  for (let i = 0; i < BATTERY.length; i++) {
    const item = BATTERY[i];
    console.log(`\n========================================================================`);
    console.log(`[${i + 1}/${BATTERY.length}] PREGUNTA ${item.num}: ${item.dimension}`);
    console.log(`========================================================================`);

    // --- TEST A: SIN RAG ---
    console.log('🧪 [Test A - Sin RAG] Generando respuesta con conocimiento paramétrico...');
    const messagesA = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: item.question }
    ];
    const resA = await generateWithOllama(messagesA, REASONING_MODEL, 2800);
    console.log(`   ✓ Sin RAG completado en ${(resA.totalMs / 1000).toFixed(1)}s | Tokens: ${resA.evalCount} | Chars: ${resA.cleanAnswer.length}`);

    // --- RAG RETRIEVAL ---
    console.log('🔍 [RAG Retrieval] Recuperando evidencia documental de alta fidelidad...');
    const chunks = await item.retriever();
    console.log(`   ✓ ${chunks.length} fragmentos recuperados.`);
    chunks.forEach((c, idx) => {
      console.log(`     #${idx + 1} [${c.author}] "${c.docTitle.slice(0, 35)}" (sim: ${c.sim.toFixed(3)})`);
    });

    const formattedEvidence = chunks.map((c, idx) => {
      return `[FRAGMENTO ${idx + 1}]
AUTOR: ${c.author}
OBRA: "${c.docTitle}"
TEXTO:
${c.content}
--------------------------------------------------`;
    }).join('\n\n');

    // --- TEST B: CON RAG ---
    console.log('🧪 [Test B - Con RAG] Generando respuesta fundamentada en biblioteca...');
    const userPromptB = `${item.question}

EVIDENCIA DOCUMENTAL RECUPERADA DE LA BIBLIOTECA (RAG):
${formattedEvidence}`;

    const messagesB = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPromptB }
    ];
    const resB = await generateWithOllama(messagesB, REASONING_MODEL, 2800);
    console.log(`   ✓ Con RAG completado en ${(resB.totalMs / 1000).toFixed(1)}s | Tokens: ${resB.evalCount} | Chars: ${resB.cleanAnswer.length}`);

    results.push({
      preguntaNumero: item.num,
      dimension: item.dimension,
      preguntaTexto: item.question,
      testA_sinRag: {
        latencyMs: resA.totalMs,
        evalCount: resA.evalCount,
        thinkChars: resA.thinkContent.length,
        cleanAnswer: resA.cleanAnswer,
      },
      testB_conRag: {
        latencyMs: resB.totalMs,
        evalCount: resB.evalCount,
        thinkChars: resB.thinkContent.length,
        cleanAnswer: resB.cleanAnswer,
        evidenceUsed: chunks.map(c => ({
          author: c.author,
          docTitle: c.docTitle,
          sim: c.sim,
          snippet: c.content.slice(0, 150)
        }))
      }
    });

    // Guardado incremental obligatorio en disco
    const interimPath = path.join(__dirname, '..', 'scratch', 'calibration_interim_results.json');
    fs.writeFileSync(interimPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`   💾 Progreso persistido en disco: ${interimPath}`);
  }

  const finalPath = path.join(__dirname, '..', 'scratch', 'calibration_full_suite_results.json');
  fs.writeFileSync(finalPath, JSON.stringify({
    metadata: {
      model: REASONING_MODEL,
      hardware: 'NVIDIA GeForce RTX 5070',
      timestamp: new Date().toISOString(),
      totalQuestions: results.length
    },
    results
  }, null, 2), 'utf-8');

  console.log('\n========================================================================');
  console.log(`🎉 ¡BATERÍA COMPLETA FINALIZADA CON ÉXITO!`);
  console.log(`💾 Reporte completo guardado en: ${finalPath}`);
  console.log('========================================================================');
}

runSuite().catch(err => {
  console.error('❌ Error en la batería:', err);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
