# 🎨 Asset Metadata System - JarBees Procedural 3D Studio

## Descripción General

Sistema de gestión de metadata estructurada para activos 3D que permite:

- **Catalogación Automática**: Registro inteligente de modelos, escenas, materiales y texturas
- **Reutilización de Configuraciones**: Biblioteca de presets de iluminación, cámara y render exitosos
- **Análisis de Rendimiento**: Métricas de tiempo vs calidad, uso de VRAM y optimización GPU
- **Generación de Variantes**: Sistema de clonación para crear renders derivados sin repetir setup
- **Búsqueda Semántica**: Búsqueda por tags, estilo, categoría y calidad mínima

---

## 📊 Estructura de Metadata

### Archivo de Metadata: `{packageId}_info.json`

```json
{
  "packageId": "bebffbcb-1435-4626-b4d1-b9dc0b7d63f7",
  "assetName": "Ballena Jorobada - Abismo Oceánico Ecco Style",
  "assetType": "scene",
  "sourcePath": "G:\\new models\\Ballena jorobada.glb",
  
  "geometry": {
    "vertices": 156789,
    "faces": 124567,
    "boundingBox": { ... }
  },
  
  "lighting": {
    "type": "cinematic",
    "volumetrics": { ... },
    "godRays": { ... },
    "caustics": { ... }
  },
  
  "camera": {
    "focalLength": 35,
    "fStop": 2.8,
    "position": [-8.2, 3.5, -15.7]
  },
  
  "renderConfig": {
    "engine": "eevee-next",
    "resolution": [2560, 1440],
    "samples": 256,
    "denoiser": "optix",
    "colorManagement": "agx"
  },
  
  "performance": {
    "renderTime": 4.96,
    "gpuModel": "NVIDIA GeForce RTX 5070",
    "vramUsage": 7840
  },
  
  "tags": ["whale", "underwater", "cinematic", "volumetric"],
  "style": ["dreamcast-aesthetic", "ecco-the-dolphin"]
}
```

---

## 🚀 API Endpoints

### 1. Obtener Estadísticas del Catálogo

```bash
GET /jarvis/3d/metadata/stats
```

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "totalAssets": 42,
    "byType": {
      "model": 15,
      "scene": 18,
      "material": 6,
      "hdri": 3
    },
    "byCategory": {
      "cinematic-render": 12,
      "product-catalog": 18,
      "game-asset": 8
    },
    "totalRenders": 156,
    "averageRenderTime": 8.34
  }
}
```

---

### 2. Obtener Metadata de un Asset

```bash
GET /jarvis/3d/metadata/{packageId}
```

**Ejemplo:**
```bash
curl http://localhost:3000/jarvis/3d/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7
```

**Respuesta:**
```json
{
  "success": true,
  "metadata": { ... }
}
```

---

### 3. Buscar Assets por Criterios

```bash
GET /jarvis/3d/metadata?assetType=scene&category=cinematic-render&tags=underwater,volumetric
```

**Query Parameters:**
- `assetType`: `model | scene | material | texture | hdri`
- `category`: string (ej. `cinematic-render`, `product-catalog`)
- `style`: string separado por comas (ej. `dreamcast-aesthetic,photorealistic`)
- `tags`: string separado por comas (ej. `whale,ocean,god-rays`)
- `minQuality`: número 0-100

**Respuesta:**
```json
{
  "success": true,
  "count": 8,
  "results": [
    { ... },
    { ... }
  ]
}
```

---

### 4. Guardar o Actualizar Metadata

```bash
POST /jarvis/3d/metadata
Content-Type: application/json

{
  "packageId": "...",
  "assetName": "...",
  "assetType": "model",
  ...
}
```

---

### 5. Extraer Metadata Automáticamente

```bash
POST /jarvis/3d/metadata/extract
Content-Type: application/json

{
  "modelPath": "G:\\new models\\Ballena jorobada.glb",
  "additionalInfo": {
    "category": "cinematic-render",
    "tags": ["whale", "ocean"]
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "packageId": "new-uuid-here",
  "metadata": { ... },
  "filepath": "storage/assets/metadata/new-uuid-here_info.json"
}
```

---

### 6. Generar Reporte de Render con Análisis de Calidad

```bash
POST /jarvis/3d/metadata/report
Content-Type: application/json

{
  "renderPath": "storage/assets/renders/ecco_whale_cinematic_abyss.png",
  "metadata": { ... },
  "performance": {
    "renderTime": 4.96,
    "gpuModel": "NVIDIA GeForce RTX 5070",
    "vramUsage": 7840
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "report": {
    "packageId": "...",
    "renderPath": "...",
    "thumbnail": "..._thumb.png",
    "quality": {
      "isEmpty": false,
      "hasArtifacts": false,
      "averageBrightness": 0.5,
      "dynamicRange": 0.8,
      "score": 85
    },
    "recommendations": [
      "Activar denoiser OptiX para reducir ruido sin aumentar samples"
    ]
  }
}
```

---

### 7. Encontrar Assets Similares

```bash
GET /jarvis/3d/metadata/{packageId}/similar?limit=5
```

Encuentra assets con tags, estilo y categoría similares.

---

### 8. Clonar Metadata para Crear Variante

```bash
POST /jarvis/3d/metadata/{packageId}/clone
Content-Type: application/json

{
  "overrides": {
    "assetName": "Ballena Jorobada - Amanecer Dorado",
    "lighting": {
      "type": "cinematic",
      "hdriPath": "G:\\HDRIs\\Sunrise_8K.exr"
    }
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "originalId": "bebffbcb-1435-4626-b4d1-b9dc0b7d63f7",
  "cloneId": "new-variant-uuid",
  "clone": { ... }
}
```

---

## 🎯 Casos de Uso

### 1. **Registro Automático Post-Render**

Después de cada render, guarda automáticamente la metadata:

```typescript
// En BlenderService después de render
const metadata: Asset3DMetadata = {
  packageId: crypto.randomUUID(),
  assetName: 'Ballena Jorobada - Abismo Oceánico',
  assetType: 'scene',
  sourcePath: modelPath,
  renderConfig: { ... },
  performance: {
    renderTime: 4.96,
    gpuModel: 'RTX 5070',
    vramUsage: 7840
  },
  tags: ['whale', 'underwater', 'cinematic'],
  category: 'cinematic-render',
  style: ['dreamcast-aesthetic']
};

await assetMetadataService.saveMetadata(metadata);
```

---

### 2. **Búsqueda de Configuraciones Exitosas**

Encuentra renders previos con características similares:

```bash
curl "http://localhost:3000/jarvis/3d/metadata?style=dreamcast-aesthetic&tags=underwater,volumetric&minQuality=80"
```

Úsalo para:
- Reutilizar configuraciones de iluminación
- Inspiración para nuevos renders
- Benchmarking de rendimiento

---

### 3. **Generación de Variantes Sin Setup Manual**

Clonar configuración y cambiar solo parámetros clave:

```typescript
// Clonar metadata del render de ballena
const variant = await fetch('/jarvis/3d/metadata/bebffbcb.../clone', {
  method: 'POST',
  body: JSON.stringify({
    overrides: {
      lighting: {
        ...originalLighting,
        hdriPath: 'Sunset_8K.exr',
        hdriStrength: 1.8
      },
      camera: {
        ...originalCamera,
        position: [-12, 5, -20] // Ángulo más dramático
      }
    }
  })
});

// Usar variant.cloneId para renderizar automáticamente
```

---

### 4. **Pipeline de Product Studio**

Para el **JarBees Product Studio** (pack de 4–12 tomas):

```typescript
// Crear metadata base del producto
const productBase = await extractMetadataFromModel(productPath);

// Clonar para cada vista
const views = ['frontal', 'three-quarter', 'top', 'macro'];
for (const view of views) {
  const variant = await cloneMetadata(productBase.packageId, {
    assetName: `${productBase.assetName} - ${view}`,
    camera: getCameraPreset(view),
    tags: [...productBase.tags, view]
  });
  
  // Renderizar usando variant.packageId
  await renderScene(variant);
}
```

---

### 5. **Análisis de Rendimiento GPU**

Comparar tiempos de render entre configuraciones:

```bash
GET /jarvis/3d/metadata?assetType=scene&category=cinematic-render
```

Filtrar por:
- `performance.renderTime` < 10 segundos
- `performance.vramUsage` < 8GB
- `renderConfig.engine` = "eevee-next"

---

## 🔄 Integración con Blender Service

### Flujo Completo de Render + Metadata

```typescript
import { BlenderService } from './3d/blender.service';
import { AssetMetadataService } from './3d/services/asset-metadata.service';

async function renderWithMetadata(modelPath: string, config: RenderConfig) {
  const startTime = Date.now();
  
  // 1. Extraer metadata base del modelo
  const baseMetadata = await metadataService.extractMetadataFromModel(modelPath, {
    category: 'cinematic-render',
    tags: ['whale', 'underwater', 'volumetric'],
    style: ['dreamcast-aesthetic'],
    lighting: config.lighting,
    camera: config.camera,
    renderConfig: config.render
  });
  
  // 2. Renderizar con Blender
  const renderPath = await blenderService.render({
    modelPath,
    outputPath: `storage/assets/renders/${baseMetadata.packageId}.png`,
    ...config
  });
  
  const renderTime = (Date.now() - startTime) / 1000;
  
  // 3. Generar reporte completo
  const report = await metadataService.generateRenderReport(
    renderPath,
    baseMetadata,
    {
      renderTime,
      gpuModel: 'NVIDIA GeForce RTX 5070',
      vramUsage: 7840
    }
  );
  
  return { renderPath, metadata: baseMetadata, report };
}
```

---

## 📁 Estructura de Archivos

```
storage/assets/
├── metadata/
│   ├── bebffbcb-1435-4626-b4d1-b9dc0b7d63f7_info.json
│   ├── bebffbcb-1435-4626-b4d1-b9dc0b7d63f7_render_report.json
│   ├── another-package-id_info.json
│   └── ...
├── renders/
│   ├── ecco_whale_cinematic_abyss.png
│   ├── ecco_whale_cinematic_abyss_thumb.png
│   └── ...
├── models/
│   └── ...
└── catalog.json  (índice global)
```

---

## 🎨 Ejemplo Completo: Render de Ballena Jorobada

### Metadata Guardada

**Archivo:** `storage/assets/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7_info.json`

```json
{
  "packageId": "bebffbcb-1435-4626-b4d1-b9dc0b7d63f7",
  "assetName": "Ballena Jorobada - Abismo Oceánico Ecco Style",
  "assetType": "scene",
  "sourcePath": "G:\\new models\\Ballena jorobada.glb",
  
  "lighting": {
    "type": "cinematic",
    "volumetrics": {
      "density": 0.008,
      "anisotropy": 0.70
    },
    "godRays": {
      "enabled": true,
      "samples": 64
    },
    "caustics": {
      "enabled": true,
      "pattern": "voronoi",
      "intensity": 2.8
    }
  },
  
  "performance": {
    "renderTime": 4.96,
    "gpuModel": "NVIDIA GeForce RTX 5070",
    "vramUsage": 7840
  },
  
  "tags": ["whale", "humpback", "ocean", "underwater", "cinematic", "dreamcast", "ecco", "volumetric", "god-rays", "caustics"],
  "style": ["dreamcast-aesthetic", "ecco-the-dolphin", "volumetric-lighting"],
  "category": "cinematic-render"
}
```

### Consultar la Metadata

```bash
curl http://localhost:3000/jarvis/3d/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7
```

### Crear Variante "Amanecer Dorado"

```bash
curl -X POST http://localhost:3000/jarvis/3d/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7/clone \
  -H "Content-Type: application/json" \
  -d '{
    "overrides": {
      "assetName": "Ballena Jorobada - Amanecer Dorado",
      "lighting": {
        "hdriPath": "G:\\HDRIs\\Sunrise_8K.exr",
        "hdriStrength": 1.8,
        "volumetrics": {
          "scatterColor": [0.95, 0.75, 0.35]
        }
      }
    }
  }'
```

---

## 🚀 Próximos Pasos

### Fase 1 (Completado)
- ✅ Servicio de gestión de metadata
- ✅ API REST para CRUD de metadata
- ✅ Sistema de catalogación automática
- ✅ Clonación de configuraciones

### Fase 2 (Pendiente)
- [ ] Análisis de calidad de imagen con Sharp/Jimp
- [ ] Generación automática de thumbnails
- [ ] Extracción de geometría real desde GLB/GLTF (usando three.js)
- [ ] Dashboard visual del catálogo

### Fase 3 (Futuro)
- [ ] Búsqueda semántica con embeddings
- [ ] Sistema de recomendaciones (ML)
- [ ] Auto-tuning de parámetros de render
- [ ] Predicción de tiempo de render

---

## 📝 Notas Técnicas

1. **Checksums**: Se usa SHA-256 para detectar cambios en archivos fuente
2. **IDs Únicos**: UUIDs v4 para cada paquete de metadata
3. **Catálogo Global**: `catalog.json` mantiene índice para búsquedas rápidas
4. **Relaciones**: Sistema de `variants` para trackear renders derivados
5. **Performance**: Metadata se almacena en JSON plano para máxima velocidad

---

## 🎯 Beneficios del Sistema

✅ **No más setup manual repetitivo**: Clona configuraciones exitosas  
✅ **Búsqueda inteligente**: Encuentra assets por características técnicas  
✅ **Optimización continua**: Analiza qué configuraciones son más rápidas  
✅ **Trazabilidad completa**: Historial de uso y variantes  
✅ **Escalable**: Preparado para miles de assets  

---

**Generado por JarBees Procedural 3D Studio**  
Documentación v1.0 - Octubre 2026
