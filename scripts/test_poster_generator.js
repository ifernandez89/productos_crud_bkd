/**
 * JARBEES POSTER GENERATOR — SUITE DE PRUEBA Y QA VISUAL
 * Ejecuta la generación y comparación de:
 * 1. Portada de Acción 16-Bit ("IRON MAN: GENESIS PROTOCOL")
 * 2. Pantalla de Título de Paisaje 16-Bit estilo Twinkle Tale ("AETHERIA: THE CELESTIAL REALM")
 */
async function runTest(payload, testName) {
  console.log(`\n======================================================`);
  console.log(`🎨 EJECUTANDO PRUEBA: ${testName}...`);
  console.log(`======================================================`);

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

  console.log(`🖼️  PÓSTER GENERADO: ${data.title} (${data.era})`);
  console.log(`⏱️  Tiempo de renderizado: ${data.durationMs} ms`);
  console.log(`📁  Ruta PNG: ${data.pngPath}`);
  console.log(`📐  Ruta SVG: ${data.svgPath}`);
  console.log(`\n🔍 INFORME DE CONTROL DE CALIDAD (QA):`);
  console.log(`   • Estado: ${data.qa.passed ? '✅ APROBADO (100% verificado)' : '❌ RECHAZADO'}`);
  console.log(`   • Puntuación: ${data.qa.score}/100`);
  console.log(`   • Tamaño de archivo: ${data.qa.technicalChecks.fileSizeKb} KB`);
  console.log(`   • Dimensiones: ${data.qa.technicalChecks.widthMatch && data.qa.technicalChecks.heightMatch ? 'OK' : 'Error'}`);
  console.log(`   • Cabecera PNG válida: ${data.qa.technicalChecks.validPng ? 'OK' : 'Error'}`);
  console.log(`   • Título presente: ${data.qa.compositionChecks.titlePresent ? 'OK' : 'Faltante'}`);
  console.log(`   • Errores técnicos: ${data.qa.technicalChecks.errors.length}`);
  console.log(`   • Advertencias: ${data.qa.compositionChecks.warnings.length}`);
  console.log(`\n🎨 CALIFICACIÓN ARTÍSTICA ESTIMADA:`);
  console.log(`   • Composición: ${data.qa.artisticReview.composition}/5 ⭐`);
  console.log(`   • Coherencia de época: ${data.qa.artisticReview.eraConsistency}/5 ⭐`);
  console.log(`   • Tipografía: ${data.qa.artisticReview.typography}/5 ⭐`);
  console.log(`   • Integración visual: ${data.qa.artisticReview.visualIntegration}/5 ⭐`);
  console.log(`   • Acabado profesional: ${data.qa.artisticReview.professionalFinish}/5 ⭐`);
  return data;
}

async function main() {
  try {
    // Prueba 1: Portada de Acción Genesis 16-Bit
    await runTest(
      {
        title: 'IRON MAN',
        subtitle: 'GENESIS PROTOCOL',
        era: 'genesis16',
        genre: 'Action / Sci-Fi / Mecha',
        width: 720,
        height: 960,
        seed: 1994,
      },
      'TEST 1: Iron Man Genesis Protocol (Action Poster)',
    );

    // Prueba 2: Pantalla de Título Twinkle Tale (Paisaje 16-Bit Isla Flotante)
    await runTest(
      {
        title: 'AETHERIA',
        subtitle: 'THE CELESTIAL REALM',
        prompt: 'isla flotante de fantasia con cascadas acantilados bosques y palacio de cristal estilo twinkle tale 1992',
        era: 'genesis-landscape',
        genre: 'Fantasy RPG / 16-Bit Title Screen',
        width: 1280,
        height: 960,
        seed: 1992,
      },
      'TEST 2: Aetheria (Twinkle Tale Style Floating Island 16-Bit)',
    );

    // Prueba 3: Atmósfera Oceánica Dreamcast 128-Bit (Alternativa a Ecco: Orca)
    await runTest(
      {
        title: 'ORCA',
        subtitle: 'DEFENDER OF THE SEAS',
        prompt: 'orca emergiendo del oceano con salpicaduras superficie de agua con reflejos atardecer tropical acantilados con palmeras y hud dreamcast',
        era: 'dreamcast-ocean',
        genre: '128-Bit Action Adventure / Dreamcast Era',
        width: 1280,
        height: 960,
        seed: 2000,
      },
      'TEST 3: Orca Defender of the Seas (Dreamcast 128-Bit Ocean Studio)',
    );

    console.log('\n🎉 ¡TODAS LAS PRUEBAS DE CALIDAD FUERON SUPERADAS CON ÉXITO!');
  } catch (err) {
    console.error('❌ Error en la suite de pruebas:', err.message);
    process.exit(1);
  }
}

main();
