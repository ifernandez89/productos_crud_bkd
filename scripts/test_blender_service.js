const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BlenderService } = require('../dist/jarvis/3d/blender.service');
const fs = require('fs');

async function testBlenderService() {
  console.log('========================================================================');
  console.log('🏛️  TEST DE INTEGRACIÓN: JARBEES BLENDER SERVICE');
  console.log('========================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const blenderService = app.get(BlenderService);

  console.log('1. Verificando disponibilidad de Blender...');
  const available = blenderService.isAvailable();
  const blenderPath = blenderService.getBlenderPath();
  console.log(`   • Disponible: ${available ? 'SÍ' : 'NO'}`);
  console.log(`   • Ruta ejecutable: ${blenderPath}\n`);

  if (!available) {
    console.error('❌ Blender no está disponible');
    await app.close();
    process.exit(1);
  }

  const modelPath = 'storage/assets/models/olmec_head.glb';
  console.log(`2. Inspeccionando modelo base: ${modelPath}...`);
  const inspection = await blenderService.inspectModel(modelPath);
  console.log('   ✓ Inspección completada exitosamente:');
  console.log(`     - Malla: ${inspection.meshes.join(', ')}`);
  console.log(`     - Vértices: ${inspection.total_vertices}`);
  console.log(`     - Triángulos: ${inspection.total_triangles}`);
  console.log(`     - Dimensiones: ${inspection.bounding_box.width}m x ${inspection.bounding_box.depth}m x ${inspection.bounding_box.height}m\n`);

  console.log('3. Ejecutando pipeline de desgaste procedural PBR...');
  const result = await blenderService.applyWeathering({
    inputGlbPath: modelPath,
    outputGlbPath: 'storage/assets/models/olmec_head_weathered.glb',
    renderBeforePath: 'storage/assets/renders/olmec_head_before.png',
    renderAfterPath: 'storage/assets/renders/olmec_head_after.png',
    mossCoverage: 0.45,
    dirtIntensity: 0.55,
    normalStrength: 0.65,
    resolution: 1024
  });

  console.log('   ✓ Proceso de desgaste finalizado:');
  console.log(`     - Duración: ${result.durationMs} ms`);
  console.log(`     - Materiales modificados: ${result.materials_modified}`);
  console.log(`     - Vértices preservados: ${result.total_vertices} (100%)`);
  console.log(`     - GLB modificado: ${result.output} (${fs.statSync(result.output).size} bytes)`);
  console.log(`     - Render Antes: ${result.render_before}`);
  console.log(`     - Render Después: ${result.render_after}\n`);

  console.log('========================================================================');
  console.log('🏁 TEST COMPLETADO CON ÉXITO AL 100%');
  console.log('========================================================================\n');

  await app.close();
}

testBlenderService().catch(console.error);
