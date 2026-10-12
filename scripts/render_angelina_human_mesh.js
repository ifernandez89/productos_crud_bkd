const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Retrato "Angelina-inspired" sobre MALLA HUMANA CONTINUA REAL (avaturn.glb).
 *
 * Regla de Oro JarBees: nunca ensamblar rostros con primitivas. Aquí NO se crea
 * geometría facial: sólo se dirige la malla anatómica existente mediante
 *   - Pose de esqueleto (brazos abajo, giro 3/4 de cabeza, leve inclinación)
 *   - Blendshapes ARKit (mirada intensa, sonrisa contenida, labios relajados)
 *   - Grading de materiales (cabello castaño oscuro, piel cálida, alpha de pelo limpio)
 *   - Iluminación de estudio con IBL (PMREM de softboxes) + key/fill/rim
 *
 * Uso: node scripts/render_angelina_human_mesh.js [salida.png] [ancho] [alto]
 */
const OUTPUT_NAME = process.argv[2] || 'angelina_human_mesh_portrait.png';
const WIDTH = parseInt(process.argv[3] || '1600', 10);
const HEIGHT = parseInt(process.argv[4] || '2000', 10);
const ARTIFACT_DIR = process.env.JARBEES_ARTIFACT_DIR || '';

// Dirección artística (todo parametrizable)
const DIRECTION = {
  armDropRad: 1.22,          // bajar brazos desde T-pose
  forearmBendRad: 0.12,
  headYaw: -0.20,            // giro 3/4 (rad)
  headTilt: 0.05,            // inclinación lateral
  headPitch: 0.05,           // mentón levemente abajo (mirada intensa)
  neckYaw: -0.08,
  morphs: {
    eyeSquintLeft: 0.22, eyeSquintRight: 0.22,   // mirada "smoldering"
    browDownLeft: 0.12, browDownRight: 0.12,
    browOuterUpLeft: 0.10,                        // ceja asimétrica sutil
    mouthSmileLeft: 0.10, mouthSmileRight: 0.04,  // sonrisa contenida
    mouthPucker: 0.12, mouthFunnel: 0.06,         // labios con más volumen frontal
    mouthLowerDownLeft: 0.015, mouthLowerDownRight: 0.015, // labios apenas separados
    cheekSquintLeft: 0.08, cheekSquintRight: 0.08,
    eyeLookOutLeft: 0.10, eyeLookInRight: 0.10,  // mirada hacia la cámara tras el giro
  },
  hairTint: 0x4a3326,        // multiplica la textura auburn -> castaño oscuro
  skinTint: 0xfff0e6,        // leve calidez
};

async function render() {
  const root = process.cwd();
  const modelPath = path.join(root, 'storage', 'assets', 'models', 'avaturn.glb');
  const bundlePath = path.join(root, 'storage', 'assets', 'three', 'three_bundle.js');
  for (const p of [modelPath, bundlePath]) if (!fs.existsSync(p)) throw new Error('No encontrado: ' + p);

  const modelBase64 = fs.readFileSync(modelPath).toString('base64');
  const threeBundleCode = fs.readFileSync(bundlePath, 'utf-8');

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--enable-gpu', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  page.on('console', (m) => console.log('  [Browser]', m.text()));
  page.on('pageerror', (e) => console.error('  [Browser Error]', e.message));

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${WIDTH}px;height:${HEIGHT}px;background:#0d0a0b;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}
  canvas{width:100%;height:100%;display:block}
  #vignette{position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse 70% 60% at 50% 42%,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%)}
  #ui{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:48px 56px}
  .top{display:flex;justify-content:space-between;align-items:flex-start}
  .badge{border:1px solid rgba(232,196,160,.35);padding:6px 16px;color:#e8c4a0;font-weight:700;font-size:13px;letter-spacing:4px;background:rgba(20,12,14,.6)}
  .tech{color:#9c8a8e;font-size:12px;letter-spacing:3px;font-weight:600}
  .foot{text-align:center;margin-bottom:12px}
  h1{font-size:64px;font-weight:300;letter-spacing:22px;color:#f6efe9;text-shadow:0 4px 24px rgba(0,0,0,.9)}
  .sub{margin-top:10px;font-size:14px;letter-spacing:7px;color:#d9b48f;font-weight:600}
</style>
<script>${threeBundleCode}</script></head><body>
<canvas id="c"></canvas><div id="vignette"></div>
<div id="ui">
  <div class="top"><div class="badge">JARBEES PORTRAIT STUDIO</div><div class="tech">CONTINUOUS ANATOMICAL MESH &bull; ARKIT BLENDSHAPES &bull; PBR</div></div>
  <div class="foot"><h1>ANGELINA</h1><div class="sub">INSPIRED STUDY &bull; 85MM &bull; REMBRANDT LIGHT</div></div>
</div>
<script>
(async function(){
 try{
  const THREE = window.THREE, GLTFLoader = window.GLTFLoader;
  const D = ${JSON.stringify(DIRECTION)};
  const renderer = new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  // Supersampling 2x: el compositor reduce a la resolución final (AA extra para pelo)
  renderer.setPixelRatio(2); renderer.setSize(${WIDTH}, ${HEIGHT});
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0a0b);

  // --- IBL de estudio: softboxes emisivos -> PMREM (reflejos de piel/ojos naturales)
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x050405);
  const box = (w,h,color,intensity,pos,look)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide}));m.position.set(...pos);m.lookAt(...look);envScene.add(m);};
  box(4,4,0xfff1e0,3.0,[4,3,4],[0,0,0]);     // key softbox
  box(3,5,0x8aa4c8,0.8,[-5,1,2],[0,0,0]);    // fill frío
  box(6,1.5,0xffd8b0,2.0,[-1,3,-5],[0,0,0]); // rim
  box(8,8,0x2a2022,0.6,[0,-5,0],[0,0,0]);    // rebote suelo
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  // --- Luces directas (Rembrandt)
  const key = new THREE.DirectionalLight(0xfff0e0, 2.6); key.position.set(2.2,2.6,2.4);
  key.castShadow = true; key.shadow.mapSize.set(2048,2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02;
  key.shadow.camera.left=-0.6; key.shadow.camera.right=0.6; key.shadow.camera.top=0.6; key.shadow.camera.bottom=-0.6;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb4d6, 0.45); fill.position.set(-3,1.2,2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffcf9a, 2.4); rim.position.set(-1.6,2.2,-2.8); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffe2c4, 1.2); rim2.position.set(2.2,1.6,-2.4); scene.add(rim2);

  const raw = atob("${modelBase64}"); const bytes = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);

  new GLTFLoader().parse(bytes.buffer,'',(gltf)=>{
    const model = gltf.scene;
    const bones = {};
    model.traverse(o=>{ if(o.isBone) bones[o.name]=o; });

    // --- Pose del esqueleto
    const rot=(n,x,y,z)=>{const b=bones[n]; if(b){b.rotation.x+=x;b.rotation.y+=y;b.rotation.z+=z;} else console.log('bone missing',n);};
    model.updateMatrixWorld(true);
    // Bajar brazos: rotamos en espacio mundo alrededor del eje Z para no depender de ejes locales
    const dropArm=(name,sign)=>{const b=bones[name]; if(!b) return;
      const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), sign*D.armDropRad);
      const parentQ=new THREE.Quaternion(); b.parent.getWorldQuaternion(parentQ);
      const worldQ=new THREE.Quaternion(); b.getWorldQuaternion(worldQ);
      const newWorld=q.multiply(worldQ);
      b.quaternion.copy(parentQ.invert().multiply(newWorld)); b.updateMatrixWorld(true);};
    dropArm('LeftArm', -1); dropArm('RightArm', 1);
    rot('Neck', 0, D.neckYaw, 0);
    rot('Head', D.headPitch, D.headYaw, D.headTilt);
    model.updateMatrixWorld(true);

    // --- Expresión + materiales
    model.traverse(o=>{
      if(!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if(o.morphTargetDictionary && o.morphTargetInfluences){
        for(const [k,v] of Object.entries(D.morphs)){ const i=o.morphTargetDictionary[k]; if(i!==undefined) o.morphTargetInfluences[i]=v; }
      }
      const m=o.material; if(!m) return;
      const n=(m.name||'')+'|'+o.name;
      m.envMapIntensity = 0.9;
      if(/hair/i.test(n)){
        m.color = new THREE.Color(D.hairTint).multiplyScalar(2.2);
        m.transparent = false; m.alphaTest = 0.35; m.alphaToCoverage = true; m.depthWrite = true; m.side = THREE.DoubleSide;
        m.roughness = 0.55; m.metalness = 0;
      } else if(/Head|Body/i.test(n)){
        m.color = new THREE.Color(D.skinTint);
        m.roughness = 0.85; m.metalness = 0; m.envMapIntensity = 0.5;
      } else if(/Eye/i.test(n) && !/lash|AO/i.test(n)){
        m.roughness = 0.08;
      } else if(/look/i.test(n)){
        m.roughness = Math.max(0.6, m.roughness||0.6);
      }
      m.needsUpdate = true;
    });
    scene.add(model);

    // --- Encuadre: localizar cabeza real por bounding box del Head_Mesh
    model.updateMatrixWorld(true);
    const headMesh = model.getObjectByName('Head_Mesh');
    const hb = new THREE.Box3().setFromObject(headMesh);
    const hc = hb.getCenter(new THREE.Vector3()); const hs = hb.getSize(new THREE.Vector3());
    console.log('Head center', hc.x.toFixed(3), hc.y.toFixed(3), hc.z.toFixed(3), 'size', hs.y.toFixed(3));
    const camera = new THREE.PerspectiveCamera(22, ${WIDTH}/${HEIGHT}, 0.05, 50);
    const target = new THREE.Vector3(hc.x, hc.y - hs.y*0.30, hc.z);
    camera.position.set(hc.x + 0.12, hc.y - hs.y*0.05, hc.z + 1.40);
    camera.lookAt(target);
    key.target.position.copy(hc); scene.add(key.target);

    renderer.render(scene,camera);
    window.__RENDER_DONE__ = true;
  },(e)=>{ console.error('parse error',e); window.__RENDER_ERROR__=String(e); });
 }catch(e){ console.error(e); window.__RENDER_ERROR__=e.message; }
})();
</script></body></html>`;

  const t0 = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RENDER_DONE__ || window.__RENDER_ERROR__, { timeout: 60000 });
  const err = await page.evaluate(() => window.__RENDER_ERROR__);
  if (err) throw new Error(err);

  const outDir = path.join(root, 'storage', 'posters');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, OUTPUT_NAME);
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();
  console.log(`✅ Render ${WIDTH}x${HEIGHT} en ${Date.now() - t0} ms -> ${outPath}`);
  if (ARTIFACT_DIR) fs.copyFileSync(outPath, path.join(ARTIFACT_DIR, OUTPUT_NAME));
}

render().catch((e) => { console.error(e); process.exit(1); });
