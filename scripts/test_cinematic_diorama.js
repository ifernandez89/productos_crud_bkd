const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BlenderService } = require('../dist/jarvis/3d/blender.service');
const fs = require('fs');
const path = require('path');

async function testCinematicDiorama() {
  console.log('========================================================================');
  console.log('🎬 TEST DE INTEGRACIÓN: BLENDERSERVICE - DIORAMA CINEMATOGRÁFICO 3D');
  console.log('========================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const blenderService = app.get(BlenderService);

  console.log('1. Verificando disponibilidad de Blender...');
  const available = blenderService.isAvailable();
  console.log(`   • Disponible: ${available ? 'SÍ' : 'NO'}`);
  console.log(`   • Ruta ejecutable: ${blenderService.getBlenderPath()}\n`);

  if (!available) {
    console.error('❌ Blender no está disponible');
    await app.close();
    process.exit(1);
  }

  const outputPath = path.resolve('storage/assets/renders/platformer_cinematic_hero_test.png');

  console.log('2. Invocando renderCinematicDiorama()...');
  const result = await blenderService.renderCinematicDiorama({
    heroModel: 'character',
    action: 'jump',
    frame: 6,
    pedestal: 'grass-round',
    mood: 'golden_hour',
    width: 1920,
    height: 1080,
    samples: 64,
    outputRenderPath: outputPath,
  });

  console.log('3. Resultado obtenido:');
  console.log(`   • Status: ${result.status}`);
  console.log(`   • Duración: ${result.durationMs}ms`);
  console.log(`   • Archivo de salida: ${result.output}`);
  console.log(`   • Dimensiones: ${result.width}x${result.height}`);
  console.log(`   • Sujeto: ${result.hero} (Acción: ${result.action}, Frame: ${result.frame})`);
  console.log(`   • Objetos en escena: ${result.objects_in_scene}`);
  console.log(`   • Materiales: ${result.materials_in_scene}`);
  console.log(`   • Props activos: ${result.props.join(', ')}`);

  if (fs.existsSync(result.output)) {
    const stats = fs.statSync(result.output);
    console.log(`   • Tamaño del render en disco: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log('\n✅ Prueba completada con éxito.');
  } else {
    console.error('\n❌ No se encontró el archivo generado en disco.');
  }

  console.log('========================================================================\n');
  await app.close();
}

testCinematicDiorama().catch(console.error);
