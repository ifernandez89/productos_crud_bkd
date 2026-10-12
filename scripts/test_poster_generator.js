/**
 * JARBEES POSTER GENERATOR — SUITE DE PRUEBA Y QA VISUAL
 * Ejecuta la generación del póster "IRON MAN: GENESIS PROTOCOL",
 * renderiza el PNG vía Playwright Edge y valida el reporte de QA.
 */
async function main() {
  console.log('🎨 Iniciando prueba del Generador Gráfico Procedural de JarBees...');

  const payload = {
    title: 'IRON MAN',
    subtitle: 'GENESIS PROTOCOL',
    era: 'genesis16',
    genre: 'Action / Sci-Fi / Mecha',
    width: 720,
    height: 960,
    seed: 1994,
  };

  try {
    const res = await fetch('http://127.0.0.1:4000/api/jarbees/poster/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    const data = json.data;

    console.log('\n======================================================');
    console.log(`🖼️  PÓSTER GENERADO: ${data.title} (${data.era})`);
    console.log(`⏱️  Tiempo de renderizado: ${data.durationMs} ms`);
    console.log(`📁  Ruta PNG: ${data.pngPath}`);
    console.log(`📐  Ruta SVG: ${data.svgPath}`);
    console.log('======================================================');
    console.log('\n🔍 INFORME DE CONTROL DE CALIDAD (QA):');
    console.log(`   • Estado: ${data.qa.passed ? '✅ APROBADO (100% verificado)' : '❌ RECHAZADO'}`);
    console.log(`   • Puntuación: ${data.qa.score}/100`);
    console.log(`   • Tamaño de archivo: ${data.qa.technicalChecks.fileSizeKb} KB`);
    console.log(`   • Coincidencia de dimensiones: ${data.qa.technicalChecks.widthMatch && data.qa.technicalChecks.heightMatch ? 'OK' : 'Error'}`);
    console.log(`   • Cabecera PNG válida: ${data.qa.technicalChecks.validPng ? 'OK' : 'Error'}`);
    console.log(`   • Título presente: ${data.qa.compositionChecks.titlePresent ? 'OK' : 'Faltante'}`);
    console.log(`   • Subtítulo presente: ${data.qa.compositionChecks.subtitlePresent ? 'OK' : 'Faltante'}`);
    console.log(`   • Errores técnicos: ${data.qa.technicalChecks.errors.length}`);
    console.log(`   • Advertencias: ${data.qa.compositionChecks.warnings.length}`);
    console.log('\n🎨 CALIFICACIÓN ARTÍSTICA ESTIMADA:');
    console.log(`   • Composición: ${data.qa.artisticReview.composition}/5 ⭐`);
    console.log(`   • Coherencia de época: ${data.qa.artisticReview.eraConsistency}/5 ⭐`);
    console.log(`   • Tipografía: ${data.qa.artisticReview.typography}/5 ⭐`);
    console.log(`   • Integración visual: ${data.qa.artisticReview.visualIntegration}/5 ⭐`);
    console.log(`   • Acabado profesional: ${data.qa.artisticReview.professionalFinish}/5 ⭐`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Error ejecutando la prueba del generador:', err.message);
    process.exit(1);
  }
}

main();
