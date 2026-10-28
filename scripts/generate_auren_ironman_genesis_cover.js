const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function generateAurenIronManGenesisCover() {
  console.log('🚀 Optimizando composición de portada retro-futurista Sega Genesis: Iron Man & Auren...');

  const rendersDir = path.resolve('storage/assets/renders');
  const postersDir = path.resolve('storage/posters');
  fs.mkdirSync(postersDir, { recursive: true });

  // 1. Cargar assets 3D
  const ironManCoverPath = path.join(rendersDir, 'iron_man_action_cover.png');
  const aetheriaCoverPath = path.join(rendersDir, 'aetheria_blender_cinematic.png');
  const robotBeePath = path.join(rendersDir, 'bee', 'robot_threequarter.png');

  const ironManB64 = fs.existsSync(ironManCoverPath)
    ? 'data:image/png;base64,' + fs.readFileSync(ironManCoverPath).toString('base64')
    : '';

  const aetheriaB64 = fs.existsSync(aetheriaCoverPath)
    ? 'data:image/png;base64,' + fs.readFileSync(aetheriaCoverPath).toString('base64')
    : '';

  const robotBeeB64 = fs.existsSync(robotBeePath)
    ? 'data:image/png;base64,' + fs.readFileSync(robotBeePath).toString('base64')
    : '';

  console.log(`📸 Assets verificados: Iron Man 3D (${ironManB64 ? 'OK' : 'NO'}), Villa Auren/Aetheria (${aetheriaB64 ? 'OK' : 'NO'}), JarBee Robot (${robotBeeB64 ? 'OK' : 'NO'})`);

  const width = 1440;
  const height = 1920;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Iron Man & Auren - Villa Auren: The Virtual Odyssey (Sega Genesis)</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Montserrat:ital,wght@0,800;0,900;1,900&family=Share+Tech+Mono&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #06070B;
      font-family: 'Montserrat', sans-serif;
      position: relative;
    }

    /* ─── VENTANA DE LA ILUSTRACIÓN ─── */
    .viewport-scene {
      position: absolute;
      top: 112px;
      left: 48px;
      width: ${width - 96}px;
      height: ${height - 208}px;
      background: radial-gradient(ellipse at 50% 25%, #0c182c 0%, #060b17 55%, #020306 100%);
      overflow: hidden;
    }

    /* ─── FONDO 1: El Mundo Virtual de Villa Auren ─── */
    .bg-virtual-world {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 65%;
      background-image: url('${aetheriaB64}');
      background-size: cover;
      background-position: center 20%;
      filter: saturate(1.3) contrast(1.2) brightness(0.7);
      opacity: 0.55;
      mix-blend-mode: screen;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 45%, rgba(0,0,0,0) 100%);
      -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 45%, rgba(0,0,0,0) 100%);
    }

    /* ─── AURORAS BOREALES POLARES ─── */
    .aurora-emerald {
      position: absolute;
      top: 2%;
      left: -20%;
      width: 140%;
      height: 450px;
      background: radial-gradient(ellipse at 45% 45%, rgba(0, 255, 179, 0.32) 0%, rgba(0, 229, 255, 0.18) 35%, rgba(0,0,0,0) 70%);
      transform: rotate(-7deg);
      filter: blur(45px);
      mix-blend-mode: screen;
    }
    .aurora-purple {
      position: absolute;
      top: 10%;
      right: -15%;
      width: 130%;
      height: 420px;
      background: radial-gradient(ellipse at 55% 45%, rgba(168, 85, 247, 0.38) 0%, rgba(59, 130, 246, 0.22) 40%, rgba(0,0,0,0) 75%);
      transform: rotate(6deg);
      filter: blur(50px);
      mix-blend-mode: screen;
    }

    /* ─── REJILLA DE PERSPECTIVA HOLOGRÁFICA (SEGA CYBER-GRID) ─── */
    .cyber-grid-plane {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 580px;
      background: 
        linear-gradient(to bottom, rgba(6,7,11,0) 0%, rgba(6,7,11,0.92) 75%, #06070B 100%),
        repeating-linear-gradient(0deg, transparent, transparent 38px, rgba(0, 229, 255, 0.28) 39px, rgba(0, 229, 255, 0.28) 40px),
        repeating-linear-gradient(90deg, transparent, transparent 78px, rgba(0, 229, 255, 0.22) 79px, rgba(0, 229, 255, 0.22) 80px);
      transform: perspective(580px) rotateX(68deg);
      transform-origin: bottom center;
      mask-image: linear-gradient(to top, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 90%);
      -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 90%);
    }

    .horizon-glow {
      position: absolute;
      bottom: 270px;
      left: 50%;
      transform: translateX(-50%);
      width: 800px;
      height: 150px;
      background: radial-gradient(ellipse at 50% 100%, rgba(0, 240, 255, 0.85) 0%, rgba(0, 102, 255, 0.4) 40%, rgba(0,0,0,0) 75%);
      filter: blur(28px);
      mix-blend-mode: screen;
    }

    /* ─── HÉROE CENTRAL: Iron Man Render 3D con Screen Blending ─── */
    .iron-man-hero-wrapper {
      position: absolute;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      width: 880px;
      height: 1180px;
      z-index: 10;
      display: flex;
      justify-content: center;
      align-items: center;
      mix-blend-mode: screen;
      mask-image: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 98%);
      -webkit-mask-image: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 98%);
    }

    .iron-man-hero-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: contrast(1.15) brightness(1.08) drop-shadow(0 0 30px rgba(0, 229, 255, 0.4));
    }

    /* Resplandor hiper-brillante del Arc Reactor Unibeam */
    .arc-reactor-bloom {
      position: absolute;
      bottom: 640px;
      left: 50%;
      transform: translateX(-50%);
      width: 220px;
      height: 220px;
      background: radial-gradient(circle, #ffffff 0%, rgba(0, 245, 255, 0.95) 25%, rgba(0, 160, 255, 0.45) 55%, transparent 75%);
      filter: blur(15px);
      mix-blend-mode: screen;
      z-index: 12;
      pointer-events: none;
    }
    .arc-reactor-core-pinpoint {
      position: absolute;
      bottom: 730px;
      left: 50%;
      transform: translateX(-50%);
      width: 44px;
      height: 44px;
      background: #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 0 30px #00FFFF, 0 0 70px #0088FF, 0 0 120px #00FFFF;
      z-index: 13;
      pointer-events: none;
    }

    /* Rayos repulsores de energía */
    .plasma-ray-left {
      position: absolute;
      bottom: 690px;
      left: 38%;
      width: 140px;
      height: 2px;
      background: linear-gradient(90deg, #00FFFF, transparent);
      box-shadow: 0 0 12px #00FFFF;
      transform: rotate(-30deg);
      opacity: 0.75;
      z-index: 12;
    }
    .plasma-ray-right {
      position: absolute;
      bottom: 690px;
      right: 38%;
      width: 140px;
      height: 2px;
      background: linear-gradient(-90deg, #00FFFF, transparent);
      box-shadow: 0 0 12px #00FFFF;
      transform: rotate(30deg);
      opacity: 0.75;
      z-index: 12;
    }

    /* ─── ACOMPAÑANTE: JarBee Cyber Robot (Transparente) ─── */
    .jarbee-companion {
      position: absolute;
      top: 140px;
      right: 70px;
      width: 260px;
      height: 260px;
      z-index: 15;
      background-image: url('${robotBeeB64}');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      filter: drop-shadow(0 0 25px rgba(245, 158, 11, 0.8)) drop-shadow(0 15px 30px rgba(0,0,0,0.9));
      transform: rotate(-10deg);
    }
    .jarbee-tag {
      position: absolute;
      top: 380px;
      right: 90px;
      background: rgba(10, 15, 26, 0.85);
      border: 1px solid rgba(245, 158, 11, 0.7);
      box-shadow: 0 0 20px rgba(245, 158, 11, 0.35);
      border-radius: 4px;
      padding: 6px 14px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      color: #FBBF24;
      letter-spacing: 2px;
      z-index: 16;
      backdrop-filter: blur(6px);
    }

    /* ─── BADGE DE COMANDANTE AUREN (Izquierda) ─── */
    .auren-telemetry-badge {
      position: absolute;
      top: 140px;
      left: 70px;
      z-index: 15;
      background: rgba(8, 14, 28, 0.88);
      border: 1px solid rgba(0, 229, 255, 0.65);
      box-shadow: 0 0 30px rgba(0, 229, 255, 0.3), inset 0 0 15px rgba(0, 229, 255, 0.15);
      padding: 16px 22px;
      border-radius: 8px;
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .auren-telemetry-badge .badge-header {
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      font-weight: 900;
      color: #00E5FF;
      letter-spacing: 2.5px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .auren-telemetry-badge .hub-name {
      font-size: 12px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 1.5px;
    }
    .auren-telemetry-badge .meta {
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      color: #9CA3AF;
      letter-spacing: 1px;
    }
    .auren-telemetry-badge .status-online {
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      color: #10B981;
      font-weight: bold;
    }

    /* Holograma AR Retícula */
    .hud-reticle {
      position: absolute;
      bottom: 390px;
      left: 100px;
      width: 140px;
      height: 140px;
      border: 1px dashed rgba(0, 229, 255, 0.4);
      border-radius: 50%;
      pointer-events: none;
    }
    .hud-reticle-inner {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 70px;
      height: 70px;
      border: 1px solid rgba(0, 229, 255, 0.6);
      border-radius: 50%;
    }

    /* ─── BANNER DE TÍTULO PRINCIPAL (16-BIT RETRO GLORY) ─── */
    .title-container {
      position: absolute;
      bottom: 125px;
      left: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 30;
      text-align: center;
    }

    .main-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 92px;
      font-weight: 900;
      font-style: italic;
      letter-spacing: 5px;
      text-transform: uppercase;
      line-height: 0.92;
      position: relative;
    }

    .title-ironman {
      background: linear-gradient(180deg, #FFFFFF 0%, #FFE600 22%, #FF5A00 52%, #C40000 82%, #450000 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 4px 0 #7A0A0A) drop-shadow(0 8px 0 #380303) drop-shadow(0 15px 30px rgba(0,0,0,0.95));
      display: block;
    }
    .title-auren {
      font-size: 66px;
      background: linear-gradient(180deg, #FFFFFF 0%, #85CDFF 28%, #124E96 70%, #061A38 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 3px 0 #0C366B) drop-shadow(0 6px 0 #041224) drop-shadow(0 12px 25px rgba(0,0,0,0.95));
      display: block;
      margin-top: -6px;
    }

    .subtitle-badge {
      display: inline-flex;
      align-items: center;
      gap: 16px;
      background: rgba(4, 9, 20, 0.96);
      border: 2px solid #00E5FF;
      border-radius: 8px;
      padding: 10px 38px;
      box-shadow: 0 0 35px rgba(0, 229, 255, 0.55), inset 0 0 20px rgba(0, 229, 255, 0.25);
      margin-top: 14px;
    }
    .subtitle-badge .world-name {
      font-family: 'Orbitron', sans-serif;
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 5px;
      color: #FFFFFF;
      text-transform: uppercase;
    }
    .subtitle-badge .nexo-protocol {
      font-family: 'Orbitron', sans-serif;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 3px;
      color: #FFD700;
    }

    /* ─── PACKAGING AUTÉNTICO SEGA GENESIS ─── */
    .sega-packaging-frame {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
    }

    .grid-paper-texture {
      background-color: #0A0A0E;
      background-image: 
        linear-gradient(rgba(35, 38, 52, 0.85) 1px, transparent 1px),
        linear-gradient(90deg, rgba(35, 38, 52, 0.85) 1px, transparent 1px);
      background-size: 16px 16px;
    }

    /* Barra Superior */
    .header-bar {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 112px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 48px;
      border-bottom: 4px solid #E62429;
    }
    .header-bar::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 0;
      width: 100%;
      height: 4px;
      background: #FFD700;
    }

    .logo-cluster {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .sega-pill {
      background: #002D80;
      border: 3px solid #FFFFFF;
      border-radius: 12px;
      padding: 4px 18px;
      font-family: 'Montserrat', sans-serif;
      font-size: 30px;
      font-weight: 900;
      font-style: italic;
      color: #FFFFFF;
      letter-spacing: 2px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
    }
    .genesis-wordmark {
      font-family: 'Montserrat', sans-serif;
      font-size: 46px;
      font-weight: 900;
      letter-spacing: 6px;
      color: #FFFFFF;
      text-shadow: 2px 3px 0 #000, 0 0 25px rgba(255,255,255,0.45);
    }
    .bits-bracket {
      font-family: 'Montserrat', sans-serif;
      font-size: 20px;
      font-weight: 900;
      color: #FFD700;
      letter-spacing: 3px;
    }

    .cartridge-badge {
      background: #1C1C26;
      border: 2px solid #00E5FF;
      border-radius: 6px;
      padding: 8px 24px;
      font-family: 'Orbitron', sans-serif;
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 3px;
      color: #00E5FF;
      box-shadow: 0 0 15px rgba(0, 229, 255, 0.4);
    }

    /* Bordes Laterales */
    .side-border-left {
      position: absolute;
      top: 112px;
      left: 0;
      width: 48px;
      height: ${height - 208}px;
      border-right: 2px solid #33384A;
    }
    .side-border-right {
      position: absolute;
      top: 112px;
      right: 0;
      width: 48px;
      height: ${height - 208}px;
      border-left: 2px solid #33384A;
    }

    /* Barra Inferior */
    .footer-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 96px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 48px;
      border-top: 4px solid #FFD700;
    }

    /* Sello Oficial de Calidad Sega */
    .seal-of-quality {
      width: 154px;
      height: 72px;
      border: 3px solid #FFD700;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: radial-gradient(circle, #2A2000 0%, #0A0A00 100%);
      box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
      outline: 2px dashed #FFD700;
      outline-offset: -7px;
    }
    .seal-of-quality .seal-sub {
      font-size: 10px;
      font-weight: 900;
      color: #FFD700;
      letter-spacing: 2px;
    }
    .seal-of-quality .seal-main {
      font-size: 18px;
      font-weight: 900;
      font-style: italic;
      color: #FFFFFF;
      letter-spacing: 1px;
      line-height: 1;
    }

    .footer-credits {
      font-family: 'Share Tech Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #9CA3AF;
      letter-spacing: 2px;
      text-align: center;
    }
    .footer-credits b {
      color: #00E5FF;
    }

    /* Código de Barras */
    .barcode-box {
      background: #FFFFFF;
      border-radius: 4px;
      padding: 6px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.7);
    }
    .barcode-lines {
      display: flex;
      height: 38px;
      align-items: stretch;
      gap: 3px;
    }
    .barcode-lines .b1 { width: 3px; background: #000; }
    .barcode-lines .b2 { width: 6px; background: #000; }
    .barcode-lines .b3 { width: 2px; background: #000; }
    .barcode-lines .b4 { width: 8px; background: #000; }
    .barcode-lines .b5 { width: 4px; background: #000; }
    .barcode-box span {
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      font-weight: 900;
      color: #000;
      margin-top: 3px;
      letter-spacing: 2.5px;
    }
  </style>
</head>
<body>

  <!-- 1. MUNDO VIRTUAL Y HÉROES -->
  <div class="viewport-scene">
    <!-- Arquitectura de Villa Auren -->
    <div class="bg-virtual-world"></div>

    <!-- Auroras polares -->
    <div class="aurora-emerald"></div>
    <div class="aurora-purple"></div>

    <!-- Cyber-Grid de perspectiva -->
    <div class="cyber-grid-plane"></div>
    <div class="horizon-glow"></div>

    <!-- Retícula HUD -->
    <div class="hud-reticle">
      <div class="hud-reticle-inner"></div>
    </div>

    <!-- Badge holográfico de Auren -->
    <div class="auren-telemetry-badge">
      <div class="badge-header">⚡ COMANDANTE AUREN</div>
      <div class="hub-name">VILLA AUREN HUB · TALLER NEXO-01</div>
      <div class="meta">BIOMA: ANTÁRTIDA POLAR [78°S, 120°W]</div>
      <div class="meta">PROPULSIÓN: FASE VEIL · MACH 3.2</div>
      <div class="status-online">● SISTEMAS EN LÍNEA · VIRTUAL SYNC OK</div>
    </div>

    <!-- JarBee Cyber Robot -->
    <div class="jarbee-companion"></div>
    <div class="jarbee-tag">JARBEE PROTO-01 · AIR PATROL</div>

    <!-- Rayos de plasma y reactor de arco -->
    <div class="plasma-ray-left"></div>
    <div class="plasma-ray-right"></div>
    <div class="arc-reactor-bloom"></div>
    <div class="arc-reactor-core-pinpoint"></div>

    <!-- Héroe Central Iron Man Render 3D -->
    <div class="iron-man-hero-wrapper">
      <img src="${ironManB64}" alt="Iron Man 3D Render" />
    </div>

    <!-- Título Principal -->
    <div class="title-container">
      <div class="main-title">
        <span class="title-ironman">IRON MAN</span>
        <span class="title-auren">&amp; AUREN</span>
      </div>

      <div class="subtitle-badge">
        <span class="world-name">VILLA AUREN: THE VIRTUAL ODYSSEY</span>
        <span class="nexo-protocol">· NEXO PROTOCOL ·</span>
      </div>
    </div>
  </div>

  <!-- 2. MARCO DE PACKAGING SEGA GENESIS -->
  <div class="sega-packaging-frame">
    <!-- Header -->
    <div class="header-bar grid-paper-texture">
      <div class="logo-cluster">
        <div class="sega-pill">SEGA</div>
        <div class="genesis-wordmark">GENESIS</div>
        <div class="bits-bracket">[ 16-BIT ]</div>
      </div>
      <div class="cartridge-badge">16-BIT CARTRIDGE</div>
    </div>

    <!-- Bordes Laterales -->
    <div class="side-border-left grid-paper-texture"></div>
    <div class="side-border-right grid-paper-texture"></div>

    <!-- Footer -->
    <div class="footer-bar grid-paper-texture">
      <!-- Sello Oficial Sega -->
      <div class="seal-of-quality">
        <span class="seal-sub">OFFICIAL</span>
        <span class="seal-main">SEGA</span>
        <span class="seal-sub">SEAL OF QUALITY</span>
      </div>

      <!-- Créditos -->
      <div class="footer-credits">
        DEVELOPED BY <b>JARBEES PROCEDURAL 3D STUDIO</b> &amp; <b>JARBEES THE GAME</b><br>
        POWERED BY <b>BLENDER 5.2 HEADLESS &middot; THREE.JS &middot; PBR CYBER ENGINE</b>
      </div>

      <!-- Código de Barras -->
      <div class="barcode-box">
        <div class="barcode-lines">
          <div class="b2"></div><div class="b1"></div><div class="b3"></div><div class="b5"></div>
          <div class="b1"></div><div class="b4"></div><div class="b2"></div><div class="b3"></div>
          <div class="b5"></div><div class="b1"></div><div class="b4"></div><div class="b2"></div>
          <div class="b1"></div><div class="b3"></div><div class="b5"></div><div class="b2"></div>
        </div>
        <span>0 77241 20261 9</span>
      </div>
    </div>
  </div>

</body>
</html>`;

  console.log('🎨 Renderizando escena final pulida con Playwright...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-gpu',
      '--use-gl=angle',
      '--use-angle=d3d11',
    ],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width, height });

  const htmlPath = path.join(postersDir, 'iron_man_auren_virtual_odyssey.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const pngPath = path.join(postersDir, 'iron_man_auren_virtual_odyssey.png');
  await page.screenshot({ path: pngPath, type: 'png' });
  await browser.close();

  const stats = fs.statSync(pngPath);
  console.log(`🎉 ¡Portada maestra finalizada! Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  return { htmlPath, pngPath, sizeBytes: stats.size };
}

generateAurenIronManGenesisCover().catch((err) => {
  console.error('❌ Error generando portada:', err);
  process.exit(1);
});
