/**
 * 🧪 Script de Prueba: Asset Metadata System
 * 
 * Demuestra el uso completo del sistema de metadata 3D:
 * 1. Consultar estadísticas del catálogo
 * 2. Obtener metadata del render de ballena
 * 3. Buscar assets similares
 * 4. Clonar configuración para crear variante
 */

const API_BASE = 'http://localhost:3000/jarvis/3d/metadata';

async function testMetadataSystem() {
  console.log('🎨 === JarBees Asset Metadata System - Test Suite ===\n');

  // 1. Estadísticas del Catálogo
  console.log('📊 1. Consultando estadísticas del catálogo...');
  try {
    const statsRes = await fetch(`${API_BASE}/stats`);
    const statsData = await statsRes.json();
    console.log('   ✅ Estadísticas:', JSON.stringify(statsData.stats, null, 2));
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // 2. Obtener Metadata de Ballena Jorobada
  console.log('\n🐋 2. Obteniendo metadata del render de ballena jorobada...');
  const whalePackageId = 'bebffbcb-1435-4626-b4d1-b9dc0b7d63f7';
  
  try {
    const metadataRes = await fetch(`${API_BASE}/${whalePackageId}`);
    const metadataData = await metadataRes.json();
    
    if (metadataData.success) {
      const meta = metadataData.metadata;
      console.log('   ✅ Asset encontrado:');
      console.log(`      - Nombre: ${meta.assetName}`);
      console.log(`      - Tipo: ${meta.assetType}`);
      console.log(`      - Render Time: ${meta.performance?.renderTime}s`);
      console.log(`      - GPU: ${meta.performance?.gpuModel}`);
      console.log(`      - VRAM: ${meta.performance?.vramUsage} MB`);
      console.log(`      - Resolución: ${meta.renderConfig?.resolution?.join('x')}`);
      console.log(`      - Tags: ${meta.tags.slice(0, 5).join(', ')}...`);
      console.log(`      - Style: ${meta.style?.join(', ')}`);
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // 3. Buscar Assets por Estilo
  console.log('\n🔍 3. Buscando assets con estilo "dreamcast-aesthetic"...');
  try {
    const searchRes = await fetch(
      `${API_BASE}?style=dreamcast-aesthetic&assetType=scene`
    );
    const searchData = await searchRes.json();
    
    console.log(`   ✅ Encontrados ${searchData.count} assets:`);
    searchData.results.forEach((asset, idx) => {
      console.log(`      ${idx + 1}. ${asset.assetName} (${asset.category})`);
    });
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // 4. Buscar Assets Similares
  console.log('\n🎯 4. Buscando assets similares a la ballena...');
  try {
    const similarRes = await fetch(`${API_BASE}/${whalePackageId}/similar?limit=5`);
    const similarData = await similarRes.json();
    
    console.log(`   ✅ Encontrados ${similarData.count} assets similares:`);
    similarData.similar.forEach((asset, idx) => {
      console.log(`      ${idx + 1}. ${asset.assetName}`);
    });
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // 5. Clonar Metadata para Variante "Amanecer Dorado"
  console.log('\n🔄 5. Clonando configuración para crear variante "Amanecer Dorado"...');
  try {
    const cloneRes = await fetch(`${API_BASE}/${whalePackageId}/clone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        overrides: {
          assetName: 'Ballena Jorobada - Amanecer Dorado',
          lighting: {
            type: 'cinematic',
            hdriPath: 'G:\\HDRIs\\Sunrise_8K.exr',
            hdriStrength: 1.8,
            volumetrics: {
              density: 0.008,
              anisotropy: 0.70,
              scatterColor: [0.95, 0.75, 0.35], // Tonos dorados
            },
          },
          camera: {
            type: 'perspective',
            focalLength: 50, // Más tele para drama
            fStop: 1.8, // Bokeh más pronunciado
            position: [-12, 5, -20], // Ángulo más dramático
          },
          tags: [
            'whale',
            'underwater',
            'cinematic',
            'sunrise',
            'golden-hour',
            'volumetric',
            'warm-tones',
          ],
          style: ['dreamcast-aesthetic', 'golden-hour-photography'],
        },
      }),
    });

    const cloneData = await cloneRes.json();
    
    if (cloneData.success) {
      console.log('   ✅ Configuración clonada exitosamente:');
      console.log(`      - Original ID: ${cloneData.originalId}`);
      console.log(`      - Nuevo ID: ${cloneData.cloneId}`);
      console.log(`      - Nombre: ${cloneData.clone.assetName}`);
      console.log(`      - Archivo: ${cloneData.filepath}`);
      console.log('\n   💡 Próximo paso: Usar este cloneId para renderizar automáticamente');
      console.log(`      await blenderService.render({ metadataId: "${cloneData.cloneId}" })`);
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // 6. Buscar Configuraciones Optimizadas (< 10s render)
  console.log('\n⚡ 6. Buscando configuraciones rápidas (< 10s render)...');
  try {
    const fastRes = await fetch(`${API_BASE}?assetType=scene`);
    const fastData = await fastRes.json();
    
    const fastRenders = fastData.results.filter(
      (asset) => asset.performance?.renderTime && asset.performance.renderTime < 10
    );

    console.log(`   ✅ Encontrados ${fastRenders.length} renders rápidos:`);
    fastRenders.slice(0, 5).forEach((asset, idx) => {
      console.log(
        `      ${idx + 1}. ${asset.assetName}: ${asset.performance.renderTime}s (${asset.renderConfig?.engine})`
      );
    });
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  console.log('\n✨ === Test Suite Completado ===');
  console.log('\n📖 Documentación completa: docs/ASSET_METADATA_SYSTEM.md');
}

// Ejecutar tests
testMetadataSystem().catch((error) => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});
