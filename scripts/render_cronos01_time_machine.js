const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * SERVICIO ESPECIAL DE RENDERIZADO 3D EN BACKEND (JARBEES GRAPHICS ENGINE)
 * Versión Final 4.0 - Vista Heroica Cinematográfica con Reactor Cuántico Visible:
 * - Emblema DMC cubierto al 100% por el splitter "ARCHEOSCOPE CHRONOS-01".
 * - Reactor de Taquiones elevado y visible sobre la zaga con anillos de plasma violeta/cian.
 * - Sensor LiDAR arqueológico enrasado en el techo.
 * - Underglow cian y huellas temporales sobre asfalto reflectante.
 * - Renderizado acelerado por GPU física NVIDIA RTX 5070 (Direct3D11).
 */
async function renderCronos01TimeMachine() {
  console.log('========================================================================');
  console.log('⚡ CRONOS-01 TEMPORAL EXPLORER: MOTOR 3D PROCEDURAL POR GPU (RTX 5070)');
  console.log('========================================================================\n');

  const root = process.cwd();
  const modelPath = path.join(root, 'storage', 'assets', 'models', 'delorean_lowpoly.glb');
  const bundlePath = path.join(root, 'storage', 'assets', 'three', 'three_bundle.js');

  if (!fs.existsSync(modelPath)) throw new Error('Modelo base no encontrado: ' + modelPath);
  if (!fs.existsSync(bundlePath)) throw new Error('Three.js bundle no encontrado: ' + bundlePath);

  const modelBase64 = fs.readFileSync(modelPath).toString('base64');
  const threeBundleCode = fs.readFileSync(bundlePath, 'utf-8');

  const width = 2048;
  const height = 1152;

  console.log('🚀 Iniciando Playwright con aceleración Direct3D11 (NVIDIA RTX 5070)...');
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
      '--ignore-gpu-blocklist',
    ],
  });

  try {
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
    body { width: ${width}px; height: ${height}px; background: #040711; overflow: hidden; font-family: 'Segoe UI', sans-serif; }
    canvas { width: 100%; height: 100%; display: block; }
    #hud {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 44px 56px;
    }
    .hud-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .badge-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .badge {
      display: inline-block;
      background: rgba(0, 240, 255, 0.14);
      border: 1px solid rgba(0, 240, 255, 0.65);
      color: #00f0ff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 3.5px;
      padding: 6px 16px;
      border-radius: 4px;
      text-transform: uppercase;
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.35);
    }
    .sys-status {
      font-size: 11px;
      color: #8da4be;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .hud-title-block h1 {
      font-size: 46px;
      font-weight: 900;
      color: #f2f7ff;
      letter-spacing: 7px;
      text-transform: uppercase;
      margin-top: 10px;
      text-shadow: 0 0 30px rgba(0, 240, 255, 0.4);
    }
    .hud-title-block p {
      font-size: 14px;
      color: #00f0ff;
      letter-spacing: 4px;
      text-transform: uppercase;
      margin-top: 4px;
      font-weight: 600;
    }
    .hud-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .spec-grid {
      display: flex;
      gap: 28px;
      background: rgba(5, 11, 20, 0.72);
      border: 1px solid rgba(0, 240, 255, 0.2);
      backdrop-filter: blur(14px);
      padding: 14px 26px;
      border-radius: 6px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    }
    .spec-item {
      display: flex;
      flex-direction: column;
    }
    .spec-label {
      font-size: 9px;
      color: #64748b;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .spec-val {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
      letter-spacing: 1px;
      margin-top: 3px;
    }
    .spec-val.cyan { color: #00f0ff; }
    .spec-val.violet { color: #c084fc; }
    .spec-val.gold { color: #fbbf24; }
    .coords {
      font-family: monospace;
      font-size: 11px;
      color: #475569;
      letter-spacing: 2px;
      text-align: right;
      line-height: 1.6;
    }
  </style>
  <script>
    ${threeBundleCode}
  </script>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hud">
    <div class="hud-header">
      <div class="hud-title-block">
        <div class="badge-wrap">
          <span class="badge">ArcheoScope Studio</span>
          <span class="sys-status">Quantum Field: Synced • Flux Ready</span>
        </div>
        <h1>CRONOS-01</h1>
        <p>Temporal Exploration Vehicle • Original Industrial IP</p>
      </div>
      <div class="coords">
        SECTOR: GIZA PLATEAU [ORIGIN ANOMALY]<br>
        WARP SIGNATURE: TACHYON-CHERENKOV<br>
        CHASSIS: TITANIUM-STEEL PBR ALLOY
      </div>
    </div>
    <div class="hud-footer">
      <div class="spec-grid">
        <div class="spec-item">
          <span class="spec-label">Displacement Core</span>
          <span class="spec-val violet">Twin Plasma Ring Reactor</span>
        </div>
        <div class="spec-item">
          <span class="spec-label">Aerodynamics</span>
          <span class="spec-val">Origami Wedge Aero</span>
        </div>
        <div class="spec-item">
          <span class="spec-label">Sensor Mast</span>
          <span class="spec-val cyan">LiDAR Sub-Surface Array</span>
        </div>
        <div class="spec-item">
          <span class="spec-label">Hardware Render</span>
          <span class="spec-val gold">NVIDIA RTX 5070 GPU</span>
        </div>
      </div>
      <div class="coords">
        100% PROCEDURAL LOCAL RENDER<br>
        ARCHEOSCOPE MOTOR 3D • 2026
      </div>
    </div>
  </div>

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
        renderer.setPixelRatio(1.0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.38;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x040711);
        scene.fog = new THREE.FogExp2(0x050914, 0.028);

        // Cámara dramática: vista 3/4 ligeramente elevada para ver capó y reactor trasero
        const camera = new THREE.PerspectiveCamera(34, ${width} / ${height}, 0.1, 200);
        camera.position.set(4.7, 1.55, 3.8);
        camera.lookAt(0.05, 0.48, -0.15);

        // ILUMINACIÓN CINEMATOGRÁFICA
        // 1. Key Light solar crepuscular cálido
        const keyLight = new THREE.DirectionalLight(0xffeedb, 4.2);
        keyLight.position.set(6.8, 5.0, 3.5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 4096;
        keyLight.shadow.mapSize.height = 4096;
        keyLight.shadow.bias = -0.0001;
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 25;
        keyLight.shadow.camera.left = -6;
        keyLight.shadow.camera.right = 6;
        keyLight.shadow.camera.top = 6;
        keyLight.shadow.camera.bottom = -6;
        scene.add(keyLight);

        // 2. Fill Light azul noche cósmica
        const fillLight = new THREE.DirectionalLight(0x3a5d85, 2.0);
        fillLight.position.set(-6.5, 3.5, 2.5);
        scene.add(fillLight);

        // 3. Rim Light Cian intenso resaltando aristas de la carrocería
        const rimLight = new THREE.DirectionalLight(0x00f0ff, 6.8);
        rimLight.position.set(-3.5, 4.2, -5.5);
        scene.add(rimLight);

        // 4. Luz de contorno superior violeta sobre el reactor
        const topRim = new THREE.DirectionalLight(0xa855f7, 4.5);
        topRim.position.set(2.8, 4.5, -4.5);
        scene.add(topRim);

        // 5. Hemisphere ambiental
        const hemiLight = new THREE.HemisphereLight(0x18263e, 0x03060a, 1.2);
        scene.add(hemiLight);

        // SUELO: Terraza arqueológica oscura con asfalto reflectante
        const floorGeo = new THREE.PlaneGeometry(80, 80, 64, 64);
        const floorMat = new THREE.MeshStandardMaterial({
          color: 0x090e18,
          roughness: 0.30,
          metalness: 0.52,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        scene.add(floor);

        // Cuadrícula holográfica
        const grid = new THREE.GridHelper(40, 40, 0x00d4ff, 0x0c1a2d);
        grid.position.y = 0.005;
        grid.material.opacity = 0.22;
        grid.material.transparent = true;
        scene.add(grid);

        // HUELLAS TEMPORALES LUMINOSAS
        const trackMat = new THREE.MeshBasicMaterial({
          color: 0x00f0ff,
          transparent: true,
          opacity: 0.60,
        });
        for (let t of [-0.85, 0.85]) {
          const trackGeo = new THREE.PlaneGeometry(0.36, 10.0);
          const track = new THREE.Mesh(trackGeo, trackMat);
          track.rotation.x = -Math.PI / 2;
          track.position.set(t, 0.01, -3.5);
          scene.add(track);
        }

        // RUINAS ARQUEOLÓGICAS (Megalitos & Pirámides)
        const ruinsMat = new THREE.MeshStandardMaterial({
          color: 0x111724,
          roughness: 0.88,
          metalness: 0.08,
        });
        const ruins = [
          [-9, 0, -9, 1.4, 7.5, 1.4],
          [10, 0, -11, 1.6, 9.5, 1.6],
          [-14, 0, -16, 2.2, 12.0, 2.2],
          [7, 0, -18, 3.0, 15.0, 3.0],
          [0, 0, -22, 6.5, 22.0, 6.5],
        ];
        ruins.forEach(([x, y, z, w, h, d], idx) => {
          const geo = idx === 4 ? new THREE.ConeGeometry(w, h, 4) : new THREE.BoxGeometry(w, h, d);
          const m = new THREE.Mesh(geo, ruinsMat);
          m.position.set(x, h / 2, z);
          m.castShadow = true;
          m.receiveShadow = true;
          scene.add(m);
        });

        // ESTRELLAS Y CONSTELACIONES
        const starsGeo = new THREE.BufferGeometry();
        const starsCount = 550;
        const starPos = new Float32Array(starsCount * 3);
        for (let i = 0; i < starsCount * 3; i += 3) {
          starPos[i] = (Math.random() - 0.5) * 55;
          starPos[i + 1] = Math.random() * 22 + 2;
          starPos[i + 2] = (Math.random() - 0.5) * 55;
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        const starsMat = new THREE.PointsMaterial({
          color: 0x9be8ff,
          size: 0.07,
          transparent: true,
          opacity: 0.85,
        });
        scene.add(new THREE.Points(starsGeo, starsMat));

        // CARGA DEL MODELO 3D BASE
        const loader = new GLTFLoader();
        const rawData = atob("${modelBase64}");
        const bytes = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          bytes[i] = rawData.charCodeAt(i);
        }

        loader.parse(bytes.buffer, '', (gltf) => {
          const car = gltf.scene;

          const box = new THREE.Box3().setFromObject(car);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 4.2 / maxDim;

          car.scale.setScalar(scale);
          car.position.x = -center.x * scale;
          car.position.y = -box.min.y * scale;
          car.position.z = -center.z * scale;
          car.rotation.y = 0.32;

          // MATERIALES PBR
          const titaniumBodyMat = new THREE.MeshStandardMaterial({
            color: 0xdde4ec,
            roughness: 0.25,
            metalness: 0.94,
            envMapIntensity: 2.5,
          });

          const cyberGlassMat = new THREE.MeshStandardMaterial({
            color: 0x081320,
            roughness: 0.05,
            metalness: 0.96,
            transparent: true,
            opacity: 0.85,
          });

          const tireMat = new THREE.MeshStandardMaterial({
            color: 0x121417,
            roughness: 0.82,
            metalness: 0.06,
          });

          const rimMat = new THREE.MeshStandardMaterial({
            color: 0x1f2633,
            roughness: 0.18,
            metalness: 0.95,
          });

          car.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              const name = (child.name || '').toLowerCase();
              if (name.includes('glass')) {
                child.material = cyberGlassMat;
              } else if (name.includes('circle') || name.includes('wheel')) {
                child.material = rimMat;
              } else if (name.includes('tire')) {
                child.material = tireMat;
              } else {
                child.material = titaniumBodyMat;
              }
            }
          });

          // =================================================================
          // PERSONALIZACIÓN TOTAL: "CRONOS-01 TEMPORAL EXPLORER"
          // =================================================================
          const cronosAddons = new THREE.Group();

          // 1. SPLITTER FRONTAL ARCHEOSCOPE (Cubre 100% el emblema DMC)
          const splitterGeo = new THREE.BoxGeometry(1.62, 0.14, 0.16);
          const splitterMat = new THREE.MeshStandardMaterial({
            color: 0x101722,
            roughness: 0.35,
            metalness: 0.92,
          });
          const splitter = new THREE.Mesh(splitterGeo, splitterMat);
          splitter.position.set(0, 0.02, 3.16);
          cronosAddons.add(splitter);

          // Placa luminosa central "ARCHEOSCOPE"
          const badgePlateGeo = new THREE.BoxGeometry(0.76, 0.065, 0.18);
          const badgePlateMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            emissive: 0x00e5ff,
            emissiveIntensity: 3.5,
          });
          const badgePlate = new THREE.Mesh(badgePlateGeo, badgePlateMat);
          badgePlate.position.set(0, 0.02, 3.17);
          cronosAddons.add(badgePlate);

          // 2. BARRA MATRIX LED CONTINUA ULTRA-DELGADA EN EL MORRO
          const lightBarGeo = new THREE.BoxGeometry(1.76, 0.032, 0.12);
          const lightBarMat = new THREE.MeshStandardMaterial({
            color: 0x00f5ff,
            emissive: 0x00f0ff,
            emissiveIntensity: 6.5,
          });
          const lightBar = new THREE.Mesh(lightBarGeo, lightBarMat);
          lightBar.position.set(0, 0.11, 3.16);
          cronosAddons.add(lightBar);

          // Foco delantero volumétrico
          const frontHeadlight = new THREE.SpotLight(0x00f5ff, 5.5, 14, Math.PI / 4, 0.45);
          frontHeadlight.position.set(0, 0.15, 3.3);
          frontHeadlight.target.position.set(0, 0, 8.0);
          scene.add(frontHeadlight.target);
          cronosAddons.add(frontHeadlight);

          // 3. SENSOR LIDAR ARQUEOLÓGICO DE TECHO
          const lidarBaseGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.04, 16);
          const brassMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37, // Oro / Latón de explorador
            roughness: 0.25,
            metalness: 0.95,
          });
          const lidarBase = new THREE.Mesh(lidarBaseGeo, brassMat);
          lidarBase.position.set(0, 0.71, 0.15);
          cronosAddons.add(lidarBase);

          const lidarDomeGeo = new THREE.SphereGeometry(0.10, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
          const lidarDomeMat = new THREE.MeshStandardMaterial({
            color: 0x00d4ff,
            emissive: 0x00f0ff,
            emissiveIntensity: 4.0,
            roughness: 0.1,
          });
          const lidarDome = new THREE.Mesh(lidarDomeGeo, lidarDomeMat);
          lidarDome.position.set(0, 0.73, 0.15);
          cronosAddons.add(lidarDome);

          // 4. REACTOR TEMPORAL CUÁNTICO TRASERO (Elevado y visible en la zaga)
          const copperMat = new THREE.MeshStandardMaterial({
            color: 0xc87d40,
            roughness: 0.22,
            metalness: 0.96,
          });
          const coilAccentMat = new THREE.MeshStandardMaterial({
            color: 0x9333ea,
            emissive: 0xa855f7,
            emissiveIntensity: 4.8,
          });

          for (let side of [-0.48, 0.48]) {
            const cylinderGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.75, 16);
            const cyl = new THREE.Mesh(cylinderGeo, copperMat);
            cyl.rotation.z = Math.PI / 2;
            cyl.position.set(side, 0.48, -1.60);
            cyl.castShadow = true;
            cronosAddons.add(cyl);

            // Anillos de bobina
            for (let ringZ of [-0.22, 0, 0.22]) {
              const bRingGeo = new THREE.TorusGeometry(0.155, 0.02, 10, 20);
              const bRing = new THREE.Mesh(bRingGeo, coilAccentMat);
              bRing.position.set(side + ringZ, 0.48, -1.60);
              cronosAddons.add(bRing);
            }
          }

          // ANILLOS DE CONFINAMIENTO DE PLASMA (Tachyon Rings inclinados y claramente visibles)
          const ringTorusGeo1 = new THREE.TorusGeometry(0.32, 0.038, 16, 32);
          const ringPlasmaMat1 = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00f0ff,
            emissiveIntensity: 7.2,
            roughness: 0.05,
          });
          const plasmaRing1 = new THREE.Mesh(ringTorusGeo1, ringPlasmaMat1);
          plasmaRing1.rotation.x = Math.PI / 2.5; // Inclinado para verse de frente-lateral
          plasmaRing1.position.set(0, 0.68, -1.60);
          cronosAddons.add(plasmaRing1);

          const ringTorusGeo2 = new THREE.TorusGeometry(0.24, 0.030, 16, 32);
          const ringPlasmaMat2 = new THREE.MeshStandardMaterial({
            color: 0xc084fc,
            emissive: 0xd946ef,
            emissiveIntensity: 6.2,
            roughness: 0.05,
          });
          const plasmaRing2 = new THREE.Mesh(ringTorusGeo2, ringPlasmaMat2);
          plasmaRing2.rotation.x = Math.PI / 2.5;
          plasmaRing2.rotation.y = 0.55;
          plasmaRing2.position.set(0, 0.68, -1.60);
          cronosAddons.add(plasmaRing2);

          // Luz de emisión del reactor
          const reactorGlow = new THREE.PointLight(0x00f0ff, 6.0, 7.0);
          reactorGlow.position.set(0, 0.80, -1.65);
          cronosAddons.add(reactorGlow);

          const reactorPurpleGlow = new THREE.PointLight(0xd946ef, 4.5, 6.0);
          reactorPurpleGlow.position.set(0, 0.55, -1.75);
          cronosAddons.add(reactorPurpleGlow);

          // 5. UNDERGLOW CIAN
          const underglowLight = new THREE.PointLight(0x00f0ff, 5.0, 4.5);
          underglowLight.position.set(0, -0.22, 0.5);
          cronosAddons.add(underglowLight);

          // 6. DIFUSORES LATERALES CON GUIAS DE NEON
          const sillNeonMat = new THREE.MeshStandardMaterial({
            color: 0x00f5ff,
            emissive: 0x00e5ff,
            emissiveIntensity: 4.2,
          });
          for (let side of [-1.02, 1.02]) {
            const sillGeo = new THREE.BoxGeometry(0.04, 0.03, 2.5);
            const sill = new THREE.Mesh(sillGeo, sillNeonMat);
            sill.position.set(side, -0.12, 0.5);
            cronosAddons.add(sill);
          }

          car.add(cronosAddons);
          scene.add(car);

          renderer.render(scene, camera);
          document.body.setAttribute('data-rendered', 'true');
          console.log('✨ Renderizado de Cronos-01 completado exitosamente.');
        }, undefined, (err) => {
          console.error('Error al parsear GLTF:', err);
          document.body.setAttribute('data-error', err.message);
        });

      } catch (e) {
        console.error('Error de inicialización Three.js:', e);
        document.body.setAttribute('data-error', e.message);
      }
    })();
  </script>
</body>
</html>`;

    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForSelector('body[data-rendered="true"]', { timeout: 25000 });
    await page.waitForTimeout(200);

    const pngBuffer = await page.screenshot({ type: 'png' });
    console.log(`📸 Captura tomada: ${pngBuffer.length} bytes`);

    // Guardar en backend storage/posters
    const outStorage = path.join(root, 'storage', 'posters', 'cronos01_temporal_explorer.png');
    fs.writeFileSync(outStorage, pngBuffer);
    console.log(`💾 Guardado en backend: ${outStorage}`);

    // Guardar en ArcheoScope/models_3d/vehicles
    const archeoDir = 'C:\\Projects\\ArcheoScope\\models_3d\\vehicles';
    if (!fs.existsSync(archeoDir)) fs.mkdirSync(archeoDir, { recursive: true });
    const outArcheo = path.join(archeoDir, 'cronos01_temporal_explorer.png');
    fs.writeFileSync(outArcheo, pngBuffer);
    console.log(`💾 Guardado en ArcheoScope: ${outArcheo}`);

    // Guardar en Artefactos con forward slashes
    const artifactDir = 'C:/Users/xiphos-pc1/.gemini/antigravity-ide/brain/38dca50f-2500-4b68-881d-914238dc84b8';
    const outArtifact = path.join(artifactDir, 'cronos01_temporal_explorer.png');
    fs.writeFileSync(outArtifact, pngBuffer);
    console.log(`💾 Guardado en Artefactos: ${outArtifact}`);

    return {
      success: true,
      size: pngBuffer.length,
      outStorage,
      outArcheo,
      outArtifact,
    };
  } finally {
    if (browser) await browser.close();
  }
}

renderCronos01TimeMachine().then(() => {
  console.log('🎉 PROCESO DE RENDERIZADO COMPLETADO.');
  process.exit(0);
}).catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
