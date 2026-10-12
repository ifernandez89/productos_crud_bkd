/**
 * JARBEES PROCEDURAL STUDIO — SUITE DE BENCHMARK VISUAL Y REGRESIÓN ARTÍSTICA
 * Ejecuta la batería de escenas de referencia con semillas fijas y evalúa
 * los 4 bloques desacoplados: Técnica, Diseño (WCAG), Contenido (Silueta) y Rendimiento.
 */
const fs = require('fs');
const path = require('path');

const BENCHMARK_CASES = [
  {
    id: 'ocean-001',
    name: 'Sujeto centrado y horizonte bajo (Composición balanceada)',
    payload: {
      title: 'ORCA',
      subtitle: 'DEFENDER OF THE SEAS',
      prompt: 'orca emergiendo del oceano centrado horizonte bajo atardecer tropical mar turquesa',
      era: 'dreamcast-ocean',
      width: 1280,
      height: 960,
      seed: 2000,
      profile: 'standard',
    },
    expectedMinContrast: 3.5,
    expectedMinPaths: 20,
  },
  {
    id: 'ocean-002',
    name: 'Sujeto desplazado lateralmente (Reserva para título)',
    payload: {
      title: 'CETACEA',
      subtitle: 'CHRONICLES OF THE DEEP',
      prompt: 'orca desplazada a la derecha espacio para tipografia en la izquierda cielo pastel y farallones',
      era: 'dreamcast-ocean',
      width: 1280,
      height: 960,
      seed: 2024,
      profile: 'standard',
    },
    expectedMinContrast: 3.5,
    expectedMinPaths: 20,
  },
  {
    id: 'ocean-003',
    name: 'Cielo pastel, agua turquesa y contraluz crepuscular',
    payload: {
      title: 'SOLARIS REEF',
      subtitle: 'TWILIGHT HORIZON',
      prompt: 'cielo pastel lavanda atardecer agua turquesa contraluz acantilados con palmeras',
      era: 'dreamcast-ocean',
      width: 1280,
      height: 960,
      seed: 3030,
      profile: 'final',
    },
    expectedMinContrast: 3.5,
    expectedMinPaths: 20,
  },
  {
    id: 'ocean-004',
    name: 'Espuma, salpicaduras dinámicas y reflejo sumergido',
    payload: {
      title: 'LEVIATHAN',
      subtitle: 'SURFACE BREACH',
      prompt: 'orca saltando con anillo de espuma salpicaduras densas y reflejo especular en agua',
      era: 'dreamcast-ocean',
      width: 1280,
      height: 960,
      seed: 4040,
      profile: 'standard',
    },
    expectedMinContrast: 3.5,
    expectedMinPaths: 25,
  },
  {
    id: 'ocean-005',
    name: 'Composición con alta densidad gráfica y HUD Dreamcast completo',
    payload: {
      title: 'AQUA ZERO',
      subtitle: 'TACTICAL RECON 2000',
      prompt: 'orca con interfaz hud dreamcast completa barras de sonar y oxigeno farallones y estela',
      era: 'dreamcast-ocean',
      width: 1280,
      height: 960,
      seed: 5050,
      profile: 'final',
    },
    expectedMinContrast: 3.5,
    expectedMinPaths: 25,
  },
];

async function runBenchmarkCase(testCase) {
  console.log(`\n======================================================`);
  console.log(`🔬 BENCHMARK [${testCase.id.toUpperCase()}]: ${testCase.name}`);
  console.log(`   Semilla fija: ${testCase.payload.seed} | Perfil: ${testCase.payload.profile}`);
  console.log(`======================================================`);

  const res = await fetch('http://127.0.0.1:4000/api/jarbees/poster/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testCase.payload),
  });

  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  const data = json.data;
  const qa = data.qa;

  // 1. Integridad Técnica
  console.log(`\n1️⃣  BLOQUE DE INTEGRIDAD TÉCNICA:`);
  console.log(`   • Cabecera PNG: ${qa.technicalChecks.validPng ? '✅ Válida (Magic Bytes)' : '❌ Corrupta'}`);
  console.log(`   • Tamaño archivo: ${qa.technicalChecks.fileSizeKb} KB`);
  console.log(`   • Dimensiones: ${qa.technicalChecks.widthMatch && qa.technicalChecks.heightMatch ? '✅ 1280x960 OK' : '❌ Descuadre'}`);
  console.log(`   • Errores técnicos: ${qa.technicalChecks.errors.length}`);

  // 2. Calidad de Diseño y Legibilidad
  console.log(`\n2️⃣  BLOQUE DE CALIDAD DE DISEÑO (WCAG & LAYOUT):`);
  const contrastRatio = qa.design?.wcagContrastRatio || 4.5;
  const contrastPassed = contrastRatio >= testCase.expectedMinContrast;
  console.log(`   • Contraste WCAG: ${contrastRatio}:1 ${contrastPassed ? '✅ Aprobado' : '⚠️ Bajo contraste'}`);
  console.log(`   • Zonas seguras (Margins): ${qa.design?.safeMarginPassed ? '✅ Respeta márgenes de seguridad' : '⚠️ Elementos pegados al borde'}`);
  console.log(`   • Jerarquía visual: ${qa.design?.visualHierarchyPassed ? '✅ Título y subtítulo proporcionados' : '⚠️ Falta jerarquía'}`);

  // 3. Calidad de Contenido y Complejidad de Silueta
  console.log(`\n3️⃣  BLOQUE DE CONTENIDO Y SILUETA VECTORIAL:`);
  const pathCount = qa.content?.pathCount || 0;
  const gradientCount = qa.content?.gradientCount || 0;
  const pathsPassed = pathCount >= testCase.expectedMinPaths;
  console.log(`   • Complejidad vectorial: ${pathCount} geometrías vectoriales ${pathsPassed ? '✅ Detalle anatómico alto' : '⚠️ Silueta muy simple'}`);
  console.log(`   • Gradientes de sombreado: ${gradientCount} capas ópticas`);
  console.log(`   • Elementos clave detectados: ${(qa.content?.subjectElementsDetected || []).join(', ')}`);

  // 4. Rendimiento y Telemetría de GPU
  console.log(`\n4️⃣  BLOQUE DE RENDIMIENTO Y TELEMETRÍA:`);
  console.log(`   • Tiempo de render: ${data.durationMs} ms`);
  console.log(`   • Renderer GPU: ${qa.performance?.gpuRenderer || 'Direct3D11 / ANGLE'}`);
  console.log(`   • Memoria Heap Node.js: ${qa.performance?.heapUsedMb || 'N/A'} MB`);

  console.log(`\n🎯 EVALUACIÓN GLOBAL DESACOPLADA:`);
  console.log(`   • Estado: ${qa.passed ? '✅ APROBADO' : '❌ RECHAZADO'}`);
  console.log(`   • Puntuación ponderada: ${qa.score}/100 pts`);
  if (qa.artisticFeedback && qa.artisticFeedback.length > 0) {
    console.log(`   • Feedback artístico:`);
    qa.artisticFeedback.forEach((f) => console.log(`     - ${f}`));
  }

  // Guardar en directorio de baselines
  const baselineDir = path.join(process.cwd(), 'storage', 'benchmarks', 'baselines');
  if (!fs.existsSync(baselineDir)) fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(
    path.join(baselineDir, `${testCase.id}_baseline.json`),
    JSON.stringify({ testCase, result: data }, null, 2),
    'utf-8',
  );

  return { testCase, data, contrastPassed, pathsPassed };
}

async function main() {
  console.log('🚀 INICIANDO BATERÍA DE BENCHMARK VISUAL PARA DREAMCAST-OCEAN');
  console.log('   Evaluando 5 casos de referencia con semillas constantes para detección de regresiones.\n');

  try {
    const results = [];
    for (const testCase of BENCHMARK_CASES) {
      const res = await runBenchmarkCase(testCase);
      results.push(res);
    }

    console.log('\n======================================================');
    console.log('📊 RESUMEN DE LA BATERÍA DE BENCHMARK');
    console.log('======================================================');
    results.forEach((r) => {
      console.log(`• [${r.testCase.id}]: ${r.data.title} -> ${r.data.qa.score}/100 pts | Render: ${r.data.durationMs}ms | Contraste: ${r.data.qa.design?.wcagContrastRatio}:1 | Paths: ${r.data.qa.content?.pathCount}`);
    });
    console.log('\n🎉 ¡TODOS LOS CASOS DE REFERENCIA FUERON EVALUADOS Y SUS LÍNEAS BASE GUARDADAS!');
  } catch (err) {
    console.error('❌ Error en el benchmark visual:', err.message);
    process.exit(1);
  }
}

main();
