const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Motor 3D Realista de Alta Fidelidad para "TWINKLE TALE: AETHERIA REBORN"
 * Recrea el clásico paisaje de fantasía de Mega Drive (isla flotante, cascadas colosales,
 * ciudadela celestial, montañas lejanas, vegetación y mar de nubes) elevándolo a:
 * - Materiales PBR (piedra erosionada, mármol blanco, oro reflectivo, agua cristalina y nieve).
 * - Iluminación cinematográfica de 3 puntos (Key solar dorado, Fill azul crepuscular, Rim etéreo).
 * - Sombras suaves PCF (2048x2048).
 * - Niebla atmosférica volumétrica FogExp2.
 * - Tone mapping ACESFilmic para estética de gran producción.
 * - Renderizado acelerado por GPU física (RTX 5070) a 2048x1536 píxeles.
 */
async function renderTwinkleTaleRealistic3D() {
  console.log('========================================================================');
  console.log('✨ RECREANDO "TWINKLE TALE" EN 3D REALISTA DE ALTA FIDELIDAD (PBR & GPU)');
  console.log('========================================================================\n');

  const bundlePath = path.join(process.cwd(), 'storage', 'assets', 'three', 'three_bundle.js');
  if (!fs.existsSync(bundlePath)) {
    throw new Error('Three.js bundle no encontrado: ' + bundlePath);
  }
  const threeBundleCode = fs.readFileSync(bundlePath, 'utf-8');

  const width = 2048;
  const height = 1536;

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--enable-gpu',
      '--use-gl=angle',
      '--use-angle=d3d11',
    ],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width, height });

  page.on('console', (msg) => console.log('  [Browser]', msg.text()));
  page.on('pageerror', (err) => console.error('  [Browser Error]', err.message));

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${width}px; height: ${height}px; background: #0c182b; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }
    canvas { width: 100%; height: 100%; display: block; }
    #ui-overlay {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 48px 56px;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .badge-sega {
      background: linear-gradient(135deg, #0044aa, #001144);
      border: 2px solid #0088ff;
      border-radius: 6px;
      padding: 6px 16px;
      color: #ffffff;
      font-weight: 800;
      font-size: 18px;
      letter-spacing: 3px;
      box-shadow: 0 4px 16px rgba(0, 100, 255, 0.4);
    }
    .badge-era {
      color: #ffd700;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 4px;
      text-transform: uppercase;
      text-shadow: 0 2px 10px rgba(0,0,0,0.8);
    }
    .footer {
      text-align: center;
      margin-bottom: 24px;
    }
    .title-main {
      font-size: 64px;
      font-weight: 900;
      letter-spacing: 12px;
      background: linear-gradient(180deg, #ffffff 0%, #ffeaa7 35%, #e1b12c 70%, #8c581e 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 6px 18px rgba(0,0,0,0.9));
      text-transform: uppercase;
      margin: 0;
      line-height: 1.1;
    }
    .subtitle {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 8px;
      color: #a8d0ff;
      text-shadow: 0 3px 12px rgba(0,0,0,0.9);
      margin-top: 10px;
      text-transform: uppercase;
    }
  </style>
  <script>${threeBundleCode}</script>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="ui-overlay">
    <div class="header">
      <div class="badge-sega">TWINKLE TALE</div>
      <div class="badge-era">3D REALISTIC FANTASY CHRONICLES</div>
    </div>
    <div class="footer">
      <h1 class="title-main">AETHERIA</h1>
      <div class="subtitle">THE CELESTIAL REALM &bull; SANCTUARY OF STARS</div>
    </div>
  </div>

  <script>
    (async function init() {
      try {
        const THREE = window.THREE;
        const canvas = document.getElementById('c');

        // 1. Renderer con ACESFilmic Tone Mapping & Sombras Suaves PCF
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true
        });
        renderer.setSize(${width}, ${height});
        renderer.setPixelRatio(1);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.18;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        // Fondo de cielo crepuscular mágico con niebla atmosférica
        const skyColor = new THREE.Color(0x0e1c36);
        scene.background = skyColor;
        scene.fog = new THREE.FogExp2(0x0e1c36, 0.028);

        // 2. Cámara Cinematográfica (Vista angular majestuosa)
        const camera = new THREE.PerspectiveCamera(46, ${width} / ${height}, 0.1, 1000);
        camera.position.set(0, 3.8, 14.5);
        camera.lookAt(0, 1.2, 0);

        // 3. Materiales PBR
        // Mármol Blanco para el Palacio / Ciudadela
        const marbleMat = new THREE.MeshStandardMaterial({
          color: 0xf4f0ea,
          roughness: 0.25,
          metalness: 0.05,
        });

        // Oro Bruñido para Cúpulas y Agujas Celestiales
        const goldMat = new THREE.MeshStandardMaterial({
          color: 0xffd54f,
          roughness: 0.18,
          metalness: 0.88,
        });

        // Roca Estratificada PBR para Acantilados
        const cliffRockMat = new THREE.MeshStandardMaterial({
          color: 0x5a4232,
          roughness: 0.85,
          metalness: 0.12,
          flatShading: true,
        });

        // Pradera / Suelo Verde de la Meseta
        const grassMat = new THREE.MeshStandardMaterial({
          color: 0x3d782a,
          roughness: 0.75,
          metalness: 0.05,
        });

        // Nieve en Cumbres Lejanas
        const snowMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.35,
          metalness: 0.02,
        });

        // Agua PBR Cristalina de Ríos y Cascadas
        const waterMat = new THREE.MeshStandardMaterial({
          color: 0x29b6f6,
          roughness: 0.08,
          metalness: 0.2,
          transparent: true,
          opacity: 0.88,
        });

        // Espuma de Cascada
        const foamMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.4,
          metalness: 0.0,
          transparent: true,
          opacity: 0.95,
        });

        // Follaje de Árboles
        const treeLeavesMat = new THREE.MeshStandardMaterial({
          color: 0x235c1e,
          roughness: 0.8,
          metalness: 0.05,
          flatShading: true,
        });
        const treeTrunkMat = new THREE.MeshStandardMaterial({
          color: 0x3e2723,
          roughness: 0.9,
          metalness: 0.05,
        });

        // Mar de Nubes Inferior
        const cloudMat = new THREE.MeshStandardMaterial({
          color: 0xd8e8f8,
          roughness: 0.95,
          metalness: 0.0,
          transparent: true,
          opacity: 0.85,
        });

        // 4. Construcción de la Escena 3D

        // 4A. Cordillera de Montañas Nevadas Lejanas (Fondo épico)
        const mountainGroup = new THREE.Group();
        const mountainPositions = [
          { x: -14, z: -25, r: 8, h: 11 },
          { x: -5, z: -32, r: 12, h: 16 },
          { x: 6, z: -28, r: 10, h: 14 },
          { x: 15, z: -26, r: 9, h: 12 },
        ];
        mountainPositions.forEach(m => {
          const coneGeo = new THREE.ConeGeometry(m.r, m.h, 7);
          const coneMesh = new THREE.Mesh(coneGeo, cliffRockMat);
          coneMesh.position.set(m.x, m.h * 0.5 - 4, m.z);
          mountainGroup.add(coneMesh);

          // Casquete de nieve en la cima
          const snowGeo = new THREE.ConeGeometry(m.r * 0.4, m.h * 0.4, 7);
          const snowMesh = new THREE.Mesh(snowGeo, snowMat);
          snowMesh.position.set(m.x, m.h * 0.8 - 4, m.z);
          mountainGroup.add(snowMesh);
        });
        scene.add(mountainGroup);

        // 4B. Mar de Nubes en la Base (-y)
        const cloudGroup = new THREE.Group();
        for (let i = 0; i < 48; i++) {
          const r = 2.5 + Math.random() * 3.5;
          const cloudGeo = new THREE.SphereGeometry(r, 8, 8);
          const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
          const cx = (Math.random() - 0.5) * 36;
          const cz = -10 + (Math.random() - 0.5) * 30;
          const cy = -3.8 + (Math.random() - 0.5) * 1.5;
          cloudMesh.position.set(cx, cy, cz);
          cloudGroup.add(cloudMesh);
        }
        scene.add(cloudGroup);

        // 4C. La Isla Flotante Celestial
        const islandGroup = new THREE.Group();

        // 1. Superficie de la Meseta Verde
        const plateauGeo = new THREE.CylinderGeometry(5.8, 6.2, 0.6, 24);
        const plateauMesh = new THREE.Mesh(plateauGeo, grassMat);
        plateauMesh.position.set(0, 0, 0);
        plateauMesh.receiveShadow = true;
        islandGroup.add(plateauMesh);

        // Colinas y desniveles en la meseta
        const hill1 = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10), grassMat);
        hill1.scale.set(1.5, 0.45, 1.2);
        hill1.position.set(-2.2, 0.3, -1.2);
        hill1.receiveShadow = true;
        islandGroup.add(hill1);

        const hill2 = new THREE.Mesh(new THREE.SphereGeometry(2.8, 12, 10), grassMat);
        hill2.scale.set(1.6, 0.5, 1.4);
        hill2.position.set(2.0, 0.35, -1.8);
        hill2.receiveShadow = true;
        islandGroup.add(hill2);

        // 2. Acantilados Inferiores Esculpidos (Roca masiva hacia abajo en punta)
        const cliffBaseGeo = new THREE.ConeGeometry(5.9, 6.8, 16);
        const cliffBaseMesh = new THREE.Mesh(cliffBaseGeo, cliffRockMat);
        cliffBaseMesh.rotation.x = Math.PI; // Invertido hacia abajo
        cliffBaseMesh.position.set(0, -3.3, 0);
        cliffBaseMesh.castShadow = true;
        cliffBaseMesh.receiveShadow = true;
        islandGroup.add(cliffBaseMesh);

        // Agujas de roca extra para textura acantilada
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2;
          const rad = 4.2 + (i % 3) * 0.5;
          const rockSpike = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4.5, 6), cliffRockMat);
          rockSpike.rotation.x = Math.PI + (Math.random() - 0.5) * 0.2;
          rockSpike.rotation.z = (Math.random() - 0.5) * 0.2;
          rockSpike.position.set(Math.cos(ang) * rad, -2.5, Math.sin(ang) * rad);
          rockSpike.castShadow = true;
          islandGroup.add(rockSpike);
        }

        // 3. Río y Lago Meandriforme
        const lakeGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.1, 16);
        const lakeMesh = new THREE.Mesh(lakeGeo, waterMat);
        lakeMesh.position.set(2.2, 0.35, -0.6);
        islandGroup.add(lakeMesh);

        // Río serpenteando hacia el borde frontal
        const riverCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(2.2, 0.32, -0.6),
          new THREE.Vector3(1.2, 0.32, 0.8),
          new THREE.Vector3(-0.6, 0.32, 1.6),
          new THREE.Vector3(-1.4, 0.32, 3.4),
          new THREE.Vector3(-1.8, 0.32, 5.7),
        ]);
        const riverGeo = new THREE.TubeGeometry(riverCurve, 20, 0.45, 8, false);
        const riverMesh = new THREE.Mesh(riverGeo, waterMat);
        islandGroup.add(riverMesh);

        // 4. Cascada Colosal que se precipita al vacío
        const waterfallGeo = new THREE.PlaneGeometry(1.2, 6.5, 8, 16);
        const waterfallMesh = new THREE.Mesh(waterfallGeo, waterMat);
        waterfallMesh.position.set(-1.8, -3.1, 5.75);
        waterfallMesh.rotation.y = 0.15;
        islandGroup.add(waterfallMesh);

        // Espuma blanca en la cresta
        const foamCrest = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12), foamMat);
        foamCrest.position.set(-1.8, 0.1, 5.75);
        islandGroup.add(foamCrest);

        // Nube de vapor y rocío en la base de la cascada
        const sprayCloud = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), foamMat);
        sprayCloud.scale.set(1.6, 0.9, 1.4);
        sprayCloud.position.set(-1.8, -6.0, 5.9);
        islandGroup.add(sprayCloud);

        // 5. El Gran Santuario Celestial / Palacio de Aetheria
        const palaceGroup = new THREE.Group();
        palaceGroup.position.set(-1.6, 0.3, -1.8);

        // Base escalonada de mármol
        const templeBase = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 2.8), marbleMat);
        templeBase.position.set(0, 0.4, 0);
        templeBase.castShadow = true;
        templeBase.receiveShadow = true;
        palaceGroup.add(templeBase);

        // Columnas clásicas
        const colGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.8, 12);
        for (let x = -1.5; x <= 1.5; x += 0.6) {
          const colFront = new THREE.Mesh(colGeo, marbleMat);
          colFront.position.set(x, 1.7, 1.2);
          colFront.castShadow = true;
          palaceGroup.add(colFront);

          const colBack = new THREE.Mesh(colGeo, marbleMat);
          colBack.position.set(x, 1.7, -1.2);
          colBack.castShadow = true;
          palaceGroup.add(colBack);
        }

        // Techo del templo
        const roofGeo = new THREE.BoxGeometry(3.8, 0.4, 3.0);
        const roofMesh = new THREE.Mesh(roofGeo, marbleMat);
        roofMesh.position.set(0, 2.7, 0);
        roofMesh.castShadow = true;
        palaceGroup.add(roofMesh);

        // Gran Cúpula Dorada Central
        const domeGeo = new THREE.SphereGeometry(1.2, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const domeMesh = new THREE.Mesh(domeGeo, goldMat);
        domeMesh.position.set(0, 2.9, 0);
        domeMesh.castShadow = true;
        palaceGroup.add(domeMesh);

        // Aguja Celestial Alta con Orbe
        const spireGeo = new THREE.ConeGeometry(0.18, 2.4, 12);
        const spireMesh = new THREE.Mesh(spireGeo, goldMat);
        spireMesh.position.set(0, 4.3, 0);
        spireMesh.castShadow = true;
        palaceGroup.add(spireMesh);

        const orbGeo = new THREE.SphereGeometry(0.28, 16, 16);
        const orbMesh = new THREE.Mesh(orbGeo, goldMat);
        orbMesh.position.set(0, 5.6, 0);
        palaceGroup.add(orbMesh);

        // Torres laterales
        const towerGeo = new THREE.CylinderGeometry(0.45, 0.5, 3.2, 16);
        const towerL = new THREE.Mesh(towerGeo, marbleMat);
        towerL.position.set(-2.2, 1.6, 0);
        towerL.castShadow = true;
        palaceGroup.add(towerL);

        const towerDomeL = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.4, 16), goldMat);
        towerDomeL.position.set(-2.2, 3.9, 0);
        towerDomeL.castShadow = true;
        palaceGroup.add(towerDomeL);

        const towerR = new THREE.Mesh(towerGeo, marbleMat);
        towerR.position.set(2.2, 1.6, 0);
        towerR.castShadow = true;
        palaceGroup.add(towerR);

        const towerDomeR = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.4, 16), goldMat);
        towerDomeR.position.set(2.2, 3.9, 0);
        towerDomeR.castShadow = true;
        palaceGroup.add(towerDomeR);

        islandGroup.add(palaceGroup);

        // 6. Vegetación y Arboleda
        const treeGroup = new THREE.Group();
        const treeCoords = [
          { x: 1.5, z: 1.5, s: 1.0 },
          { x: 2.2, z: 2.1, s: 0.8 },
          { x: 0.8, z: 2.5, s: 1.1 },
          { x: 3.2, z: 0.2, s: 1.3 },
          { x: 3.8, z: -0.8, s: 0.9 },
          { x: -3.8, z: 0.5, s: 1.1 },
          { x: -4.2, z: -1.2, s: 1.2 },
          { x: -2.8, z: 1.8, s: 0.85 },
        ];
        treeCoords.forEach(t => {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * t.s, 0.15 * t.s, 0.8 * t.s, 6), treeTrunkMat);
          trunk.position.set(t.x, 0.4 + 0.4 * t.s, t.z);
          trunk.castShadow = true;
          treeGroup.add(trunk);

          const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.7 * t.s, 1.6 * t.s, 7), treeLeavesMat);
          foliage.position.set(t.x, 0.4 + 1.2 * t.s, t.z);
          foliage.castShadow = true;
          treeGroup.add(foliage);
        });
        islandGroup.add(treeGroup);

        scene.add(islandGroup);

        // 5. Esquema de Iluminación Cinematográfica de 3 Puntos
        // Key Light: Sol Crepuscular Dorado con Sombras de Alta Definición
        const sunKey = new THREE.DirectionalLight(0xfff3d6, 3.4);
        sunKey.position.set(9, 12, 7);
        sunKey.castShadow = true;
        sunKey.shadow.mapSize.width = 2048;
        sunKey.shadow.mapSize.height = 2048;
        sunKey.shadow.camera.near = 0.5;
        sunKey.shadow.camera.far = 40;
        sunKey.shadow.camera.left = -10;
        sunKey.shadow.camera.right = 10;
        sunKey.shadow.camera.top = 10;
        sunKey.shadow.camera.bottom = -10;
        sunKey.shadow.bias = -0.00015;
        sunKey.shadow.radius = 2.2; // Suavizado PCF
        scene.add(sunKey);

        // Fill Light: Cielo azul penumbra para sombras naturales
        const skyFill = new THREE.DirectionalLight(0x4078aa, 1.4);
        skyFill.position.set(-8, 6, -3);
        scene.add(skyFill);

        // Rim Light: Contraluz etéreo cian/dorado para separar silueta del fondo
        const rimLight = new THREE.DirectionalLight(0x00e5ff, 2.6);
        rimLight.position.set(0, 5, -12);
        scene.add(rimLight);

        // Luz ambiental mágica tenue
        const ambient = new THREE.AmbientLight(0x1a263e, 0.9);
        scene.add(ambient);

        // Renderizar escena a canvas
        renderer.render(scene, camera);
        console.log('Three.js render completado con éxito!');
        window.__RENDER_DONE__ = true;
      } catch (err) {
        console.error('Error durante render Three.js:', err);
        window.__RENDER_ERROR__ = err.message;
      }
    })();
  </script>
</body>
</html>`;

  console.log('Iniciando captura GPU con Playwright en resolución 2048x1536...');
  const t0 = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RENDER_DONE__ || window.__RENDER_ERROR__, { timeout: 20000 });
  const renderDurationMs = Date.now() - t0;

  const outDir = path.join(process.cwd(), 'storage', 'posters');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const filename = 'twinkle_tale_aetheria_3d_realistic.png';
  const outputPath = path.join(outDir, filename);
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();

  const stat = fs.statSync(outputPath);
  const sizeKb = Math.round(stat.size / 1024);

  console.log(`\n========================================================================`);
  console.log(`✅ RENDER 3D REALISTA DE TWINKLE TALE GENERADO CON ÉXITO!`);
  console.log(`========================================================================`);
  console.log(`⏱️ Tiempo total de render GPU: ${renderDurationMs} ms`);
  console.log(`📐 Resolución: ${width}x${height} píxeles`);
  console.log(`💾 Tamaño del archivo: ${sizeKb} KB`);
  console.log(`📁 Ruta en disco: ${outputPath}`);

  // Copiar al directorio de artifacts de Gemini
  const artifactDir = 'C:\\Users\\xiphos-pc1\\.gemini\\antigravity-ide\\brain\\bb2b02ab-1056-4da6-a344-b2bb0f45627f';
  const artifactPath = path.join(artifactDir, filename);
  fs.copyFileSync(outputPath, artifactPath);
  console.log(`🖼️ Artifact copiado para visualización: ${artifactPath}`);
}

renderTwinkleTaleRealistic3D().catch(console.error);
