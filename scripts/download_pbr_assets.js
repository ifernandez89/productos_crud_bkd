/**
 * JARBEES PBR & 3D ASSET PACK DOWNLOADER
 * Descarga activos 100% libres de derechos (CC0 / Apache 2.0 / Khronos)
 * desde Poly Haven y Khronos Group para enriquecer el estudio 3D.
 */
const fs = require('fs');
const path = require('path');

const ASSETS_TO_DOWNLOAD = [
  // ── 1. MAPAS DE ENTORNO HDRI (360° Lighting & Reflections de Poly Haven CC0) ──
  {
    name: 'sunset_fairway_1k.hdr',
    type: 'hdri',
    dir: 'textures/hdri',
    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/sunset_fairway_1k.hdr',
    desc: 'Atardecer cálido dorado crepuscular (ideal para escenas oceánicas y Dreamcast)',
  },
  {
    name: 'quarry_01_1k.hdr',
    type: 'hdri',
    dir: 'textures/hdri',
    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/quarry_01_1k.hdr',
    desc: 'Luz natural diurna para templos arqueológicos y acantilados rocosos',
  },
  {
    name: 'studio_small_08_1k.hdr',
    type: 'hdri',
    dir: 'textures/hdri',
    url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
    desc: 'Iluminación de estudio fotográfico profesional para retratos 3D',
  },

  // ── 2. MODELOS 3D GLB HIPERREALISTAS (Khronos Group glTF Sample Assets) ──
  {
    name: 'AntiqueCamera.glb',
    type: 'model3d',
    dir: 'models',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/AntiqueCamera/glTF-Binary/AntiqueCamera.glb',
    desc: 'Cámara clásica con madera pulida, latón metálico envejecido y lentes de cristal óptico',
  },
  {
    name: 'WaterBottle.glb',
    type: 'model3d',
    dir: 'models',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
    desc: 'Prueba de materiales translúcidos, plástico transparente y condensación',
  },
  {
    name: 'Fox.glb',
    type: 'model3d',
    dir: 'models',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Fox/glTF-Binary/Fox.glb',
    desc: 'Criatura animal estilizada en 3D con rig y articulaciones esqueléticas',
  },

  // ── 3. MAPAS DE TEXTURA PBR (Poly Haven CC0: Difuso, Normal y Rugosidad) ──
  {
    name: 'rock_boulder_diff_1k.jpg',
    type: 'texture',
    dir: 'textures/pbr',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_cracked/rock_boulder_cracked_diff_1k.jpg',
    desc: 'Mapa de color/albedo de roca basáltica agrietada',
  },
  {
    name: 'rock_boulder_nor_1k.jpg',
    type: 'texture',
    dir: 'textures/pbr',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_cracked/rock_boulder_cracked_nor_gl_1k.jpg',
    desc: 'Mapa de normales OpenGL para relieve de roca basáltica',
  },
  {
    name: 'rock_boulder_rough_1k.jpg',
    type: 'texture',
    dir: 'textures/pbr',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_cracked/rock_boulder_cracked_rough_1k.jpg',
    desc: 'Mapa de rugosidad superficial de roca basáltica',
  },
  {
    name: 'aerial_beach_diff_1k.jpg',
    type: 'texture',
    dir: 'textures/pbr',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_beach_01/aerial_beach_01_diff_1k.jpg',
    desc: 'Mapa de albedo de arena costera y orilla marina',
  },
  {
    name: 'aerial_beach_nor_1k.jpg',
    type: 'texture',
    dir: 'textures/pbr',
    url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_beach_01/aerial_beach_01_nor_gl_1k.jpg',
    desc: 'Mapa de normales para ondulación de arena mojada',
  },
];

async function downloadAsset(asset) {
  const targetDir = path.join(process.cwd(), 'storage', 'assets', asset.dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetFile = path.join(targetDir, asset.name);
  if (fs.existsSync(targetFile)) {
    const stats = fs.statSync(targetFile);
    console.log(`⚡ [Ya existe] ${asset.name} (${Math.round(stats.size / 1024)} KB)`);
    return { name: asset.name, path: targetFile, sizeKb: Math.round(stats.size / 1024), status: 'cached' };
  }

  console.log(`⬇️  Descargando [${asset.type.toUpperCase()}]: ${asset.name}...`);
  try {
    const res = await fetch(asset.url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(targetFile, buffer);
    const sizeKb = Math.round(buffer.length / 1024);
    console.log(`   ✅ Guardado: ${targetFile} (${sizeKb} KB)`);
    return { name: asset.name, path: targetFile, sizeKb, status: 'downloaded' };
  } catch (err) {
    console.error(`   ❌ Error descargando ${asset.name}:`, err.message);
    return { name: asset.name, error: err.message, status: 'failed' };
  }
}

async function main() {
  console.log('======================================================');
  console.log('🚀 INICIANDO DESCARGA DEL PACK DE ACTIVOS PBR & 3D');
  console.log('   Fuentes: Poly Haven (CC0) y Khronos Group glTF Samples');
  console.log('======================================================\n');

  const results = [];
  for (const asset of ASSETS_TO_DOWNLOAD) {
    const r = await downloadAsset(asset);
    results.push(r);
  }

  console.log('\n======================================================');
  console.log('📊 RESUMEN DE ACTIVOS INTEGRADOS EN JARBEES:');
  console.log('======================================================');
  results.forEach((r) => {
    if (r.status !== 'failed') {
      console.log(`• ${r.name.padEnd(28)} | ${r.sizeKb.toString().padStart(6)} KB | ${r.status}`);
    } else {
      console.log(`• ${r.name.padEnd(28)} | FALLÓ: ${r.error}`);
    }
  });
  console.log('\n🎉 ¡TODOS LOS ACTIVOS SE ENCUENTRAN ALOJADOS EN STORAGE/ASSETS!');
}

main();
