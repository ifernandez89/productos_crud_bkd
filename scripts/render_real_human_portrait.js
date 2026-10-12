const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Renderizador de Retrato 3D Real con Malla Anatómica Femenina Real (avaturn.glb)
 * Malla continua con topología facial auténtica, ojos humanos, párpados reales,
 * labios con volumen anatómico y cabello natural.
 */
async function renderRealHumanPortrait(modelFile = 'avaturn.glb', outputName = 'angelina_human_portrait_real3d.png') {
  console.log(`========================================================================`);
  console.log(`🌟 RENDERIZANDO RETRATO CON MALLA HUMANA ANATÓMICA REAL: ${modelFile}`);
  console.log(`========================================================================\n`);

  const modelPath = path.join(process.cwd(), 'storage', 'assets', 'models', modelFile);
  if (!fs.existsSync(modelPath)) throw new Error('Modelo no encontrado: ' + modelPath);

  const bundlePath = path.join(process.cwd(), 'storage', 'assets', 'three', 'three_bundle.js');
  if (!fs.existsSync(bundlePath)) throw new Error('Bundle no encontrado: ' + bundlePath);

  const modelBuffer = fs.readFileSync(modelPath);
  const modelBase64 = modelBuffer.toString('base64');
  const threeBundleCode = fs.readFileSync(bundlePath, 'utf-8');

  const width = 2048;
  const height = 2048;

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
    body { width: ${width}px; height: ${height}px; background: #0c090c; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }
    canvas { width: 100%; height: 100%; display: block; }
    #ui-overlay {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 56px 64px;
      box-sizing: border-box;
    }
    .badge-studio {
      background: rgba(22, 14, 20, 0.75);
      border: 1px solid rgba(255, 215, 170, 0.4);
      border-radius: 4px;
      padding: 6px 18px;
      color: #ffd8aa;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 4px;
      text-transform: uppercase;
      backdrop-filter: blur(8px);
    }
    .badge-tech {
      color: #a894a8;
      font-weight: 600;
      font-size: 14px;
      letter-spacing: 3px;
      text-transform: uppercase;
      text-shadow: 0 2px 10px rgba(0,0,0,0.9);
    }
    .footer {
      text-align: center;
      margin-bottom: 24px;
    }
    .name-main {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: 14px;
      color: #ffffff;
      text-shadow: 0 4px 20px rgba(0,0,0,0.9);
      text-transform: uppercase;
      margin: 0;
      line-height: 1.1;
    }
    .name-sub {
      font-size: 18px;
      font-weight: 500;
      letter-spacing: 8px;
      color: #ffd4aa;
      text-shadow: 0 2px 10px rgba(0,0,0,0.9);
      margin-top: 8px;
      text-transform: uppercase;
    }
  </style>
  <script>${threeBundleCode}</script>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="ui-overlay">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div class="badge-studio">JARBEES 3D REALISTIC STUDIO</div>
      <div class="badge-tech">ANATOMICAL CONTINUOUS MESH &bull; RTX 5070</div>
    </div>
    <div class="footer">
      <h1 class="name-main">CINEMATIC REALISTIC PORTRAIT</h1>
      <div class="name-sub">AUTHENTIC ANATOMY &bull; 85MM PORTRAIT LENS</div>
    </div>
  </div>

  <script>
    (async function init() {
      try {
        const THREE = window.THREE;
        const GLTFLoader = window.GLTFLoader;
        const canvas = document.getElementById('c');

        // 1. Renderer con ACESFilmic Tone Mapping & Sombras Suaves
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
        scene.background = new THREE.Color(0x0a070a);
        scene.fog = new THREE.FogExp2(0x0a070a, 0.035);

        // 2. Cámara de Retrato 85mm
        const camera = new THREE.PerspectiveCamera(34, ${width} / ${height}, 0.1, 100);

        // 3. Luces de Estudio Cinematográficas
        // Key Light cálida suave (Rembrandt)
        const keyLight = new THREE.DirectionalLight(0xfff3e4, 3.4);
        keyLight.position.set(2.8, 3.0, 3.5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.bias = -0.0001;
        keyLight.shadow.radius = 2.0;
        scene.add(keyLight);

        // Fill Light fría de penumbra
        const fillLight = new THREE.DirectionalLight(0x406085, 1.2);
        fillLight.position.set(-3.2, 1.8, 2.0);
        scene.add(fillLight);

        // Rim Light dorado de silueta
        const rimLight = new THREE.DirectionalLight(0xffd5a0, 2.8);
        rimLight.position.set(-0.5, 2.5, -3.5);
        scene.add(rimLight);

        // Luz de ojos (Catchlight específico en pupila)
        const eyeCatchLight = new THREE.PointLight(0xffffff, 0.6, 5);
        eyeCatchLight.position.set(0, 1.5, 2.5);
        scene.add(eyeCatchLight);

        const ambient = new THREE.AmbientLight(0x181216, 0.85);
        scene.add(ambient);

        // 4. Cargar Malla GLTF Real
        const loader = new GLTFLoader();
        const rawData = atob("${modelBase64}");
        const bytes = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);

        loader.parse(bytes.buffer, '', (gltf) => {
          const root = gltf.scene;
          console.log('Modelo cargado exitosamente!');

          // Calcular Bounding Box y Bounding Sphere
          const box = new THREE.Box3().setFromObject(root);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);
          console.log('Tamaño del modelo:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
          console.log('Centro del modelo:', center.x.toFixed(2), center.y.toFixed(2), center.z.toFixed(2));

          // Encontrar la cabeza / nivel de ojos
          // Centrar horizontalmente y alinear cámara al rostro
          // Si el modelo es de cuerpo completo (alto > 1.4m), la cabeza está arriba
          const isFullBody = size.y > 1.2;
          const headY = isFullBody ? (box.min.y + size.y * 0.92) : center.y;

          // Habilitar sombras y asegurar espacios de color
          root.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.roughness = Math.max(0.35, child.material.roughness || 0.5);
                child.material.envMapIntensity = 1.0;
              }
            }
          });

          scene.add(root);

          // Encuadre fotográfico de retrato (primer plano de busto y cabeza)
          const fovFactor = isFullBody ? 0.38 : (size.y * 0.65);
          camera.position.set(center.x + 0.05, headY - 0.05, center.z + fovFactor * 2.8);
          camera.lookAt(center.x, headY - 0.04, center.z);

          // Render
          renderer.render(scene, camera);
          console.log('Render finalizado!');
          window.__RENDER_DONE__ = true;
        }, (err) => {
          console.error('Error parseando modelo:', err);
          window.__RENDER_ERROR__ = err.message;
        });
      } catch (err) {
        console.error('Error general:', err);
        window.__RENDER_ERROR__ = err.message;
      }
    })();
  </script>
</body>
</html>`;

  console.log('Iniciando captura Playwright en GPU a 2048x2048...');
  const t0 = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RENDER_DONE__ || window.__RENDER_ERROR__, { timeout: 25000 });
  const renderDurationMs = Date.now() - t0;

  const outDir = path.join(process.cwd(), 'storage', 'posters');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outputPath = path.join(outDir, outputName);
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();

  const stat = fs.statSync(outputPath);
  const sizeKb = Math.round(stat.size / 1024);

  console.log(`\n========================================================================`);
  console.log(`✅ RETRATO HUMANO REAL COMPLETADO EN ${renderDurationMs} ms!`);
  console.log(`========================================================================`);
  console.log(`📐 Resolución: ${width}x${height} píxeles`);
  console.log(`💾 Tamaño: ${sizeKb} KB`);
  console.log(`📁 Ruta en disco: ${outputPath}`);

  // Copiar al directorio de artifacts de Gemini
  const artifactDir = 'C:\\Users\\xiphos-pc1\\.gemini\\antigravity-ide\\brain\\bb2b02ab-1056-4da6-a344-b2bb0f45627f';
  const artifactPath = path.join(artifactDir, outputName);
  fs.copyFileSync(outputPath, artifactPath);
  console.log(`🖼️ Artifact copiado para visualización: ${artifactPath}`);
}

renderRealHumanPortrait('avaturn.glb', 'real_human_portrait_avaturn.png').catch(console.error);
