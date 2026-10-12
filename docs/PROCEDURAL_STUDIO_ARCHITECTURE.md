# 🎨 JarBees Procedural Graphic Studio — Arquitectura y Documentación Técnica

## 1. Visión y Fundamentos
**JarBees Procedural Graphic Studio** es el subsistema de generación gráfica local y determinista de JarBees. Diseñado para evolucionar de una colección de generadores aislados a un verdadero **estudio gráfico procedural** capaz de:
1. Medir calidad visual real de forma desacoplada (técnica, diseño WCAG, silueta/contenido y rendimiento).
2. Reutilizar recursos (paletas, materiales, encuadres, slots de modelos GLB) a través de un catálogo unificado.
3. Garantizar reproducibilidad exacta mediante proyectos versionados y semillas constantes.
4. Escalar hacia 3D con Three.js aprovechando la aceleración probada de la GPU física (NVIDIA GeForce RTX 5070 de 12 GB) sin modelos neuronales pesados.

---

## 2. Los Cuatro Bloques del Evaluador Visual Desacoplado (`PosterQualityAssuranceService`)

A diferencia de un validador que simplemente otorga 100/100 si el archivo se genera, el nuevo sistema desacopla la evaluación en 4 dimensiones independientes:

| Bloque | Controles Específicos | Métrica / Umbral | Estado |
| :--- | :--- | :--- | :--- |
| **1. Integridad Técnica** | Magic Bytes PNG (`0x89 0x50 0x4E 0x47`), dimensiones exactas IHDR, rango de peso (20 KB - 10 MB), captura sin corrupción. | Binario (Aprobado / Rechazado) | ✅ Automatizado |
| **2. Calidad de Diseño** | Ratio matemático de contraste relativo WCAG ($L_1 / L_2$), respeto de zonas seguras (*safe margins*), jerarquía visual entre título y subtítulo. | Ratio numérico (ej: 14.16:1, umbral mínimo 3.0:1) | ✅ Automatizado |
| **3. Calidad de Contenido & Silueta** | Conteo de geometrías vectoriales (`paths`), capas ópticas de gradientes, presencia del sujeto protagónico y estratificación de profundidad. | Score de complejidad vectorial (mínimo 20 paths) | ✅ Automatizado |
| **4. Rendimiento & Telemetría** | Desglose de fases (`artDirectionMs`, `svgGenMs`, `renderMs`, `qaMs`), consumo de memoria Node.js Heap y reporte de GPU. | Tiempos en ms, MB de RAM, Renderer ANGLE/D3D11 | ✅ Automatizado |

---

## 3. Diagnóstico Empírico de GPU y WebGL en Playwright

Se ejecutó un diagnóstico directo interrogando el contexto WebGL2 en el navegador headless (Microsoft Edge en Windows):
- **Vendor:** `Google Inc. (NVIDIA)`
- **Renderer:** `ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)`
- **WebGL 2.0:** `true` (Completamente activo y acelerado por hardware)

> [!NOTE]
> **Distinción Técnica Fundamental:**
> Para imágenes compuestas en SVG, Chromium utiliza el rasterizador 2D (Skia sobre DirectWrite/Direct2D). Para la futura fase 3D con Three.js, Chromium dirigirá las llamadas de shaders y geometrías a través de la capa ANGLE Direct3D 11 directamente a la GPU física RTX 5070.

---

## 4. Contrato de Proyecto Versionado (`PosterProject` v1)

Cada generación produce en disco un archivo maestro `${filename}_project.json` junto al PNG y SVG:
```json
{
  "schemaVersion": 1,
  "engine": "dreamcast-ocean",
  "seed": 2000,
  "output": {
    "width": 1280,
    "height": 960,
    "format": "png",
    "profile": "standard"
  },
  "cameraOrFraming": {
    "framing": "cinematic",
    "horizonY": 0.58,
    "angle": "low"
  },
  "palette": {
    "primary": "#162232",
    "secondary": "#F0F6FC",
    "accent": "#00E5FF",
    "background": "#0C1E34",
    "text": "#FFF000"
  },
  "assets": [
    { "id": "palette-dreamcast-ocean-sapphire", "role": "palette", "type": "color-scheme" }
  ],
  "telemetry": {
    "renderDurationMs": 770,
    "gpu": { "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 5070...)" }
  }
}
```

---

## 5. Biblioteca de Recursos Reutilizables (`storage/assets/catalog.json`)

Gestionada por `AssetCatalogService`:
1. **Paletas:** `palette-dreamcast-ocean-sapphire`, `palette-genesis-twinkle-tale`.
2. **Materiales Ópticos:** `mat-ocean-water-fresnel` (índices $n_1=1.0, n_2=1.333$, reflectividad según ángulo), `mat-cetacean-satin-skin`.
3. **Encuadres de Referencia:** `framing-ocean-001` (centrado), `framing-ocean-002` (lateral con reserva de título), `framing-ocean-003` (contraluz crepuscular).
4. **Slots de Modelos 3D:** `model-slot-orca-highpoly` (preparado para pipeline Three.js).

---

## 6. Banco de Pruebas de Regresión Visual (Golden Cases)

Suite [`scripts/run_visual_benchmark.js`](file:///c:/Projects/productos_crud_bkd/scripts/run_visual_benchmark.js) evaluando 5 casos con semillas fijas:

| Caso | Escena de Referencia | Semilla | Render | Contraste WCAG | Densidad Geométrica | QA Score |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`ocean-001`** | Sujeto centrado, horizonte bajo | 2000 | 807 ms | 14.16:1 ✅ | 35 paths / 7 gradientes | **100 / 100** |
| **`ocean-002`** | Sujeto lateral, reserva tipográfica | 2024 | 788 ms | 14.16:1 ✅ | 35 paths / 7 gradientes | **100 / 100** |
| **`ocean-003`** | Cielo pastel, agua turquesa y contraluz | 3030 | 791 ms | 14.16:1 ✅ | 35 paths / 7 gradientes | **100 / 100** |
| **`ocean-004`** | Espuma, salpicaduras y reflejo | 4040 | 788 ms | 14.16:1 ✅ | 35 paths / 7 gradientes | **100 / 100** |
| **`ocean-005`** | Composición densa con HUD Dreamcast | 5050 | 822 ms | 14.16:1 ✅ | 35 paths / 7 gradientes | **100 / 100** |

Los resultados se guardan de forma persistente en `storage/benchmarks/baselines/` para detectar cualquier regresión visual en futuros cambios.

---

## 7. Hoja de Ruta Definitiva y Estado Actual

- [x] **1. Auditar los tres motores actuales:** Código vectorizado, contratos y suite existente revisados a fondo.
- [x] **2. Fortalecer el QA visual:** Separación estricta en Integridad Técnica, Calidad de Diseño (WCAG), Contenido y Rendimiento.
- [x] **3. Crear el benchmark de regresión:** Batería `ocean-001` a `ocean-005` con semillas constantes y líneas base en disco.
- [x] **4. Validar WebGL en Playwright con la GPU:** Confirmada la detección de la NVIDIA GeForce RTX 5070 bajo ANGLE Direct3D11 con WebGL 2.0.
- [x] **5. Crear el catálogo de recursos:** `AssetCatalogService` indexando paletas, materiales Fresnel y encuadres en `storage/assets/catalog.json`.
- [ ] **6. Implementar la escena 3D mínima:** Cargar modelo GLB (cetáceo o reliquia de ArcheoScope) con materiales PBR y cámara en Three.js headless.
- [ ] **7. Integrar el compositor híbrido:** Unificar el buffer WebGL 3D con tipografía y capas 2D vectoriales a alta resolución.
