const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Motor 3D Realista para Retrato de Angelina Jolie en Three.js (WebGL 2.0 / RTX 5070)
 * Construye una escena tridimensional completa con:
 * - Geometría facial 3D esculpida paramétricamente con los rasgos icónicos de Angelina Jolie:
 *   * Pómulos altos prominentes (arcos cigomáticos esculpidos).
 *   * Mandíbula angular y mentón definido.
 *   * Ojos felinos rasgados almendrados con córnea reflectiva, iris avellana y delineado cat-eye.
 *   * Labios hiper-voluminosos con hendidura inferior y arco de Cupido pronunciado.
 *   * Cabello castaño espresso con múltiples capas de volumen y brillo sedoso.
 * - Materiales PBR (MeshStandardMaterial) calibrados para piel con calidez sub-superficial,
 *   labios con brillo gloss húmedo y ojos cristalinos de alta reflectividad.
 * - Iluminación de estudio cinematográfica estilo Rembrandt (Key Light 45°, Fill fría, Rim dorado de silueta).
 * - Sombras suaves PCF a 2048x2048 de alta definición.
 * - Tone mapping ACESFilmic para calidad fílmica.
 * - Renderizado en resolución maestra 2048x2048 acelerado por la GPU física RTX 5070.
 */
async function renderAngelina3DRealistic() {
  console.log('========================================================================');
  console.log('🎬 RENDERIZANDO RETRATO 3D REALISTA DE ANGELINA JOLIE (THREE.JS & GPU)');
  console.log('========================================================================\n');

  const bundlePath = path.join(process.cwd(), 'storage', 'assets', 'three', 'three_bundle.js');
  if (!fs.existsSync(bundlePath)) {
    throw new Error('Three.js bundle no encontrado: ' + bundlePath);
  }
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
    body { width: ${width}px; height: ${height}px; background: #080608; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }
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
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .badge-studio {
      background: rgba(18, 12, 16, 0.7);
      border: 1px solid rgba(255, 215, 170, 0.35);
      border-radius: 4px;
      padding: 6px 16px;
      color: #ffd8aa;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 4px;
      text-transform: uppercase;
      backdrop-filter: blur(8px);
    }
    .badge-tech {
      color: #a090a0;
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
      font-size: 58px;
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
    <div class="header">
      <div class="badge-studio">JARBEES 3D REALISTIC STUDIO</div>
      <div class="badge-tech">PBR &bull; REMBRANDT 3-POINT LIGHTING &bull; RTX 5070</div>
    </div>
    <div class="footer">
      <h1 class="name-main">ANGELINA JOLIE</h1>
      <div class="name-sub">ANATOMICAL 3D CINEMATIC PORTRAIT</div>
    </div>
  </div>

  <script>
    (async function init() {
      try {
        const THREE = window.THREE;
        const canvas = document.getElementById('c');

        // 1. WebGL 2.0 Renderer con ACESFilmic Tone Mapping
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
        renderer.toneMappingExposure = 1.15;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        // Fondo de estudio cálido con viñeteado crepuscular
        scene.background = new THREE.Color(0x0a0709);
        scene.fog = new THREE.FogExp2(0x0a0709, 0.04);

        // 2. Cámara de Retrato Focal 85mm (FOV 32° para compresión facial natural)
        const camera = new THREE.PerspectiveCamera(32, ${width} / ${height}, 0.1, 100);
        camera.position.set(0, 0.25, 4.2);
        camera.lookAt(0, 0.15, 0);

        // 3. Materiales PBR Especializados
        // Piel con calidez de dispersión sub-superficial
        const skinMat = new THREE.MeshStandardMaterial({
          color: 0xecd0be,
          roughness: 0.58,
          metalness: 0.04,
          roughnessMap: null,
        });

        // Pómulos y luces altas (Sheen sutil)
        const cheekHighlightMat = new THREE.MeshStandardMaterial({
          color: 0xffeae0,
          roughness: 0.38,
          metalness: 0.06,
        });

        // Labios Voluminosos con Gloss Especular Húmedo
        const lipsMat = new THREE.MeshStandardMaterial({
          color: 0xbd5555,
          roughness: 0.22,
          metalness: 0.08,
        });

        // Dientes delicados
        const teethMat = new THREE.MeshStandardMaterial({
          color: 0xfbfbf9,
          roughness: 0.3,
          metalness: 0.05,
        });

        // Ojos: Esclerótica
        const scleraMat = new THREE.MeshStandardMaterial({
          color: 0xf6f4f0,
          roughness: 0.18,
          metalness: 0.05,
        });

        // Ojos: Iris Hazel/Verde Esmeralda Radiante
        const irisMat = new THREE.MeshStandardMaterial({
          color: 0x4e7844,
          roughness: 0.15,
          metalness: 0.12,
        });

        // Ojos: Pupila Profunda
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050508 });

        // Córnea reflectiva transparente sobre el ojo
        const corneaMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.04,
          metalness: 0.25,
          transparent: true,
          opacity: 0.45,
        });

        // Delineado Eyeliner y Pestañas
        const linerMat = new THREE.MeshBasicMaterial({ color: 0x110c0e });

        // Cejas Castaño Oscuro
        const browMat = new THREE.MeshStandardMaterial({
          color: 0x241612,
          roughness: 0.85,
          metalness: 0.05,
        });

        // Cabello Castaño Espresso Sedoso
        const hairMat = new THREE.MeshStandardMaterial({
          color: 0x180f0b,
          roughness: 0.38,
          metalness: 0.15,
        });

        // Mechones con Reflejos Caoba/Dorado
        const hairSheenMat = new THREE.MeshStandardMaterial({
          color: 0x482b1f,
          roughness: 0.28,
          metalness: 0.22,
        });

        // 4. Construcción Anatómica 3D del Retrato
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 0, 0);
        headGroup.rotation.y = -0.12; // Rotación sutil de 3/4 hacia la luz

        // 4A. Cráneo y Rostro Base Esculpido
        // Cabeza con volumen ovalado alargado
        const headBaseGeo = new THREE.SphereGeometry(0.72, 32, 28);
        headBaseGeo.scale(1.0, 1.34, 1.08);
        const headMesh = new THREE.Mesh(headBaseGeo, skinMat);
        headMesh.castShadow = true;
        headMesh.receiveShadow = true;
        headGroup.add(headMesh);

        // Pómulos Altos Prominentes de Angelina (Zygomatic Arches)
        const cheekLeftGeo = new THREE.SphereGeometry(0.24, 16, 16);
        cheekLeftGeo.scale(1.3, 0.85, 0.95);
        const cheekLeft = new THREE.Mesh(cheekLeftGeo, cheekHighlightMat);
        cheekLeft.position.set(-0.46, 0.12, 0.48);
        cheekLeft.rotation.z = 0.25;
        cheekLeft.castShadow = true;
        headGroup.add(cheekLeft);

        const cheekRightGeo = new THREE.SphereGeometry(0.24, 16, 16);
        cheekRightGeo.scale(1.3, 0.85, 0.95);
        const cheekRight = new THREE.Mesh(cheekRightGeo, cheekHighlightMat);
        cheekRight.position.set(0.46, 0.12, 0.48);
        cheekRight.rotation.z = -0.25;
        cheekRight.castShadow = true;
        headGroup.add(cheekRight);

        // Mandíbula Angular y Mentón Definido
        const jawGeo = new THREE.CylinderGeometry(0.55, 0.32, 0.65, 16);
        jawGeo.scale(1.15, 1.0, 1.0);
        const jawMesh = new THREE.Mesh(jawGeo, skinMat);
        jawMesh.position.set(0, -0.45, 0.18);
        jawMesh.rotation.x = 0.28;
        jawMesh.castShadow = true;
        jawMesh.receiveShadow = true;
        headGroup.add(jawMesh);

        // Barbilla / Mentón esculpido con leve relieve
        const chinGeo = new THREE.SphereGeometry(0.18, 16, 14);
        chinGeo.scale(1.25, 0.8, 1.0);
        const chinMesh = new THREE.Mesh(chinGeo, skinMat);
        chinMesh.position.set(0, -0.74, 0.52);
        chinMesh.castShadow = true;
        headGroup.add(chinMesh);

        // 4B. Cuello Grácil y Clavículas
        const neckGeo = new THREE.CylinderGeometry(0.32, 0.44, 0.95, 24);
        const neckMesh = new THREE.Mesh(neckGeo, skinMat);
        neckMesh.position.set(0, -1.05, -0.05);
        neckMesh.castShadow = true;
        neckMesh.receiveShadow = true;
        headGroup.add(neckMesh);

        // Hombros y Clavículas estilizados
        const shouldersGeo = new THREE.BoxGeometry(2.4, 0.45, 0.9);
        const shouldersMesh = new THREE.Mesh(shouldersGeo, skinMat);
        shouldersMesh.position.set(0, -1.55, -0.1);
        shouldersMesh.receiveShadow = true;
        headGroup.add(shouldersMesh);

        // 4C. Ojos Felinos Rasgados de Angelina Jolie
        const eyeY = 0.18;
        const eyeDist = 0.32;
        const eyeZ = 0.64;

        function createAngelinaEye(isRight) {
          const eyeGroup = new THREE.Group();
          const dir = isRight ? 1 : -1;

          // Esclerótica
          const eyeBallGeo = new THREE.SphereGeometry(0.145, 24, 20);
          eyeBallGeo.scale(1.25, 0.85, 1.0); // Ojo almendrado
          const eyeBall = new THREE.Mesh(eyeBallGeo, scleraMat);
          eyeGroup.add(eyeBall);

          // Iris Verde/Avellana
          const irisGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.02, 24);
          const irisMesh = new THREE.Mesh(irisGeo, irisMat);
          irisMesh.rotation.x = Math.PI / 2;
          irisMesh.position.set(0, 0, 0.12);
          eyeGroup.add(irisMesh);

          // Pupila
          const pupilGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.025, 18);
          const pupilMesh = new THREE.Mesh(pupilGeo, pupilMat);
          pupilMesh.rotation.x = Math.PI / 2;
          pupilMesh.position.set(0, 0, 0.125);
          eyeGroup.add(pupilMesh);

          // Córnea con Brillo Especular
          const corneaGeo = new THREE.SphereGeometry(0.09, 16, 16);
          const corneaMesh = new THREE.Mesh(corneaGeo, corneaMat);
          corneaMesh.position.set(0, 0, 0.08);
          eyeGroup.add(corneaMesh);

          // Eyeliner Cat-Eye con colita exterior rasgada
          const linerGeo = new THREE.TorusGeometry(0.14, 0.018, 8, 24, Math.PI * 0.85);
          const linerMesh = new THREE.Mesh(linerGeo, linerMat);
          linerMesh.rotation.z = (Math.PI * 0.1) * dir;
          linerMesh.rotation.x = 0.2;
          linerMesh.position.set(0, 0.03, 0.1);
          eyeGroup.add(linerMesh);

          // Colita alada del cat-eye
          const wingGeo = new THREE.ConeGeometry(0.016, 0.11, 8);
          const wingMesh = new THREE.Mesh(wingGeo, linerMat);
          wingMesh.rotation.z = isRight ? -Math.PI * 0.35 : Math.PI * 0.35;
          wingMesh.position.set(dir * 0.155, 0.045, 0.08);
          eyeGroup.add(wingMesh);

          return eyeGroup;
        }

        const eyeLeft = createAngelinaEye(false);
        eyeLeft.position.set(-eyeDist, eyeY, eyeZ);
        eyeLeft.rotation.y = -0.08;
        headGroup.add(eyeLeft);

        const eyeRight = createAngelinaEye(true);
        eyeRight.position.set(eyeDist, eyeY, eyeZ);
        eyeRight.rotation.y = 0.08;
        headGroup.add(eyeRight);

        // 4D. Cejas Arqueadas Icónicas
        function createEyebrow(isRight) {
          const dir = isRight ? 1 : -1;
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(dir * 0.16, 0.30, 0.69),
            new THREE.Vector3(dir * 0.32, 0.37, 0.67),
            new THREE.Vector3(dir * 0.48, 0.31, 0.58),
          ]);
          const browGeo = new THREE.TubeGeometry(curve, 18, 0.024, 8, false);
          return new THREE.Mesh(browGeo, browMat);
        }
        headGroup.add(createEyebrow(false));
        headGroup.add(createEyebrow(true));

        // 4E. Nariz Recta y Esculpida
        const noseBridgeGeo = new THREE.BoxGeometry(0.09, 0.42, 0.18);
        const noseBridge = new THREE.Mesh(noseBridgeGeo, skinMat);
        noseBridge.position.set(0, 0.02, 0.72);
        noseBridge.rotation.x = 0.18;
        noseBridge.castShadow = true;
        headGroup.add(noseBridge);

        // Punta de la nariz delicada
        const noseTipGeo = new THREE.SphereGeometry(0.065, 16, 14);
        const noseTip = new THREE.Mesh(noseTipGeo, cheekHighlightMat);
        noseTip.position.set(0, -0.16, 0.81);
        noseTip.castShadow = true;
        headGroup.add(noseTip);

        // Aletas nasales suaves
        const nostrilL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skinMat);
        nostrilL.position.set(-0.08, -0.17, 0.77);
        headGroup.add(nostrilL);

        const nostrilR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skinMat);
        nostrilR.position.set(0.08, -0.17, 0.77);
        headGroup.add(nostrilR);

        // 4F. Los Famosos Labios Carnosos de Angelina Jolie
        const mouthY = -0.38;
        const mouthZ = 0.73;

        // Labio Superior con Arco de Cupido
        const upperLipLeft = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), lipsMat);
        upperLipLeft.scale.set(1.4, 0.65, 0.75);
        upperLipLeft.position.set(-0.11, mouthY + 0.035, mouthZ);
        upperLipLeft.rotation.z = -0.15;
        upperLipLeft.castShadow = true;
        headGroup.add(upperLipLeft);

        const upperLipRight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), lipsMat);
        upperLipRight.scale.set(1.4, 0.65, 0.75);
        upperLipRight.position.set(0.11, mouthY + 0.035, mouthZ);
        upperLipRight.rotation.z = 0.15;
        upperLipRight.castShadow = true;
        headGroup.add(upperLipRight);

        // Labio Inferior Voluminoso con sutil hendidura central (Double Lobed)
        const lowerLipLeft = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14), lipsMat);
        lowerLipLeft.scale.set(1.3, 0.85, 0.95);
        lowerLipLeft.position.set(-0.10, mouthY - 0.075, mouthZ + 0.02);
        lowerLipLeft.castShadow = true;
        headGroup.add(lowerLipLeft);

        const lowerLipRight = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14), lipsMat);
        lowerLipRight.scale.set(1.3, 0.85, 0.95);
        lowerLipRight.position.set(0.10, mouthY - 0.075, mouthZ + 0.02);
        lowerLipRight.castShadow = true;
        headGroup.add(lowerLipRight);

        // Dientes visibles de manera muy sutil entre los labios
        const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.06), teethMat);
        teeth.position.set(0, mouthY - 0.015, mouthZ - 0.03);
        headGroup.add(teeth);

        // 4G. Cabello Voluminoso Sedoso (Capas de mechas esculpidas)
        const hairGroup = new THREE.Group();

        // Corona y volumen posterior
        const hairDomeGeo = new THREE.SphereGeometry(0.82, 24, 20);
        hairDomeGeo.scale(1.08, 1.25, 1.15);
        const hairDome = new THREE.Mesh(hairDomeGeo, hairMat);
        hairDome.position.set(0, 0.22, -0.15);
        hairDome.castShadow = true;
        hairGroup.add(hairDome);

        // Mechones frontales cayendo a los lados de los pómulos y hombros
        const hairStrandCurves = [
          // Lado Izquierdo (Mechón frontal voluminoso)
          [new THREE.Vector3(-0.35, 0.65, 0.45), new THREE.Vector3(-0.68, 0.15, 0.35), new THREE.Vector3(-0.75, -0.55, 0.25), new THREE.Vector3(-0.65, -1.35, 0.15)],
          [new THREE.Vector3(-0.25, 0.72, 0.35), new THREE.Vector3(-0.55, 0.30, 0.48), new THREE.Vector3(-0.62, -0.35, 0.38), new THREE.Vector3(-0.50, -1.20, 0.25)],
          // Lado Derecho (Mechón cayendo sensual sobre la clavícula)
          [new THREE.Vector3(0.20, 0.74, 0.42), new THREE.Vector3(0.55, 0.32, 0.46), new THREE.Vector3(0.72, -0.25, 0.38), new THREE.Vector3(0.68, -1.35, 0.30)],
          [new THREE.Vector3(0.35, 0.68, 0.38), new THREE.Vector3(0.70, 0.18, 0.30), new THREE.Vector3(0.78, -0.45, 0.20), new THREE.Vector3(0.62, -1.25, 0.15)],
        ];

        hairStrandCurves.forEach((pts, idx) => {
          const curve = new THREE.CatmullRomCurve3(pts);
          const tubeGeo = new THREE.TubeGeometry(curve, 28, 0.085, 10, false);
          const mat = idx % 2 === 0 ? hairMat : hairSheenMat;
          const tubeMesh = new THREE.Mesh(tubeGeo, mat);
          tubeMesh.castShadow = true;
          hairGroup.add(tubeMesh);
        });

        // Capa posterior cayendo a la espalda
        for (let i = -3; i <= 3; i++) {
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(i * 0.18, 0.5, -0.6),
            new THREE.Vector3(i * 0.24, -0.4, -0.55),
            new THREE.Vector3(i * 0.28, -1.4, -0.45),
          ]);
          const backStrand = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.09, 8, false), hairMat);
          backStrand.castShadow = true;
          hairGroup.add(backStrand);
        }

        headGroup.add(hairGroup);
        scene.add(headGroup);

        // 5. Esquema Cinematográfico de Iluminación de Estudio (Rembrandt 3-Point Lighting)
        // Key Light: Luz Solar/Estudio Cálida a 45° a la Derecha (Crea triángulo Rembrandt en pómulo izquierdo)
        const keyLight = new THREE.DirectionalLight(0xfff1dc, 3.8);
        keyLight.position.set(4.5, 3.5, 4.0);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.bias = -0.00015;
        keyLight.shadow.radius = 2.4; // Suavizado PCF
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 15;
        scene.add(keyLight);

        // Fill Light: Luz Fría Azulada de Relleno en lado izquierdo
        const fillLight = new THREE.DirectionalLight(0x5580aa, 1.4);
        fillLight.position.set(-4.5, 1.5, 2.5);
        scene.add(fillLight);

        // Rim Light (Contraluz Dramático de Silueta): Recorte dorado/ámbar en cabello y mandíbula
        const rimLight = new THREE.DirectionalLight(0xffd5a0, 3.4);
        rimLight.position.set(-1.5, 3.0, -4.5);
        scene.add(rimLight);

        // Segundo Rim sutil frío para separación perimetral derecha
        const rimCool = new THREE.DirectionalLight(0x60a0d0, 1.6);
        rimCool.position.set(3.5, 2.5, -4.0);
        scene.add(rimCool);

        // Luz Ambiental Suave para evitar negros absolutos
        const ambient = new THREE.AmbientLight(0x181014, 0.8);
        scene.add(ambient);

        // Halo de Fondo en el Estudio (Backdrop Spotlight)
        const backdropGeo = new THREE.PlaneGeometry(12, 12);
        const backdropMat = new THREE.MeshBasicMaterial({ color: 0x0c080b });
        const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
        backdrop.position.set(0, 0, -3.5);
        scene.add(backdrop);

        // Renderizado
        renderer.render(scene, camera);
        console.log('Render 3D de Angelina Jolie completado exitosamente!');
        window.__RENDER_DONE__ = true;
      } catch (err) {
        console.error('Error durante render:', err);
        window.__RENDER_ERROR__ = err.message;
      }
    })();
  </script>
</body>
</html>`;

  console.log('Iniciando renderizado GPU con Playwright en resolución 2048x2048...');
  const t0 = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RENDER_DONE__ || window.__RENDER_ERROR__, { timeout: 20000 });
  const renderDurationMs = Date.now() - t0;

  const outDir = path.join(process.cwd(), 'storage', 'posters');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const filename = 'angelina_jolie_3d_realistic_pbr.png';
  const outputPath = path.join(outDir, filename);
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();

  const stat = fs.statSync(outputPath);
  const sizeKb = Math.round(stat.size / 1024);

  console.log(`\n========================================================================`);
  console.log(`✅ RETRATO 3D REALISTA DE ANGELINA JOLIE COMPLETADO!`);
  console.log(`========================================================================`);
  console.log(`⏱️ Tiempo total de render GPU: ${renderDurationMs} ms`);
  console.log(`📐 Resolución: ${width}x${height} píxeles (Master 2048x2048)`);
  console.log(`💾 Tamaño del archivo: ${sizeKb} KB`);
  console.log(`📁 Ruta en disco: ${outputPath}`);

  // Copiar al directorio de artifacts de Gemini
  const artifactDir = 'C:\\Users\\xiphos-pc1\\.gemini\\antigravity-ide\\brain\\bb2b02ab-1056-4da6-a344-b2bb0f45627f';
  const artifactPath = path.join(artifactDir, filename);
  fs.copyFileSync(outputPath, artifactPath);
  console.log(`🖼️ Artifact copiado para visualización: ${artifactPath}`);
}

renderAngelina3DRealistic().catch(console.error);
