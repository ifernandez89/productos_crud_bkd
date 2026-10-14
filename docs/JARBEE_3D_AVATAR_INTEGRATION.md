# 🐝 Guía de Integración: JarBee 3D Cyber Avatar en el Frontend

Esta guía detalla cómo implementar el nuevo modelo 3D optimizado **JarBee Cyber Avatar** en el frontend (`productos_crud_frd`), sustituyendo o complementando el avatar 2D SVG actual de [`src/components/chat/JarBeeAvatar.tsx`](file:///c:/Projects/productos_crud_frd/src/components/chat/JarBeeAvatar.tsx).

---

## 1. Ficheros y Ubicación de Assets

Los modelos ya han sido procesados, optimizados y copiados directamente a la carpeta estática del frontend:

| Archivo | Ruta en Frontend | Tamaño | Uso Recomendado |
| :--- | :--- | :--- | :--- |
| **`jarbee_robot.glb`** | `/models/jarbee/jarbee_robot.glb` | **4.37 MB** | Carga directa sin descompresor WebAssembly |
| **`jarbee_robot.draco.glb`** | `/models/jarbee/jarbee_robot.draco.glb` | **2.76 MB** | Carga ultra-rápida en móviles (requiere `DRACOLoader`) |
| **Reporte de Metadatos** | `/models/jarbee/jarbee_robot.report.json` | 1.1 KB | Metadatos de clips, frames y escala normalizada |

> [!NOTE]
> **Normalización Garantizada**: El modelo tiene escala normalizada (`bounding box = 1.0`), está perfectamente centrado en el origen `(0, 0, 0)` y su cabeza apunta directamente hacia la cámara frontal (`-Y` en Blender / `+Z` en Three.js).

---

## 2. Animaciones Nativas Incluidas

El archivo GLB incluye el rig completo de 107 huesos y 3 clips de animación con nombres estándar limpios:

| Clip | Frames | FPS | Descripción | Estado Ideal en Chat |
| :--- | :--- | :--- | :--- | :--- |
| **`"hover"`** | `0 - 45.6` | 24 | Aleteo continuo y levitación flotante | `isThinking`, `isSpeaking`, `active` |
| **`"idle"`** | `0 - 236.0` | 24 | Reposo con movimientos sutiles de patas y antenas | Espera, reposo, `isListening` |
| **`"take_off_and_land"`**| `0 - 219.2` | 24 | Despegue y aterrizaje cinemático | Apertura de chat, transición `wake-up` |

---

## 3. Métodos de Implementación en React / Next.js

### Opción A: `<model-viewer>` de Google (Recomendada — Cero Configuración)

No requiere instalar librerías pesadas. Solo agregar el script en el HTML o layout y usar el componente declarativo:

```tsx
// En app/layout.tsx o en el componente:
// <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>

interface JarBee3DProps {
  className?: string;
  animation?: "hover" | "idle" | "take_off_and_land";
  autoRotate?: boolean;
}

export function JarBee3DViewer({
  className = "w-32 h-32",
  animation = "hover",
  autoRotate = false
}: JarBee3DProps) {
  return (
    <div className={className}>
      <model-viewer
        src="/models/jarbee/jarbee_robot.glb"
        alt="JarBee Cyber Avatar 3D"
        autoplay
        animation-name={animation}
        auto-rotate={autoRotate ? "true" : undefined}
        camera-controls
        shadow-intensity="1.2"
        shadow-softness="0.8"
        exposure="1.15"
        style={{ width: "100%", height: "100%", background: "transparent" }}
      />
    </div>
  );
}
```

---

### Opción B: Three.js Canvas con `GLTFLoader`

Ideal si se desea interactividad total (seguimiento del ratón, parpadeo de luces emisivas según voz):

```tsx
"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface JarBeeCanvasProps {
  isSpeaking?: boolean;
  isThinking?: boolean;
  size?: number;
}

export function JarBee3DCanvas({ isSpeaking, isThinking, size = 120 }: JarBeeCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
    camera.position.set(0, 0.25, 2.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mountRef.current.appendChild(renderer.domElement);

    // Iluminación para resaltar el blindaje metálico y las alas cian
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 3.2);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    fillLight.position.set(-2, 1, -1);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    let mixer: THREE.AnimationMixer;
    let actions: { [name: string]: THREE.AnimationAction } = {};
    const clock = new THREE.Clock();

    const loader = new GLTFLoader();
    loader.load("/models/jarbee/jarbee_robot.glb", (gltf) => {
      const model = gltf.scene;
      scene.add(model);

      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        actions[clip.name] = mixer.clipAction(clip);
      });

      // Iniciar con animación de vuelo hover
      if (actions["hover"]) {
        actions["hover"].play();
      }
    });

    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (mixer) {
        // Acelerar alas si está hablando o procesando
        const speedMultiplier = isSpeaking ? 1.5 : isThinking ? 1.2 : 1.0;
        mixer.update(delta * speedMultiplier);
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, [size]);

  return <div ref={mountRef} style={{ width: size, height: size }} />;
}
```

---

## 4. Mapeo de Estados del Chat Engine

Enlace directo con los estados de `useJarBeeEngine`:

| Estado en `useJarBeeEngine` | Clip 3D | Velocidad / Parámetros | Color Glow Emisivo |
| :--- | :--- | :--- | :--- |
| **`isSleeping: true`** | `"idle"` | `0.6x` (reposo pausado) | Apagado |
| **`isListening: true`** | `"hover"` | `0.9x` con leve cabeceo hacia el usuario | `#0078d7` (Azul corporativo) |
| **`isThinking: true`** | `"hover"` | `1.3x` rotando levemente en su eje | `#38bdf8` (Cian pulsante) |
| **`isSpeaking: true`** | `"hover"` | `1.6x` aleteo rápido y dinámico | `#f59e0b` (Ámbar activo) |
| **`triggerHappyReaction`** | `"take_off_and_land"` | `1.4x` pirueta / despegue breve | `#10b981` (Verde esmeralda) |
