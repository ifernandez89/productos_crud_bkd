const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * JarBees Human Mesh Scene Renderer
 * ---------------------------------------------------------------------------
 * Motor de retratos realistas sobre MALLAS HUMANAS CONTINUAS (GLB con
 * esqueleto + blendshapes ARKit). Regla de Oro: jamás se construye un rostro
 * con primitivas; sólo se DIRIGE una malla anatómica real.
 *
 * Todo se controla con un "spec" JSON (pensado para que un LLM lo genere
 * desde un prompt en lenguaje natural):
 *   {
 *     "model": "avatarsdk.glb",
 *     "scene": "beach" | "studio",
 *     "pose": { "armDropRad", "headYaw", "headPitch", "headTilt", "neckYaw" },
 *     "morphs": { "<arkitName>": 0..1 },
 *     "materials": { "hairTint", "skinTint", "topTint" },
 *     "camera": { "distance", "offsetX", "targetDrop", "fov" },
 *     "text": { "title", "subtitle", "badge" },
 *     "output": "file.png", "width": 1600, "height": 2000
 *   }
 *
 * Escena "beach": cielo físico-estilizado con nubes, sol, océano con
 * fresnel + destellos, arena con humedad en la orilla. El fondo se renderiza
 * en un canvas separado con desenfoque de lente (bokeh 85mm f/1.8) y el sujeto
 * en un canvas transparente encima, con la MISMA cámara para que la
 * perspectiva coincida. La iluminación del sujeto sale del mismo cielo (IBL).
 *
 * Uso: node scripts/render_human_scene.js <spec.json>
 */

const DEFAULT_SPEC = {
  model: 'avatarsdk.glb',
  scene: 'beach',
  pose: { armDownDeg: 78, headYaw: 0.16, headPitch: 0.02, headTilt: -0.04, neckYaw: 0.06 },
  morphs: {
    mouthSmileLeft: 0.32, mouthSmileRight: 0.26,
    cheekSquintLeft: 0.2, cheekSquintRight: 0.2,
    eyeSquintLeft: 0.32, eyeSquintRight: 0.32, // entrecerrar por el sol
    browInnerUp: 0.06,
  },
  materials: { hairTint: null, skinTint: 0xfff0e2, topTint: 0xf2ece0, topStripTexture: true },
  camera: { distance: 1.8, offsetX: -0.14, targetDrop: 0.42, fov: 22 },
  sun: { azimuthDeg: 125, elevationDeg: 38 },
  text: { badge: 'JARBEES PORTRAIT STUDIO', title: 'SUMMER', subtitle: 'SUNNY BEACH \u2022 85MM f/1.8 \u2022 NATURAL LIGHT' },
  output: 'human_scene_portrait.png',
  width: 1600,
  height: 2000,
};

function loadSpec() {
  const arg = process.argv[2];
  if (!arg) return DEFAULT_SPEC;
  const user = JSON.parse(fs.readFileSync(arg, 'utf-8'));
  return {
    ...DEFAULT_SPEC, ...user,
    pose: { ...DEFAULT_SPEC.pose, ...(user.pose || {}) },
    morphs: user.morphs || DEFAULT_SPEC.morphs,
    materials: { ...DEFAULT_SPEC.materials, ...(user.materials || {}) },
    camera: { ...DEFAULT_SPEC.camera, ...(user.camera || {}) },
    sun: { ...DEFAULT_SPEC.sun, ...(user.sun || {}) },
    text: { ...DEFAULT_SPEC.text, ...(user.text || {}) },
  };
}

async function render() {
  const spec = loadSpec();
  const { width: W, height: H } = spec;
  const root = process.cwd();
  const modelPath = path.join(root, 'storage', 'assets', 'models', spec.model);
  const bundlePath = path.join(root, 'storage', 'assets', 'three', 'three_bundle.js');
  for (const p of [modelPath, bundlePath]) if (!fs.existsSync(p)) throw new Error('No encontrado: ' + p);

  const modelBase64 = fs.readFileSync(modelPath).toString('base64');
  const threeBundleCode = fs.readFileSync(bundlePath, 'utf-8');

  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--no-sandbox', '--enable-gpu', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: W, height: H });
  page.on('console', (m) => console.log('  [Browser]', m.text()));
  page.on('pageerror', (e) => console.error('  [Browser Error]', e.message));

  const isBeach = spec.scene === 'beach';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;background:${isBeach ? '#bcd9ee' : '#0d0a0b'};overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}
  canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
  #bg{filter:blur(${isBeach ? 9 : 0}px) saturate(1.05);transform:scale(1.04)}
  #grade{position:absolute;inset:0;pointer-events:none;
    background:${isBeach
      ? 'radial-gradient(circle at 96% 4%,rgba(255,226,170,.38) 0%,rgba(255,226,170,0) 38%),radial-gradient(ellipse 80% 70% at 50% 40%,rgba(255,240,215,0) 55%,rgba(40,25,10,.28) 100%),linear-gradient(180deg,rgba(255,236,200,.10),rgba(255,210,150,.06))'
      : 'radial-gradient(ellipse 70% 60% at 50% 42%,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%)'}}
  #ui{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:48px 56px}
  .top{display:flex;justify-content:space-between;align-items:flex-start}
  .badge{border:1px solid rgba(255,255,255,.55);padding:6px 16px;color:#fff;font-weight:700;font-size:13px;letter-spacing:4px;background:rgba(10,30,50,.25);backdrop-filter:blur(6px)}
  .tech{color:rgba(255,255,255,.85);font-size:12px;letter-spacing:3px;font-weight:600;text-shadow:0 1px 6px rgba(0,0,0,.35)}
  .foot{text-align:center;margin-bottom:12px}
  h1{font-size:72px;font-weight:300;letter-spacing:26px;color:#fff;text-shadow:0 4px 28px rgba(0,0,0,.45)}
  .sub{margin-top:10px;font-size:14px;letter-spacing:7px;color:#fff3df;font-weight:600;text-shadow:0 2px 10px rgba(0,0,0,.45)}
</style>
<script>${threeBundleCode}</script></head><body>
<canvas id="bg"></canvas><canvas id="fg"></canvas><div id="grade"></div>
<div id="ui">
  <div class="top"><div class="badge">${spec.text.badge}</div><div class="tech">CONTINUOUS ANATOMICAL MESH &bull; ARKIT &bull; PBR + SKY IBL</div></div>
  <div class="foot"><h1>${spec.text.title}</h1><div class="sub">${spec.text.subtitle}</div></div>
</div>
<script>
(async function(){
 try{
  const THREE = window.THREE, GLTFLoader = window.GLTFLoader;
  const S = ${JSON.stringify(spec)};
  const W=${W}, H=${H};
  const mkRenderer=(id,alpha)=>{const r=new THREE.WebGLRenderer({canvas:document.getElementById(id),antialias:true,alpha,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    r.setPixelRatio(2); r.setSize(W,H); r.toneMapping=THREE.ACESFilmicToneMapping; r.outputColorSpace=THREE.SRGBColorSpace; if(alpha) r.setClearColor(0x000000,0); return r;};
  const bgR = mkRenderer('bg', false);
  const fgR = mkRenderer('fg', true);
  fgR.shadowMap.enabled = true; fgR.shadowMap.type = THREE.PCFSoftShadowMap;

  const az = THREE.MathUtils.degToRad(S.sun.azimuthDeg), el = THREE.MathUtils.degToRad(S.sun.elevationDeg);
  // azimut 0 = detrás del sujeto (-Z), positivo hacia +X
  const sunDir = new THREE.Vector3(Math.sin(az)*Math.cos(el), Math.sin(el), -Math.cos(az)*Math.cos(el)).normalize();

  // ======================= ESCENA DE FONDO =======================
  const bgScene = new THREE.Scene();
  const NOISE = \`
    float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<6;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}\`;
  const SKY_FN = \`
    uniform vec3 sunDir;
    vec3 skyColor(vec3 d){
      float y=max(d.y,0.);
      vec3 zenith=vec3(0.02,0.16,0.55), horizon=vec3(0.42,0.66,0.92);
      vec3 c=mix(horizon,zenith,pow(y,0.32));
      float s=max(dot(d,sunDir),0.);
      c+=vec3(1.0,0.85,0.6)*pow(s,6.)*0.35 + vec3(1.,.95,.85)*pow(s,64.)*0.8;
      c+=vec3(30.,26.,20.)*smoothstep(0.9994,0.9997,s);            // disco solar
      // nubes cúmulos bajos
      if(d.y>0.0){vec2 uv=d.xz/(d.y+0.08)*1.3; float n=fbm(uv*1.1+vec2(3.,7.));
        float cl=smoothstep(0.48,0.72,n)*smoothstep(0.0,0.05,d.y)*(1.-smoothstep(0.35,0.7,d.y));
        vec3 cc=mix(vec3(0.72,0.78,0.88),vec3(1.25,1.2,1.12),smoothstep(0.5,0.85,n)+0.4*s);
        c=mix(c,cc,cl*0.95);}
      return c;
    }\`;
  const TAIL = \`
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
\`;
  const VS = \`varying vec3 vW; void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}\`;

  if (${isBeach}) {
    // Cielo
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500,64,32), new THREE.ShaderMaterial({
      side:THREE.BackSide, depthWrite:false, uniforms:{sunDir:{value:sunDir}},
      vertexShader:VS,
      fragmentShader:\`varying vec3 vW; \${NOISE} \${SKY_FN}
        void main(){vec3 d=normalize(vW-cameraPosition); vec3 c=skyColor(d);
          if(d.y<0.) c=vec3(0.04,0.22,0.32); gl_FragColor=vec4(c,1.); \${TAIL}}\`}));
    bgScene.add(sky);

    // Océano: olas procedurales, fresnel, reflejo de cielo y destellos solares
    const SHORE_Z = -9.0;
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(4000,4000), new THREE.ShaderMaterial({
      uniforms:{sunDir:{value:sunDir}}, vertexShader:VS,
      fragmentShader:\`varying vec3 vW; \${NOISE} \${SKY_FN}
        void main(){
          vec2 p=vW.xz; float dist=length(vW-cameraPosition);
          float e=0.15; float h0=fbm(p*0.35)+0.5*fbm(p*1.7+vec2(5.));
          float hx=fbm((p+vec2(e,0))*0.35)+0.5*fbm((p+vec2(e,0))*1.7+vec2(5.));
          float hz=fbm((p+vec2(0,e))*0.35)+0.5*fbm((p+vec2(0,e))*1.7+vec2(5.));
          float amp=mix(0.9,0.12,smoothstep(20.,400.,dist));
          vec3 n=normalize(vec3(-(hx-h0)/e*amp,1.,-(hz-h0)/e*amp));
          vec3 v=normalize(vW-cameraPosition); vec3 r=reflect(v,n); r.y=abs(r.y);
          float fres=0.02+0.98*pow(1.-max(dot(-v,n),0.),5.);
          float shoreT=smoothstep(0.,22.,${'SHORE_Z'}-vW.z);
          vec3 shallow=vec3(0.10,0.62,0.62), deep=vec3(0.01,0.16,0.32);
          vec3 water=mix(shallow,deep,shoreT);
          vec3 c=mix(water,skyColor(r),fres);
          c+=vec3(1.,.95,.85)*pow(max(dot(r,sunDir),0.),350.)*12.;
          // espuma en la orilla
          float foam=smoothstep(0.55,0.75,fbm(p*vec2(0.6,2.2)))*(1.-smoothstep(0.,4.,${'SHORE_Z'}-vW.z));
          c=mix(c,vec3(0.95,0.97,0.98),foam*0.8);
          // bruma atmosférica hacia el horizonte
          c=mix(c,vec3(0.55,0.74,0.93),smoothstep(250.,1500.,dist)*0.7);
          gl_FragColor=vec4(c,1.); \${TAIL}}\`.replaceAll('${'SHORE_Z'}', SHORE_Z.toFixed(2))}));
    ocean.rotation.x=-Math.PI/2; ocean.position.y=-0.02; bgScene.add(ocean);

    // Arena (hasta la orilla), con zona húmeda
    const sandGeo=new THREE.PlaneGeometry(400,200,1,1);
    const sand = new THREE.Mesh(sandGeo, new THREE.ShaderMaterial({
      uniforms:{sunDir:{value:sunDir}}, vertexShader:VS,
      fragmentShader:\`varying vec3 vW; \${NOISE}
        uniform vec3 sunDir;
        void main(){
          vec2 p=vW.xz; float n=fbm(p*3.)*0.6+fbm(p*40.)*0.4;
          vec3 dry=vec3(0.86,0.72,0.52)*(0.85+0.3*n);
          vec3 wet=vec3(0.52,0.42,0.30)*(0.9+0.2*n);
          float wetT=smoothstep(-5.5,-8.6,vW.z+fbm(p*0.4)*1.2);
          vec3 c=mix(dry,wet,wetT);
          c*=0.75+0.45*max(sunDir.y,0.);
          float dist=length(vW-cameraPosition);
          c=mix(c,vec3(0.66,0.82,0.94),smoothstep(60.,300.,dist)*0.6);
          gl_FragColor=vec4(c,1.); \${TAIL}}\`}));
    sand.rotation.x=-Math.PI/2; sand.position.set(0,0,-9.0+100.0); bgScene.add(sand);

    // Promontorio lejano con bruma (silueta de colinas)
    const hillGeo=new THREE.PlaneGeometry(900,60,200,1);
    const pos=hillGeo.attributes.position;
    for(let i=0;i<pos.count;i++){ if(pos.getY(i)>0){ const x=pos.getX(i);
      const h=18+14*Math.sin(x*0.011+1.3)+8*Math.sin(x*0.037)+4*Math.sin(x*0.11);
      pos.setY(i, -30+Math.max(0,h)*(x<-80?1:0.15)); } }
    const hills=new THREE.Mesh(hillGeo,new THREE.MeshBasicMaterial({color:new THREE.Color(0.48,0.64,0.74),fog:false}));
    hills.position.set(-120,28,-1100); bgScene.add(hills);
  } else {
    bgScene.background = new THREE.Color(0x0d0a0b);
  }

  // ======================= IBL DESDE LA ESCENA =======================
  const pmrem = new THREE.PMREMGenerator(fgR);
  let envTex;
  if (${isBeach}) {
    envTex = pmrem.fromScene(bgScene, 0.02).texture;
  } else {
    const env = new THREE.Scene(); env.background=new THREE.Color(0x050405);
    const box=(w,h,c,i,p)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(i),side:THREE.DoubleSide}));m.position.set(...p);m.lookAt(0,0,0);env.add(m);};
    box(4,4,0xfff1e0,3,[4,3,4]); box(3,5,0x8aa4c8,.8,[-5,1,2]); box(6,1.5,0xffd8b0,2,[-1,3,-5]);
    envTex = pmrem.fromScene(env,0.04).texture;
  }

  // ======================= SUJETO =======================
  const fgScene = new THREE.Scene();
  fgScene.environment = envTex;
  if (${isBeach}) {
    const sun = new THREE.DirectionalLight(0xfff0d8, 4.4);
    sun.position.copy(sunDir).multiplyScalar(6); sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048); sun.shadow.bias=-0.0002; sun.shadow.normalBias=0.02;
    Object.assign(sun.shadow.camera,{left:-0.8,right:0.8,top:0.8,bottom:-0.8,near:0.1,far:20});
    fgScene.add(sun);
    // Rebote de arena + "reflector" del fotógrafo (relleno frontal cálido)
    const reflector = new THREE.DirectionalLight(0xffe8cc, 0.55); reflector.position.set(-1.6,0.4,2.6); fgScene.add(reflector);
    fgScene.add(new THREE.HemisphereLight(0x9cc8f5, 0xe2c79c, 0.35));
    fgR.toneMappingExposure = 1.0; bgR.toneMappingExposure = 1.0;
  } else {
    const key=new THREE.DirectionalLight(0xfff0e0,2.6); key.position.set(2.2,2.6,2.4); key.castShadow=true; fgScene.add(key);
    const rim=new THREE.DirectionalLight(0xffcf9a,2.4); rim.position.set(-1.6,2.2,-2.8); fgScene.add(rim);
    fgR.toneMappingExposure = 1.05;
  }

  const raw=atob("${modelBase64}"); const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);

  new GLTFLoader().parse(bytes.buffer,'',(gltf)=>{
    const model=gltf.scene; const bones={};
    model.traverse(o=>{ if(o.isBone) bones[o.name]=o; });
    model.updateMatrixWorld(true);

    // Pose: llevar cada brazo a un ángulo objetivo bajo la horizontal, sin importar
    // si el rig viene en T-pose o A-pose (se mide el ángulo actual en mundo).
    const setArmDown=(name,side)=>{const a=bones[name], f=bones[name.replace('Arm','ForeArm')]; if(!a||!f) return;
      const pa=a.getWorldPosition(new THREE.Vector3()), pf=f.getWorldPosition(new THREE.Vector3());
      const d=pf.sub(pa); const cur=Math.atan2(-d.y, Math.abs(d.x));           // 0 = horizontal, +90 = vertical abajo
      const delta=THREE.MathUtils.degToRad(S.pose.armDownDeg)-cur;
      const sign = d.x>0 ? -1 : 1;                                              // brazo hacia +X baja con giro negativo en Z
      const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), sign*delta);
      const pq=new THREE.Quaternion(); a.parent.getWorldQuaternion(pq);
      const wq=new THREE.Quaternion(); a.getWorldQuaternion(wq);
      a.quaternion.copy(pq.invert().multiply(q.multiply(wq))); a.updateMatrixWorld(true);
      console.log(name,'angle',THREE.MathUtils.radToDeg(cur).toFixed(1),'->',S.pose.armDownDeg);};
    setArmDown('LeftArm'); setArmDown('RightArm');
    const rot=(n,x,y,z)=>{const b=bones[n]; if(b){b.rotation.x+=x;b.rotation.y+=y;b.rotation.z+=z;}};
    rot('Neck',0,S.pose.neckYaw,0);
    rot('Head',S.pose.headPitch,S.pose.headYaw,S.pose.headTilt);
    model.updateMatrixWorld(true);

    let headMesh=null, best=-1;
    model.traverse(o=>{
      if(!o.isMesh) return;
      o.castShadow=true; o.receiveShadow=true; o.frustumCulled=false;
      if(o.morphTargetDictionary && o.morphTargetInfluences){
        for(const [k,v] of Object.entries(S.morphs)){const i=o.morphTargetDictionary[k]; if(i!==undefined) o.morphTargetInfluences[i]=v;}
        const nm=Object.keys(o.morphTargetDictionary).length;
        if(/head|base/i.test(o.name) && nm>best){best=nm; headMesh=o;}
      }
      const mats=Array.isArray(o.material)?o.material:[o.material];
      for(const m of mats){ if(!m) continue;
        const n=(m.name||'')+'|'+o.name;
        m.envMapIntensity=1.0;
        if(/hair|ponytail/i.test(n)){
          if(S.materials.hairTint!=null) m.color=new THREE.Color(S.materials.hairTint).multiplyScalar(2.2);
          m.transparent=false; m.alphaTest=0.35; m.alphaToCoverage=true; m.depthWrite=true; m.side=THREE.DoubleSide;
        } else if(/head|body|base/i.test(n) && !/eye|lash|teeth|tongue|brow/i.test(n)){
          if(S.materials.skinTint!=null) m.color=new THREE.Color(S.materials.skinTint);
          m.roughness=0.72; m.metalness=0; m.envMapIntensity=0.7;
        } else if(/eyeball|eyes?_|^eyes/i.test(n)){
          m.roughness=0.06;
        } else if(/top|look|shirt/i.test(n)){
          if(S.materials.topStripTexture){ m.map=null; }   // quitar logos/estampados de la textura
          if(S.materials.topTint!=null) m.color=new THREE.Color(S.materials.topTint);
          m.roughness=0.9; m.metalness=0; m.envMapIntensity=0.6;
        } else if(/lash|brow/i.test(n)){
          m.alphaTest=0.3; m.alphaToCoverage=true;
        }
        m.needsUpdate=true;
      }
    });
    fgScene.add(model);
    model.updateMatrixWorld(true);

    const hb=new THREE.Box3().setFromObject(headMesh||model);
    const hc=hb.getCenter(new THREE.Vector3()), hs=hb.getSize(new THREE.Vector3());
    console.log('head mesh:', headMesh&&headMesh.name, 'center', hc.toArray().map(v=>v.toFixed(3)).join(','), 'h', hs.y.toFixed(3));
    const C=S.camera;
    const camera=new THREE.PerspectiveCamera(C.fov, W/H, 0.05, 5000);
    camera.position.set(hc.x+C.offsetX, hc.y-hs.y*0.05, hc.z+C.distance);
    camera.lookAt(hc.x, hc.y-hs.y*C.targetDrop, hc.z);

    bgR.render(bgScene,camera);
    fgR.render(fgScene,camera);
    window.__RENDER_DONE__=true;
  },(e)=>{console.error('parse error',e); window.__RENDER_ERROR__=String(e);});
 }catch(e){ console.error(e.stack||e); window.__RENDER_ERROR__=e.message; }
})();
</script></body></html>`;

  const t0 = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__RENDER_DONE__ || window.__RENDER_ERROR__, { timeout: 90000 });
  const err = await page.evaluate(() => window.__RENDER_ERROR__);
  if (err) throw new Error(err);

  const outDir = path.join(root, 'storage', 'posters');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, spec.output);
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();
  fs.writeFileSync(outPath.replace(/\.png$/, '.spec.json'), JSON.stringify(spec, null, 2), 'utf-8');
  console.log(`✅ Render ${W}x${H} en ${Date.now() - t0} ms -> ${outPath}`);
  if (process.env.JARBEES_ARTIFACT_DIR) fs.copyFileSync(outPath, path.join(process.env.JARBEES_ARTIFACT_DIR, spec.output));
}

render().catch((e) => { console.error(e); process.exit(1); });
