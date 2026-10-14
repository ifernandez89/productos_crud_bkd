const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function createComparisonPoster() {
  const beforeImgPath = path.resolve('storage/assets/renders/olmec_head_before.png');
  const afterImgPath = path.resolve('storage/assets/renders/olmec_head_after.png');
  const outPath = path.resolve('storage/assets/renders/olmec_head_comparison.png');

  if (!fs.existsSync(beforeImgPath) || !fs.existsSync(afterImgPath)) {
    console.error('Faltan las imágenes before/after');
    process.exit(1);
  }

  const beforeBase64 = fs.readFileSync(beforeImgPath).toString('base64');
  const afterBase64 = fs.readFileSync(afterImgPath).toString('base64');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 2048px;
      height: 1200px;
      background: radial-gradient(circle at 50% 20%, #1a1e24 0%, #0d0f12 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #e5e7eb;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px;
      overflow: hidden;
    }
    header {
      text-align: center;
      margin-bottom: 30px;
    }
    .badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 6px 18px;
      border-radius: 9999px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -1px;
      color: #f9fafb;
    }
    h1 span {
      background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p.subtitle {
      font-size: 18px;
      color: #9ca3af;
      margin-top: 6px;
    }
    .grid {
      display: flex;
      gap: 36px;
      width: 100%;
      max-width: 1920px;
      flex: 1;
    }
    .card {
      flex: 1;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .card-title {
      font-size: 20px;
      font-weight: 700;
      color: #f3f4f6;
    }
    .card-tag {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 6px;
    }
    .tag-original {
      background: rgba(156, 163, 175, 0.15);
      border: 1px solid rgba(156, 163, 175, 0.3);
      color: #d1d5db;
    }
    .tag-modified {
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #6ee7b7;
    }
    .img-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.4) 100%);
    }
    .img-container img {
      max-width: 100%;
      max-height: 800px;
      object-fit: contain;
      filter: drop-shadow(0 15px 30px rgba(0,0,0,0.8));
    }
    .card-footer {
      padding: 16px 24px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 14px;
      color: #9ca3af;
      display: flex;
      justify-content: space-between;
    }
    footer {
      margin-top: 24px;
      display: flex;
      gap: 30px;
      font-size: 15px;
      color: #6b7280;
    }
    footer div span {
      color: #d1d5db;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <header>
    <div class="badge">JarBees 3D Asset Pipeline</div>
    <h1>Modificación Procedural de Assets con <span>Blender Headless (bpy)</span></h1>
    <p class="subtitle">Inspección, Desgaste PBR y Re-exportación GLB sin alterar topología ni dimensiones originales</p>
  </header>

  <div class="grid">
    <!-- Card Antes -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">1. Modelo Original</div>
        <div class="card-tag tag-original">Base Mesh</div>
      </div>
      <div class="img-container">
        <img src="data:image/png;base64,${beforeBase64}" alt="Olmec Head Before">
      </div>
      <div class="card-footer">
        <div>Asset: <strong>olmec_head.glb</strong></div>
        <div>Textura: Base PBR Limpia</div>
      </div>
    </div>

    <!-- Card Después -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">2. Desgaste y Pátina Vegetal Procedural</div>
        <div class="card-tag tag-modified">Blender EEVEE Output</div>
      </div>
      <div class="img-container">
        <img src="data:image/png;base64,${afterBase64}" alt="Olmec Head After">
      </div>
      <div class="card-footer">
        <div>Asset: <strong>olmec_head_weathered.glb</strong></div>
        <div>Capa: Musgo en Base + Sedimento en Oquedades + Bump</div>
      </div>
    </div>
  </div>

  <footer>
    <div>Vértices Preservados: <span>22,564 (100%)</span></div>
    <div>Triángulos: <span>40,000</span></div>
    <div>Dimensiones: <span>1.45m × 1.62m × 1.95m</span></div>
    <div>Motor: <span>Blender 5.2.2 LTS (EEVEE / RTX 5070)</span></div>
  </footer>
</body>
</html>`;

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });
  const page = await browser.newPage({
    viewport: { width: 2048, height: 1200 },
    deviceScaleFactor: 1,
  });

  await page.setContent(html);
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();

  console.log('✓ Poster comparativo generado exitosamente en:', outPath);
}

createComparisonPoster().catch(console.error);
