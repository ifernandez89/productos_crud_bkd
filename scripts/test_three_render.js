const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function renderRealisticFace3D(modelName = 'akenaton.glb', outputName = 'realistic_face_3d_akenaton.png') {
  console.log(`\n======================================================`);
  console.log(`🎨 RENDERIZANDO ROSTRO 3D HIPERREALISTA: ${modelName}`);
  console.log(`======================================================`);

  const modelPath = path.join(process.cwd(), 'storage', 'assets', 'models', modelName);
  if (!fs.existsSync(modelPath)) {
    throw new Error('Modelo 3D no encontrado: ' + modelPath);
  }

  const bundlePath = path.join(process.cwd(), 'storage', 'assets', 'three', 'three_bundle.js');
  if (!fs.existsSync(bundlePath)) {
    throw new Error('Three bundle no encontrado: ' + bundlePath);
  }

  const modelBuffer = fs.readFileSync(modelPath);
  const modelBase64 = modelBuffer.toString('base64');
  console.log(`📦 Modelo 3D: ${modelName} (${Math.round(modelBuffer.length / 1024)} KB)`);

  const threeBundleCode = fs.readFileSync(bundlePath, 'utf-8');
  console.log(`⚡ Three.js Bundle Local cargado (${Math.round(threeBundleCode.length / 1024)} KB, 100% Offline)`);

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

  const width = 1280;
  const height = 960;
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
    body { width: ${width}px; height: ${height}px; background: #07090E; overflow: hidden; }
    canvas { width: 100%; height: 100%; display: block; }
  </style>
  <script>
    ${threeBundleCode}
  </script>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    (async function init() {
      try {
        const THREE = window.THREE;
        const GLTFLoader = window.GLTFLoader;

        const canvas = document.getElementById('c');
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true
        });
        renderer.setSize(${width}, ${height});
        renderer.setPixelRatio(1.5);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.35;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x06080D);

        // Niebla sutil de estudio
        scene.fog = new THREE.FogExp2(0x06080D, 0.09);

        // Cámara de retrato profesional (FOV 34° ~85mm retrato)
        const camera = new THREE.PerspectiveCamera(34, ${width} / ${height}, 0.1, 100);
        camera.position.set(0, 0.35, 3.8);

        // ILUMINACIÓN CINEMATOGRÁFICA
        // 1. Key Light (Cálida dorada, 45 grados arriba y a la derecha)
        const keyLight = new THREE.DirectionalLight(0xFFF0DD, 4.2);
        keyLight.position.set(2.6, 3.2, 3.0);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.bias = -0.0001;
        scene.add(keyLight);

        // 2. Fill Light (Relleno frío azul pizarra)
        const fillLight = new THREE.DirectionalLight(0x789AC2, 1.6);
        fillLight.position.set(-3.2, 1.2, 2.2);
        scene.add(fillLight);

        // 3. Rim / Kicker Light (Luz rasante ámbar para silueta de mandíbula y pómulos)
        const rimLight = new THREE.DirectionalLight(0xFFB030, 5.5);
        rimLight.position.set(-2.0, 2.5, -2.8);
        scene.add(rimLight);

        // 4. Accent Rim (Contraluz cian superior para relieve de corona/cabello)
        const topRim = new THREE.DirectionalLight(0x40E0D0, 2.8);
        topRim.position.set(1.8, 3.8, -2.2);
        scene.add(topRim);

        // 5. Luz Ambiental
        const hemiLight = new THREE.HemisphereLight(0x1B2533, 0x05070B, 0.8);
        scene.add(hemiLight);

        // Parsear modelo GLB con decodificador DRACO acelerado
        const loader = new GLTFLoader();
        if (window.DRACOLoader) {
          const dracoLoader = new window.DRACOLoader();
          dracoLoader.setDecoderPath('http://127.0.0.1:4000/api/jarbees/poster/draco/');
          loader.setDRACOLoader(dracoLoader);
        }
        const rawData = atob("${modelBase64}");
        const bytes = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          bytes[i] = rawData.charCodeAt(i);
        }

        loader.parse(bytes.buffer, '', (gltf) => {
          const root = gltf.scene;

          const box = new THREE.Box3().setFromObject(root);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 2.45 / maxDim;

          root.scale.setScalar(scale);
          root.position.x = -center.x * scale;
          root.position.y = -center.y * scale + 0.12;
          root.position.z = -center.z * scale;

          // Ángulo de retrato clásico en tres cuartos (22 grados hacia la cámara)
          root.rotation.y = 0.24;
          root.rotation.x = 0.04;

          // Enriquecimiento de sombreado PBR
          root.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.roughness = Math.min(child.material.roughness || 0.45, 0.52);
                child.material.metalness = Math.max(child.material.metalness || 0.08, 0.06);
                child.material.envMapIntensity = 1.8;
                child.material.needsUpdate = true;
              }
            }
          });

          scene.add(root);
          renderer.render(scene, camera);
          console.log('Escena 3D renderizada con éxito en WebGL');
          document.body.setAttribute('data-rendered', 'true');
        }, (err) => {
          console.error('Error cargando modelo:', err);
          document.body.setAttribute('data-error', 'gltf_error');
        });
      } catch (e) {
        console.error('Error init:', e);
        document.body.setAttribute('data-error', e.message);
      }
    })();
  </script>
</body>
</html>`;

  const startTime = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForSelector('body[data-rendered="true"]', { timeout: 15000 });
  await page.waitForTimeout(200);

  const pngBuffer = await page.screenshot({ type: 'png' });
  const renderDurationMs = Date.now() - startTime;

  const outputDir = path.join(process.cwd(), 'storage', 'posters');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outPath = path.join(outputDir, outputName);
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`🖼️  PNG 3D guardado: ${outPath} (${Math.round(pngBuffer.length / 1024)} KB en ${renderDurationMs}ms)`);

  const artifactDest = path.join(
    'C:', 'Users', 'xiphos-pc1', '.gemini', 'antigravity-ide', 'brain',
    'bb2b02ab-1056-4da6-a344-b2bb0f45627f', outputName
  );
  fs.copyFileSync(outPath, artifactDest);
  console.log(`📁 Copiado a artifacts: ${artifactDest}`);

  await browser.close();
  return { outPath, artifactDest, pngBuffer, renderDurationMs };
}

async function main() {
  try {
    // 1. Casco de Ciencia Ficción PBR Hiperrealista (Khronos Group PBR Standard)
    await renderRealisticFace3D('DamagedHelmet.glb', 'realistic_3d_damaged_helmet.png');

    // 2. Rostro 3D de Akhenatón (Rostro humano real de la antigüedad)
    await renderRealisticFace3D('akenaton.glb', 'realistic_3d_face_akenaton.png');

    console.log('\n🎉 ¡TODOS LOS MODELOS 3D FUERON RENDERIZADOS CON ÉXITO EN THREE.JS Y LA GPU!');
  } catch (err) {
    console.error('❌ Error renderizando modelos 3D:', err);
    process.exit(1);
  }
}

main();
