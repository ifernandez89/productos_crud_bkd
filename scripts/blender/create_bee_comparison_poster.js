const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function createBeeComparisonPoster() {
  console.log('Generando póster comparativo: Abeja Orgánica vs JarBee Cyber Robot...');

  const orig3qPath = path.resolve('storage/assets/renders/bee/original_threequarter.png');
  const robot3qPath = path.resolve('storage/assets/renders/bee/robot_threequarter.png');
  const origTopPath = path.resolve('storage/assets/renders/bee/original_top.png');
  const robotTopPath = path.resolve('storage/assets/renders/bee/robot_top.png');

  const orig3qB64 = fs.readFileSync(orig3qPath).toString('base64');
  const robot3qB64 = fs.readFileSync(robot3qPath).toString('base64');
  const origTopB64 = fs.readFileSync(origTopPath).toString('base64');
  const robotTopB64 = fs.readFileSync(robotTopPath).toString('base64');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 2560px;
      height: 1440px;
      background: radial-gradient(circle at 50% 12%, #0e1726 0%, #030712 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #f3f4f6;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 48px;
      overflow: hidden;
    }
    header {
      text-align: center;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-block;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.45);
      color: #fbbf24;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      padding: 6px 20px;
      border-radius: 9999px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 44px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #ffffff;
      margin-bottom: 6px;
    }
    h1 span.amber {
      background: linear-gradient(135deg, #f59e0b 0%, #fcd34d 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    h1 span.cyan {
      background: linear-gradient(135deg, #06b6d4 0%, #38bdf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p.subtitle {
      font-size: 17px;
      color: #9ca3af;
      letter-spacing: 0.5px;
    }
    .grid-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      width: 100%;
      height: 1200px;
    }
    .card {
      background: rgba(17, 24, 39, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(12px);
    }
    .card-title {
      font-size: 23px;
      font-weight: 800;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .tag {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 6px;
    }
    .tag-red {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }
    .tag-green {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .images-split {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 14px;
      flex: 1;
      min-height: 0;
    }
    .img-box {
      position: relative;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #030712;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .img-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .label-badge {
      position: absolute;
      top: 12px;
      left: 12px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1px;
      border-radius: 6px;
      text-transform: uppercase;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    }
    .label-badge.organic {
      background: rgba(180, 83, 9, 0.85);
      color: #fef3c7;
      border: 1px solid rgba(253, 230, 138, 0.3);
    }
    .label-badge.robot {
      background: rgba(8, 145, 178, 0.85);
      color: #ecfeff;
      border: 1px solid rgba(165, 243, 252, 0.3);
    }
    .features {
      margin-top: 14px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .f-item {
      background: rgba(31, 41, 55, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #d1d5db;
    }
    .f-item strong {
      color: #f3f4f6;
      display: block;
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
  <header>
    <div class="badge">Pipeline Blender 5.2 LTS • Procedural Mesh Adaptation</div>
    <h1>Transformación: <span class="amber">Abeja Orgánica</span> ➔ <span class="cyan">JarBee Cyber Drone</span></h1>
    <p class="subtitle">Conversión determinista de asset 3D: blindaje de gunmetal, alas de celda solar cian, visores HUD y compresión web 86%</p>
  </header>

  <div class="grid-container">
    <!-- PANEL IZQUIERDO: ANTES (ORGÁNICA) -->
    <div class="card">
      <div class="card-title">
        <span>🐝 Modelo Original: Abeja Biológica</span>
        <span class="tag tag-red">20.1 MB • No apto avatar UI</span>
      </div>
      <div class="images-split">
        <div class="img-box">
          <img src="data:image/png;base64,${orig3qB64}" alt="Abeja Orgánica 3/4">
          <div class="label-badge organic">Perspectiva 3/4</div>
        </div>
        <div class="img-box">
          <img src="data:image/png;base64,${origTopB64}" alt="Abeja Orgánica Cenital">
          <div class="label-badge organic">Vista Cenital</div>
        </div>
      </div>
      <div class="features">
        <div class="f-item">
          <strong>Textura de Pelo Natural</strong>
          Pelaje amarillo y marrón oscuro biológico simulado en difuso plano.
        </div>
        <div class="f-item">
          <strong>Alas de Membrana Venosa</strong>
          Alas de insecto transparentes con venación orgánica marrón claro.
        </div>
        <div class="f-item">
          <strong>Ojos Compuestos Opacos</strong>
          Ojos biológicos negros sin tecnología, reflectividad ni emisión.
        </div>
        <div class="f-item">
          <strong>Escala Desfasada (22.2m)</strong>
          Modelo gigantesco sin centrar ni orientación frontal respecto a cámara web.
        </div>
      </div>
    </div>

    <!-- PANEL DERECHO: DESPUÉS (CYBER DRONE) -->
    <div class="card">
      <div class="card-title">
        <span>🤖 Modelo Nuevo: JarBee Cyber Avatar</span>
        <span class="tag tag-green">2.76 MB Draco / 4.37 MB GLB • 100% Web Ready</span>
      </div>
      <div class="images-split">
        <div class="img-box">
          <img src="data:image/png;base64,${robot3qB64}" alt="JarBee Robot 3/4">
          <div class="label-badge robot">Perspectiva 3/4 (PBR)</div>
        </div>
        <div class="img-box">
          <img src="data:image/png;base64,${robotTopB64}" alt="JarBee Robot Cenital">
          <div class="label-badge robot">Vista Cenital (Circuitos)</div>
        </div>
      </div>
      <div class="features">
        <div class="f-item">
          <strong>Blindaje Gunmetal &amp; Ámbar</strong>
          Placas metálicas esmaltadas con remaches y costuras mecánicas profundas.
        </div>
        <div class="f-item">
          <strong>Alas Hex-Solar con Circuitos</strong>
          Cristal azul ahumado con rejilla fotovoltaica y pistas conductoras cian.
        </div>
        <div class="f-item">
          <strong>Visor Óptico HUD Emisivo</strong>
          Ojos convertidos en visores digitales con scanlines y halo ámbar/cian.
        </div>
        <div class="f-item">
          <strong>Normalización &amp; 3 Animaciones</strong>
          Escala 1.0 centrada frontalmente, 107 huesos intactos y clips: hover, idle, land.
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

  const outPath = path.resolve('storage/assets/renders/bee_robot_comparison.png');
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();

  // Copiar a artifact dir
  const artifactDir = 'C:\\Users\\xiphos-pc1\\.gemini\antigravity-ide\\brain\\c2671350-674a-49d7-b91f-df147e558782';
  if (fs.existsSync(artifactDir)) {
    const artifactPath = path.join(artifactDir, 'bee_robot_comparison.png');
    fs.copyFileSync(outPath, artifactPath);
  }

  console.log(`✓ Póster guardado con éxito: ${outPath}`);
}

createBeeComparisonPoster().catch(console.error);
