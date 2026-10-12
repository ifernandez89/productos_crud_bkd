---
name: threejs-graphics
description: Guía experta y patrones de producción para Three.js r165 en entornos WebGL 2.0 y headless Playwright. Cubre materiales PBR (MeshStandard/Physical), iluminación cinematográfica de 3 puntos, mapas HDRI/IBL con PMREMGenerator, sombras suaves, niebla atmosférica y shaders GLSL personalizados.
license: MIT
metadata:
  author: JarBees Graphic Studio
  version: "1.0.0"
---

# Three.js High-Fidelity Graphics & PBR Guidelines (r165 Compatible)

Guía técnica especializada para construir escenas 3D de alta fidelidad, realismo procedural y materiales físicos en Three.js r165, optimizada para aceleración por GPU (NVIDIA RTX) en navegadores headless (Playwright / Chromium).

---

## 1. Reglas de Compatibilidad y Pipeline Base

### 1.1 WebGL 2.0 vs WebGPU / TSL
- **Regla Estricta:** Utilizar `THREE.WebGLRenderer` estándar. NO emplear nodos TSL (`three/tsl`) ni `WebGPURenderer` en entornos headless, ya que carecen de soporte maduro en Chromium sin banderas experimentales de flags de SO.
- **Tone Mapping Obligatorio:**
  ```javascript
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15; // Calibrado para evitar quemado de altas luces
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  ```
- **Sombras Suaves:**
  ```javascript
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  ```

---

## 2. Iluminación Basada en Imágenes (IBL) y HDRIs

El salto visual decisivo en Three.js proviene del **Image-Based Lighting**:

```javascript
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

new RGBELoader().load('path/to/hdri.hdr', (texture) => {
  const envMap = pmremGenerator.fromEquirectangular(texture).texture;
  scene.environment = envMap; // Aporta iluminación difusa indirecta y reflejos PBR
  scene.background = envMap;  // Opcional, para usar como cielo
  texture.dispose();
  pmremGenerator.dispose();
});
```

---

## 3. Materiales PBR de Grado Producción

### 3.1 `MeshStandardMaterial` vs `MeshPhysicalMaterial`
- Usar `MeshStandardMaterial` para rocas, metales, plásticos comunes y suelo.
- Usar `MeshPhysicalMaterial` cuando se requiera:
  - **Piel / Cera:** `transmission`, `thickness` y tinte sub-superficial.
  - **Barniz / Lentes / Agua:** `clearcoat: 1.0`, `clearcoatRoughness: 0.1`, `ior: 1.333` a `1.5`.

### 3.2 Escala de Mapas de Normales y Rugosidad
```javascript
const material = new THREE.MeshStandardMaterial({
  map: diffuseTexture,           // sRGB
  normalMap: normalTexture,      // Linear
  normalScale: new THREE.Vector2(1.2, 1.2), // Fuerza del relieve micro-geométrico
  roughnessMap: roughnessTexture,
  roughness: 0.8,
  metalness: 0.1,
  envMapIntensity: 1.0,          // Escala del reflejo ambiental del HDRI
});
// Asegurar espacios de color correctos:
diffuseTexture.colorSpace = THREE.SRGBColorSpace;
normalTexture.colorSpace = THREE.NoColorSpace;
roughnessTexture.colorSpace = THREE.NoColorSpace;
```

---

## 4. Esquema de Iluminación Cinematográfica (3-Point Lighting)

1. **Key Light (Luz Principal con Sombra):**
   ```javascript
   const keyLight = new THREE.DirectionalLight(0xfff0dd, 2.5);
   keyLight.position.set(5, 8, 4);
   keyLight.castShadow = true;
   keyLight.shadow.mapSize.width = 2048;
   keyLight.shadow.mapSize.height = 2048;
   keyLight.shadow.bias = -0.0001; // Evita shadow acne
   keyLight.shadow.radius = 2.5;   // Suavizado PCF
   scene.add(keyLight);
   ```

2. **Fill Light (Luz de Relleno Opuesta Fría):**
   ```javascript
   const fillLight = new THREE.DirectionalLight(0x7090b8, 0.8);
   fillLight.position.set(-6, 3, -2);
   fillLight.castShadow = false;
   scene.add(fillLight);
   ```

3. **Rim Light (Contraluz Dramático de Silueta):**
   ```javascript
   const rimLight = new THREE.DirectionalLight(0x00e5ff, 2.2);
   rimLight.position.set(0, 4, -8);
   scene.add(rimLight);
   ```

---

## 5. Atmósfera y Composición

- **Niebla Exponencial de Profundidad:**
  ```javascript
  scene.fog = new THREE.FogExp2(0x0c1e34, 0.025);
  ```
- **Calibración de Cámara:**
  ```javascript
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 1.5, 4.5);
  camera.lookAt(0, 0.8, 0);
  ```

---

## 6. Checklist de QA Visual para Renders 3D

1. **¿Hay artefactos de sombra (Shadow Acne / Peter Panning)?** Ajustar `shadow.bias` entre `-0.0001` y `-0.0005`.
2. **¿Los reflejos lucen planos?** Comprobar que `scene.environment` esté asignado con un mapa HDRI procesado con PMREM.
3. **¿Las texturas normales se ven invertidas?** Comprobar si el mapa es DirectX (verde invertido) y multiplicar `normalScale.y = -1.0` si es necesario.
4. **¿Los colores están lavados o quemados?** Verificar `renderer.outputColorSpace = THREE.SRGBColorSpace` y que la exposición de ACES no supere $1.3$.
