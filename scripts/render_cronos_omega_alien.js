const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * SERVICIO ESPECIAL DE RENDERIZADO 3D EN BACKEND (JARBEES GRAPHICS ENGINE)
 * Versión 3.0 - Acabado Iridiscente y Brillante Alienígena:
 * - Chasis de aleación bismuto-turquesa con alta visibilidad y reflejos angulares.
 * - 4 Pods antigravedad iónicos con vórtices de energía esmeralda y haz tractor central.
 * - Núcleo de singularidad cuántica en la zaga con octaedro de cristal refractivo.
 * - Sensor dorsal telemétrico y barra frontal matrix esmeralda.
 * - Renderizado en GPU física NVIDIA RTX 5070 con Direct3D11 a 2048x1152.
 */
async function renderCronosOmegaAlien() {
  console.log('========================================================================');
  console.log('🛸 CRONOS-OMEGA: XENOTECH TEMPORAL VESSEL v3 (ALTO BRILLO IRIDISCENTE)');
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
    body { width: ${width}px; height: ${height}px; background: #03060c; overflow: hidden; font-family: 'Segoe UI', sans-serif; }
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
      background: rgba(0, 255, 170, 0.15);
      border: 1px solid rgba(0, 255, 170, 0.75);
      color: #00ffaa;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 3.5px;
      padding: 6px 16px;
      border-radius: 4px;
      text-transform: uppercase;
      box-shadow: 0 0 22px rgba(0, 255, 170, 0.4);
    }
    .sys-status {
      font-size: 11px;
      color: #7ee7c9;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .hud-title-block h1 {
      font-size: 46px;
      font-weight: 900;
      color: #f0fffb;
      letter-spacing: 7px;
      text-transform: uppercase;
      margin-top: 10px;
      text-shadow: 0 0 35px rgba(0, 255, 170, 0.45);
    }
    .hud-title-block p {
      font-size: 14px;
      color: #00ffaa;
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
      background: rgba(3, 10, 16, 0.78);
      border: 1px solid rgba(0, 255, 170, 0.3);
      backdrop-filter: blur(14px);
      padding: 14px 26px;
      border-radius: 6px;
      box-shadow: 0 8px 36px rgba(0, 0, 0, 0.75);
    }
    .spec-item {
      display: flex;
      flex-direction: column;
    }
    .spec-label {
      font-size: 9px;
      color: #5d8278;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .spec-val {
      font-size: 13px;
      font-weight: 700;
      color: #e2fbf3;
      letter-spacing: 1px;
      margin-top: 3px;
    }
    .spec-val.emerald { color: #00ffaa; }
    .spec-val.cyan { color: #00e5ff; }
    .spec-val.violet { color: #d946ef; }
    .coords {
      font-family: monospace;
      font-size: 11px;
      color: #3f6057;
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
          <span class="badge">ArcheoScope Xenotech</span>
          <span class="sys-status">Anti-Gravity Levitation: Active • Warp 99.8%</span>
        </div>
        <h1>CRONOS-OMEGA</h1>
        <p>Xenotech Temporal Vessel • Alien Artifact Hovercraft</p>
      </div>
      <div class="coords">
        ORIGIN: ANCIENT EXTRATERRESTRIAL VAULT<br>
        PROPULSION: 4x IONIC HOVER PODS<br>
        SINGULARITY CORE: SUSPENDED TACHYON CRYSTAL
      </div>
    </div>
    <div class="hud-footer">
      <div class="spec-grid">
        <div class="spec-item">
          <span class="spec-label">Hull Material</span>
          <span class="spec-val emerald">Iridescent Obsidian-Bismuth</span>
        </div>
        <div class="spec-item">
          <span class="spec-label">Levitation</span>
          <span class="spec-val cyan">Gravimetric Tractor Vortex</span>
        </div>
        <div class="spec-item">
          <span class="spec-label">Displacement Core</span>
          <span class="spec-val violet">Quantum Crystal Octahedron</span>
        </div>
        <div class="spec-item">
          <span class="spec-label">Hardware Render</span>
          <span class="spec-val emerald">NVIDIA RTX 5070 GPU</span>
        </div>
      </div>
      <div class="coords">
        REVERSE-ENGINEERED ALIEN TECH<br>
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
        renderer.toneMappingExposure = 1.32;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x02050b);
        scene.fog = new THREE.FogExp2(0x040913, 0.024);

        // Cámara dramática baja en ángulo 3/4
        const camera = new THREE.PerspectiveCamera(35, ${width} / ${height}, 0.1, 200);
        camera.position.set(4.6, 1.35, 4.2);
        camera.lookAt(0.1, 0.72, 0.0);

        // ILUMINACIÓN ALIENÍGENA MULTI-DIRECCIONAL
        // 1. Key Light solar/alienígena frontal potente
        const keyLight = new THREE.DirectionalLight(0xdffaff, 4.8);
        keyLight.position.set(5.5, 4.2, 5.5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 4096;
        keyLight.shadow.mapSize.height = 4096;
        keyLight.shadow.bias = -0.0001;
        scene.add(keyLight);

        // 2. Front Fill Light cian suave para modelar la chapa
        const frontFill = new THREE.DirectionalLight(0x4095a8, 2.8);
        frontFill.position.set(1.5, 3.0, 6.0);
        scene.add(frontFill);

        // 3. Fill Light violeta lateral
        const fillLight = new THREE.DirectionalLight(0x733299, 2.8);
        fillLight.position.set(-6.0, 3.5, 2.5);
        scene.add(fillLight);

        // 4. Rim Light Esmeralda intenso
        const rimLight = new THREE.DirectionalLight(0x00ffaa, 7.5);
        rimLight.position.set(-3.5, 4.2, -5.2);
        scene.add(rimLight);

        // 5. Luz superior de contorno
        const topRim = new THREE.DirectionalLight(0x00e5ff, 4.5);
        topRim.position.set(3.0, 4.8, -4.5);
        scene.add(topRim);

        // 6. Ambient Hemisphere
        const hemiLight = new THREE.HemisphereLight(0x1a4239, 0x050c0f, 1.6);
        scene.add(hemiLight);

        // SUELO: Terraza ancestral alienígena oscura reflectante
        const floorGeo = new THREE.PlaneGeometry(80, 80, 64, 64);
        const floorMat = new THREE.MeshStandardMaterial({
          color: 0x081018,
          roughness: 0.28,
          metalness: 0.65,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        scene.add(floor);

        // Red holográfica esmeralda en el suelo
        const grid = new THREE.GridHelper(44, 44, 0x00ffaa, 0x0c2a22);
        grid.position.y = 0.005;
        grid.material.opacity = 0.28;
        grid.material.transparent = true;
        scene.add(grid);

        // ANILLOS RUNICOS CONCÉNTRICOS EN EL SUELO
        for (let r of [1.6, 2.8, 4.2]) {
          const runicCircleGeo = new THREE.RingGeometry(r - 0.035, r, 64);
          const runicMat = new THREE.MeshBasicMaterial({
            color: 0x00ffbb,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.45 - r * 0.05,
          });
          const runicRing = new THREE.Mesh(runicCircleGeo, runicMat);
          runicRing.rotation.x = -Math.PI / 2;
          runicRing.position.set(0, 0.012, 0.1);
          scene.add(runicRing);
        }

        // HAZ TRACTOR GRAVITACIONAL CÓNICO
        const beamGeo = new THREE.CylinderGeometry(0.55, 2.4, 0.95, 32, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
          color: 0x00ffaa,
          transparent: true,
          opacity: 0.24,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const tractorBeam = new THREE.Mesh(beamGeo, beamMat);
        tractorBeam.position.set(0, 0.48, 0.1);
        scene.add(tractorBeam);

        const tractorLight = new THREE.PointLight(0x00ffaa, 7.5, 5.5);
        tractorLight.position.set(0, 0.35, 0.1);
        scene.add(tractorLight);

        // OBELISCOS Y PIRÁMIDES ANCESTRALES CON RUNAS LUMINOSAS
        const monolithMat = new THREE.MeshStandardMaterial({
          color: 0x0e1822,
          roughness: 0.85,
          metalness: 0.15,
        });
        const runeMat = new THREE.MeshBasicMaterial({
          color: 0x00ffcc,
          transparent: true,
          opacity: 0.75,
        });

        const monoliths = [
          [-8, 0, -8, 1.2, 8.0, 1.2],
          [9, 0, -10, 1.4, 9.5, 1.4],
          [-14, 0, -15, 2.0, 13.0, 2.0],
          [6, 0, -17, 2.8, 16.0, 2.8],
          [0, 0, -22, 6.5, 22.0, 6.5],
        ];

        monoliths.forEach(([x, y, z, w, h, d], idx) => {
          const geo = idx === 4 ? new THREE.ConeGeometry(w, h, 4) : new THREE.BoxGeometry(w, h, d);
          const m = new THREE.Mesh(geo, monolithMat);
          m.position.set(x, h / 2, z);
          m.castShadow = true;
          m.receiveShadow = true;
          scene.add(m);

          if (idx < 4) {
            const runeStripeGeo = new THREE.PlaneGeometry(0.12, h * 0.7);
            const stripe = new THREE.Mesh(runeStripeGeo, runeMat);
            stripe.position.set(x, h * 0.5, z + d / 2 + 0.02);
            scene.add(stripe);
          }
        });

        // ESTRELLAS Y CONSTELACIONES
        const starsGeo = new THREE.BufferGeometry();
        const starsCount = 600;
        const starPos = new Float32Array(starsCount * 3);
        for (let i = 0; i < starsCount * 3; i += 3) {
          starPos[i] = (Math.random() - 0.5) * 60;
          starPos[i + 1] = Math.random() * 24 + 2;
          starPos[i + 2] = (Math.random() - 0.5) * 60;
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        const starsMat = new THREE.PointsMaterial({
          color: 0xaaffea,
          size: 0.075,
          transparent: true,
          opacity: 0.85,
        });
        scene.add(new THREE.Points(starsGeo, starsMat));

        // CARGA Y TRANSFORMACIÓN DE LA MALLA
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
          // ELEVADO EN EL AIRE: MODO HOVER (0.86m de levitación!)
          car.position.y = 0.86;
          car.position.z = -center.z * scale;
          car.rotation.y = 0.32;
          car.rotation.x = -0.04;

          // MATERIALES ALIENÍGENAS XENOTECH BRILLANTES
          // Carrocería: Aleación Bismuto-Turquesa iridiscente con alto brillo y facetas definidas
          const alienHullMat = new THREE.MeshStandardMaterial({
            color: 0x487a88,
            roughness: 0.32,
            metalness: 0.78,
            envMapIntensity: 2.2,
          });

          // Cristal tintado alienígena polarizado
          const alienGlassMat = new THREE.MeshStandardMaterial({
            color: 0x052433,
            roughness: 0.06,
            metalness: 0.96,
            transparent: true,
            opacity: 0.88,
          });

          // Ocultar ruedas viejas y aplicar el material iridiscente
          car.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              const name = (child.name || '').toLowerCase();
              if (name.includes('glass')) {
                child.material = alienGlassMat;
              } else if (name.includes('wheel') || name.includes('circle') || name.includes('tire')) {
                child.visible = false;
              } else {
                child.material = alienHullMat;
              }
            }
          });

          // =================================================================
          // COMPONENTES XENOTECH ALIENÍGENAS AÑADIDOS
          // =================================================================
          const xenotechGroup = new THREE.Group();

          // 1. SPLITTER FRONTAL XENOTECH (Cubre totalmente el logo DMC en z=3.16, y=0.02)
          const alienSplitterGeo = new THREE.BoxGeometry(1.64, 0.16, 0.16);
          const alienSplitterMat = new THREE.MeshStandardMaterial({
            color: 0x0b1e2a,
            roughness: 0.3,
            metalness: 0.95,
          });
          const alienSplitter = new THREE.Mesh(alienSplitterGeo, alienSplitterMat);
          alienSplitter.position.set(0, 0.02, 3.16);
          xenotechGroup.add(alienSplitter);

          // Placa central de insignia Xenotech esmeralda
          const badgePlateGeo = new THREE.BoxGeometry(0.78, 0.075, 0.18);
          const badgePlateMat = new THREE.MeshStandardMaterial({
            color: 0x00ffaa,
            emissive: 0x00ffbb,
            emissiveIntensity: 4.2,
          });
          const badgePlate = new THREE.Mesh(badgePlateGeo, badgePlateMat);
          badgePlate.position.set(0, 0.02, 3.17);
          xenotechGroup.add(badgePlate);

          // Barra Matrix Esmeralda / Cian en el morro (z=3.16, y=0.11)
          const alienFrontLightGeo = new THREE.BoxGeometry(1.78, 0.035, 0.14);
          const alienLightMat = new THREE.MeshStandardMaterial({
            color: 0x00ffaa,
            emissive: 0x00e5a3,
            emissiveIntensity: 7.0,
          });
          const alienFrontLight = new THREE.Mesh(alienFrontLightGeo, alienLightMat);
          alienFrontLight.position.set(0, 0.11, 3.16);
          xenotechGroup.add(alienFrontLight);

          // 2. MÓDULOS DE PROPULSIÓN ANTIGRAVEDAD EN LOS 4 PASOS DE RUEDA (Hover Pods)
          const podPositions = [
            [-1.08, -0.22, 2.05], // Delantero Izquierdo
            [1.08, -0.22, 2.05],  // Delantero Derecho
            [-1.08, -0.22, -1.05],// Trasero Izquierdo
            [1.08, -0.22, -1.05], // Trasero Derecho
          ];

          const podHousingMat = new THREE.MeshStandardMaterial({
            color: 0x102b3a,
            roughness: 0.22,
            metalness: 0.94,
          });

          const podEmitterMat = new THREE.MeshStandardMaterial({
            color: 0x00ffaa,
            emissive: 0x00ffaa,
            emissiveIntensity: 6.5,
          });

          const thrusterConeGlowMat = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
          });

          podPositions.forEach(([px, py, pz]) => {
            const housingGeo = new THREE.CylinderGeometry(0.34, 0.38, 0.14, 24);
            const housing = new THREE.Mesh(housingGeo, podHousingMat);
            housing.position.set(px, py, pz);
            xenotechGroup.add(housing);

            const emitterGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20);
            const emitter = new THREE.Mesh(emitterGeo, podEmitterMat);
            emitter.position.set(px, py - 0.06, pz);
            xenotechGroup.add(emitter);

            const ringGeo = new THREE.TorusGeometry(0.36, 0.025, 12, 24);
            const ring = new THREE.Mesh(ringGeo, podEmitterMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(px, py - 0.04, pz);
            xenotechGroup.add(ring);

            const coneGeo = new THREE.CylinderGeometry(0.24, 0.58, 0.72, 16, 1, true);
            const cone = new THREE.Mesh(coneGeo, thrusterConeGlowMat);
            cone.position.set(px, py - 0.42, pz);
            xenotechGroup.add(cone);

            const pLight = new THREE.PointLight(0x00ffaa, 4.2, 3.5);
            pLight.position.set(px, py - 0.45, pz);
            xenotechGroup.add(pLight);
          });

          // 3. NÚCLEO DE SINGULARIDAD CUÁNTICA ALIENÍGENA
          const crystalGeo = new THREE.OctahedronGeometry(0.28, 0);
          const crystalMat = new THREE.MeshStandardMaterial({
            color: 0x70ffff,
            emissive: 0x00ffaa,
            emissiveIntensity: 5.5,
            roughness: 0.04,
            metalness: 0.15,
            transparent: true,
            opacity: 0.90,
          });
          const crystalCore = new THREE.Mesh(crystalGeo, crystalMat);
          crystalCore.position.set(0, 0.58, -1.65);
          crystalCore.rotation.y = Math.PI / 4;
          crystalCore.rotation.z = Math.PI / 6;
          xenotechGroup.add(crystalCore);

          const alienOrbitalRingGeo1 = new THREE.TorusGeometry(0.38, 0.032, 16, 32);
          const alienOrbitalMat1 = new THREE.MeshStandardMaterial({
            color: 0x00ffaa,
            emissive: 0x00ffaa,
            emissiveIntensity: 7.2,
            roughness: 0.05,
          });
          const oRing1 = new THREE.Mesh(alienOrbitalRingGeo1, alienOrbitalMat1);
          oRing1.rotation.x = Math.PI / 2.3;
          oRing1.position.set(0, 0.58, -1.65);
          xenotechGroup.add(oRing1);

          const alienOrbitalRingGeo2 = new THREE.TorusGeometry(0.28, 0.024, 16, 32);
          const alienOrbitalMat2 = new THREE.MeshStandardMaterial({
            color: 0xd946ef,
            emissive: 0xe879f9,
            emissiveIntensity: 6.5,
            roughness: 0.05,
          });
          const oRing2 = new THREE.Mesh(alienOrbitalRingGeo2, alienOrbitalMat2);
          oRing2.rotation.x = Math.PI / 2.8;
          oRing2.rotation.y = 0.65;
          oRing2.position.set(0, 0.58, -1.65);
          xenotechGroup.add(oRing2);

          const singularityLight = new THREE.PointLight(0x00ffaa, 7.0, 6.0);
          singularityLight.position.set(0, 0.70, -1.65);
          xenotechGroup.add(singularityLight);

          const singularityPurple = new THREE.PointLight(0xd946ef, 5.0, 5.0);
          singularityPurple.position.set(0, 0.45, -1.75);
          xenotechGroup.add(singularityPurple);

          // 4. SENSOR DORSAL TELEMÉTRICO ALIENÍGENA
          const dorsalSpikeGeo = new THREE.ConeGeometry(0.08, 0.32, 6);
          const dorsalMat = new THREE.MeshStandardMaterial({
            color: 0x00e5ff,
            emissive: 0x00ffaa,
            emissiveIntensity: 4.8,
            roughness: 0.1,
          });
          const dorsalSpike = new THREE.Mesh(dorsalSpikeGeo, dorsalMat);
          dorsalSpike.position.set(0, 0.84, 0.15);
          xenotechGroup.add(dorsalSpike);

          // 5. GUIAS DE CIRCUITO LUMINOSO EN LOS DIFUSORES LATERALES
          const circuitNeonMat = new THREE.MeshStandardMaterial({
            color: 0x00ffaa,
            emissive: 0x00ffaa,
            emissiveIntensity: 5.5,
          });
          for (let side of [-1.02, 1.02]) {
            const sillGeo = new THREE.BoxGeometry(0.035, 0.03, 2.7);
            const sill = new THREE.Mesh(sillGeo, circuitNeonMat);
            sill.position.set(side, -0.12, 0.5);
            xenotechGroup.add(sill);
          }

          car.add(xenotechGroup);
          scene.add(car);

          renderer.render(scene, camera);
          document.body.setAttribute('data-rendered', 'true');
          console.log('✨ Renderizado de Cronos-Omega Alien completado con éxito.');
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
    const outStorage = path.join(root, 'storage', 'posters', 'cronos_omega_alien_hovercraft.png');
    fs.writeFileSync(outStorage, pngBuffer);
    console.log(`💾 Guardado en backend: ${outStorage}`);

    // Guardar en ArcheoScope/models_3d/vehicles
    const archeoDir = 'C:\\Projects\\ArcheoScope\\models_3d\\vehicles';
    if (!fs.existsSync(archeoDir)) fs.mkdirSync(archeoDir, { recursive: true });
    const outArcheo = path.join(archeoDir, 'cronos_omega_alien_hovercraft.png');
    fs.writeFileSync(outArcheo, pngBuffer);
    console.log(`💾 Guardado en ArcheoScope: ${outArcheo}`);

    // Guardar en Artefactos con forward slashes
    const artifactDir = 'C:/Users/xiphos-pc1/.gemini/antigravity-ide/brain/38dca50f-2500-4b68-881d-914238dc84b8';
    const outArtifact = path.join(artifactDir, 'cronos_omega_alien_hovercraft.png');
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

renderCronosOmegaAlien().then(() => {
  console.log('🎉 PROCESO DE RENDERIZADO ALIEN v3 COMPLETADO.');
  process.exit(0);
}).catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
