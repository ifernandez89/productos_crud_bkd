# Catálogo de Recursos 3D & PBR de JarBees Procedural Studio

Este documento cataloga los recursos 3D (modelos GLB), mapas de texturas PBR y entornos de iluminación HDRI integrados localmente en el ecosistema de JarBees. Todos los recursos son de dominio público (**CC0**) o licencia permisiva (**Apache 2.0 / Khronos Group**) y se almacenan de forma local e incremental en `storage/assets/`.

---

## 1. Resumen de Recursos en Disco

| Categoría | Recurso | Formato | Tamaño | Origen & Licencia | Descripción / Uso |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Modelos 3D** | `DamagedHelmet.glb` | GLB (PBR Met/Rough) | ~3.6 MB | Khronos Group (Apache 2.0) | Casco de ciencia ficción con desgaste, micro-rayones, emisivo y oclusión ambiental. |
| **Modelos 3D** | `AntiqueCamera.glb` | GLB (PBR) | ~19.2 MB | Khronos Group (Apache 2.0) | Cámara antigua ultra-detallada con cuero, latón, madera y cristal de lente. |
| **Modelos 3D** | `WaterBottle.glb` | GLB (PBR) | ~8.5 MB | Khronos Group (Apache 2.0) | Botella deportiva con materiales combinados de plástico, goma y metal reflectivo. |
| **Modelos 3D** | `Fox.glb` | GLB (Rigged) | ~155 KB | Khronos Group (Apache 2.0) | Modelo low-poly articulado estilizado con gradientes. |
| **Modelos 3D** | `akenaton.glb` | GLB (Draco compressed) | ~1.4 MB | ArcheoScope (CC0 / Open Data) | Reliquia arqueológica con malla facial de alta densidad escultórica. |
| **Modelos 3D** | `hatshepsut.glb` | GLB (Draco compressed) | ~1.2 MB | ArcheoScope (CC0 / Open Data) | Busto monumental con detalle en corona, nariz y pómulos. |
| **Modelos 3D** | `olmec_head.glb` | GLB (Draco compressed) | ~1.5 MB | ArcheoScope (CC0 / Open Data) | Cabeza colosal olmeca con curvaturas volumétricas pronunciadas. |
| **Modelos 3D** | `jade_mask.glb` | GLB (Draco compressed) | ~1.3 MB | ArcheoScope (CC0 / Open Data) | Máscara de jade con relieves y geometría ceremonial. |
| **HDRI (Luz 360°)** | `sunset_fairway_1k.hdr` | Radiance HDR 32-bit | ~1.4 MB | Poly Haven (CC0) | Atardecer dorado cálido con horizonte natural y sombras rasantes. |
| **HDRI (Luz 360°)** | `quarry_01_1k.hdr` | Radiance HDR 32-bit | ~1.4 MB | Poly Haven (CC0) | Luz natural diurna de cantera con alta reflectancia en piedra y metal. |
| **HDRI (Luz 360°)** | `studio_small_08_1k.hdr` | Radiance HDR 32-bit | ~1.4 MB | Poly Haven (CC0) | Iluminación de estudio fotográfico suave para retratos y modelos mecánicos. |
| **PBR Textures** | `rock_boulder_diff_1k.jpg` | Albedo Map | ~200 KB | Poly Haven (CC0) | Difuso de roca con vetas minerales y desgaste geológico. |
| **PBR Textures** | `rock_boulder_nor_1k.jpg` | Normal Map | ~480 KB | Poly Haven (CC0) | Mapa de normales tangente para micro-relieve sin polígonos extra. |
| **PBR Textures** | `rock_boulder_rough_1k.jpg` | Roughness Map | ~130 KB | Poly Haven (CC0) | Rugosidad superficial no uniforme para specular highlight variable. |
| **PBR Textures** | `aerial_beach_diff_1k.jpg` | Albedo Map | ~230 KB | Poly Haven (CC0) | Terreno de arena costera y sedimentos marinos. |
| **PBR Textures** | `aerial_beach_nor_1k.jpg` | Normal Map | ~380 KB | Poly Haven (CC0) | Normales de ondulaciones de arena y surcos de marea. |

---

## 2. API de Catálogo (`AssetCatalogService`)

El backend de JarBees expone el catálogo activo en el endpoint:
```http
GET /api/jarbees/poster/assets
```

Respuesta JSON estructurada:
```json
{
  "total": 17,
  "categories": {
    "palette": 2,
    "shader_material": 3,
    "framing_preset": 3,
    "model3d_slot": 9
  },
  "assets": [
    {
      "id": "model-damaged-helmet",
      "category": "model3d_slot",
      "name": "Khronos Damaged Helmet (PBR)",
      "format": "glb",
      "path": "storage/assets/models/DamagedHelmet.glb",
      "role": "Sci-Fi / Mechanical PBR Hero Prop",
      "features": ["PBR Metallic-Roughness", "Emissive Maps", "Normal Details"]
    },
    {
      "id": "hdri-studio-small-08",
      "category": "shader_material",
      "name": "Poly Haven Studio Small 08 HDR",
      "format": "hdr",
      "path": "storage/assets/textures/hdri/studio_small_08_1k.hdr",
      "role": "Studio Lighting / Image-Based Lighting (IBL)"
    }
  ]
}
```

---

## 3. Arquitectura del Motor 3D (`ThreePortraitEngine`)

El motor 3D de JarBees opera en modo **Headless WebGL 2.0** aprovechando la GPU física (NVIDIA GeForce RTX 5070):

1. **Bundle Three.js Offline Autónomo (`storage/assets/three/three_bundle.js`):**
   - Compilado localmente con Bun en 41 ms.
   - Incluye `THREE`, `GLTFLoader`, `DRACOLoader` y utilidades de iluminación física.
   - Cero dependencias de redes externas ni CDN, garantizando 100% de operatividad offline y máxima velocidad.

2. **Decodificación Draco Nativa:**
   - Servida a través del endpoint interno `GET /api/jarbees/poster/draco/:filename`.
   - Permite cargar mallas 3D complejas comprimidas (hasta 85% de ahorro de ancho de banda).

3. **Iluminación de Estudio y Sombreado Físico (PBR):**
   - **Key Light:** Directional Light con tono solar cálido ($45^\circ$, intensidad 2.8).
   - **Fill Light:** Cool Ambient + Directional azul/cian para contraste de color en penumbras.
   - **Rim Light (Contraluz):** Resalta siluetas anatómicas y mecánicas, separando al sujeto del fondo.
   - **Tone Mapping:** `ACESFilmicToneMapping` calibrado con exposición $1.15$ para emular rango dinámico cinematográfico.

---

## 4. Scripts y Comandos Útiles

- **Descargar / Actualizar Recursos PBR:**
  ```bash
  node scripts/download_pbr_assets.js
  ```
- **Probar Render 3D Directo por GPU:**
  ```bash
  node scripts/test_three_render.js
  ```
- **Compilar el Backend:**
  ```bash
  npm run build
  ```
