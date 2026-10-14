const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function createUpgradesShowcase() {
  console.log('Generando póster comparativo de upgrades en Blender 5.2 LTS...');

  const angelinaBeforePath = path.resolve('storage/posters/angelina_human_mesh_portrait.png');
  const angelinaAfterPath = path.resolve('storage/assets/renders/angelina_blender_portrait.png');
  const aetheriaBeforePath = path.resolve('storage/posters/twinkle_tale_aetheria_3d_realistic_v2.png');
  const aetheriaAfterPath = path.resolve('storage/assets/renders/aetheria_blender_cinematic.png');

  const angelinaBeforeB64 = fs.readFileSync(angelinaBeforePath).toString('base64');
  const angelinaAfterB64 = fs.readFileSync(angelinaAfterPath).toString('base64');
  const aetheriaBeforeB64 = fs.readFileSync(aetheriaBeforePath).toString('base64');
  const aetheriaAfterB64 = fs.readFileSync(aetheriaAfterPath).toString('base64');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 2560px;
      height: 1440px;
      background: radial-gradient(circle at 50% 15%, #111827 0%, #06090e 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f3f4f6;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 36px 48px;
      overflow: hidden;
    }
    header {
      text-align: center;
      margin-bottom: 28px;
    }
    .badge {
      display: inline-block;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.45);
      color: #fbbf24;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      padding: 6px 20px;
      border-radius: 9999px;
      margin-bottom: 10px;
    }
    h1 {
      font-size: 46px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin-bottom: 6px;
    }
    h1 span {
      background: linear-gradient(135deg, #f59e0b 0%, #06b6d4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p.subtitle {
      font-size: 18px;
      color: #9ca3af;
      letter-spacing: 0.5px;
    }
    .grid-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 36px;
      width: 100%;
      height: 1180px;
    }
    .section-card {
      background: rgba(17, 24, 39, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(12px);
    }
    .card-title {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .card-title .tech-tag {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 6px;
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.4);
    }
    .comparison-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      flex: 1;
      min-height: 0;
    }
    .image-box {
      position: relative;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: #030712;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .image-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .image-tag {
      position: absolute;
      top: 14px;
      left: 14px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1px;
      border-radius: 6px;
      text-transform: uppercase;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      backdrop-filter: blur(8px);
    }
    .tag-before {
      background: rgba(239, 68, 68, 0.85);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .tag-after {
      background: rgba(16, 185, 129, 0.85);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .feature-list {
      margin-top: 14px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .feature-item {
      background: rgba(31, 41, 55, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #d1d5db;
    }
    .feature-item strong {
      color: #f3f4f6;
      display: block;
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
  <header>
    <div class="badge">Blender 5.2 LTS Headless Pipeline • Visual Leap</div>
    <h1>Evolución 3D: <span>Angelina Jolie</span> &amp; <span>Aetheria</span></h1>
    <p class="subtitle">Comparativa directa: Renderizado WebGL básico vs. Motor Fotorrealista Blender 5.2 (PBR, SSS, ARKit &amp; EEVEE Next)</p>
  </header>

  <div class="grid-container">
    <!-- SECCIÓN 1: ANGELINA JOLIE -->
    <div class="section-card">
      <div class="card-title">
        <span>👤 Angelina Jolie: Retrato Humano Realista</span>
        <span class="tech-tag">Subsurface Scattering &amp; ARKit</span>
      </div>
      <div class="comparison-row">
        <div class="image-box">
          <img src="data:image/png;base64,${angelinaBeforeB64}" alt="Angelina Before">
          <div class="image-tag tag-before">WebGL 2.0 (Antes)</div>
        </div>
        <div class="image-box">
          <img src="data:image/png;base64,${angelinaAfterB64}" alt="Angelina After">
          <div class="image-tag tag-after">Blender 5.2 SSS (Ahora)</div>
        </div>
      </div>
      <div class="feature-list">
        <div class="feature-item">
          <strong>Subsurface Scattering (SSS)</strong>
          Dispersión dérmica translúcida profunda; elimina el efecto plástico.
        </div>
        <div class="feature-item">
          <strong>Micro-expresiones ARKit</strong>
          Sonrisa sutil (0.28), guiño ocular (0.26) y elevación de cejas (0.35).
        </div>
        <div class="feature-item">
          <strong>Iluminación Rembrandt</strong>
          Triángulo de luz suave en mejilla, Fill frío crepuscular y Hair rim light.
        </div>
        <div class="feature-item">
          <strong>Física de Cabello y Ojos</strong>
          Reflexión corneal cáustica y tinte moreno chocolate con brillo especular.
        </div>
      </div>
    </div>

    <!-- SECCIÓN 2: AETHERIA -->
    <div class="section-card">
      <div class="card-title">
        <span>🏛️ Aetheria: Ciudadela Celestial Flotante</span>
        <span class="tech-tag">PBR Shaders &amp; Acrópolis Clásica</span>
      </div>
      <div class="comparison-row">
        <div class="image-box">
          <img src="data:image/png;base64,${aetheriaBeforeB64}" alt="Aetheria Before">
          <div class="image-tag tag-before">Canvas Three.js (Antes)</div>
        </div>
        <div class="image-box">
          <img src="data:image/png;base64,${aetheriaAfterB64}" alt="Aetheria After">
          <div class="image-tag tag-after">Blender 5.2 EEVEE (Ahora)</div>
        </div>
      </div>
      <div class="feature-list">
        <div class="feature-item">
          <strong>Texturas PBR 1K &amp; Geología</strong>
          Risco rocoso esculpido con mapas de normales, aspereza y estratos basálticos.
        </div>
        <div class="feature-item">
          <strong>Acrópolis Clásica &amp; Cúpula</strong>
          14 columnas corintias con capiteles de oro, cúpula nervada y orbe celestial.
        </div>
        <div class="feature-item">
          <strong>Cascada y Río al Vacío</strong>
          Flujo de agua translúcida precipitándose al abismo con bruma y espuma.
        </div>
        <div class="feature-item">
          <strong>Atmósfera y Cristales Arcanos</strong>
          Monolitos orbitantes con halo cian, pebeteros encendidos y cordillera nevada.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.setContent(html, { waitUntil: 'load' });

  const outPath = path.resolve('storage/assets/renders/blender_upgrades_showcase.png');
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();

  // Copiar a artifact dir
  const artifactDir = 'C:\\Users\\xiphos-pc1\\.gemini\\antigravity-ide\\brain\\c2671350-674a-49d7-b91f-df147e558782';
  if (fs.existsSync(artifactDir)) {
    const artifactPath = path.join(artifactDir, 'blender_upgrades_showcase.png');
    fs.copyFileSync(outPath, artifactPath);
  }

  console.log(`✓ Póster guardado con éxito: ${outPath}`);
}

createUpgradesShowcase().catch(console.error);
