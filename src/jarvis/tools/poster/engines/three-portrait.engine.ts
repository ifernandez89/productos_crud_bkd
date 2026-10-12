import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { PosterDesignSpec } from '../poster.types';

export interface ThreeRenderResult {
  pngBuffer: Buffer;
  pngPath: string;
  durationMs: number;
}

@Injectable()
export class ThreePortraitEngine {
  private readonly logger = new Logger(ThreePortraitEngine.name);

  /**
   * Renderiza un rostro 3D hiperrealista usando Three.js, mallas GLB y aceleración física por GPU
   */
  async renderPortrait(
    spec: PosterDesignSpec,
    modelName = 'akenaton.glb',
  ): Promise<ThreeRenderResult> {
    const startTime = Date.now();
    this.logger.log(`[three-portrait] Renderizando rostro 3D "${spec.title}" (modelo: ${modelName})`);

    const modelPath = path.join(process.cwd(), 'storage', 'assets', 'models', modelName);
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Modelo 3D ${modelName} no encontrado en storage/assets/models`);
    }

    const bundlePath = path.join(process.cwd(), 'storage', 'assets', 'three', 'three_bundle.js');
    if (!fs.existsSync(bundlePath)) {
      throw new Error('Three bundle no encontrado en storage/assets/three/three_bundle.js');
    }

    const modelBuffer = fs.readFileSync(modelPath);
    const modelBase64 = modelBuffer.toString('base64');
    const threeBundleCode = fs.readFileSync(bundlePath, 'utf-8');

    const width = spec.dimensions.width || 1280;
    const height = spec.dimensions.height || 960;

    let browser;
    try {
      browser = await chromium.launch({
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
        scene.fog = new THREE.FogExp2(0x06080D, 0.09);

        const camera = new THREE.PerspectiveCamera(34, ${width} / ${height}, 0.1, 100);
        camera.position.set(0, 0.35, 3.8);

        // ILUMINACIÓN CINEMATOGRÁFICA
        const keyLight = new THREE.DirectionalLight(0xFFF0DD, 4.2);
        keyLight.position.set(2.6, 3.2, 3.0);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.bias = -0.0001;
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x789AC2, 1.6);
        fillLight.position.set(-3.2, 1.2, 2.2);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xFFB030, 5.5);
        rimLight.position.set(-2.0, 2.5, -2.8);
        scene.add(rimLight);

        const topRim = new THREE.DirectionalLight(0x40E0D0, 2.8);
        topRim.position.set(1.8, 3.8, -2.2);
        scene.add(topRim);

        const hemiLight = new THREE.HemisphereLight(0x1B2533, 0x05070B, 0.8);
        scene.add(hemiLight);

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

          root.rotation.y = 0.24;
          root.rotation.x = 0.04;

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
          document.body.setAttribute('data-rendered', 'true');
        }, (err) => {
          document.body.setAttribute('data-error', 'gltf_parse_error');
        });
      } catch (e) {
        document.body.setAttribute('data-error', e.message);
      }
    })();
  </script>
</body>
</html>`;

      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForSelector('body[data-rendered="true"]', { timeout: 20000 });
      await page.waitForTimeout(150);

      const pngBuffer = await page.screenshot({ type: 'png' });
      const durationMs = Date.now() - startTime;

      const safeTitle = spec.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const filename = `${safeTitle}_3d_face_seed${spec.seed}.png`;
      const outputDir = path.join(process.cwd(), 'storage', 'posters');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const pngPath = path.join(outputDir, filename);
      fs.writeFileSync(pngPath, pngBuffer);

      this.logger.log(`[three-portrait] Render exitoso: ${pngPath} (${pngBuffer.length} bytes en ${durationMs}ms)`);
      return { pngBuffer, pngPath, durationMs };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}
